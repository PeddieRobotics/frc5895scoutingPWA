import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../lib/auth';
import { sanitizePrescoutFormTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

async function resolveGameName(client, gameId) {
  if (gameId) {
    const res = await client.query('SELECT game_name FROM game_configs WHERE id = $1', [gameId]);
    return res.rows[0]?.game_name || null;
  }
  const res = await client.query('SELECT game_name FROM game_configs WHERE is_active = TRUE LIMIT 1');
  return res.rows[0]?.game_name || null;
}

async function ensurePrescoutFormTable(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      team_number INTEGER NOT NULL UNIQUE,
      data JSONB NOT NULL,
      submitted_by VARCHAR(100),
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * GET /api/prescout/form?team=<num>&gameId=<id>
 * Returns prescout form data for a single team. Auth: any authenticated user.
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

    const tableName = sanitizePrescoutFormTableName(gameName);
    await ensurePrescoutFormTable(client, tableName);

    const res = await client.query(
      `SELECT data, submitted_by, submitted_at, updated_at FROM ${tableName} WHERE team_number = $1`,
      [team]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: res.rows[0].data,
      submittedBy: res.rows[0].submitted_by,
      submittedAt: res.rows[0].submitted_at,
      updatedAt: res.rows[0].updated_at,
    });
  } finally {
    client.release();
  }
}

/**
 * POST /api/prescout/form
 * Submit or update prescout form data for a team.
 * Body: { teamNumber, gameId?, data: [{field, value}, ...] }
 * Auth: any authenticated user.
 */
export async function POST(request) {
  const { isValid, error, teamName } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamNumber, gameId, data } = body;

    if (!teamNumber || !Array.isArray(data)) {
      return NextResponse.json({ message: 'teamNumber and data array are required' }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      const gameName = await resolveGameName(client, gameId);
      if (!gameName) {
        return NextResponse.json({ message: 'No active game found' }, { status: 404 });
      }

      const tableName = sanitizePrescoutFormTableName(gameName);
      await ensurePrescoutFormTable(client, tableName);

      const submittedBy = teamName || null;

      // Field-level merge inside a transaction with FOR UPDATE to prevent
      // concurrent writers from silently overwriting each other's changes.
      await client.query('BEGIN');
      try {
        const existing = await client.query(
          `SELECT data FROM ${tableName} WHERE team_number = $1 FOR UPDATE`,
          [teamNumber]
        );

        let mergedData = data.filter(e => e.value !== '');
        if (existing.rows.length > 0 && Array.isArray(existing.rows[0].data)) {
          const existingMap = new Map();
          for (const entry of existing.rows[0].data) {
            existingMap.set(entry.field, entry.value);
          }
          // Submitted fields override existing: empty string = delete, non-empty = update
          for (const entry of data) {
            if (entry.value === '') {
              existingMap.delete(entry.field);
            } else {
              existingMap.set(entry.field, entry.value);
            }
          }
          mergedData = Array.from(existingMap, ([field, value]) => ({ field, value }));
        }

        // If merged data is empty, delete the row instead of storing an empty array
        if (mergedData.length === 0) {
          await client.query(`DELETE FROM ${tableName} WHERE team_number = $1`, [teamNumber]);
          await client.query('COMMIT');
          return NextResponse.json({ success: true, teamNumber, deleted: true });
        }

        await client.query(
          `INSERT INTO ${tableName} (team_number, data, submitted_by, submitted_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (team_number)
           DO UPDATE SET data = EXCLUDED.data, submitted_by = EXCLUDED.submitted_by, updated_at = NOW()`,
          [teamNumber, JSON.stringify(mergedData), submittedBy]
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      }

      return NextResponse.json({ success: true, teamNumber });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Prescout Form] Error:', err);
    return NextResponse.json({ message: 'Failed to save prescout form data', error: err.message }, { status: 500 });
  }
}
