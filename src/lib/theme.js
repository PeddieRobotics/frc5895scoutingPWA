import { sql } from '@vercel/postgres';

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
  const rows = await sql`UPDATE year_themes SET is_active = TRUE, updated_at = NOW() WHERE id = ${id} RETURNING id;`;
  if (!rows || !rows.length) {
    throw new Error('Theme not found');
  }
  await sql`UPDATE year_themes SET is_active = FALSE WHERE id <> ${id};`;
}

export async function listThemes() {
  await ensureThemesTable();
  const { rows } = await sql`SELECT * FROM year_themes ORDER BY updated_at DESC;`;
  return rows;
}

export async function createTheme({ year, themeName, eventCode, eventName, eventTable, config, activate = false }) {
  await ensureThemesTable();
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
