import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getActiveGame, ensureScoutLeadsTableForGame } from "../../../lib/game-config";
import { normalizeMatchForStorage } from "../../../lib/match-utils";

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

function parseNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || "Authentication required" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const team = parseNumber(searchParams.get("team"));
  const match = parseNumber(searchParams.get("match"));
  const matchTypeRaw = searchParams.get("matchType") ?? searchParams.get("matchtype") ?? 2;

  if (!Number.isInteger(team) || !Number.isInteger(match)) {
    return NextResponse.json(
      { message: "team and match query parameters are required" },
      { status: 400 }
    );
  }

  let activeGame = null;
  try {
    activeGame = await getActiveGame();
  } catch (gameError) {
    console.error("[scout-leads] Error loading active game:", gameError);
  }

  if (!activeGame?.table_name) {
    return NextResponse.json(
      {
        message: "No active game configured. Please go to /admin/games to create and activate a game.",
        error: "NO_ACTIVE_GAME",
      },
      { status: 400 }
    );
  }

  const { match: storedMatch, matchType } = normalizeMatchForStorage(match, matchTypeRaw);
  if (!Number.isInteger(storedMatch)) {
    return NextResponse.json(
      { message: "Invalid match number" },
      { status: 400 }
    );
  }

  let scoutLeadsInfo;
  try {
    scoutLeadsInfo = await ensureScoutLeadsTableForGame(activeGame);
  } catch (tableError) {
    console.error("[scout-leads] Failed to ensure scout leads table:", tableError);
    return NextResponse.json(
      { message: "Failed to initialize scout leads table", error: tableError.message },
      { status: 500 }
    );
  }

  const scoutLeadsTableName = assertSafeTableName(scoutLeadsInfo.tableName);
  const scoutingTableName = assertSafeTableName(activeGame.table_name);
  const timerFields = scoutLeadsInfo.timerFields || [];

  if (timerFields.length === 0) {
    return NextResponse.json({
      success: true,
      team,
      match,
      storedMatch,
      matchType,
      scoutingTableName,
      scoutLeadsTableName,
      timerFields: [],
      timerSummary: [],
      averageRates: {},
      scoutingRows: [],
      scoutLeadsRows: [],
    });
  }

  const timerColumnSql = timerFields.map((field) => quoteIdentifier(field.name)).join(", ");

  const client = await pool.connect();
  try {
    const scoutingResult = await client.query(
      `SELECT scoutname, scoutteam, match, matchtype, timestamp, ${timerColumnSql}
       FROM ${scoutingTableName}
       WHERE team = $1 AND match = $2 AND COALESCE(noshow, FALSE) = FALSE
       ORDER BY timestamp ASC`,
      [team, storedMatch]
    );

    const scoutLeadsResult = await client.query(
      `SELECT * FROM ${scoutLeadsTableName}
       WHERE team = $1 AND match = $2 AND matchtype = $3
       ORDER BY timestamp ASC`,
      [team, storedMatch, matchType]
    );
    const scoutLeadsRows = scoutLeadsResult.rows;

    const timerSummary = timerFields.map((field) => {
      const valuesByEntry = scoutingResult.rows.map((row) => {
        const seconds = Number(row[field.name]);
        return {
          scoutname: row.scoutname || null,
          scoutteam: row.scoutteam || null,
          timestamp: row.timestamp || null,
          seconds: Number.isFinite(seconds) ? seconds : 0,
        };
      });

      const values = valuesByEntry.map((entry) => entry.seconds).filter((value) => Number.isFinite(value));

      const totalSeconds = values.reduce((sum, value) => sum + value, 0);
      const averageSeconds = values.length > 0 ? totalSeconds / values.length : 0;

      const rateSamples = scoutLeadsRows
        .map((row) => Number(row[field.name]))
        .filter((value) => Number.isFinite(value) && value > 0);

      const averageRate = rateSamples.length
        ? average(rateSamples)
        : 0;

      const estimatedBallsByEntry = valuesByEntry.map((entry) => ({
        ...entry,
        estimatedBalls: entry.seconds * averageRate,
      }));

      return {
        name: field.name,
        label: field.label,
        rateLabel: field.scoutLeadsRateLabel,
        ratePlaceholder: field.scoutLeadsRatePlaceholder || "",
        group: field.group || null,
        groupLabel: field.groupLabel || null,
        values,
        valuesByEntry,
        totalSeconds,
        averageSeconds,
        scoutingSamples: values.length,
        averageRate,
        rateSamples,
        estimatedBallsByEntry,
      };
    });

    const averageRates = {};
    timerFields.forEach((field) => {
      const samples = scoutLeadsRows
        .map((row) => Number(row[field.name]))
        .filter((value) => Number.isFinite(value) && value > 0);
      averageRates[field.name] = samples.length
        ? average(samples)
        : 0;
    });

    return NextResponse.json({
      success: true,
      team,
      match,
      storedMatch,
      matchType,
      scoutingTableName,
      scoutLeadsTableName,
      timerFields: timerFields.map((field) => ({
        name: field.name,
        label: field.label,
        rateLabel: field.scoutLeadsRateLabel,
        ratePlaceholder: field.scoutLeadsRatePlaceholder || "",
        defaultRate: field.scoutLeadsDbColumn?.default ?? 0,
        group: field.group || null,
        groupLabel: field.groupLabel || null,
      })),
      scoutingRows: scoutingResult.rows,
      timerSummary,
      averageRates,
      scoutLeadsRows,
    });
  } finally {
    client.release();
  }
}

