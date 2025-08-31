import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { validateAuthToken } from '../../../lib/auth';
import { getActiveTheme, sanitizeIdentifier } from '../../../lib/theme';
import { aggregateRows, normalizeRows, collectFieldNames } from '../../../lib/config-utils';

export const revalidate = 0;

export async function GET(request) {
  // Auth
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const team = Number(searchParams.get('team'));
  if (!Number.isFinite(team)) {
    return NextResponse.json({ message: 'Invalid team' }, { status: 400 });
  }

  const active = await getActiveTheme();
  if (!active?.event_table) return NextResponse.json({ message: 'No active theme configured' }, { status: 409 });
  const table = sanitizeIdentifier(active.event_table);
  const cfg = active.config || {};

  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE team = $1 ORDER BY match ASC;`, [team]);
  if (!rows || !rows.length) {
    return NextResponse.json({ message: `No data for team ${team}` }, { status: 404 });
  }
  const merged = normalizeRows(rows);
  const stats = aggregateRows(merged, cfg);
  const fields = collectFieldNames(cfg);

  return NextResponse.json({
    team,
    stats,
    fields,
    rows: merged
  }, { status: 200 });
}
