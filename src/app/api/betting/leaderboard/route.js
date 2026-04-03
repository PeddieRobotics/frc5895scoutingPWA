import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../../lib/game-config";
import { resolveCompletedBets, getLeaderboard } from "../../../../lib/betting";

export const revalidate = 0;

export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );
  const activeGame = await getGameByIdOrActive(requestedGameId);
  if (!activeGame) {
    return NextResponse.json({ message: "No active game found" }, { status: 404 });
  }

  const tbaEventCode = activeGame.tba_event_code || activeGame.config_json?.tbaEventCode;
  const gameName = activeGame.game_name;

  const client = await pool.connect();
  try {
    // Auto-resolve any completed matches before returning leaderboard
    if (tbaEventCode) {
      try {
        const resolved = await resolveCompletedBets(gameName, tbaEventCode, client);
        if (resolved > 0) {
          console.log(`[Betting] Resolved ${resolved} bets for ${gameName}`);
        }
      } catch (err) {
        console.error("[Betting] Error resolving bets:", err.message);
      }
    }

    const leaderboard = await getLeaderboard(gameName, client);
    return NextResponse.json({
      gameName: activeGame.display_name || gameName,
      leaderboard,
    });
  } finally {
    client.release();
  }
}
