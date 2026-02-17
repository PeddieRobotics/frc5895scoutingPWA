import { ensureScoutLeadsTableForGame } from "./game-config";

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function assertSafeTableName(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return name;
}

function parseInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMatchType(matchTypeValue) {
  return parseInteger(matchTypeValue, 2);
}

function toDisplayMatch(storedMatchValue, matchTypeValue) {
  const storedMatch = parseInteger(storedMatchValue, null);
  const matchType = normalizeMatchType(matchTypeValue);

  if (!Number.isInteger(storedMatch)) {
    return storedMatchValue;
  }

  switch (matchType) {
    case 0:
      return storedMatch + 100;
    case 1:
      return storedMatch + 50;
    case 3:
      return storedMatch - 100;
    default:
      return storedMatch;
  }
}

function buildMatchKey(team, match, matchType) {
  return `${team}::${match}::${matchType}`;
}

/**
 * Convert holdTimer second values into scored counts using scout-leads average rates.
 * Rows with timer seconds but missing/invalid rate are excluded from scoring output.
 */
async function applyScoutLeadRatesToRows(rows, activeGame, client) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { scoredRows: [], unscoredMatches: [], timerFields: [] };
  }

  const scoutLeadsInfo = await ensureScoutLeadsTableForGame(activeGame, client);
  const timerFields = scoutLeadsInfo?.timerFields || [];
  if (timerFields.length === 0) {
    return {
      scoredRows: rows.map((row) => ({ ...row })),
      unscoredMatches: [],
      timerFields,
    };
  }

  const scoutLeadsTableName = assertSafeTableName(scoutLeadsInfo.tableName);
  const teams = Array.from(
    new Set(
      rows
        .map((row) => parseInteger(row.team, null))
        .filter((teamValue) => Number.isInteger(teamValue))
    )
  );

  const averageColumnsSql = timerFields
    .map((field) => `AVG(NULLIF(${quoteIdentifier(field.name)}, 0)) AS ${quoteIdentifier(field.name)}`)
    .join(", ");

  let rateRows = [];
  if (teams.length > 0) {
    const result = await client.query(
      `SELECT team, match, COALESCE(matchtype, 2) AS matchtype, ${averageColumnsSql}
       FROM ${scoutLeadsTableName}
       WHERE team = ANY($1::int[])
       GROUP BY team, match, COALESCE(matchtype, 2)`,
      [teams]
    );
    rateRows = result.rows;
  }

  const ratesByMatch = new Map();
  rateRows.forEach((row) => {
    const team = parseInteger(row.team, null);
    const match = parseInteger(row.match, null);
    const matchType = normalizeMatchType(row.matchtype);
    if (!Number.isInteger(team) || !Number.isInteger(match)) return;
    ratesByMatch.set(buildMatchKey(team, match, matchType), row);
  });

  const scoredRows = [];
  const unscoredByKey = new Map();

  rows.forEach((row) => {
    const convertedRow = { ...row };
    const team = parseInteger(row.team, null);
    const match = parseInteger(row.match, null);
    const matchType = normalizeMatchType(row.matchtype);
    const matchKey = Number.isInteger(team) && Number.isInteger(match)
      ? buildMatchKey(team, match, matchType)
      : null;

    const averagedRates = matchKey ? ratesByMatch.get(matchKey) : null;
    const missingTimerFields = [];

    timerFields.forEach((field) => {
      const seconds = parseNumber(row[field.name]);
      if (seconds === null || seconds <= 0) {
        if (seconds !== null) {
          convertedRow[field.name] = seconds;
        }
        return;
      }

      const averagedRate = averagedRates ? parseNumber(averagedRates[field.name]) : null;
      const hasValidRate = averagedRate !== null && averagedRate > 0;
      if (!hasValidRate) {
        missingTimerFields.push({
          field: field.name,
          label: field.label || field.name,
          seconds,
        });
        return;
      }

      convertedRow[field.name] = seconds * averagedRate;
    });

    if (missingTimerFields.length > 0) {
      if (!matchKey) {
        return;
      }

      if (!unscoredByKey.has(matchKey)) {
        unscoredByKey.set(matchKey, {
          key: matchKey,
          team,
          match,
          matchType,
          displayMatch: toDisplayMatch(match, matchType),
          missingTimerFields: [],
          rowsSkipped: 0,
        });
      }

      const entry = unscoredByKey.get(matchKey);
      entry.rowsSkipped += 1;
      missingTimerFields.forEach((item) => {
        if (!entry.missingTimerFields.some((existing) => existing.field === item.field)) {
          entry.missingTimerFields.push(item);
        }
      });
      return;
    }

    scoredRows.push(convertedRow);
  });

  const unscoredMatches = Array.from(unscoredByKey.values())
    .map((entry) => {
      const labels = entry.missingTimerFields.map((item) => item.label);
      return {
        team: entry.team,
        match: entry.match,
        matchType: entry.matchType,
        displayMatch: entry.displayMatch,
        missingTimerFields: entry.missingTimerFields.map((item) => item.field),
        missingTimerLabels: labels,
        rowsSkipped: entry.rowsSkipped,
        reason: `Missing scout-leads balls/sec rate for ${labels.join(", ")}.`,
      };
    })
    .sort((a, b) => {
      const byMatch = Number(a.displayMatch) - Number(b.displayMatch);
      if (Number.isFinite(byMatch) && byMatch !== 0) return byMatch;
      return Number(a.team) - Number(b.team);
    });

  return { scoredRows, unscoredMatches, timerFields };
}

export { applyScoutLeadRatesToRows };
