import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { computePicklistMetrics } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";
import { getTeamOPRMap, getLast3OPRMap } from "../../../lib/opr-service";

export async function POST(request) {
  // First validate the auth token
  const { isValid, teamName: authTeamName, error } = await validateAuthToken(request);

  if (!isValid) {
    return NextResponse.json({
      message: error || "Authentication required"
    }, {
      status: 401,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }

  const requestBody = await request.json(); // Weight inputs (legacy: array)
  const requestedGameId = parseRequestedGameId(
    (!Array.isArray(requestBody) ? requestBody?.gameId : null) || request.headers.get("X-Game-Id")
  );
  const weightInputs = Array.isArray(requestBody)
    ? requestBody
    : (Array.isArray(requestBody?.weightEntries) ? requestBody.weightEntries : []);

  // Get active game config dynamically
  let activeGame;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (e) {
    console.error("[compute-picklist] Error getting active game:", e);
  }

  if (!activeGame || !activeGame.table_name) {
    if (requestedGameId !== null) {
      return NextResponse.json({
        message: `Selected game ${requestedGameId} was not found.`,
        error: "INVALID_GAME_SELECTION"
      }, { status: 400 });
    }
    return NextResponse.json({
      message: "No active game configured. Please go to /admin/games to create and activate a game.",
      error: "NO_ACTIVE_GAME"
    }, { status: 400 });
  }

  const tableName = activeGame.table_name;
  const gameConfig = activeGame.config_json;
  const calculationFunctions = createCalculationFunctions(gameConfig);

  const client = await pool.connect();
  let rows;
  let scoredRows;
  let unscoredMatches = [];
  try {
    const result = await client.query(`SELECT * FROM ${tableName}`);
    rows = result.rows;
    const timerProcessing = await applyScoutLeadRatesToRows(rows, activeGame, client);
    scoredRows = timerProcessing.scoredRows;
    unscoredMatches = timerProcessing.unscoredMatches;
  } finally {
    client.release();
  }

  // Use config-driven picklist computation
  let teamTable = scoredRows.length > 0
    ? computePicklistMetrics(scoredRows, gameConfig, calculationFunctions, weightInputs)
    : [];

  // If usePPR, replace EPA fields with PPR (Peddie Power Rating) then recompute weighted score
  if (gameConfig?.usePPR === true) {
    try {
      const [oprMap, last3OprMap] = await Promise.all([
        getTeamOPRMap(activeGame),
        getLast3OPRMap(activeGame),
      ]);
      if (oprMap) {
        // Step 1: inject raw PPR into real* and display fields
        teamTable = teamTable.map((entry) => {
          const opr = oprMap.get(Number(entry.team));
          const last3Opr = last3OprMap?.get(Number(entry.team));
          if (opr == null) return entry;
          return { ...entry, realEpa: opr, realEpa3: last3Opr ?? opr, avgEpa: opr, last3Epa: last3Opr ?? opr };
        });

        // Step 2: re-normalize epa / epa3 relative to new PPR max so weights still scale 0–1
        const maxEpa  = Math.max(...teamTable.map(e => e.realEpa  ?? 0), 0);
        const maxEpa3 = Math.max(...teamTable.map(e => e.realEpa3 ?? 0), 0);
        teamTable = teamTable.map(entry => ({
          ...entry,
          epa:  maxEpa  ? (entry.realEpa  ?? 0) / maxEpa  : 0,
          epa3: maxEpa3 ? (entry.realEpa3 ?? 0) / maxEpa3 : 0,
        }));

        // Step 3: recompute score using the same weight formula as computePicklistMetrics
        // Other normalized metrics (consistency, defense, breakdown, etc.) are unchanged.
        teamTable = teamTable.map(entry => ({
          ...entry,
          score: weightInputs.reduce((sum, [key, weight]) => {
            const value = entry[key] ?? 0;
            if (key === 'breakdown') return sum + ((1 - value) * parseFloat(weight));
            return sum + (value * parseFloat(weight));
          }, 0),
        }));

        // Step 4: sort by weighted score
        teamTable.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
    } catch (oprError) {
      console.error("[compute-picklist] PPR injection error:", oprError);
    }
  }

  // Fetch TBA Rankings (best effort)
  try {
    const tbaEventCode = gameConfig?.tbaEventCode || process.env.TBA_EVENT_CODE;
    const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${tbaEventCode}/rankings`, {
      headers: {
        'X-TBA-Auth-Key': process.env.TBA_AUTH_KEY,
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const rankings = data.rankings.map(t => ({
        teamNumber: t.team_key.replace('frc', ''),
        rank: t.rank
      }));

      teamTable = teamTable.map(teamData => {
        const rankedData = rankings.find(r => r.teamNumber == teamData.team);
        return {
          ...teamData,
          tbaRank: rankedData ? rankedData.rank : -1
        };
      });
    }
  } catch (tbaError) {
    console.error('[compute-picklist] Error fetching TBA rankings:', tbaError);
  }

  return NextResponse.json({
    teamTable,
    unscoredMatches,
    skippedScoringRows: rows.length - scoredRows.length,
  }, { status: 200 });
}
