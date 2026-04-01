/**
 * Game Configuration Helpers
 * Database operations and utilities for game management
 */

import { pool } from './auth.js';
import {
  extractFieldsFromConfig,
  extractTimerFieldsFromConfig,
  generateCreateTableSQL,
  generateCreateScoutLeadsTableSQL,
  sanitizeTableName,
  sanitizeScoutLeadsTableName,
  sanitizeOprSettingsTableName,
  sanitizePrescoutTableName,
  sanitizePhotosTableName,
} from './schema-generator.js';

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

// No in-memory cache: serverless environments (Vercel) run each API route in a
// separate Lambda instance, so a cache cleared in one Lambda is invisible to
// others.  The DB round-trip is fast enough that we query fresh every time.

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

    // Migration: ensure is_active column exists for older installations
    await client.query(`
      ALTER TABLE game_configs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
    `);

    // Migration: fix any wrong DEFAULT (set it to FALSE)
    await client.query(`
      ALTER TABLE game_configs ALTER COLUMN is_active SET DEFAULT FALSE;
    `);

    // Migration: ensure rows that somehow have NULL is_active are treated as inactive
    await client.query(`
      UPDATE game_configs SET is_active = FALSE WHERE is_active IS NULL;
    `);

    // Create unique index for active game (only one can be active at a time).
    // Drop duplicates first if somehow the table ended up with multiple active games.
    await client.query(`
      DO $$
      DECLARE dup_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO dup_count FROM game_configs WHERE is_active = TRUE;
        IF dup_count > 1 THEN
          -- Keep only the most recently updated active game; deactivate the rest
          UPDATE game_configs SET is_active = FALSE
          WHERE is_active = TRUE
            AND id NOT IN (
              SELECT id FROM game_configs WHERE is_active = TRUE
              ORDER BY updated_at DESC LIMIT 1
            );
        END IF;
      END $$;
    `);

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
      SELECT id, game_name, display_name, table_name, is_active, tba_event_code, created_at, updated_at, created_by
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
 * @returns {Promise<Object|null>} Active game config or null
 */
async function getActiveGame() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM game_configs
      WHERE is_active = TRUE
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Parse a game ID from query/body/header input.
 * @param {unknown} value
 * @returns {number|null}
 */
function parseRequestedGameId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * Resolve a game by explicit ID, or fall back to active game.
 * @param {number|string|null|undefined} gameId
 * @param {{ preferActive?: boolean }} [options]
 * @returns {Promise<Object|null>}
 */
async function getGameByIdOrActive(gameId, options = {}) {
  const preferActive = options.preferActive !== false;
  const parsedId = parseRequestedGameId(gameId);

  // Default behavior for app data endpoints: always prefer the currently active
  // game so stale client IDs cannot force requests onto an inactive config.
  if (preferActive) {
    const activeGame = await getActiveGame();
    if (activeGame) {
      return activeGame;
    }
  }

  if (parsedId === null) {
    return null;
  }

  return getGameById(parsedId);
}

/**
 * No-op: cache was removed (serverless environments have per-Lambda module
 * instances so clearing one Lambda's cache doesn't affect others).
 */
