/**
 * Betting Service Layer
 * Handles Statbotics predictions, bet placement, resolution, and leaderboard queries.
 */

import { sanitizeBettingTableName, generateCreateBettingTableSQL } from './schema-generator.js';

// In-memory cache for Statbotics predictions (60s TTL)
const predictionCache = new Map();
const CACHE_TTL = 60_000;

/**
 * Ensure the betting table exists for a game (lazy creation for pre-existing games).
 */
async function ensureBettingTable(gameName, client) {
  const tableName = sanitizeBettingTableName(gameName);
  await client.query(generateCreateBettingTableSQL(tableName));
  // Migrate: add points_if_loss column if missing (for tables created before asymmetric payouts)
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS points_if_loss INTEGER NOT NULL DEFAULT 25`);
  return tableName;
}

/**
 * Build a Statbotics match key from event code and match number.
 * Only supports qualification matches (qm).
 */
function buildMatchKey(tbaEventCode, matchNumber) {
  return `${tbaEventCode}_qm${matchNumber}`;
}

/**
 * Fetch match prediction from Statbotics API with caching.
 * Returns { redWinProb, blueWinProb, predictedWinner, matchStatus } or null on error.
 */
async function getStatboticsPrediction(tbaEventCode, matchNumber) {
  const matchKey = buildMatchKey(tbaEventCode, matchNumber);

  // Check cache
  const cached = predictionCache.get(matchKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://api.statbotics.io/v3/match/${matchKey}`);
    if (!response.ok) {
      console.error(`[Betting] Statbotics returned ${response.status} for ${matchKey}`);
      return null;
    }

    const match = await response.json();
    const data = {
      redWinProb: match.pred?.red_win_prob ?? 0.5,
      blueWinProb: 1 - (match.pred?.red_win_prob ?? 0.5),
      predictedWinner: match.pred?.winner || 'unknown',
      matchStatus: match.status || 'Unknown',
      resultWinner: match.result?.winner || null,
    };

    predictionCache.set(matchKey, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error(`[Betting] Failed to fetch Statbotics prediction for ${matchKey}:`, err.message);
    return null;
  }
}

/**
 * Check if a match has started (not "Upcoming").
 */
async function isMatchStarted(tbaEventCode, matchNumber) {
  const prediction = await getStatboticsPrediction(tbaEventCode, matchNumber);
  if (!prediction) return null; // unknown — caller decides
  return prediction.matchStatus !== 'Upcoming';
}

/**
 * Calculate points for a bet using asymmetric payouts.
 * Win reward: exponential curve max(1, round(1000 * e^(-5.3 * chosenProb)))
 *   ~948 at 1%, ~266 at 25%, ~71 at 50%, ~19 at 75%, ~5 at 99%
 * Loss penalty: flat -25 points regardless of alliance.
 * Returns { pointsIfWin, pointsIfLoss }.
 */
const LOSS_PENALTY = 25;

function calculatePointsWagered(redWinProb, blueWinProb, alliance) {
  const chosenProb = alliance === 'red' ? redWinProb : blueWinProb;
  const pointsIfWin = Math.max(1, Math.round(1000 * Math.exp(-5.3 * chosenProb)));
  return { pointsIfWin, pointsIfLoss: LOSS_PENALTY };
}

/**
 * Resolve all pending bets for a game by checking Statbotics results.
 */
async function resolveCompletedBets(gameName, tbaEventCode, client) {
  const tableName = sanitizeBettingTableName(gameName);

  // Check if table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [tableName]);
  if (!tableCheck.rows[0]?.exists) return 0;

  // Get all pending bets
  const pending = await client.query(
    `SELECT id, match, matchtype, alliance, points_wagered, points_if_loss FROM ${tableName} WHERE status = 'pending'`
  );

  if (pending.rows.length === 0) return 0;

  let resolved = 0;

  for (const bet of pending.rows) {
    const prediction = await getStatboticsPrediction(tbaEventCode, bet.match);
    if (!prediction || prediction.matchStatus !== 'Completed') continue;

    const won = bet.alliance === prediction.resultWinner;
    const earned = won ? (bet.points_wagered || 0) : -(bet.points_if_loss || LOSS_PENALTY);

    await client.query(
      `UPDATE ${tableName}
       SET status = $1, points_earned = $2, resolved_at = NOW()
       WHERE id = $3`,
      [won ? 'won' : 'lost', earned, bet.id]
    );
    resolved++;
  }

  return resolved;
}

