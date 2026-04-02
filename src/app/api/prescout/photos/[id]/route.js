import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../../lib/auth';
import { sanitizePhotosTableName } from '../../../../../lib/schema-generator';

export const revalidate = 0;

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
  await client.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS tag VARCHAR(100)`);
}

/**
 * GET /api/prescout/photos/[id]?gameId=<id>
 * Returns the full photo including base64 photo_data for a single photo.
 * Auth: any authenticated user.
 */
export async function GET(request, { params }) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ message: 'Could not resolve game' }, { status: 400 });
    }

    const tableName = sanitizePhotosTableName(gameName);
    await ensurePhotosTable(client, tableName);

    const res = await client.query(
      `SELECT id, filename, mime_type, photo_data, tag FROM ${tableName} WHERE id = $1`,
      [parseInt(id, 10)]
    );

    if (!res.rows[0]) {
      return NextResponse.json({ message: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json(res.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/prescout/photos/[id]?gameId=<id>
 * Deletes a photo. Auth: any authenticated user.
 */
export async function DELETE(request, { params }) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ message: 'Could not resolve game' }, { status: 400 });
    }

    const tableName = sanitizePhotosTableName(gameName);
    await ensurePhotosTable(client, tableName);

    const res = await client.query(
      `DELETE FROM ${tableName} WHERE id = $1 RETURNING id`,
      [parseInt(id, 10)]
    );

    if (!res.rowCount) {
      return NextResponse.json({ message: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/prescout/photos/[id]?gameId=<id>
 * Updates a photo's tag. Cannot remove an existing tag (only add or change).
 * Body: { tag: string }
 * Auth: any authenticated user.
 */
export async function PATCH(request, { params }) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const newTag = body.tag;
  if (!newTag || typeof newTag !== 'string') {
    return NextResponse.json({ message: 'tag is required and must be a non-empty string' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ message: 'Could not resolve game' }, { status: 400 });
    }

    const tableName = sanitizePhotosTableName(gameName);
    await ensurePhotosTable(client, tableName);

    const res = await client.query(
      `UPDATE ${tableName} SET tag = $1 WHERE id = $2 RETURNING id, tag`,
      [newTag, parseInt(id, 10)]
    );

    if (!res.rows[0]) {
      return NextResponse.json({ message: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json(res.rows[0]);
  } finally {
    client.release();
  }
}
