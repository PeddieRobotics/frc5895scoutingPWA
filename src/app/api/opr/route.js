import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { getTBAMatches, getOprBlacklist, saveOprBlacklist } from "../../../lib/opr-service";

export const revalidate = 0;

function resolveGame(activeGame) {
  const configJson = activeGame?.config_json || {};
  const tbaEventCode = (activeGame?.tba_event_code || configJson.tbaEventCode || "").trim();
  return { configJson, tbaEventCode };
}

/**
 * GET /api/opr?gameId=<optional>
 *
 * Returns played TBA match data for the active game's event, plus the
 * currently saved OPR blacklist so the sidebar can restore toggle state.
 */
export async function GET(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );

  let activeGame;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (e) {
    console.error("[opr GET] Error loading active game:", e);
    return NextResponse.json({ message: "Failed to load game config" }, { status: 500 });
  }

  const { configJson, tbaEventCode } = resolveGame(activeGame);

  if (configJson.usePPR !== true) {
    return NextResponse.json({ message: "usePPR is not enabled for this game config" }, { status: 400 });
  }
  if (!tbaEventCode) {
    return NextResponse.json({ message: "No tbaEventCode configured." }, { status: 400 });
  }
  if (!process.env.TBA_AUTH_KEY) {
    return NextResponse.json({ message: "TBA_AUTH_KEY environment variable is not configured" }, { status: 500 });
  }

  let matches, blacklist;
  try {
    const client = await pool.connect();
    try {
      [matches, blacklist] = await Promise.all([
        getTBAMatches(tbaEventCode),
        getOprBlacklist(activeGame.game_name, client),
      ]);
    } finally {
      client.release();
    }
  } catch (fetchError) {
    console.error("[opr GET] Error:", fetchError);
    return NextResponse.json(
      { message: fetchError.message || "Failed to fetch OPR data" },
      { status: 502 }
    );
  }

  return NextResponse.json({ matches, blacklist, eventCode: tbaEventCode });
}

/**
 * POST /api/opr
 *
 * Saves the OPR blacklist (excluded match keys) for the active game.
 * Called by the scout-leads Recalculate button.
 *
 * Body: { blacklist: string[], gameId?: string|number }
 */
export async function POST(request) {
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json({ message: error || "Authentication required" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { blacklist, gameId: bodyGameId } = body;
  if (!Array.isArray(blacklist)) {
    return NextResponse.json({ message: "blacklist must be an array" }, { status: 400 });
  }

  const requestedGameId = parseRequestedGameId(
    bodyGameId ?? request.headers.get("X-Game-Id")
  );

  let activeGame;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (e) {
    console.error("[opr POST] Error loading active game:", e);
    return NextResponse.json({ message: "Failed to load game config" }, { status: 500 });
  }

  const { configJson } = resolveGame(activeGame);
  if (configJson.usePPR !== true) {
    return NextResponse.json({ message: "usePPR is not enabled for this game config" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await saveOprBlacklist(activeGame.game_name, blacklist, client);
  } catch (saveError) {
    console.error("[opr POST] Error saving blacklist:", saveError);
    return NextResponse.json({ message: "Failed to save OPR blacklist" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, blacklistCount: blacklist.length });
}
