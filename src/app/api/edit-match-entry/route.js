import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { extractFieldsFromConfig } from "../../../lib/schema-generator";

export const revalidate = 0;

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function assertSafeTableName(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return name;
}

// Fields that must never be updated by this endpoint
const IMMUTABLE_FIELDS = new Set(["id", "team", "match", "matchtype", "scoutteam", "timestamp"]);

export async function PATCH(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || "Authentication required" },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { id, updates, adminPassword } = body;
  const requestedGameId = parseRequestedGameId(
    body.gameId ?? body?.__meta?.gameId ?? request.headers.get("X-Game-Id")
  );

  if (id === undefined || id === null) {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return NextResponse.json({ message: "updates must be a non-null object" }, { status: 400 });
  }

  let activeGame;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (gameError) {
    console.error("[edit-match-entry] Error loading active game:", gameError);
  }

  if (!activeGame?.table_name) {
    if (requestedGameId !== null) {
      return NextResponse.json(
        { message: `Selected game ${requestedGameId} was not found.`, error: "INVALID_GAME_SELECTION" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "No active game configured", error: "NO_ACTIVE_GAME" },
      { status: 400 }
    );
  }

  const scoutingTableName = assertSafeTableName(activeGame.table_name);

  // Determine allowed fields from config
  const config = activeGame.config_json || {};
  const configFields = extractFieldsFromConfig(config);
  const allowedFieldNames = new Set(
    configFields
      .filter((f) => !IMMUTABLE_FIELDS.has(f.name))
      .map((f) => f.name)
  );
  // scoutname and noshow are always editable
  allowedFieldNames.add("scoutname");
  allowedFieldNames.add("noshow");

  const qualitativeFieldMap = new Map(
    configFields
      .filter((f) => f.type === "starRating" || f.type === "qualitative")
      .map((f) => [f.name, f.max || 6])
  );

  const filteredUpdates = Object.entries(updates)
    .filter(([key]) => allowedFieldNames.has(key))
    .map(([key, val]) => {
      if (qualitativeFieldMap.has(key) && typeof val === "number") {
        return [key, Math.max(0, Math.min(qualitativeFieldMap.get(key), val))];
      }
      return [key, val];
    });

  if (filteredUpdates.length === 0) {
    return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Fetch the row to check ownership
    const rowResult = await client.query(
      `SELECT id, scoutteam FROM ${scoutingTableName} WHERE id = $1`,
      [Number(id)]
    );

    if (rowResult.rows.length === 0) {
      return NextResponse.json({ message: "Entry not found" }, { status: 404 });
    }

    const row = rowResult.rows[0];
    const isOwnEntry = String(row.scoutteam) === String(teamName);
    const isAdmin =
      adminPassword &&
      typeof adminPassword === "string" &&
      adminPassword === process.env.ADMIN_PASSWORD;

    if (!isOwnEntry && !isAdmin) {
      return NextResponse.json(
        { message: "Not authorized to edit this entry" },
        { status: 403 }
      );
    }

    // Build parameterized UPDATE
    const setClauses = filteredUpdates.map(
      ([key], index) => `${quoteIdentifier(key)} = $${index + 2}`
    );
    const values = [Number(id), ...filteredUpdates.map(([, val]) => val)];

    const updateResult = await client.query(
      `UPDATE ${scoutingTableName} SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );

    return NextResponse.json({
      success: true,
      row: updateResult.rows[0],
    });
  } finally {
    client.release();
  }
}
