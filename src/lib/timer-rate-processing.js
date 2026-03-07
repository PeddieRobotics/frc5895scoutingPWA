import { ensureScoutLeadsTableForGame } from "./game-config";
import { extractScoringRequirementFields } from "./schema-generator";

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
 * Also excludes rows that fail any boolean scoringRequirement fields.
 * Excluded rows are collected into unscoredMatches with a reason string.
 */
async function applyScoutLeadRatesToRows(rows, activeGame, client) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { scoredRows: [], unscoredMatches: [], timerFields: [] };
  }

  const scoutLeadsInfo = await ensureScoutLeadsTableForGame(activeGame, client);
  const timerFields = scoutLeadsInfo?.timerFields || [];

  // Extract boolean scoring requirement fields from the game config
  const requirementFields = extractScoringRequirementFields(activeGame?.config_json || {});
  if (timerFields.length === 0 && requirementFields.length === 0) {
    return {
      scoredRows: rows.map((row) => ({ ...row })),
      unscoredMatches: [],
      timerFields,
    };
  }

  const teams = Array.from(
    new Set(
      rows
        .map((row) => parseInteger(row.team, null))
        .filter((teamValue) => Number.isInteger(teamValue))
    )
  );

  // Only query the scout-leads table if there are timer fields to average
  let rateRows = [];
  let teamAverageRows = [];
  if (timerFields.length > 0 && teams.length > 0) {
    const scoutLeadsTableName = assertSafeTableName(scoutLeadsInfo.tableName);
    const averageColumnsSql = timerFields
      .map((field) => `AVG(NULLIF(${quoteIdentifier(field.name)}, 0)) AS ${quoteIdentifier(field.name)}`)
      .join(", ");

    const [matchResult, teamResult] = await Promise.all([
      client.query(
        `SELECT team, match, COALESCE(matchtype, 2) AS matchtype, ${averageColumnsSql}
         FROM ${scoutLeadsTableName}
         WHERE team = ANY($1::int[])
         GROUP BY team, match, COALESCE(matchtype, 2)`,
        [teams]
      ),
      client.query(
        `SELECT team, ${averageColumnsSql}
         FROM ${scoutLeadsTableName}
         WHERE team = ANY($1::int[])
         GROUP BY team`,
        [teams]
      ),
    ]);
    rateRows = matchResult.rows;
    teamAverageRows = teamResult.rows;
  }

  const ratesByMatch = new Map();
  rateRows.forEach((row) => {
    const team = parseInteger(row.team, null);
    const match = parseInteger(row.match, null);
    const matchType = normalizeMatchType(row.matchtype);
    if (!Number.isInteger(team) || !Number.isInteger(match)) return;
    ratesByMatch.set(buildMatchKey(team, match, matchType), row);
  });

  // Team-level average rates as fallback when a specific match has no entry
  const ratesByTeam = new Map();
  teamAverageRows.forEach((row) => {
    const team = parseInteger(row.team, null);
    if (!Number.isInteger(team)) return;
    ratesByTeam.set(team, row);
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

    const matchRates = matchKey ? ratesByMatch.get(matchKey) : null;
    const teamRates = Number.isInteger(team) ? ratesByTeam.get(team) : null;
    const missingTimerFields = [];
    const failedRequirements = [];

    timerFields.forEach((field) => {
      const seconds = parseNumber(row[field.name]);
      if (seconds === null || seconds <= 0) {
        if (seconds !== null) {
          convertedRow[field.name] = seconds;
        }
        return;
      }

      // Use match-specific rate first, fall back to team average across all matches.
      // Explicitly check > 0 at each step so a null/zero match-specific entry
      // (e.g. a comment-only scout-leads row) still falls through to team averages.
      const matchRate = matchRates != null ? parseNumber(matchRates[field.name]) : null;
      const teamRate = teamRates != null ? parseNumber(teamRates[field.name]) : null;
      const rate = (matchRate !== null && matchRate > 0) ? matchRate : teamRate;
      const hasValidRate = rate !== null && rate > 0;
      if (!hasValidRate) {
        missingTimerFields.push({
          field: field.name,
          label: field.label || field.name,
          seconds,
        });
        return;
      }

      convertedRow[field.name] = seconds * rate;
    });

    // Check boolean scoring requirements
    requirementFields.forEach((req) => {
      const rawValue = row[req.name];
      const boolValue = rawValue === true || rawValue === 'true' || rawValue === 1;
      if (boolValue !== req.requiredValue) {
        failedRequirements.push({ field: req.name, label: req.label, requiredValue: req.requiredValue });
      }
    });

    if (missingTimerFields.length > 0 || failedRequirements.length > 0) {
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
          failedRequirements: [],
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
      failedRequirements.forEach((item) => {
        if (!entry.failedRequirements.some((existing) => existing.field === item.field)) {
          entry.failedRequirements.push(item);
        }
      });
      return;
    }

    scoredRows.push(convertedRow);
  });

  const unscoredMatches = Array.from(unscoredByKey.values())
    .map((entry) => {
      const timerLabels = entry.missingTimerFields.map((item) => item.label);
      const reqParts = (entry.failedRequirements || []).map(
        (item) => `${item.label} must be ${item.requiredValue}`
      );
      const reasonParts = [];
      if (timerLabels.length > 0) {
        reasonParts.push(`Missing scout-leads rate for ${timerLabels.join(", ")}`);
      }
      if (reqParts.length > 0) {
        reasonParts.push(`Excluded by requirement: ${reqParts.join(", ")}`);
      }
      return {
        team: entry.team,
        match: entry.match,
        matchType: entry.matchType,
        displayMatch: entry.displayMatch,
        missingTimerFields: entry.missingTimerFields.map((item) => item.field),
        missingTimerLabels: timerLabels,
        failedRequirements: (entry.failedRequirements || []).map((item) => item.field),
        rowsSkipped: entry.rowsSkipped,
        reason: reasonParts.join("; ") + ".",
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
