import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../lib/auth';
import { sanitizePrescoutTableName } from '../../../lib/schema-generator';
import { cookies } from 'next/headers';

export const revalidate = 0;

async function validateAdminAuth() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  const cookieStore = await cookies();
  const adminAuth = cookieStore.get('admin_auth');
  if (!adminAuth?.value) return false;
  try {
    const decoded = Buffer.from(adminAuth.value, 'base64').toString('utf-8');
    const [username, password] = decoded.split(':');
    return username === 'admin' && password === adminPassword;
  } catch {
    return false;
  }
}

async function resolveGameName(client, gameId) {
  if (gameId) {
    const res = await client.query('SELECT game_name FROM game_configs WHERE id = $1', [gameId]);
    return res.rows[0]?.game_name || null;
  }
  const res = await client.query('SELECT game_name FROM game_configs WHERE is_active = TRUE LIMIT 1');
  return res.rows[0]?.game_name || null;
}

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
 * GET /api/prescout?team=<num>&gameId=<id>
 * Returns prescout data object for a single team. Auth: any authenticated user.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const team = parseInt(searchParams.get('team'));
  const gameId = searchParams.get('gameId');

  if (!team) {
    return NextResponse.json({ message: 'team parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ data: null });
    }

    const tableName = sanitizePrescoutTableName(gameName);
    await ensurePrescoutTable(client, tableName);

    const res = await client.query(
      `SELECT data, uploaded_at FROM ${tableName} WHERE team_number = $1`,
      [team]
    );

    return NextResponse.json({
      data: res.rows[0]?.data || null,
      uploadedAt: res.rows[0]?.uploaded_at || null,
    });
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/prescout?gameName=<name>
 * Clears all prescout data for a game. Auth: admin only.
 */
export async function DELETE(request) {
  const isAdmin = await validateAdminAuth();
  if (!isAdmin) {
    return NextResponse.json({ message: 'Admin authentication required' }, { status: 401 });
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
    const res = await client.query(`DELETE FROM ${tableName}`);
    return NextResponse.json({ deleted: res.rowCount });
  } finally {
    client.release();
  }
}
