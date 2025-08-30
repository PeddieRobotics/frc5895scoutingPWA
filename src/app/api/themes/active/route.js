import { NextResponse } from 'next/server';
import { getActiveTheme } from '../../../../lib/theme';

export async function GET() {
  try {
    const row = await getActiveTheme();
    if (!row) return NextResponse.json({ item: null }, { status: 200 });
    return NextResponse.json({ item: row }, { status: 200 });
  } catch (e) {
    console.error('themes active GET error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

