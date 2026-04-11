import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../../lib/game-config";
import { getUserBalance, resolveCompletedBets } from "../../../../lib/betting";

export const revalidate = 0;

export async function GET(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scoutname = searchParams.get("scoutname");

  if (!scoutname) {
    return NextResponse.json({ message: "Scout name required" }, { status: 400 });
  }

  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );
  const activeGame = await getGameByIdOrActive(requestedGameId);
  if (!activeGame) {
    return NextResponse.json({ message: "No active game found" }, { status: 404 });
  }

  const client = await pool.connect();
  try {
    await resolveCompletedBets(activeGame.game_name, activeGame.tba_event_code || activeGame.config_json?.tbaEventCode, client);
    const stats = await getUserBalance(activeGame.game_name, scoutname, teamName, client);
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[Betting] balance error:", err);
    return NextResponse.json({ message: "Failed to fetch balance" }, { status: 500 });
  } finally {
    client.release();
  }
}
