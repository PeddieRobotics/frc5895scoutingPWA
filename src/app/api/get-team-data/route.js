import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { aggregateTeamData } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";
import { getTeamOPRMap, getLast3OPRMap, getPPROverTime, getPerPeriodTeamData } from "../../../lib/opr-service";

export const revalidate = 0; // Disable cache to ensure fresh data

export async function GET(request) {
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

  const { searchParams } = new URL(request.url);
  const team = searchParams.get('team');
  const includeRows = searchParams.get('includeRows') === 'true';
  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );

  if (!team || isNaN(+team)) {
    return NextResponse.json({ message: "ERROR: Invalid team number" }, { status: 400 });
  }

  // Get active game - required
  let activeGame = null;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (e) {
    console.error("[get-team-data] Error getting active game:", e);
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

  // Fetch team data from database
  const client = await pool.connect();
  let rows;
  let scoredRows;
  let unscoredMatches = [];
  try {
    const result = await client.query(`SELECT * FROM ${tableName} WHERE team = $1`, [team]);
    rows = result.rows;
    const timerProcessing = await applyScoutLeadRatesToRows(rows, activeGame, client);
    scoredRows = timerProcessing.scoredRows;
    unscoredMatches = timerProcessing.unscoredMatches;
  } finally {
    client.release();
  }

  if (rows.length === 0) {
    return NextResponse.json({
      message: `ERROR: No data for team ${team} in game "${activeGame.display_name || activeGame.game_name}" (${tableName}).`,
      error: "TEAM_NOT_FOUND_IN_ACTIVE_GAME",
      team: Number(team),
      gameId: activeGame.id,
      gameName: activeGame.game_name,
      displayName: activeGame.display_name,
      tableName,
    }, { status: 404 });
  }

  // Use config-driven aggregation
  const returnObject = scoredRows.length > 0
    ? aggregateTeamData(scoredRows, gameConfig, calculationFunctions)
    : {
      team: Number(team),
      avgEpa: 0,
      avgAuto: 0,
      avgTele: 0,
      avgEnd: 0,
      last3Epa: 0,
      last3Auto: 0,
      last3Tele: 0,
      last3End: 0,
      epaOverTime: [],
      autoOverTime: [],
      teleOverTime: [],
      endOverTime: [],
      overlayOverTime: {},
      consistency: 0,
      defense: 0,
      breakdown: 0,
      lastBreakdown: "N/A",
      noShow: 0,
      leave: 0,
      matchesScouted: 0,
      scouts: [],
      auto: {},
      tele: {},
      endPlacement: {},
      attemptCage: 0,
      successCage: 0,
      qualitative: [],
    };

  // If usePPR, override EPA fields with PPR (Peddie Power Rating) from TBA
  if (gameConfig?.usePPR === true) {
    // Main PPR (total OPR + over-time) — kept separate so a period failure doesn't block this
    let oprMap = null, last3OprMap = null, pprOverTime = [];
    try {
      [oprMap, last3OprMap, pprOverTime] = await Promise.all([
        getTeamOPRMap(activeGame),
        getLast3OPRMap(activeGame),
        getPPROverTime(activeGame, Number(team)),
      ]);
    } catch (oprError) {
      console.error("[get-team-data] PPR injection error:", oprError);
    }
    if (oprMap) {
      const opr = oprMap.get(Number(team));
      const last3Opr = last3OprMap?.get(Number(team));
      if (opr != null) {
        returnObject.avgEpa   = opr;
        returnObject.last3Epa = last3Opr ?? opr;
        returnObject.epaOverTime = pprOverTime.length > 0
          ? pprOverTime
          : (returnObject.epaOverTime || []).map(p => ({ ...p, epa: opr }));
      }
    }

    // Per-period PPR breakdown (auto/tele/end avg, last3, and over-time charts)
    let periodData = null;
    try {
      periodData = await getPerPeriodTeamData(activeGame, Number(team));
    } catch (periodError) {
      console.error("[get-team-data] Period PPR error:", periodError);
    }
    if (periodData) {
      if (periodData.avgAuto  != null) returnObject.avgAuto  = periodData.avgAuto;
      if (periodData.avgTele  != null) returnObject.avgTele  = periodData.avgTele;
      if (periodData.avgEnd   != null) returnObject.avgEnd   = periodData.avgEnd;
      if (periodData.last3Auto != null) returnObject.last3Auto = periodData.last3Auto;
      if (periodData.last3Tele != null) returnObject.last3Tele = periodData.last3Tele;
      if (periodData.last3End  != null) returnObject.last3End  = periodData.last3End;
      if (periodData.autoOverTime.length > 0) returnObject.autoOverTime = periodData.autoOverTime;
      if (periodData.teleOverTime.length > 0) returnObject.teleOverTime = periodData.teleOverTime;
    } else {
      returnObject.avgAuto  = 0;
      returnObject.avgTele  = 0;
      returnObject.avgEnd   = 0;
      returnObject.last3Auto = 0;
      returnObject.last3Tele = 0;
      returnObject.last3End  = 0;
    }
  }

  // Inject scout names into over-time arrays (PPR override strips them, so re-add from scoredRows)
  const scoutsByMatch = {};
  scoredRows.forEach(row => {
    if (row.scoutname && row.scoutname.trim()) {
      if (!scoutsByMatch[row.match]) scoutsByMatch[row.match] = [];
      if (!scoutsByMatch[row.match].includes(row.scoutname)) scoutsByMatch[row.match].push(row.scoutname);
    }
  });
  ['epaOverTime', 'autoOverTime', 'teleOverTime'].forEach(key => {
    if (Array.isArray(returnObject[key])) {
      returnObject[key] = returnObject[key].map(p => ({
        ...p,
        scout: (scoutsByMatch[p.match] || []).join(', ') || null,
      }));
    }
  });

  // Fetch team name from TBA
  try {
    const teamName = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${team}/simple`, {
      headers: {
        "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY,
        "Accept": "application/json"
      },
    }).then(resp => resp.ok ? resp.json() : null)
      .then(data => data?.nickname || "");

    returnObject.name = teamName;
  } catch (tbaError) {
    console.error("[get-team-data] TBA fetch error:", tbaError);
    returnObject.name = "";
  }

  // Include the raw rows if requested
  if (includeRows) {
    returnObject.rows = scoredRows;
  }

  // Add game config metadata
  returnObject.tableName = tableName;
  returnObject.unscoredMatches = unscoredMatches;
  returnObject.skippedScoringRows = rows.length - scoredRows.length;
  if (gameConfig) {
    returnObject.gameName = gameConfig.gameName;
    returnObject.displayName = gameConfig.displayName;
  }

  return NextResponse.json(returnObject, { status: 200 });
}
