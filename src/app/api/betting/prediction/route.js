import { NextResponse } from "next/server";
import { validateAuthToken } from "../../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../../lib/game-config";
import { getStatboticsPrediction } from "../../../../lib/betting";

export const revalidate = 0;

export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchNumber = parseInt(searchParams.get("match"), 10);
  if (!matchNumber || matchNumber < 1) {
    return NextResponse.json({ message: "Valid match number required" }, { status: 400 });
  }

  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );
  const activeGame = await getGameByIdOrActive(requestedGameId);
  if (!activeGame) {
    return NextResponse.json({ message: "No active game found" }, { status: 404 });
  }

  const tbaEventCode = activeGame.tba_event_code || activeGame.config_json?.tbaEventCode;
  if (!tbaEventCode) {
    return NextResponse.json({ message: "No TBA event code configured for this game" }, { status: 400 });
  }

  const prediction = await getStatboticsPrediction(tbaEventCode, matchNumber);
  if (!prediction) {
    return NextResponse.json({ message: "Could not fetch prediction from Statbotics. Match may not exist yet." }, { status: 404 });
  }

  return NextResponse.json(prediction);
}
