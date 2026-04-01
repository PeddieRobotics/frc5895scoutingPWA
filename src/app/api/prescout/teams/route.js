import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/auth';
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

/**
 * GET /api/prescout/teams?gameName=<name>
 * Returns sorted list of team numbers that have prescout data for a game.
 * Auth: admin only.
 */
export async function GET(request) {
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
    const res = await client.query(
      'SELECT team_number FROM prescout_data WHERE game_name = $1 ORDER BY team_number ASC',
      [gameName]
    );
    return NextResponse.json({ teams: res.rows.map(r => r.team_number) });
  } finally {
    client.release();
  }
}
