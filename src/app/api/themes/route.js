import { NextResponse } from 'next/server';
import { listThemes, createTheme, sanitizeIdentifier } from '../../../lib/theme';

export async function GET() {
  try {
    const rows = await listThemes();
    return NextResponse.json({ items: rows });
  } catch (e) {
    console.error('themes GET error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    let cfg = body.config;
    if (typeof cfg === 'string') {
      try { cfg = JSON.parse(cfg); } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON in config' }, { status: 400 });
      }
    }
    const table = sanitizeIdentifier(body.eventTable);
    if (!table) {
      return NextResponse.json({ error: 'Invalid eventTable. Use letters, numbers, underscore only.' }, { status: 400 });
    }
    const row = await createTheme({
      year: body.year,
      themeName: body.themeName,
      eventCode: body.eventCode,
      eventName: body.eventName,
      eventTable: table,
      config: cfg,
      activate: !!body.activate
    });
    return NextResponse.json({ item: row });
  } catch (e) {
    console.error('themes POST error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
