/**
 * Game Configuration Helpers
 * Database operations and utilities for game management
 */

import { pool } from './auth.js';
import { extractFieldsFromConfig, generateCreateTableSQL, sanitizeTableName } from './schema-generator.js';

// Cache for active game config (5 minute TTL)
let activeGameCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize the game_configs table if it doesn't exist
 */
async function initializeGameConfigsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_configs (
        id SERIAL PRIMARY KEY,
        game_name VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(200) NOT NULL,
        table_name VARCHAR(100) NOT NULL UNIQUE,
        config_json JSONB NOT NULL,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100)
      );
    `);

    // Create unique index for active game (only one can be active)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_game
      ON game_configs (is_active) WHERE is_active = TRUE;
    `);

    console.log('[GameConfig] Initialized game_configs table');
  } finally {
    client.release();
  }
}

/**
 * Get all game configurations
 * @returns {Promise<Array>} Array of game config summaries
 */
async function getAllGames() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, game_name, display_name, table_name, is_active, created_at, updated_at, created_by
      FROM game_configs
      ORDER BY created_at DESC
    `);
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get a specific game configuration by ID
 * @param {number} id - Game ID
 * @returns {Promise<Object|null>} Game config or null
 */
async function getGameById(id) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM game_configs WHERE id = $1
    `, [id]);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get a game configuration by name
 * @param {string} gameName - Game name
 * @returns {Promise<Object|null>} Game config or null
 */
async function getGameByName(gameName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM game_configs WHERE game_name = $1
    `, [gameName]);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Get the currently active game configuration
 * @param {boolean} useCache - Whether to use cached value
 * @returns {Promise<Object|null>} Active game config or null
 */
async function getActiveGame(useCache = true) {
  // Check cache
  if (useCache && activeGameCache && cacheTimestamp) {
    const age = Date.now() - cacheTimestamp;
    if (age < CACHE_TTL) {
      return activeGameCache;
    }
  }

  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM game_configs WHERE is_active = TRUE
    `);

    const activeGame = result.rows[0] || null;

    // Update cache
    activeGameCache = activeGame;
    cacheTimestamp = Date.now();

    return activeGame;
  } finally {
    client.release();
  }
}

/**
 * Clear the active game cache
 */
function clearActiveGameCache() {
  activeGameCache = null;
  cacheTimestamp = null;
}

/**
 * Create a new game configuration and its data table
 * @param {Object} params - { gameName, displayName, configJson, createdBy }
 * @returns {Promise<Object>} Created game config with table info
 */
async function createGame({ gameName, displayName, configJson, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Generate table name
    const tableName = sanitizeTableName(gameName);

    // Check if game name or table name already exists
    const existing = await client.query(`
      SELECT game_name, table_name FROM game_configs
      WHERE game_name = $1 OR table_name = $2
    `, [gameName, tableName]);

    if (existing.rows.length > 0) {
      throw new Error(`Game with name "${gameName}" or table "${tableName}" already exists`);
    }

    // Extract fields and generate CREATE TABLE SQL
    const fields = extractFieldsFromConfig(configJson);
    const createTableSQL = generateCreateTableSQL(tableName, fields);

    // Create the data table
    await client.query(createTableSQL);
    console.log(`[GameConfig] Created table: ${tableName}`);

    // Insert into game_configs
    const insertResult = await client.query(`
      INSERT INTO game_configs (game_name, display_name, table_name, config_json, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [gameName, displayName, tableName, JSON.stringify(configJson), createdBy]);

    await client.query('COMMIT');

    return {
      ...insertResult.rows[0],
      columnsCreated: fields.map(f => f.name),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update a game configuration
 * @param {number} id - Game ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated game config
 */
async function updateGame(id, { displayName, configJson }) {
  const client = await pool.connect();

  try {
    const updates = [];
    const values = [id];
    let paramIndex = 2;

    if (displayName !== undefined) {
      updates.push(`display_name = $${paramIndex}`);
      values.push(displayName);
      paramIndex++;
    }

    if (configJson !== undefined) {
      updates.push(`config_json = $${paramIndex}`);
      values.push(JSON.stringify(configJson));
      paramIndex++;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const result = await client.query(`
      UPDATE game_configs
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Game not found');
    }

    // Clear cache if active game was updated
    if (result.rows[0].is_active) {
      clearActiveGameCache();
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Delete a game configuration
 * @param {number} id - Game ID
 * @param {boolean} dropTable - Whether to drop the data table
 * @returns {Promise<Object>} Deleted game info
 */
async function deleteGame(id, dropTable = false) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get game info first
    const gameResult = await client.query(`
      SELECT * FROM game_configs WHERE id = $1
    `, [id]);

    if (gameResult.rows.length === 0) {
      throw new Error('Game not found');
    }

    const game = gameResult.rows[0];

    if (game.is_active) {
      throw new Error('Cannot delete the active game. Please activate another game first.');
    }

    // Delete from game_configs
    await client.query(`
      DELETE FROM game_configs WHERE id = $1
    `, [id]);

    // Optionally drop the data table
    if (dropTable) {
      await client.query(`DROP TABLE IF EXISTS ${game.table_name}`);
      console.log(`[GameConfig] Dropped table: ${game.table_name}`);
    }

    await client.query('COMMIT');

    return { ...game, tableDropped: dropTable };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Activate a game (deactivate all others)
 * @param {number} id - Game ID to activate
 * @returns {Promise<Object>} Activated game config
 */
async function activateGame(id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Deactivate all games
    await client.query(`
      UPDATE game_configs SET is_active = FALSE WHERE is_active = TRUE
    `);

    // Activate the specified game
    const result = await client.query(`
      UPDATE game_configs
      SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Game not found');
    }

    await client.query('COMMIT');

    // Clear cache
    clearActiveGameCache();

    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the count of records in a game's data table
 * @param {string} tableName - The table name
 * @returns {Promise<number>} Record count
 */
async function getGameDataCount(tableName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    // Table might not exist
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Check if a table exists
 * @param {string} tableName - The table name
 * @returns {Promise<boolean>} Whether table exists
 */
async function tableExists(tableName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )
    `, [tableName]);
    return result.rows[0].exists;
  } finally {
    client.release();
  }
}

/**
 * Get columns for a table
 * @param {string} tableName - The table name
 * @returns {Promise<Array>} Array of column definitions
 */
async function getTableColumns(tableName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    return result.rows;
  } finally {
    client.release();
  }
}

export {
  initializeGameConfigsTable,
  getAllGames,
  getGameById,
  getGameByName,
  getActiveGame,
  clearActiveGameCache,
  createGame,
  updateGame,
  deleteGame,
  activateGame,
  getGameDataCount,
  tableExists,
  getTableColumns,
};
