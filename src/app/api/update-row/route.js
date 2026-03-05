import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../lib/auth';
import { getGameByIdOrActive, parseRequestedGameId } from '../../../lib/game-config';
import { extractFieldsFromConfig } from '../../../lib/schema-generator';

const IMMUTABLE_FIELDS = new Set(['id', 'team', 'match', 'matchtype', 'scoutteam', 'timestamp']);

export async function POST(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ error: error || 'Authentication required' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { id, data, password } = body;
  const requestedGameId = parseRequestedGameId(
    body.gameId ?? body?.__meta?.gameId ?? request.headers.get("X-Game-Id")
  );

  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }

  const isAdmin = password && password === process.env.ADMIN_PASSWORD;

  const activeGame = await getGameByIdOrActive(requestedGameId);
  if (!activeGame?.table_name) {
    if (requestedGameId !== null) {
      return NextResponse.json({ error: `Selected game ${requestedGameId} was not found` }, { status: 400 });
    }
    return NextResponse.json({ error: 'No active game configured' }, { status: 400 });
  }

  if (!/^[a-z][a-z0-9_]*$/.test(activeGame.table_name)) {
    return NextResponse.json({ error: 'Invalid table name' }, { status: 500 });
  }

  const configFields = extractFieldsFromConfig(activeGame.config_json || {});
  const allowedFields = new Set(
    configFields
      .filter((f) => !IMMUTABLE_FIELDS.has(f.name))
      .map((f) => f.name)
  );
  allowedFields.add('scoutname');
  allowedFields.add('noshow');

  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const [field, value] of Object.entries(data)) {
    if (allowedFields.has(field)) {
      updates.push(`"${field}" = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const row = await client.query(
      `SELECT id, scoutteam FROM ${activeGame.table_name} WHERE id = $1`,
      [id]
    );

    if (row.rows.length === 0) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    const rowData = row.rows[0];
    const isOwnEntry = String(rowData.scoutteam) === String(teamName);

    if (!isAdmin && !isOwnEntry) {
      return NextResponse.json(
        { error: 'You can only edit data from your own team' },
        { status: 403 }
      );
    }

    values.push(id);
    await client.query(
      `UPDATE ${activeGame.table_name} SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    return NextResponse.json({ message: 'Row updated successfully' }, { status: 200 });
  } catch (dbError) {
    console.error('[update-row] Database error:', dbError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  } finally {
    client.release();
  }
}
