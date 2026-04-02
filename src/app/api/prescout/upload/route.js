import { NextResponse } from 'next/server';
import { pool } from '../../../../lib/auth';
import { sanitizePrescoutTableName } from '../../../../lib/schema-generator';
import { cookies } from 'next/headers';
import * as XLSX from 'xlsx';

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

async function ensurePrescoutTable(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      team_number INTEGER NOT NULL UNIQUE,
      data JSONB NOT NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * POST /api/prescout/upload
 * Accepts multipart formData with:
 *   file    - the .xlsx spreadsheet
 *   gameName - the game to associate data with
 *
 * Parses the "Prescout" sheet (transposed layout):
 *   Row 0, col 0: empty / label
 *   Row 0, cols 1+: team numbers
 *   Row 1+, col 0: field names
 *   Row 1+, cols 1+: values
 *
 * Auth: admin cookie required.
 */
export async function POST(request) {
  const isAdmin = await validateAdminAuth();
  if (!isAdmin) {
    return NextResponse.json({ message: 'Admin authentication required' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const gameName = formData.get('gameName');

    if (!file || !gameName) {
      return NextResponse.json({ message: 'file and gameName are required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const SHEET_NAME = 'Prescout';
    if (!workbook.SheetNames.includes(SHEET_NAME)) {
      return NextResponse.json({
        message: `Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`,
      }, { status: 400 });
    }

    const sheet = workbook.Sheets[SHEET_NAME];
    // defval: null so empty cells are null rather than undefined
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (!rows || rows.length < 2) {
      return NextResponse.json({ message: 'Prescout sheet has insufficient data (need at least 2 rows)' }, { status: 400 });
    }

    // Row 0: [ignored, teamNum1, teamNum2, ...]
    const rawTeamNumbers = rows[0].slice(1).filter(v => v != null && String(v).trim() !== '');
    if (rawTeamNumbers.length === 0) {
      return NextResponse.json({ message: 'No team numbers found in row 1 of the Prescout sheet' }, { status: 400 });
    }

    // Normalize team numbers: floats like 1234.0 → "1234"
    const teamKeys = rawTeamNumbers.map(t =>
      typeof t === 'number' ? String(Math.round(t)) : String(t).trim()
    );

    // Build per-team data as ordered arrays (JSONB objects don't preserve key order)
    const teamDataMap = {};
    teamKeys.forEach(k => { teamDataMap[k] = []; });

    for (let r = 1; r < rows.length; r++) {
      const rawField = rows[r][0];
      if (rawField == null || String(rawField).trim() === '') continue;
      const fieldName = String(rawField).trim();

      for (let c = 0; c < teamKeys.length; c++) {
        const value = rows[r][c + 1]; // +1: col 0 is field name
        teamDataMap[teamKeys[c]].push({
          field: fieldName,
          value: value != null ? String(value) : null,
        });
      }
    }

    // Upsert into per-game prescout table
    const tableName = sanitizePrescoutTableName(gameName);
    const client = await pool.connect();
    try {
      await ensurePrescoutTable(client, tableName);

      let imported = 0;
      for (const [teamKey, data] of Object.entries(teamDataMap)) {
        const teamNumber = parseInt(teamKey, 10);
        if (isNaN(teamNumber)) continue;

        await client.query(
          `INSERT INTO ${tableName} (team_number, data, uploaded_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (team_number)
           DO UPDATE SET data = EXCLUDED.data, uploaded_at = EXCLUDED.uploaded_at`,
          [teamNumber, JSON.stringify(data)]
        );
        imported++;
      }

      const teams = Object.keys(teamDataMap)
        .map(k => parseInt(k, 10))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);

      return NextResponse.json({ imported, teams });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Prescout Upload] Error:', err);
    return NextResponse.json({ message: 'Failed to parse spreadsheet', error: err.message }, { status: 500 });
  }
}
