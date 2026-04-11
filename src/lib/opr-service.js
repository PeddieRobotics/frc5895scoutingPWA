/**
 * opr-service.js
 *
 * Server-side OPR utilities:
 * - Fetches TBA match data with a short in-memory cache
 * - Reads/writes the OPR blacklist from opr_settings_{gameName}
 * - Computes a team → OPR map for use in display API routes
 *
 * Import only in server-side code (API routes, server components).
 */

import { pool } from './auth.js';
import { sanitizeOprSettingsTableName } from './schema-generator.js';
import { ensureOprSettingsTableForGame } from './game-config.js';
import { computeOPR } from './opr-calculator.js';

// Tikhonov regularization parameter — stabilises the OPR solve when not all
// teams have played enough matches for a fully determined system (early events).
const OPR_LAMBDA = 1.0;

// ─── TBA match cache ──────────────────────────────────────────────────────────
// Keyed by event code; entries expire after CACHE_TTL_MS.
const tbaMatchCache = new Map();
const CACHE_TTL_MS = 60_000;

/**
 * Fetch played matches for a TBA event, with a 60-second in-memory cache.
 * Returns an array in the same shape as /api/opr GET:
 *   [{ type, number, redTeams, blueTeams, redScore, blueScore }]
 */
async function getTBAMatches(tbaEventCode) {
  const cached = tbaMatchCache.get(tbaEventCode);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.matches;
  }

  const tbaAuthKey = process.env.TBA_AUTH_KEY;
  if (!tbaAuthKey) throw new Error('TBA_AUTH_KEY environment variable is not configured');

  const url = `https://www.thebluealliance.com/api/v3/event/${tbaEventCode}/matches`;
  const response = await fetch(url, {
    headers: { 'X-TBA-Auth-Key': tbaAuthKey },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`TBA API error: ${response.status}`);
  }

  const rawMatches = await response.json();
  if (!Array.isArray(rawMatches)) throw new Error('Unexpected TBA response format');

  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matches = [];

  for (const m of rawMatches) {
    const { comp_level, match_number, set_number, alliances } = m;

    let type, number;
    if (comp_level === 'qm')      { type = 'Q';  number = match_number; }
    else if (comp_level === 'sf') { type = 'SF'; number = set_number; }
    else if (comp_level === 'f')  { type = 'F';  number = match_number; }
    else continue;

    const redScore  = alliances?.red?.score  ?? -1;
    const blueScore = alliances?.blue?.score ?? -1;
    if (redScore < 0 || blueScore < 0) continue;

    const redTeams  = (alliances?.red?.team_keys  || []).map(k => parseInt(k.replace('frc', ''), 10));
    const blueTeams = (alliances?.blue?.team_keys || []).map(k => parseInt(k.replace('frc', ''), 10));
    if (redTeams.some(isNaN) || blueTeams.some(isNaN)) continue;

    const redBreakdown  = m.score_breakdown?.red  || null;
    const blueBreakdown = m.score_breakdown?.blue || null;

    matches.push({ type, number, redTeams, blueTeams, redScore, blueScore, redBreakdown, blueBreakdown });
  }

  matches.sort((a, b) => {
    const lo = (levelOrder[a.type] ?? 99) - (levelOrder[b.type] ?? 99);
    return lo !== 0 ? lo : a.number - b.number;
  });

  tbaMatchCache.set(tbaEventCode, { matches, fetchedAt: Date.now() });
  return matches;
}

/**
 * Read the current OPR blacklist for a game.
 * Returns an array of excluded match keys, e.g. ["Q3", "SF2"].
 * Returns [] if the table doesn't exist or has no rows yet.
 *
 * @param {string} gameName
 * @param {Object} client - pg client
 */
async function getOprBlacklist(gameName, client) {
  const tableName = sanitizeOprSettingsTableName(gameName);
  try {
    const result = await client.query(
      `SELECT blacklist FROM ${tableName} ORDER BY id LIMIT 1`
    );
    if (result.rows.length === 0) return [];
    return Array.isArray(result.rows[0].blacklist) ? result.rows[0].blacklist : [];
  } catch (_e) {
    // Table may not exist yet — that's fine, treat as empty blacklist
    return [];
  }
}

