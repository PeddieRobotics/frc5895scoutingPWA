import { NextResponse } from "next/server";
import { validateAuthToken } from "../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";

export const revalidate = 0;

/**
 * GET /api/opr?gameId=<optional>
 *
 * Fetches played match data from The Blue Alliance for the active game's event
 * and returns it in a normalized format for client-side OPR computation.
 *
 * Requires:
 *   - usePPR: true in the game config JSON
 *   - tbaEventCode set in the game config (or tba_event_code DB column)
 *   - TBA_AUTH_KEY environment variable
 */
export async function GET(request) {
  // Auth check — same pattern as other scout-leads routes
  const { isValid, error } = await validateAuthToken(request);
  if (!isValid) {
    return NextResponse.json(
      { message: error || "Authentication required" },
      { status: 401 }
    );
  }

  // Resolve game config
  const { searchParams } = new URL(request.url);
  const requestedGameId = parseRequestedGameId(
    searchParams.get("gameId") || request.headers.get("X-Game-Id")
  );

  let activeGame;
  try {
    activeGame = await getGameByIdOrActive(requestedGameId);
  } catch (gameError) {
    console.error("[opr] Error loading active game:", gameError);
    return NextResponse.json(
      { message: "Failed to load game config" },
      { status: 500 }
    );
  }

  const configJson = activeGame?.config_json || {};

  // Guard: only proceed if usePPR is explicitly enabled
  if (configJson.usePPR !== true) {
    return NextResponse.json(
      { message: "usePPR is not enabled for this game config" },
      { status: 400 }
    );
  }

  // Resolve event code — prefer DB column, fall back to config JSON
  const tbaEventCode =
    activeGame?.tba_event_code || configJson.tbaEventCode || "";
  if (!tbaEventCode || !tbaEventCode.trim()) {
    return NextResponse.json(
      { message: "No tbaEventCode configured. Set tbaEventCode in the game config." },
      { status: 400 }
    );
  }

  const tbaAuthKey = process.env.TBA_AUTH_KEY;
  if (!tbaAuthKey) {
    return NextResponse.json(
      { message: "TBA_AUTH_KEY environment variable is not configured" },
      { status: 500 }
    );
  }

  // Fetch matches from TBA
  let rawMatches;
  try {
    const tbaUrl = `https://www.thebluealliance.com/api/v3/event/${tbaEventCode.trim()}/matches`;
    const tbaResponse = await fetch(tbaUrl, {
      headers: { "X-TBA-Auth-Key": tbaAuthKey },
      cache: "no-store",
    });

    if (!tbaResponse.ok) {
      const errorBody = await tbaResponse.text().catch(() => "");
      console.error("[opr] TBA API error:", tbaResponse.status, errorBody);
      return NextResponse.json(
        { message: `TBA API error: ${tbaResponse.status}` },
        { status: tbaResponse.status }
      );
    }

    rawMatches = await tbaResponse.json();
  } catch (fetchError) {
    console.error("[opr] Failed to fetch from TBA:", fetchError);
    return NextResponse.json(
      { message: "Failed to fetch match data from The Blue Alliance" },
      { status: 502 }
    );
  }

  if (!Array.isArray(rawMatches)) {
    return NextResponse.json(
      { message: "Unexpected response format from TBA" },
      { status: 502 }
    );
  }

  // Parse and normalize — only include matches that have been played (score >= 0)
  const matches = [];
  for (const m of rawMatches) {
    const { comp_level, match_number, set_number, alliances } = m;

    let type, number;
    if (comp_level === "qm") {
      type = "Q";
      number = match_number;
    } else if (comp_level === "sf") {
      type = "SF";
      number = set_number;
    } else if (comp_level === "f") {
      type = "F";
      number = match_number;
    } else {
      // Skip ef, qf, or any other level not relevant to standard FRC events
      continue;
    }

    const redScore = alliances?.red?.score ?? -1;
    const blueScore = alliances?.blue?.score ?? -1;

    // Skip unplayed matches (TBA uses -1 for not-yet-played)
    if (redScore < 0 || blueScore < 0) continue;

    const redTeams = (alliances?.red?.team_keys || []).map((k) =>
      parseInt(k.replace("frc", ""), 10)
    );
    const blueTeams = (alliances?.blue?.team_keys || []).map((k) =>
      parseInt(k.replace("frc", ""), 10)
    );

    // Skip if team data is malformed
    if (redTeams.some(isNaN) || blueTeams.some(isNaN)) continue;

    matches.push({ type, number, redTeams, blueTeams, redScore, blueScore });
  }

  // Sort: Q → SF → F, then ascending by number within each level
  const levelOrder = { Q: 0, SF: 1, F: 2 };
  matches.sort((a, b) => {
    const lo = (levelOrder[a.type] ?? 99) - (levelOrder[b.type] ?? 99);
    return lo !== 0 ? lo : a.number - b.number;
  });

  return NextResponse.json({ matches, eventCode: tbaEventCode.trim() });
}