function clearActiveGameCache() {
  // intentionally empty
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
    const scoutLeadsTableName = sanitizeScoutLeadsTableName(gameName);

    // Check if game name or table name already exists
    const existing = await client.query(`
      SELECT game_name, table_name FROM game_configs
      WHERE game_name = $1 OR table_name = $2
    `, [gameName, tableName]);

    if (existing.rows.length > 0) {
      throw new Error(`Game with name "${gameName}" or table "${tableName}" already exists`);
    }

    // Guard against scout-leads table collisions from truncation or orphaned tables
    const scoutLeadsExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )
    `, [scoutLeadsTableName]);

    if (scoutLeadsExists.rows[0]?.exists) {
      throw new Error(`Scout leads table "${scoutLeadsTableName}" already exists`);
    }

    // Extract fields and generate CREATE TABLE SQL
    const fields = extractFieldsFromConfig(configJson);
    const createTableSQL = generateCreateTableSQL(tableName, fields);
    const timerFields = extractTimerFieldsFromConfig(configJson);
    const createScoutLeadsTableSQL = generateCreateScoutLeadsTableSQL(scoutLeadsTableName, timerFields);

    // Create the data table
    await client.query(createTableSQL);
    console.log(`[GameConfig] Created table: ${tableName}`);

    // Create the scout leads data table
    await client.query(createScoutLeadsTableSQL);
    console.log(`[GameConfig] Created scout leads table: ${scoutLeadsTableName}`);

    // Create prescout and photos tables
    const prescoutTableName = sanitizePrescoutTableName(gameName);
    const photosTableName = sanitizePhotosTableName(gameName);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${prescoutTableName} (
        id SERIAL PRIMARY KEY,
        team_number INTEGER NOT NULL UNIQUE,
        data JSONB NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`[GameConfig] Created prescout table: ${prescoutTableName}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${photosTableName} (
        id SERIAL PRIMARY KEY,
        team_number INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        photo_data TEXT NOT NULL,
        mime_type VARCHAR(50) NOT NULL,
        uploaded_by VARCHAR(100),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`[GameConfig] Created photos table: ${photosTableName}`);

    // Insert into game_configs
    const tbaEventCode = configJson.tbaEventCode || null;
    const insertResult = await client.query(`
      INSERT INTO game_configs (game_name, display_name, table_name, config_json, created_by, tba_event_code)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [gameName, displayName, tableName, JSON.stringify(configJson), createdBy, tbaEventCode]);

    await client.query('COMMIT');

    return {
      ...insertResult.rows[0],
      columnsCreated: fields.map(f => f.name),
      scoutLeadsTableName,
      scoutLeadsColumnsCreated: timerFields.map((f) => f.name),
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
      updates.push(`tba_event_code = $${paramIndex}`);
      values.push(configJson.tbaEventCode || null);
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
      const scoutLeadsTableName = sanitizeScoutLeadsTableName(game.game_name);
      await client.query(`DROP TABLE IF EXISTS ${scoutLeadsTableName}`);
      console.log(`[GameConfig] Dropped table: ${scoutLeadsTableName}`);

      const prescoutTableName = sanitizePrescoutTableName(game.game_name);
      const photosTableName = sanitizePhotosTableName(game.game_name);
      await client.query(`DROP TABLE IF EXISTS ${prescoutTableName}`);
      console.log(`[GameConfig] Dropped table: ${prescoutTableName}`);
      await client.query(`DROP TABLE IF EXISTS ${photosTableName}`);
      console.log(`[GameConfig] Dropped table: ${photosTableName}`);
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

function getScoutLeadsTableName(gameName) {
  return sanitizeScoutLeadsTableName(gameName);
}

/**
 * Ensure the scout leads table exists for a given game configuration
 * @param {Object} game - Game row with game_name and config_json
 * @param {Object|null} existingClient - Optional PG client to reuse
 * @returns {Promise<{tableName: string, timerFields: Array}>}
 */
async function ensureScoutLeadsTableForGame(game, existingClient = null) {
  if (!game) {
    throw new Error('Game is required');
  }

  const gameName = game.game_name || game.gameName || game.config_json?.gameName;
  if (!gameName) {
    throw new Error('Game name is required to derive scout leads table name');
  }

  const config = game.config_json || game.configJson || {};
  const timerFields = extractTimerFieldsFromConfig(config);
  const tableName = sanitizeScoutLeadsTableName(gameName);
  const createTableSQL = generateCreateScoutLeadsTableSQL(tableName, timerFields);

  const client = existingClient || await pool.connect();
  try {
    await client.query(createTableSQL);

    // Ensure comment column exists for tables created before this was added.
    await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS comment TEXT`);

    // Older versions created a unique constraint on (team, match, matchtype).
    // Remove it so multiple scout-lead entries can be averaged per match.
    const constraintsResult = await client.query(`
      SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = $1
        AND c.contype = 'u'
    `, [tableName]);

    for (const row of constraintsResult.rows) {
      const definition = row.definition || '';
      if (/UNIQUE\s*\(\s*team\s*,\s*match\s*,\s*matchtype\s*\)/i.test(definition)) {
        await client.query(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(row.conname)}`);
      }
    }
  } finally {
    if (!existingClient) {
      client.release();
    }
  }

  return { tableName, timerFields };
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

/**
 * Add new columns to the scouting table for fields added to the config.
 * Uses ADD COLUMN IF NOT EXISTS — safe to call multiple times, never drops columns.
 * @param {string} tableName - The scouting table name
 * @param {Array} newFields - Field definitions (name, type, default) from extractFieldsFromConfig
 */
async function migrateScoutingTable(tableName, newFields) {
  if (!newFields || newFields.length === 0) return { columnsAdded: [] };

  const client = await pool.connect();
  try {
    const columnsAdded = [];
    for (const field of newFields) {
      let def = `${field.name} ${field.type}`;

      if (field.default !== undefined && field.default !== null) {
        if (typeof field.default === 'boolean') {
          def += ` DEFAULT ${field.default ? 'TRUE' : 'FALSE'}`;
        } else if (typeof field.default === 'string' && field.default.includes('CURRENT')) {
          def += ` DEFAULT ${field.default}`;
        } else if (typeof field.default === 'number') {
          def += ` DEFAULT ${field.default}`;
        }
      }

      await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${def}`);
      columnsAdded.push(field.name);
    }
    return { columnsAdded };
  } finally {
    client.release();
  }
}

