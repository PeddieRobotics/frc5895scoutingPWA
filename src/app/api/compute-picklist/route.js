import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { computePicklistMetrics } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";

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