/**
 * Get the leaderboard for a game: aggregated points per scout.
 */
async function getLeaderboard(gameName, client) {
  const tableName = sanitizeBettingTableName(gameName);

  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [tableName]);
  if (!tableCheck.rows[0]?.exists) return [];

  const result = await client.query(`
    SELECT
      scoutname,
      scoutteam,
      COALESCE(SUM(points_earned), 0) AS balance,
      COUNT(*) FILTER (WHERE status = 'won') AS wins,
      COUNT(*) FILTER (WHERE status = 'lost') AS losses,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending,
      COUNT(*) AS total_bets
    FROM ${tableName}
    GROUP BY scoutname, scoutteam
    ORDER BY balance DESC, wins DESC
  `);

  return result.rows;
}

/**
 * Get a user's balance and stats for a game.
 */
async function getUserBalance(gameName, scoutname, scoutteam, client) {
  const tableName = sanitizeBettingTableName(gameName);

  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [tableName]);
  if (!tableCheck.rows[0]?.exists) {
    return { balance: 0, totalBets: 0, wins: 0, losses: 0, pending: 0 };
  }

  const result = await client.query(`
    SELECT
      COALESCE(SUM(points_earned), 0) AS balance,
      COUNT(*) AS total_bets,
      COUNT(*) FILTER (WHERE status = 'won') AS wins,
      COUNT(*) FILTER (WHERE status = 'lost') AS losses,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending
    FROM ${tableName}
    WHERE scoutname = $1 AND scoutteam = $2
  `, [scoutname, scoutteam]);

  const row = result.rows[0];
  return {
    balance: Number(row?.balance || 0),
    totalBets: Number(row?.total_bets || 0),
    wins: Number(row?.wins || 0),
    losses: Number(row?.losses || 0),
    pending: Number(row?.pending || 0),
  };
}

/**
 * Get a user's existing bet for a specific match.
 */
async function getUserBet(gameName, scoutname, scoutteam, matchNumber, matchtype, client) {
  const tableName = sanitizeBettingTableName(gameName);

  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [tableName]);
  if (!tableCheck.rows[0]?.exists) return null;

  const result = await client.query(
    `SELECT * FROM ${tableName}
     WHERE scoutname = $1 AND scoutteam = $2 AND match = $3 AND matchtype = $4`,
    [scoutname, scoutteam, matchNumber, matchtype]
  );

  return result.rows[0] || null;
}

/**
 * Place a bet. Returns the inserted row or throws on duplicate/validation error.
 */
async function placeBet(gameName, { scoutname, scoutteam, match, matchtype, alliance, redWinProb, blueWinProb, pointsWagered, pointsIfLoss }, client) {
  const tableName = await ensureBettingTable(gameName, client);

  const result = await client.query(
    `INSERT INTO ${tableName}
       (scoutname, scoutteam, match, matchtype, alliance, red_win_prob, blue_win_prob, points_wagered, points_if_loss)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [scoutname, scoutteam, match, matchtype, alliance, redWinProb, blueWinProb, pointsWagered, pointsIfLoss || LOSS_PENALTY]
  );

  return result.rows[0];
}

export {
  ensureBettingTable,
  buildMatchKey,
  getStatboticsPrediction,
  isMatchStarted,
  calculatePointsWagered,
  resolveCompletedBets,
  getLeaderboard,
  getUserBalance,
  getUserBet,
  placeBet,
};
