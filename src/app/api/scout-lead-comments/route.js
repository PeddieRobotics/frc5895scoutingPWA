import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getActiveGame, ensureScoutLeadsTableForGame } from "../../../lib/game-config";

export const revalidate = 0;

function assertSafeTableName(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return name;
}

export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || "Authentication required" },
      { status: 401 }
    );
  }

  let activeGame;
  try {
    activeGame = await getActiveGame();
  } catch (e) {
    console.error("[scout-lead-comments] Error loading active game:", e);
  }

  if (!activeGame?.table_name) {
    return NextResponse.json(
      { message: "No active game configured.", error: "NO_ACTIVE_GAME" },
      { status: 400 }
    );
  }

  let scoutLeadsInfo;
  try {
    scoutLeadsInfo = await ensureScoutLeadsTableForGame(activeGame);
  } catch (e) {
    return NextResponse.json(
      { message: "Failed to initialize scout leads table", error: e.message },
      { status: 500 }
    );
  }

  const tableName = assertSafeTableName(scoutLeadsInfo.tableName);
  const { searchParams } = new URL(request.url);
  const teamFilter = searchParams.get("team");

  const client = await pool.connect();
  try {
    const values = [];
    let whereClause = `WHERE comment IS NOT NULL AND TRIM(comment) != ''`;
    if (teamFilter !== null) {
      values.push(Number(teamFilter));
      whereClause += ` AND team = $1`;
    }

    const result = await client.query(
      `SELECT id, team, match, matchtype, scoutname, comment, timestamp
       FROM ${tableName}
       ${whereClause}
       ORDER BY team ASC, match ASC, timestamp ASC`,
      values
    );
    return NextResponse.json({ success: true, comments: result.rows });
  } finally {
    client.release();
  }
}