/**
 * Add new rate columns to the scout leads table for holdTimer fields added to the config.
 * Uses ADD COLUMN IF NOT EXISTS — safe to call multiple times, never drops columns.
 * @param {string} scoutLeadsTableName - The scout leads table name
 * @param {Array} timerFields - Timer field definitions from extractTimerFieldsFromConfig
 */
async function migrateScoutLeadsTable(scoutLeadsTableName, timerFields) {
  if (!timerFields || timerFields.length === 0) return { columnsAdded: [] };

  const client = await pool.connect();
  try {
    const columnsAdded = [];
    for (const field of timerFields) {
      const colType = field.scoutLeadsDbColumn?.type || 'NUMERIC(10,4)';
      const colDefault = field.scoutLeadsDbColumn?.default;

      let def = `${field.name} ${colType}`;
      if (colDefault !== undefined && colDefault !== null && typeof colDefault === 'number') {
        def += ` DEFAULT ${colDefault}`;
      }

      await client.query(`ALTER TABLE ${scoutLeadsTableName} ADD COLUMN IF NOT EXISTS ${def}`);
      columnsAdded.push(field.name);
    }
    return { columnsAdded };
  } finally {
    client.release();
  }
}

/**
 * Ensure the OPR settings table exists for a given game.
 * Creates opr_settings_{gameName} with a single JSON blacklist row.
 * @param {Object} game - Game row with game_name
 * @param {Object|null} existingClient - Optional PG client to reuse
 * @returns {Promise<string>} The table name
 */
async function ensureOprSettingsTableForGame(game, existingClient = null) {
  if (!game) throw new Error('Game is required');
  const gameName = game.game_name || game.gameName || game.config_json?.gameName;
  if (!gameName) throw new Error('Game name is required');

  const tableName = sanitizeOprSettingsTableName(gameName);
  const client = existingClient || await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        blacklist JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } finally {
    if (!existingClient) client.release();
  }
  return tableName;
}

export {
  initializeGameConfigsTable,
  getAllGames,
  getGameById,
  getGameByIdOrActive,
  getGameByName,
  getActiveGame,
  parseRequestedGameId,
  clearActiveGameCache,
  createGame,
  updateGame,
  deleteGame,
  activateGame,
  getGameDataCount,
  tableExists,
  getTableColumns,
  getScoutLeadsTableName,
  ensureScoutLeadsTableForGame,
  ensureOprSettingsTableForGame,
  migrateScoutingTable,
  migrateScoutLeadsTable,
};
