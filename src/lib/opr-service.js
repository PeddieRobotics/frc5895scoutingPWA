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

    matches.push({ type, number, redTeams, blueTeams, redScore, blueScore });
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

  const results = computeOPR(enabledMatches);
  if (!results) return null;

  return new Map(results.map(r => [r.team, r.opr]));
}

/**
 * Compute a team → last-3-matches PPR map for the active game.
 *
 * For each team, their contribution to the match matrix is temporarily limited
 * to their 3 most recent enabled matches; all other teams keep all their matches
 * (preserving matrix conditioning). PPR is then solved once per team.
 *
 * Returns null if usePPR is not set, tbaEventCode is missing, or data is insufficient.
 *
 * @param {Object} activeGame
 * @returns {Promise<Map<number, number>|null>}
 */
async function getLast3OPRMap(activeGame) {
  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return null;

  // Match sort order: Q < SF < F, ascending by number
  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matchOrder = m => (levelOrder[m.type] ?? 99) * 10000 + m.number;

  // Build per-team sorted match list
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

    // The 3 most recent match keys for this team
    const last3Keys = new Set(matchList.slice(-3).map(m => `${m.type}${m.number}`));

    // Temporarily exclude this team's older matches; all others stay
    const filteredMatches = enabledMatches.filter(m => {
      const hasTeam = m.redTeams.includes(team) || m.blueTeams.includes(team);
      return hasTeam ? last3Keys.has(`${m.type}${m.number}`) : true;
    });

    const results = computeOPR(filteredMatches);
    if (results) {
      const entry = results.find(r => r.team === team);
      if (entry) last3Map.set(team, entry.opr);
    }
  }

  return last3Map.size > 0 ? last3Map : null;
}

/**
 * Compute running PPR (OPR) for a team across qualification matches.
 * At each Q match the team played, OPR is computed using only matches
 * played up to and including that match — showing how their PPR evolved
 * over the course of the event.
 *
 * Returns [{match: number, epa: ppr}, ...] in ascending match order,
 * or [] if usePPR is not enabled / insufficient data.
 *
 * @param {Object} activeGame
 * @param {number} teamNumber
 * @returns {Promise<Array>}
 */
async function getPPROverTime(activeGame, teamNumber) {
  const enabledMatches = await getEnabledMatches(activeGame);
  if (!enabledMatches) return [];

  const levelOrder = { Q: 0, SF: 1, F: 2 };
  const matchOrder = m => (levelOrder[m.type] ?? 99) * 10000 + m.number;

  // Qualification matches the target team participated in, sorted ascending
  const teamQualMatches = enabledMatches
    .filter(m => m.type === 'Q' && (m.redTeams.includes(teamNumber) || m.blueTeams.includes(teamNumber)))
    .sort((a, b) => a.number - b.number);

  if (teamQualMatches.length === 0) return [];

  const result = [];

  for (const m of teamQualMatches) {
    const cutoff = matchOrder(m);
    // All enabled matches played up to and including this match
    const subset = enabledMatches.filter(x => matchOrder(x) <= cutoff);
    // λ=1.0 regularisation stabilises early matches where MTM is singular
    const oprResults = computeOPR(subset, 1.0);
    if (!oprResults) continue;
    const entry = oprResults.find(r => r.team === teamNumber);
    if (entry) {
      result.push({ match: m.number, epa: Math.round(entry.opr * 100) / 100 });
    }
  }

  return result;
}

export { getTBAMatches, getOprBlacklist, saveOprBlacklist, getTeamOPRMap, getLast3OPRMap, getPPROverTime };
