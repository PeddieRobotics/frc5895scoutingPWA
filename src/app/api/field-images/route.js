import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../lib/auth';
import { sanitizeFieldImagesTableName } from '../../../lib/schema-generator';

export const revalidate = 0;

async function resolveGameName(client, gameId) {
  if (gameId) {
    const res = await client.query('SELECT game_name FROM game_configs WHERE id = $1', [gameId]);
    return res.rows[0]?.game_name || null;
  }
  const res = await client.query('SELECT game_name FROM game_configs WHERE is_active = TRUE LIMIT 1');
  return res.rows[0]?.game_name || null;
}

/**
 * GET /api/field-images?gameId=<id>&tag=<tag>
 * Returns full base64 image data for a specific tag. Auth: any authenticated user.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');
  const tag = searchParams.get('tag');

  if (!tag) {
    return NextResponse.json({ message: 'tag parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 });
    }

    const tableName = sanitizeFieldImagesTableName(gameName);

    // Check table exists
    const tableExists = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
      [tableName]
    );
    if (!tableExists.rows[0]?.exists) {
      return NextResponse.json({ message: 'No field images table' }, { status: 404 });
    }

    const res = await client.query(
      `SELECT id, image_tag, image_data, mime_type, uploaded_by, uploaded_at
       FROM ${tableName}
       WHERE image_tag = $1`,
      [tag]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ message: 'Image not found' }, { status: 404 });
    }

    return NextResponse.json({ image: res.rows[0] });
  } finally {
    client.release();
  }
}
