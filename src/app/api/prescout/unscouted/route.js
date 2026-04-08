import { NextResponse } from 'next/server';
import { pool, validateAuthToken } from '../../../../lib/auth';
import { sanitizePrescoutFormTableName, sanitizePhotosTableName } from '../../../../lib/schema-generator';

export const revalidate = 0;

/**
 * GET /api/prescout/unscouted?gameId=<id>
 * Returns event teams split into scouted and unscouted lists.
 * Fetches teams from TBA using tbaEventCode in the game config.
 * Auth: any authenticated user.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');

  const client = await pool.connect();
  try {
    // Resolve game config
    let gameRow;
    if (gameId) {
      const res = await client.query('SELECT game_name, config_json FROM game_configs WHERE id = $1', [gameId]);
      gameRow = res.rows[0];
    } else {
      const res = await client.query('SELECT game_name, config_json FROM game_configs WHERE is_active = TRUE LIMIT 1');
      gameRow = res.rows[0];
    }

    if (!gameRow) {
      return NextResponse.json({ message: 'No active game found' }, { status: 404 });
    }

    const configJson = typeof gameRow.config_json === 'string' ? JSON.parse(gameRow.config_json) : gameRow.config_json;
    const tbaEventCode = configJson?.tbaEventCode;

    if (!tbaEventCode) {
      return NextResponse.json({ eventTeams: [], scouted: [], unscouted: [] });
    }

    // Fetch teams from TBA
    const tbaAuthKey = process.env.TBA_AUTH_KEY;
    if (!tbaAuthKey) {
      return NextResponse.json({ message: 'TBA_AUTH_KEY not configured' }, { status: 500 });
    }

    const tbaRes = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${tbaEventCode}/teams/keys`,
      {
        headers: { 'X-TBA-Auth-Key': tbaAuthKey },
        cache: 'no-store',
      }
    );

    if (!tbaRes.ok) {
      return NextResponse.json({ message: `TBA API error: ${tbaRes.status}` }, { status: 502 });
    }

    const teamKeys = await tbaRes.json();
    if (!Array.isArray(teamKeys)) {
      return NextResponse.json({ eventTeams: [], scouted: [], unscouted: [] });
    }

    // Parse "frc1234" keys to numbers
    const eventTeams = teamKeys
      .map(k => parseInt(k.replace('frc', ''), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    // Get teams that have prescout form data
    const tableName = sanitizePrescoutFormTableName(gameRow.game_name);
    // Ensure table exists (lazy creation)
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

    const scoutedRes = await client.query(`SELECT team_number FROM ${tableName}`);
    const scoutedSet = new Set(scoutedRes.rows.map(r => r.team_number));

    // Get teams that have photos
    const photosTableName = sanitizePhotosTableName(gameRow.game_name);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${photosTableName} (
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
    const photosRes = await client.query(`SELECT DISTINCT team_number FROM ${photosTableName}`);
    const photosSet = new Set(photosRes.rows.map(r => r.team_number));

    const unscouted = eventTeams.filter(t => !scoutedSet.has(t));
    const scoutedNoPhotos = eventTeams.filter(t => scoutedSet.has(t) && !photosSet.has(t));
    const scoutedWithPhotos = eventTeams.filter(t => scoutedSet.has(t) && photosSet.has(t));

    return NextResponse.json({ eventTeams, unscouted, scoutedNoPhotos, scoutedWithPhotos });
  } finally {
    client.release();
  }
}
