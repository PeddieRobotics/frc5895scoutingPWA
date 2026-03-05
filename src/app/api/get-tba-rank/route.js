import { NextResponse } from 'next/server';
import { getActiveGame } from '../../../lib/game-config';

export const revalidate = 0;

/**
 * GET /api/get-tba-rank?team=XXXX
 * Returns the TBA ranking for a team at the active game's event.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const team = searchParams.get('team');

  if (!team) {
    return NextResponse.json({ message: 'team parameter is required' }, { status: 400 });
  }

  const activeGame = await getActiveGame();
  const tbaEventCode =
    activeGame?.tba_event_code ||
    activeGame?.config_json?.tbaEventCode ||
    process.env.TBA_EVENT_CODE;

  if (!tbaEventCode) {
    return NextResponse.json(
      { message: 'No TBA event code configured. Set tbaEventCode in the game config.' },
      { status: 400 }
    );
  }

  const tbaAuthKey = process.env.TBA_AUTH_KEY;
  if (!tbaAuthKey) {
    return NextResponse.json({ message: 'TBA_AUTH_KEY not configured' }, { status: 500 });
  }

  const response = await fetch(
    `https://www.thebluealliance.com/api/v3/event/${tbaEventCode}/rankings`,
    { headers: { 'X-TBA-Auth-Key': tbaAuthKey } }
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: `TBA API error: ${response.status}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  const rankings = data?.rankings || [];
  const teamKey = `frc${team}`;
  const entry = rankings.find((r) => r.team_key === teamKey);

  return NextResponse.json({
    rank: entry?.rank ?? null,
    totalTeams: rankings.length,
    eventCode: tbaEventCode,
  });
}