export async function POST(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || "Authentication required" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const team = parseNumber(body.team);
  const match = parseNumber(body.match);
  const matchTypeRaw = body.matchType ?? body.matchtype ?? 2;
  const scoutName = typeof body.scoutname === "string" ? body.scoutname.trim() : null;

  if (!Number.isInteger(team) || !Number.isInteger(match)) {
    return NextResponse.json(
      { message: "team and match are required" },
      { status: 400 }
    );
  }

  let activeGame = null;
  try {
    activeGame = await getActiveGame();
  } catch (gameError) {
    console.error("[scout-leads] Error loading active game:", gameError);
  }

  if (!activeGame?.table_name) {
    return NextResponse.json(
      {
        message: "No active game configured. Please go to /admin/games to create and activate a game.",
        error: "NO_ACTIVE_GAME",
      },
      { status: 400 }
    );
  }

  const { match: storedMatch, matchType } = normalizeMatchForStorage(match, matchTypeRaw);
  if (!Number.isInteger(storedMatch)) {
    return NextResponse.json(
      { message: "Invalid match number" },
      { status: 400 }
    );
  }

  let scoutLeadsInfo;
  try {
    scoutLeadsInfo = await ensureScoutLeadsTableForGame(activeGame);
  } catch (tableError) {
    console.error("[scout-leads] Failed to ensure scout leads table:", tableError);
    return NextResponse.json(
      { message: "Failed to initialize scout leads table", error: tableError.message },
      { status: 500 }
    );
  }

  const scoutLeadsTableName = assertSafeTableName(scoutLeadsInfo.tableName);
  const timerFields = scoutLeadsInfo.timerFields || [];

  if (timerFields.length === 0) {
    return NextResponse.json(
      { message: "No holdTimer fields are configured for the active game." },
      { status: 400 }
    );
  }

  const incomingRates = body.rates && typeof body.rates === "object" ? body.rates : {};
  const timerColumns = timerFields.map((field) => field.name);
  const timerValues = timerFields.map((field) => {
    const rawValue = incomingRates[field.name];
    const parsedValue = parseNumber(rawValue);
    if (parsedValue === null) {
      return null;
    }
    return parsedValue;
  });

  const baseColumns = ["scoutname", "scoutteam", "team", "match", "matchtype"];
  const allColumns = [...baseColumns, ...timerColumns];
  const allValues = [scoutName || null, teamName || null, team, storedMatch, matchType, ...timerValues];

  const placeholders = allColumns.map((_, index) => `$${index + 1}`).join(", ");
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO ${scoutLeadsTableName} (${allColumns.map((column) => quoteIdentifier(column)).join(", ")})
       VALUES (${placeholders})
       RETURNING *`,
      allValues
    );

    return NextResponse.json({
      success: true,
      message: "Scout lead rates saved successfully",
      scoutLeadsTableName,
      row: result.rows[0],
    });
  } finally {
    client.release();
  }
}
