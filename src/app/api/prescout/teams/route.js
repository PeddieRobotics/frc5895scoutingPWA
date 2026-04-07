import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../lib/auth';
import { sanitizePrescoutTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

async function ensurePrescoutTable(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      team_number INTEGER NOT NULL UNIQUE,
      data JSONB NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * GET /api/prescout/teams?gameName=<name>
 * Returns sorted list of team numbers that have prescout data for a game.
 * Auth: any authenticated user.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameName = searchParams.get('gameName');
  if (!gameName) {
    return NextResponse.json({ message: 'gameName parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Validate gameName exists in game_configs to prevent orphan table creation
    const gameCheck = await client.query('SELECT game_name FROM game_configs WHERE game_name = $1', [gameName]);
    if (gameCheck.rows.length === 0) {
      return NextResponse.json({ message: `Game "${gameName}" not found` }, { status: 404 });
    }

    const tableName = sanitizePrescoutTableName(gameName);
    await ensurePrescoutTable(client, tableName);
    const res = await client.query(
      `SELECT team_number FROM ${tableName} ORDER BY team_number ASC`
    );
    return NextResponse.json({ teams: res.rows.map(r => r.team_number) });
  } finally {
    client.release();
  }
}
