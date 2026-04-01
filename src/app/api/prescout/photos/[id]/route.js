import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../../lib/auth';

export const revalidate = 0;

/**
 * GET /api/prescout/photos/[id]
 * Returns the full photo including base64 photo_data for a single photo.
 * Auth: any authenticated user.
 */
export async function GET(request, { params }) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT id, filename, mime_type, photo_data FROM team_photos WHERE id = $1',
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
 * DELETE /api/prescout/photos/[id]
 * Deletes a photo. Auth: any authenticated user.
 */
export async function DELETE(request, { params }) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const res = await client.query(
      'DELETE FROM team_photos WHERE id = $1 RETURNING id',
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
