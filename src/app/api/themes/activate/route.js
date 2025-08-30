import { NextResponse } from 'next/server';
import { setActiveTheme } from '../../../../lib/theme';

export async function POST(request) {
  try {
    const { id } = await request.json();
    const intId = parseInt(id, 10);
    if (!intId || Number.isNaN(intId)) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await setActiveTheme(intId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('themes activate error', e);
    const msg = e?.message || 'Activation error';
    const status = msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
