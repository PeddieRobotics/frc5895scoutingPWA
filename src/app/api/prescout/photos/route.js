import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../lib/auth';
import { sanitizePhotosTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB

async function resolveGameName(client, gameId) {
  if (gameId) {
    const res = await client.query('SELECT game_name FROM game_configs WHERE id = $1', [gameId]);
    return res.rows[0]?.game_name || null;
  }
  const res = await client.query('SELECT game_name FROM game_configs WHERE is_active = TRUE LIMIT 1');
  return res.rows[0]?.game_name || null;
}

async function ensurePhotosTable(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      team_number INTEGER NOT NULL,
      filename VARCHAR(255) NOT NULL,
      photo_data TEXT NOT NULL,
      mime_type VARCHAR(50) NOT NULL,
      uploaded_by VARCHAR(100),
      tag VARCHAR(100),
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Migrate existing tables that lack the tag column
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS tag VARCHAR(100)`);
}

/**
 * GET /api/prescout/photos?team=<num>&gameId=<id>&tag=<name>
 * Returns photo metadata (no photo_data). Auth: any authenticated user.
 * Optional tag filter: if provided, only returns photos with that tag.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const team = parseInt(searchParams.get('team'));
  const gameId = searchParams.get('gameId');
  const tag = searchParams.get('tag');

  if (!team) {
    return NextResponse.json({ message: 'team parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ photos: [] });
    }

    const tableName = sanitizePhotosTableName(gameName);
    await ensurePhotosTable(client, tableName);

    const params = [team];
    let where = 'WHERE team_number = $1';
    if (tag) {
      where += ' AND tag = $2';
      params.push(tag);
    }

    const res = await client.query(
      `SELECT id, filename, mime_type, uploaded_by, uploaded_at, tag
       FROM ${tableName}
       ${where}
       ORDER BY uploaded_at ASC`,
      params
    );

    return NextResponse.json({ photos: res.rows });
  } finally {
    client.release();
  }
}

/**
 * POST /api/prescout/photos
 * Uploads a photo for a team. multipart formData: file, team, gameName, tag (optional).
 * Auth: any authenticated user.
 */
export async function POST(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const team = parseInt(formData.get('team'));
    const gameName = formData.get('gameName');
    const tag = formData.get('tag') || null;

    if (!file || !team || !gameName) {
      return NextResponse.json({ message: 'file, team, and gameName are required' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ message: 'Only image files are allowed' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PHOTO_BYTES) {
      return NextResponse.json({ message: 'Photo must be under 3 MB' }, { status: 400 });
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const client = await pool.connect();
    try {
      // Validate gameName exists in game_configs to prevent orphan table creation
      const gameCheck = await client.query('SELECT game_name FROM game_configs WHERE game_name = $1', [gameName]);
      if (gameCheck.rows.length === 0) {
        return NextResponse.json({ message: `Game "${gameName}" not found` }, { status: 404 });
      }

      const tableName = sanitizePhotosTableName(gameName);
      await ensurePhotosTable(client, tableName);

      const res = await client.query(
        `INSERT INTO ${tableName} (team_number, filename, photo_data, mime_type, uploaded_by, tag, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, filename, mime_type, uploaded_by, tag, uploaded_at`,
        [team, file.name, base64, file.type, teamName || null, tag]
      );

      return NextResponse.json({ photo: res.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Photos] Upload error:', err);
    return NextResponse.json({ message: 'Failed to upload photo', error: err.message }, { status: 500 });
  }
}