/**
 * Save the OPR blacklist for a game (upsert single row).
 *
 * @param {string} gameName
 * @param {string[]} blacklist - array of match keys to exclude
 * @param {Object} client - pg client
 */
async function saveOprBlacklist(gameName, blacklist, client) {
  const tableName = await ensureOprSettingsTableForGame({ game_name: gameName }, client);
  // Upsert: update existing row, or insert if none
  const result = await client.query(`SELECT id FROM ${tableName} LIMIT 1`);
  if (result.rows.length > 0) {
    await client.query(
      `UPDATE ${tableName} SET blacklist = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(blacklist), result.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO ${tableName} (blacklist) VALUES ($1)`,
      [JSON.stringify(blacklist)]
    );
  }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Fetch enabled matches (blacklist applied) for an active game.
 * Returns null if the game isn't PPR-enabled, tbaEventCode is missing, or no matches.
 *
 * @param {Object} activeGame
 * @returns {Promise<Array|null>}
 */
async function getEnabledMatches(activeGame) {
  const config = activeGame?.config_json || {};
  if (config.usePPR !== true) return null;

  const tbaEventCode = activeGame.tba_event_code || config.tbaEventCode;
  if (!tbaEventCode) return null;

  let allMatches, blacklist;
  const client = await pool.connect();
  try {
    [allMatches, blacklist] = await Promise.all([
      getTBAMatches(tbaEventCode),
      getOprBlacklist(activeGame.game_name, client),
    ]);
  } finally {
    client.release();
  }

  if (!allMatches || allMatches.length === 0) return null;

  const blacklistSet = new Set(blacklist);
  const enabled = allMatches.filter(m => !blacklistSet.has(`${m.type}${m.number}`));
  return enabled.length > 0 ? enabled : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a team → overall PPR map for the active game.
 * Uses all enabled (non-blacklisted) matches.
 * Returns null if usePPR is not set, tbaEventCode is missing, or PPR cannot be computed.
 *
 * @param {Object} activeGame - game row with config_json and game_name
 * @returns {Promise<Map<number, number>|null>}
 */
async function getTeamOPRMap(activeGame) {
  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  const results = computeOPR(enabledMatches, OPR_LAMBDA);
  if (!results) return null;

  return new Map(results.map(r => [r.team, r.opr]));
}

/**
 * Compute a team → last-3-matches PPR map for the active game.
 *
 * Uses the adjusted-contribution method: compute full-event OPR once, then for
 * each team's 3 most recent matches estimate their contribution as:
 *   allianceScore - sum(full-event OPR of the team's two teammates)
 * The average of those 3 contributions is the last-3 PPR.
 *
 * This avoids re-solving OPR per team and handles early/playoff matches cleanly.
 *
 * Returns null if usePPR is not set, tbaEventCode is missing, or data is insufficient.
 *
 * @param {Object} activeGame
 * @returns {Promise<Map<number, number>|null>}
 */
async function getLast3OPRMap(activeGame) {
  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  // One full-event OPR solve
  const fullOPR = computeOPR(enabledMatches, OPR_LAMBDA);
  if (!fullOPR) return null;
  const oprMap = new Map(fullOPR.map(r => [r.team, r.opr]));

  // Sort order: Q < SF < F, ascending by number
  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matchOrder = m => (levelOrder[m.type] ?? 99) * 10000 + m.number;

  // Build per-team sorted match list (all types)
  const teamMatchList = {};
  enabledMatches.forEach(m => {
    [...m.redTeams, ...m.blueTeams].forEach(team => {
      if (!teamMatchList[team]) teamMatchList[team] = [];
      teamMatchList[team].push(m);
    });
  });
  Object.values(teamMatchList).forEach(list =>
    list.sort((a, b) => matchOrder(a) - matchOrder(b))
  );

  const last3Map = new Map();

  for (const [teamStr, matchList] of Object.entries(teamMatchList)) {
    const team = Number(teamStr);
    const last3 = matchList.slice(-3);
    if (last3.length === 0) continue;

    // Adjusted contribution per match: allianceScore − teammates' full-event OPR
    const contributions = last3.map(m => {
      const isRed = m.redTeams.includes(team);
      const allianceScore = isRed ? m.redScore : m.blueScore;
      const teammates = (isRed ? m.redTeams : m.blueTeams).filter(t => t !== team);
      const teammatesOPR = teammates.reduce((sum, t) => sum + (oprMap.get(t) ?? 0), 0);
      return allianceScore - teammatesOPR;
    });

    const avg = contributions.reduce((s, v) => s + v, 0) / contributions.length;
    last3Map.set(team, avg);
  }

  return last3Map.size > 0 ? last3Map : null;
}

/**
 * Compute per-match adjusted PPR contributions for a team across qualification matches.
 *
 * For each Q match the team played, their contribution is estimated as:
 *   allianceScore − sum(full-event OPR of the two teammates)
 *
 * This directly answers "how much did this team score beyond what their partners
 * were expected to contribute?" and works from Q1 with no singularity issues.
 *
 * Returns [{match: number, epa: contribution}, ...] in ascending match order,
 * or [] if usePPR is not enabled / insufficient data.
 *
 * @param {Object} activeGame
 * @param {number} teamNumber
 * @returns {Promise<Array>}
 */
async function getPPROverTime(activeGame, teamNumber) {
  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return [];

  // One full-event OPR solve
  const fullOPR = computeOPR(enabledMatches, OPR_LAMBDA);
  if (!fullOPR) return [];
  const oprMap = new Map(fullOPR.map(r => [r.team, r.opr]));

  // Q matches the target team played, sorted ascending
  const teamQualMatches = enabledMatches
    .filter(m => m.type === 'Q' && (m.redTeams.includes(teamNumber) || m.blueTeams.includes(teamNumber)))
    .sort((a, b) => a.number - b.number);

  if (teamQualMatches.length === 0) return [];

  return teamQualMatches.map(m => {
    const isRed = m.redTeams.includes(teamNumber);
    const allianceScore = isRed ? m.redScore : m.blueScore;
    const teammates = (isRed ? m.redTeams : m.blueTeams).filter(t => t !== teamNumber);
    const teammatesOPR = teammates.reduce((sum, t) => sum + (oprMap.get(t) ?? 0), 0);
    const contribution = allianceScore - teammatesOPR;
    return { match: m.number, epa: Math.round(contribution * 100) / 100 };
  });
}

/**
 * Compute per-period PPR data for a single team: avgAuto/Tele/End, last3 per period,
 * and autoOverTime / teleOverTime using the adjusted-contribution method.
 *
 * Requires `config.pprBreakdownFields` in the game config.
 * Returns null if usePPR is off, breakdown fields aren't configured, or TBA data is missing.
 *
 * @param {Object} activeGame
 * @param {number} teamNumber
 * @returns {Promise<{avgAuto, avgTele, avgEnd, last3Auto, last3Tele, last3End, autoOverTime, teleOverTime}|null>}
 */
async function getPerPeriodTeamData(activeGame, teamNumber) {
  const config = activeGame?.config_json || {};
  const breakdownFields = config.pprBreakdownFields;
  if (!breakdownFields) return null;

  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  const buildPeriodMatches = (field) =>
    enabledMatches
      .filter(m => m.redBreakdown?.[field] != null && m.blueBreakdown?.[field] != null)
      .map(m => ({ ...m, redScore: m.redBreakdown[field], blueScore: m.blueBreakdown[field] }));

  const autoMatches = buildPeriodMatches(breakdownFields.auto);
  const teleMatches = buildPeriodMatches(breakdownFields.tele);
  const endMatches  = buildPeriodMatches(breakdownFields.end);

  if (autoMatches.length === 0 && teleMatches.length === 0 && endMatches.length === 0) return null;

  const toMap = (results) => results ? new Map(results.map(r => [r.team, r.opr])) : new Map();
  const autoOPRMap = toMap(autoMatches.length > 0 ? computeOPR(autoMatches, OPR_LAMBDA) : null);
  const teleOPRMap = toMap(teleMatches.length > 0 ? computeOPR(teleMatches, OPR_LAMBDA) : null);
  const endOPRMap  = toMap(endMatches.length  > 0 ? computeOPR(endMatches, OPR_LAMBDA)  : null);

  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matchOrder = m => (levelOrder[m.type] ?? 99) * 10000 + m.number;

  const adjustedContribution = (m, oprMap) => {
    const isRed = m.redTeams.includes(teamNumber);
    const score = isRed ? m.redScore : m.blueScore;
    const teammates = (isRed ? m.redTeams : m.blueTeams).filter(t => t !== teamNumber);
    return score - teammates.reduce((sum, t) => sum + (oprMap.get(t) ?? 0), 0);
  };

  const computeLast3Avg = (periodMatches, oprMap) => {
    const teamMatches = periodMatches
      .filter(m => m.redTeams.includes(teamNumber) || m.blueTeams.includes(teamNumber))
      .sort((a, b) => matchOrder(a) - matchOrder(b))
      .slice(-3);
    if (teamMatches.length === 0) return null;
    const sum = teamMatches.reduce((s, m) => s + adjustedContribution(m, oprMap), 0);
    return Math.round((sum / teamMatches.length) * 10) / 10;
  };

  const computeOverTime = (periodMatches, oprMap, valueKey) =>
    periodMatches
      .filter(m => m.type === 'Q' && (m.redTeams.includes(teamNumber) || m.blueTeams.includes(teamNumber)))
      .sort((a, b) => a.number - b.number)
      .map(m => ({ match: m.number, [valueKey]: Math.round(adjustedContribution(m, oprMap) * 100) / 100 }));

  return {
    avgAuto:  autoOPRMap.size > 0 ? (autoOPRMap.get(teamNumber) ?? null) : null,
    avgTele:  teleOPRMap.size > 0 ? (teleOPRMap.get(teamNumber) ?? null) : null,
    avgEnd:   endOPRMap.size  > 0 ? (endOPRMap.get(teamNumber)  ?? null) : null,
    last3Auto: computeLast3Avg(autoMatches, autoOPRMap),
    last3Tele: computeLast3Avg(teleMatches, teleOPRMap),
    last3End:  computeLast3Avg(endMatches,  endOPRMap),
    autoOverTime: computeOverTime(autoMatches, autoOPRMap, 'auto'),
    teleOverTime: computeOverTime(teleMatches, teleOPRMap, 'tele'),
  };
}

/**
 * Compute per-period (auto / tele / end) OPR maps using TBA score_breakdown data.
 *
 * Requires `config.pprBreakdownFields` to map period names to TBA score_breakdown keys:
 *   { auto: "autoPoints", tele: "teleopPoints", end: "endgamePoints" }
 *
 * Returns { auto: Map<team, opr>, tele: Map<team, opr>, end: Map<team, opr> },
 * or null if usePPR is off, breakdown fields aren't configured, or TBA data is missing.
 *
 * @param {Object} activeGame
 * @returns {Promise<{auto: Map, tele: Map, end: Map}|null>}
 */
async function getPerPeriodOPRMaps(activeGame) {
  const config = activeGame?.config_json || {};
  const breakdownFields = config.pprBreakdownFields;
  if (!breakdownFields) return null;

  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  const toMap = (results) => results ? new Map(results.map(r => [r.team, r.opr])) : null;

  const buildPeriodMatches = (field) =>
    enabledMatches
      .filter(m => m.redBreakdown?.[field] != null && m.blueBreakdown?.[field] != null)
      .map(m => ({ ...m, redScore: m.redBreakdown[field], blueScore: m.blueBreakdown[field] }));

  const autoMatches = buildPeriodMatches(breakdownFields.auto);
  const teleMatches = buildPeriodMatches(breakdownFields.tele);
  const endMatches  = buildPeriodMatches(breakdownFields.end);

  const auto = toMap(autoMatches.length > 0 ? computeOPR(autoMatches, OPR_LAMBDA) : null);
  const tele = toMap(teleMatches.length > 0 ? computeOPR(teleMatches, OPR_LAMBDA) : null);
  const end  = toMap(endMatches.length  > 0 ? computeOPR(endMatches, OPR_LAMBDA)  : null);

  if (!auto && !tele && !end) return null;
  return { auto, tele, end };
}

/**
 * Compute last-3 adjusted-contribution maps per period for all teams.
 * Uses the same method as getPerPeriodTeamData but returns Maps for all teams at once.
 *
 * Returns { auto: Map<team, last3>, tele: Map<team, last3>, end: Map<team, last3> },
 * or null if breakdown fields aren't configured or TBA data is missing.
 *
 * @param {Object} activeGame
 * @returns {Promise<{auto: Map, tele: Map, end: Map}|null>}
 */
async function getLast3PerPeriodOPRMaps(activeGame) {
  const config = activeGame?.config_json || {};
  const breakdownFields = config.pprBreakdownFields;
  if (!breakdownFields) return null;

  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  const buildPeriodMatches = (field) =>
    enabledMatches
      .filter(m => m.redBreakdown?.[field] != null && m.blueBreakdown?.[field] != null)
      .map(m => ({ ...m, redScore: m.redBreakdown[field], blueScore: m.blueBreakdown[field] }));

  const autoMatches = buildPeriodMatches(breakdownFields.auto);
  const teleMatches = buildPeriodMatches(breakdownFields.tele);
  const endMatches  = buildPeriodMatches(breakdownFields.end);

  const toOPRMap = (results) => results ? new Map(results.map(r => [r.team, r.opr])) : new Map();
  const autoOPRMap = toOPRMap(autoMatches.length > 0 ? computeOPR(autoMatches, OPR_LAMBDA) : null);
  const teleOPRMap = toOPRMap(teleMatches.length > 0 ? computeOPR(teleMatches, OPR_LAMBDA) : null);
  const endOPRMap  = toOPRMap(endMatches.length  > 0 ? computeOPR(endMatches, OPR_LAMBDA)  : null);

  const allTeams = new Set();
  enabledMatches.forEach(m => {
    m.redTeams.forEach(t => allTeams.add(t));
    m.blueTeams.forEach(t => allTeams.add(t));
  });

  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matchOrder = m => (levelOrder[m.type] ?? 99) * 10000 + m.number;

  const adjustedContribution = (m, teamNumber, oprMap) => {
    const isRed = m.redTeams.includes(teamNumber);
    const score = isRed ? m.redScore : m.blueScore;
    const teammates = (isRed ? m.redTeams : m.blueTeams).filter(t => t !== teamNumber);
    return score - teammates.reduce((sum, t) => sum + (oprMap.get(t) ?? 0), 0);
  };

  const computeLast3Map = (periodMatches, oprMap) => {
    if (periodMatches.length === 0) return null;
    const result = new Map();
    allTeams.forEach(teamNumber => {
      const teamMatches = periodMatches
        .filter(m => m.redTeams.includes(teamNumber) || m.blueTeams.includes(teamNumber))
        .sort((a, b) => matchOrder(a) - matchOrder(b))
        .slice(-3);
      if (teamMatches.length === 0) return;
      const sum = teamMatches.reduce((s, m) => s + adjustedContribution(m, teamNumber, oprMap), 0);
      result.set(teamNumber, Math.round((sum / teamMatches.length) * 10) / 10);
    });
    return result;
  };

  const auto = computeLast3Map(autoMatches, autoOPRMap);
  const tele = computeLast3Map(teleMatches, teleOPRMap);
  const end  = computeLast3Map(endMatches,  endOPRMap);

  if (!auto && !tele && !end) return null;
  return { auto, tele, end };
}

export { getTBAMatches, getOprBlacklist, saveOprBlacklist, getTeamOPRMap, getLast3OPRMap, getPPROverTime, getPerPeriodOPRMaps, getPerPeriodTeamData, getLast3PerPeriodOPRMaps };
