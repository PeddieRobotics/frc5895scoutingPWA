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

/**
 * Compute a team → OPR map for the active game.
 * Returns null if usePPR is not set, tbaEventCode is missing, or OPR cannot be computed.
 *
 * @param {Object} activeGame - game row with config_json and game_name
 * @returns {Promise<Map<number, number>|null>}
 */
async function getTeamOPRMap(activeGame) {
  const config = activeGame?.config_json || {};
  if (config.usePPR !== true) return null;

  const tbaEventCode = activeGame.tba_event_code || config.tbaEventCode;
  if (!tbaEventCode) return null;

  const gameName = activeGame.game_name;

  // Fetch TBA matches (cached) and blacklist in parallel
  let allMatches, blacklist;
  const client = await pool.connect();
  try {
    [allMatches, blacklist] = await Promise.all([
      getTBAMatches(tbaEventCode),
      getOprBlacklist(gameName, client),
    ]);
  } finally {
    client.release();
  }

  if (!allMatches || allMatches.length === 0) return null;

  // Filter out blacklisted matches
  const blacklistSet = new Set(blacklist);
  const enabledMatches = allMatches.filter(
    m => !blacklistSet.has(`${m.type}${m.number}`)
  );

  if (enabledMatches.length === 0) return null;

  const results = computeOPR(enabledMatches);
  if (!results) return null;

  return new Map(results.map(r => [r.team, r.opr]));
}

export { getTBAMatches, getOprBlacklist, saveOprBlacklist, getTeamOPRMap };
