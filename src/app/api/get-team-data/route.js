import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { aggregateTeamData } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";
import { getTeamOPRMap } from "../../../lib/opr-service";

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

  // If usePPR, override EPA fields with OPR from TBA
  if (gameConfig?.usePPR === true) {
    try {
      const oprMap = await getTeamOPRMap(activeGame);
      if (oprMap) {
        const opr = oprMap.get(Number(team));
        if (opr != null) {
          returnObject.avgEpa   = opr;
          returnObject.last3Epa = opr;
          returnObject.avgAuto  = 0;
          returnObject.avgTele  = 0;
          returnObject.avgEnd   = 0;
          returnObject.last3Auto = 0;
          returnObject.last3Tele = 0;
          returnObject.last3End  = 0;
          // Flatten time-series to OPR value per match so charts reflect OPR
          returnObject.epaOverTime  = (returnObject.epaOverTime  || []).map(p => ({ ...p, epa: opr }));
          returnObject.autoOverTime = [];
          returnObject.teleOverTime = [];
        }
      }
    } catch (oprError) {
      console.error("[get-team-data] OPR injection error:", oprError);
    }
  }

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
