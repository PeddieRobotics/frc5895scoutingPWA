import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { computePicklistMetrics } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";
import { getTeamOPRMap, getLast3OPRMap, getPerPeriodOPRMaps, getTBAMatches } from "../../../lib/opr-service";

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

  // Compute TBA-based unscouted matches: finished qualifier matches with zero scouting rows
  // for one or more alliance members. Any existing row (including noshow=true) counts as submitted.
  let unscoutedMatches = [];
  try {
    const tbaEventCode = activeGame?.tba_event_code || gameConfig?.tbaEventCode;
    if (tbaEventCode) {
      const tbaMatches = await getTBAMatches(tbaEventCode);
      const submittedKeys = new Set(
        rows
          .filter((r) => Number(r.matchtype) === 2)
          .map((r) => `${Number(r.team)}_${Number(r.match)}`)
      );
      for (const m of tbaMatches) {
        if (m.type !== "Q") continue;
        const pairs = [
          ...m.redTeams.map((t) => ({ team: t, alliance: "red" })),
          ...m.blueTeams.map((t) => ({ team: t, alliance: "blue" })),
        ];
        for (const { team, alliance } of pairs) {
          if (!submittedKeys.has(`${team}_${m.number}`)) {
            unscoutedMatches.push({
              team,
              match: m.number,
              matchType: 2,
              displayMatch: m.number,
              alliance,
              reason: "No scouting record submitted.",
            });
          }
        }
      }
    }
  } catch (tbaError) {
    console.error("[compute-picklist] Error computing unscouted matches from TBA:", tbaError);
    unscoutedMatches = [];
  }

  // Use config-driven picklist computation
  let teamTable = scoredRows.length > 0
    ? computePicklistMetrics(scoredRows, gameConfig, calculationFunctions, weightInputs)
    : [];

  // If usePPR, replace EPA fields with PPR (Peddie Power Rating) then recompute weighted score
  if (gameConfig?.usePPR === true) {
    try {
      const [oprMap, last3OprMap, periodMaps] = await Promise.all([
        getTeamOPRMap(activeGame),
        getLast3OPRMap(activeGame),
        getPerPeriodOPRMaps(activeGame),
      ]);
      if (oprMap) {
        // Step 1: inject raw PPR into real* and display fields
        teamTable = teamTable.map((entry) => {
          const num = Number(entry.team);
          const opr = oprMap.get(num);
          const last3Opr = last3OprMap?.get(num);
          if (opr == null) return entry;
          const updated = { ...entry, realEpa: opr, realEpa3: last3Opr ?? opr, avgEpa: opr, last3Epa: last3Opr ?? opr };
          // Inject per-period PPR so scatterplot realAuto/realTele/realEnd reflect OPR
          if (periodMaps) {
            const autoOpr = periodMaps.auto?.get(num);
            const teleOpr = periodMaps.tele?.get(num);
            const endOpr  = periodMaps.end?.get(num);
            if (autoOpr != null) { updated.auto = autoOpr; updated.realAuto = autoOpr; }
            if (teleOpr != null) { updated.tele = teleOpr; updated.realTele = teleOpr; }
            if (endOpr  != null) { updated.end  = endOpr;  updated.realEnd  = endOpr;  }
          }
          return updated;
        });

        // Step 2: re-normalize epa / epa3 / auto / tele / end relative to new PPR maxes so weights still scale 0–1
        const maxEpa  = Math.max(...teamTable.map(e => e.realEpa  ?? 0), 0);
        const maxEpa3 = Math.max(...teamTable.map(e => e.realEpa3 ?? 0), 0);
        const maxAuto = Math.max(...teamTable.map(e => e.realAuto ?? 0), 0);
        const maxTele = Math.max(...teamTable.map(e => e.realTele ?? 0), 0);
        const maxEnd  = Math.max(...teamTable.map(e => e.realEnd  ?? 0), 0);
        teamTable = teamTable.map(entry => ({
          ...entry,
          epa:  maxEpa  ? (entry.realEpa  ?? 0) / maxEpa  : 0,
          epa3: maxEpa3 ? (entry.realEpa3 ?? 0) / maxEpa3 : 0,
          auto: maxAuto ? (entry.realAuto ?? 0) / maxAuto : 0,
          tele: maxTele ? (entry.realTele ?? 0) / maxTele : 0,
          end:  maxEnd  ? (entry.realEnd  ?? 0) / maxEnd  : 0,
        }));

        // Step 3: recompute score (normalized) and absoluteScore (real values) using the same weight formula
        // Other normalized metrics (consistency, defense, breakdown, etc.) are unchanged.
        const realKeyMap = {
          epa: 'realEpa', epa3: 'realEpa3', defense: 'realDefense',
          auto: 'realAuto', tele: 'realTele', end: 'realEnd', consistency: 'realConsistency',
        };
        teamTable = teamTable.map(entry => ({
          ...entry,
          score: weightInputs.reduce((sum, [key, weight]) => {
            const value = entry[key] ?? 0;
            if (key === 'breakdown') return sum + ((1 - value) * parseFloat(weight));
            return sum + (value * parseFloat(weight));
          }, 0),
          absoluteScore: weightInputs.reduce((sum, [key, weight]) => {
            const realKey = realKeyMap[key] ?? `real${key.charAt(0).toUpperCase() + key.slice(1)}`;
            const value = entry[realKey] ?? entry[key] ?? 0;
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
    unscoutedMatches,
    skippedScoringRows: rows.length - scoredRows.length,
  }, { status: 200 });
}
