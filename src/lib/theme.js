import { sql } from '@vercel/postgres';
import { pool } from './db';

const TABLE_NAME = 'year_themes';

export function sanitizeIdentifier(name) {
  if (!name) return null;
  const ok = /^[a-zA-Z0-9_]+$/.test(name);
  return ok ? name : null;
}

export async function ensureThemesTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS year_themes (
      id BIGSERIAL PRIMARY KEY,
      year INT,
      theme_name TEXT NOT NULL,
      event_code TEXT,
      event_name TEXT,
      event_table TEXT NOT NULL,
      config JSONB NOT NULL,
      is_active BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
}

export async function getActiveTheme() {
  await ensureThemesTable();
  const { rows } = await sql`SELECT * FROM year_themes WHERE is_active = TRUE ORDER BY updated_at DESC LIMIT 1;`;
  return rows[0] || null;
}

export async function setActiveTheme(id) {
  await ensureThemesTable();
  const { rows } = await sql`UPDATE year_themes SET is_active = TRUE, updated_at = NOW() WHERE id = ${id} RETURNING id;`;
  if (!rows || !rows.length) {
    throw new Error('Theme not found');
  }
  await sql`UPDATE year_themes SET is_active = FALSE WHERE id <> ${id};`;
  // Ensure the active theme's event table exists, shaped from its config
  const { rows: eventRows } = await sql`SELECT event_table, config FROM year_themes WHERE id = ${id} LIMIT 1;`;
  const eventTable = eventRows?.[0]?.event_table;
  const cfg = eventRows?.[0]?.config || {};
  if (eventTable) {
    await ensureEventDataTable(eventTable, cfg);
  }
}

export async function listThemes() {
  await ensureThemesTable();
  const { rows } = await sql`SELECT * FROM year_themes ORDER BY updated_at DESC;`;
  return rows;
}

export async function createTheme({ year, themeName, eventCode, eventName, eventTable, config, activate = false }) {
  await ensureThemesTable();
  // Ensure the event data table exists for this theme with columns from config
  await ensureEventDataTable(eventTable, config);
  const { rows } = await sql`
    INSERT INTO year_themes (year, theme_name, event_code, event_name, event_table, config, is_active)
    VALUES (${year || null}, ${themeName}, ${eventCode || null}, ${eventName || null}, ${eventTable}, ${config}, ${Boolean(activate)})
    RETURNING *;
  `;
  const inserted = rows[0];
  if (activate && inserted?.id) {
    await sql`UPDATE year_themes SET is_active = FALSE WHERE id <> ${inserted.id};`;
  }
  return inserted;
}

// Create/upgrade an event data table using fields defined by the theme config
export async function ensureEventDataTable(tableName, config = {}) {
  const safe = sanitizeIdentifier(tableName);
  if (!safe) throw new Error('Invalid event table name');

  // Build SQL with sanitized identifier
  const createSql = `
    CREATE TABLE IF NOT EXISTS ${safe} (
      id BIGSERIAL PRIMARY KEY,
      scoutname TEXT,
      scoutteam INT,
      team INT,
      match INT,
      matchtype INT DEFAULT 2,
      noshow BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`;

  await pool.query(createSql);

  // Compute dynamic columns based on config
  const dynamicCols = new Map();

  const pushCounterCols = (arr) => {
    (arr || []).forEach(group => {
      (group.rows || []).forEach(r => {
        if (r?.success) dynamicCols.set(r.success, 'INT');
        if (r?.fail) dynamicCols.set(r.fail, 'INT');
      });
    });
  };

  pushCounterCols(config?.counters?.auto);
  pushCounterCols(config?.counters?.tele);

  (config?.teamFields || []).forEach(f => {
    if (!f?.name) return;
    switch (f.type) {
      case 'number': dynamicCols.set(f.name, 'INT'); break;
      case 'checkbox': dynamicCols.set(f.name, 'BOOLEAN'); break;
      case 'comment': dynamicCols.set(f.name, 'TEXT'); break;
      case 'qualitative': dynamicCols.set(f.name, 'INT'); break;
      case 'select': dynamicCols.set(f.name, 'TEXT'); break;
      default: break;
    }
  });

  (config?.postMatchIntake?.options || []).forEach(opt => {
    if (opt?.name) dynamicCols.set(opt.name, 'BOOLEAN');
  });

  if (config?.endgame?.name) dynamicCols.set(config.endgame.name, 'INT');

  // Optional per-phase fields
  (config?.autoFields || []).forEach(f => {
    if (!f?.name) return;
    switch (f.type) {
      case 'number': dynamicCols.set(f.name, 'INT'); break;
      case 'checkbox': dynamicCols.set(f.name, 'BOOLEAN'); break;
      case 'comment': dynamicCols.set(f.name, 'TEXT'); break;
      case 'qualitative': dynamicCols.set(f.name, 'INT'); break;
      case 'select': dynamicCols.set(f.name, 'TEXT'); break;
      default: break;
    }
  });
  (config?.teleFields || []).forEach(f => {
    if (!f?.name) return;
    switch (f.type) {
      case 'number': dynamicCols.set(f.name, 'INT'); break;
      case 'checkbox': dynamicCols.set(f.name, 'BOOLEAN'); break;
      case 'comment': dynamicCols.set(f.name, 'TEXT'); break;
      case 'qualitative': dynamicCols.set(f.name, 'INT'); break;
      case 'select': dynamicCols.set(f.name, 'TEXT'); break;
      default: break;
    }
  });

  // Apply ALTER TABLE for each dynamic column
  for (const [col, type] of dynamicCols.entries()) {
    await pool.query(`ALTER TABLE ${safe} ADD COLUMN IF NOT EXISTS ${col} ${type};`);
  }

  // Indexes commonly used by queries
  await pool.query(`CREATE INDEX IF NOT EXISTS ${safe}_team_idx ON ${safe} (team);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${safe}_match_idx ON ${safe} (match);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${safe}_scoutteam_idx ON ${safe} (scoutteam);`);
}
