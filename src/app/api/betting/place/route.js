import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../../lib/game-config";
import {
  getStatboticsPrediction,
  calculatePointsWagered,
  placeBet,
  getUserBet,
} from "../../../../lib/betting";

export const revalidate = 0;

export async function POST(request) {
  const { isValid, teamName, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { match, alliance, matchtype = 2, scoutname, gameId } = body;

  if (!match || !Number.isInteger(Number(match)) || Number(match) < 1) {
    return NextResponse.json({ message: "Valid match number required" }, { status: 400 });
  }
  if (!alliance || !['red', 'blue'].includes(alliance)) {
    return NextResponse.json({ message: "Alliance must be 'red' or 'blue'" }, { status: 400 });
  }
  if (!scoutname || typeof scoutname !== 'string' || !scoutname.trim()) {
    return NextResponse.json({ message: "Scout name required" }, { status: 400 });
  }

  const requestedGameId = parseRequestedGameId(
    gameId || request.headers.get("X-Game-Id")
  );
  const activeGame = await getGameByIdOrActive(requestedGameId);
  if (!activeGame) {
    return NextResponse.json({ message: "No active game found" }, { status: 404 });
  }

  const tbaEventCode = activeGame.tba_event_code || activeGame.config_json?.tbaEventCode;
  if (!tbaEventCode) {
    return NextResponse.json({ message: "No TBA event code configured" }, { status: 400 });
  }

  // Fetch prediction and check match status
  const prediction = await getStatboticsPrediction(tbaEventCode, Number(match));
  if (!prediction) {
    return NextResponse.json({ message: "Could not fetch match prediction from Statbotics" }, { status: 404 });
  }

  if (prediction.matchStatus !== 'Upcoming' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({
      message: `Cannot place bet: match is ${prediction.matchStatus.toLowerCase()}`,
    }, { status: 409 });
  }

  const { pointsIfWin, pointsIfLoss } = calculatePointsWagered(
    prediction.redWinProb,
    prediction.blueWinProb,
    alliance
  );

  const client = await pool.connect();
  try {
    const gameName = activeGame.game_name;

    // Check for existing bet
    const existing = await getUserBet(
      gameName, scoutname.trim(), teamName, Number(match), Number(matchtype), client
    );
    if (existing) {
      return NextResponse.json({
        message: "You already placed a bet on this match",
        bet: existing,
      }, { status: 409 });
    }

    const bet = await placeBet(gameName, {
      scoutname: scoutname.trim(),
      scoutteam: teamName,
      match: Number(match),
      matchtype: Number(matchtype),
      alliance,
      redWinProb: prediction.redWinProb,
      blueWinProb: prediction.blueWinProb,
      pointsWagered: pointsIfWin,
      pointsIfLoss,
    }, client);

    return NextResponse.json({
      bet,
      pointsIfWin,
      pointsIfLoss,
      prediction,
    });
  } catch (err) {
    if (err.code === '23505') {
      // Unique violation — duplicate bet
      return NextResponse.json({ message: "You already placed a bet on this match" }, { status: 409 });
    }
    console.error("[Betting] Place bet error:", err);
    return NextResponse.json({ message: "Failed to place bet" }, { status: 500 });
  } finally {
    client.release();
  }
}
