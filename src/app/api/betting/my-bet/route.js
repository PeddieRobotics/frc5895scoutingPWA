import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../../lib/game-config";
import { getUserBet } from "../../../../lib/betting";

export const revalidate = 0;

export async function GET(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const matchNumber = parseInt(searchParams.get("match"), 10);
  const scoutname = searchParams.get("scoutname");
  const matchtypeRaw = parseInt(searchParams.get("matchtype") || "2", 10);
  const matchtype = Number.isFinite(matchtypeRaw) ? matchtypeRaw : 2;

  if (!matchNumber || matchNumber < 1) {
    return NextResponse.json({ message: "Valid match number required" }, { status: 400 });
  }
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
    const bet = await getUserBet(
      activeGame.game_name, scoutname, teamName, matchNumber, matchtype, client
    );
    return NextResponse.json({ bet: bet || null });
  } catch (err) {
    console.error("[Betting] my-bet error:", err);
    return NextResponse.json({ message: "Failed to check bet" }, { status: 500 });
  } finally {
    client.release();
  }
}
