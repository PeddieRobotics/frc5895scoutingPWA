import { NextResponse } from "next/server";
import { pool, validateAuthToken } from '../../../lib/auth';
import { getActiveGame } from "../../../lib/game-config";
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { aggregateTeamData } from "../../../lib/display-engine";

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

  if (!team || isNaN(+team)) {
    return NextResponse.json({ message: "ERROR: Invalid team number" }, { status: 400 });
  }

  // Get active game - required
  let activeGame = null;
  try {
    activeGame = await getActiveGame();
  } catch (e) {
    console.error("[get-team-data] Error getting active game:", e);
  }

  if (!activeGame || !activeGame.table_name) {
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
  try {
    const result = await client.query(`SELECT * FROM ${tableName} WHERE team = $1`, [team]);
    rows = result.rows;
  } finally {
    client.release();
  }

  if (rows.length === 0) {
    return NextResponse.json({ message: `ERROR: No data for team ${team}` }, { status: 404 });
  }

  // Use config-driven aggregation
  const returnObject = aggregateTeamData(rows, gameConfig, calculationFunctions);

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
    returnObject.rows = rows;
  }

  // Add game config metadata
  returnObject.tableName = tableName;
  if (gameConfig) {
    returnObject.gameName = gameConfig.gameName;
    returnObject.displayName = gameConfig.displayName;
  }

  return NextResponse.json(returnObject, { status: 200 });
}
