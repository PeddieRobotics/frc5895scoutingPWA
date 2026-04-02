import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../lib/auth';
import { sanitizeFieldImagesTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

async function resolveGameName(client, gameId) {
  if (gameId) {
    const res = await client.query('SELECT game_name FROM game_configs WHERE id = $1', [gameId]);
    return res.rows[0]?.game_name || null;
  }
  return null;
}

async function ensureFieldImagesTable(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      image_tag VARCHAR(100) NOT NULL UNIQUE,
      image_data TEXT NOT NULL,
      mime_type VARCHAR(50) NOT NULL,
      uploaded_by VARCHAR(100),
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * GET /api/admin/field-images?gameId=<id>
 * Returns metadata for all field images in a game (no image_data).
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  if (!gameId) {
    return NextResponse.json({ message: 'gameId parameter required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ images: [] });
    }

    const tableName = sanitizeFieldImagesTableName(gameName);
    await ensureFieldImagesTable(client, tableName);

    const res = await client.query(
      `SELECT id, image_tag, mime_type, uploaded_by, uploaded_at
       FROM ${tableName}
       ORDER BY image_tag ASC`
    );

    return NextResponse.json({ images: res.rows });
  } finally {
    client.release();
  }
}

/**
 * POST /api/admin/field-images
 * Upload or replace a field image. Body JSON: { gameId, imageTag, imageData (base64), mimeType }.
 * Admin auth required (validated via admin password in request body).
 */
export async function POST(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { gameId, imageTag, imageData, mimeType } = body;

    if (!gameId || !imageTag || !imageData || !mimeType) {
      return NextResponse.json(
        { message: 'gameId, imageTag, imageData, and mimeType are required' },
        { status: 400 }
      );
    }

    if (typeof imageTag !== 'string' || imageTag.length > 100) {
      return NextResponse.json({ message: 'imageTag must be a string under 100 chars' }, { status: 400 });
    }

    if (!mimeType.startsWith('image/')) {
      return NextResponse.json({ message: 'Only image MIME types are allowed' }, { status: 400 });
    }

    // Check base64 size (~4/3 of original)
    const estimatedBytes = Math.ceil(imageData.length * 3 / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ message: 'Image must be under 5 MB' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const gameName = await resolveGameName(client, gameId);
      if (!gameName) {
        return NextResponse.json({ message: 'Game not found' }, { status: 404 });
      }

      const tableName = sanitizeFieldImagesTableName(gameName);
      await ensureFieldImagesTable(client, tableName);

      const res = await client.query(
        `INSERT INTO ${tableName} (image_tag, image_data, mime_type, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (image_tag) DO UPDATE
         SET image_data = EXCLUDED.image_data,
             mime_type = EXCLUDED.mime_type,
             uploaded_by = EXCLUDED.uploaded_by,
             uploaded_at = NOW()
         RETURNING id, image_tag, mime_type, uploaded_by, uploaded_at`,
        [imageTag, imageData, mimeType, teamName || null]
      );

      return NextResponse.json({ image: res.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[FieldImages] Upload error:', err);
    return NextResponse.json({ message: 'Failed to upload image', error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/field-images?gameId=<id>&tag=<tag>
 * Delete a field image by tag.
 */
export async function DELETE(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');
  const tag = searchParams.get('tag');

  if (!gameId || !tag) {
    return NextResponse.json({ message: 'gameId and tag parameters required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const gameName = await resolveGameName(client, gameId);
    if (!gameName) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 });
    }

    const tableName = sanitizeFieldImagesTableName(gameName);
    await ensureFieldImagesTable(client, tableName);

    await client.query(`DELETE FROM ${tableName} WHERE image_tag = $1`, [tag]);

    return NextResponse.json({ success: true });
  } finally {
    client.release();
  }
}
