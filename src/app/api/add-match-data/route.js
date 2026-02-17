import { NextResponse } from "next/server";
import { pool } from "../../../lib/auth";
import { validateAuthToken } from "../../../lib/auth";
import { getActiveGame } from "../../../lib/game-config";
import { extractFieldsFromConfig, getNumericFields, getBooleanFields } from "../../../lib/schema-generator";
import { normalizeMatchForStorage } from "../../../lib/match-utils";

export async function POST(req) {
  try {
    // Validate auth token
    const { isValid, teamName: authTeamName, error } = await validateAuthToken(req);

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

    let body = await req.json();

    // Try to get active game config
    let activeGame = null;
    try {
      activeGame = await getActiveGame();
    } catch (e) {
      console.error("[add-match-data] Error getting active game:", e);
    }

    // Require an active game - no fallback
    if (!activeGame || !activeGame.table_name) {
      return NextResponse.json(
        {
          message: "No active game configured. Please go to /admin/games to create and activate a game.",
          error: "NO_ACTIVE_GAME"
        },
        { status: 400 }
      );
    }

    // Use dynamic insertion with active game
    return await handleDynamicInsert(body, activeGame);

  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { message: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle dynamic insert using active game config
 */
async function handleDynamicInsert(body, activeGame) {
  const { table_name: tableName, config_json: config } = activeGame;

  // Extract fields from config
  const fields = extractFieldsFromConfig(config);
  const numericFields = getNumericFields(fields);
  const booleanFields = getBooleanFields(fields);

  // Build defaults from config
  const fieldDefaults = {};
  fields.forEach(f => {
    if (f.default !== undefined) {
      fieldDefaults[f.name] = f.default;
    } else if (f.type === 'BOOLEAN') {
      fieldDefaults[f.name] = false;
    } else if (f.type === 'INTEGER') {
      fieldDefaults[f.name] = null;
    } else {
      fieldDefaults[f.name] = null;
    }
  });

  // Merge defaults with provided data
  const processedData = { ...fieldDefaults, ...body };

  // Convert numeric fields
  numericFields.forEach(fieldName => {
    const value = processedData[fieldName];
    if (value !== null && value !== undefined && value !== '') {
      processedData[fieldName] = Number(value);
      if (Number.isNaN(processedData[fieldName])) {
        processedData[fieldName] = null;
      }
    } else {
      processedData[fieldName] = null;
    }
  });

  // Convert boolean fields
  booleanFields.forEach(fieldName => {
    processedData[fieldName] = Boolean(processedData[fieldName]);
  });

  // Validate required fields
  if (
    !processedData.scoutname ||
    processedData.team === null ||
    processedData.match === null
  ) {
    return NextResponse.json(
      { message: "Missing required fields (scoutname, team, match)" },
      { status: 400 }
    );
  }

  // Handle match number adjustment based on matchType
  const { match: adjustedMatch, matchType } = normalizeMatchForStorage(
    processedData.match,
    processedData.matchtype ?? processedData.matchType ?? 2
  );
  processedData.match = adjustedMatch;
  processedData.matchtype = matchType;

  // Get column names that exist in the config (excluding 'id' and 'timestamp')
  const columnNames = fields
    .map(f => f.name)
    .filter(name => name !== 'id' && name !== 'timestamp' && processedData[name] !== undefined);

  // Build the INSERT query dynamically
  const columns = columnNames.join(', ');
  const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
  const values = columnNames.map(name => processedData[name]);

  const client = await pool.connect();
  try {
    // Handle no-show case - only insert minimal data
    if (processedData.noshow) {
      const noShowColumns = ['scoutname', 'scoutteam', 'team', 'match', 'matchtype', 'noshow'];
      const noShowPlaceholders = noShowColumns.map((_, i) => `$${i + 1}`).join(', ');
      const noShowValues = noShowColumns.map(name => processedData[name]);

      await client.query(
        `INSERT INTO ${tableName} (${noShowColumns.join(', ')}) VALUES (${noShowPlaceholders})`,
        noShowValues
      );
      return NextResponse.json({ message: "No-show recorded", table: tableName });
    }

    // Insert full data
    await client.query(
      `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
      values
    );

    return NextResponse.json({ message: "Data recorded successfully", table: tableName });
  } finally {
    client.release();
  }
}
