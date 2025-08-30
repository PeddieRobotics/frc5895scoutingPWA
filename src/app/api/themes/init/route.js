import { NextResponse } from 'next/server';
import { ensureThemesTable } from '../../../../lib/theme';

export async function POST() {
  try {
    await ensureThemesTable();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('init themes error', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

