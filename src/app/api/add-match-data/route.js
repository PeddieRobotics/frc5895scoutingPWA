import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { validateAuthToken } from "../../../lib/auth";
import { getActiveTheme, sanitizeIdentifier, ensureEventDataTable } from "../../../lib/theme";

export async function POST(req) {
  try {
    // Auth
    const { isValid, teamName: authTeamName, error } = await validateAuthToken(req);
    if (!isValid) {
      return NextResponse.json({ message: error || 'Authentication required' }, { status: 401 });
    }

    // Payload
    const body = await req.json();
    const data = { ...body };

    // Required baked fields
    if (!data.scoutname || data.team == null || data.match == null) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Determine active event table
    const active = await getActiveTheme();
    if (!active?.event_table) return NextResponse.json({ message: 'No active theme configured' }, { status: 409 });
    const table = sanitizeIdentifier(active.event_table);
    if (!table) return NextResponse.json({ message: 'Invalid active theme table' }, { status: 409 });

    // Ensure table exists and is shaped from config
    await ensureEventDataTable(table, active.config || {});

    // Compute scoutteam from auth if numeric
    try {
      const t = parseInt(authTeamName, 10);
      if (!Number.isNaN(t)) data.scoutteam = t;
    } catch {}

    // Normalize defaults
    if (data.matchtype === undefined) data.matchtype = 2; // default Qualification
    if (data.noshow === undefined) data.noshow = false;

    // Adjusted match number from matchtype
    let adjustedMatch = Number(data.match);
    const matchType = Number(data.matchtype);
    if (Number.isFinite(adjustedMatch) && Number.isFinite(matchType)) {
      switch (matchType) {
        case 0: adjustedMatch -= 100; break; // practice
        case 1: adjustedMatch -= 50; break;  // practice 2
        case 3: adjustedMatch += 100; break; // playoff
        default: break;
      }
    }
    data.match = adjustedMatch;

    // Fetch table columns
    const colRes = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);
    const columns = colRes.rows
      .map(r => ({ name: r.column_name, type: r.data_type }))
      .filter(c => !['id','created_at'].includes(c.name));

    // Cast values to match DB types
    const cast = (val, type) => {
      if (val === undefined) return null;
      if (type.includes('boolean')) return Boolean(val);
      if (type.includes('int') || type.includes('numeric')) {
        const n = Number(val);
        return Number.isNaN(n) ? null : n;
      }
      return val;
    };

    const names = [];
    const params = [];
    const values = [];
    columns.forEach(col => {
      names.push(col.name);
      values.push(cast(data[col.name], col.type));
      params.push(`$${params.length + 1}`);
    });

    const sql = `INSERT INTO ${table} (${names.join(',')}) VALUES (${params.join(',')});`;
    await pool.query(sql, values);

    return NextResponse.json({ message: 'Data recorded successfully' });
  } catch (error) {
    console.error('add-match-data error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

