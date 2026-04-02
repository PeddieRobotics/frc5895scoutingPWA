import { NextResponse } from "next/server";
import { pool, validateAuthToken } from "../../../lib/auth";
import { getGameByIdOrActive, parseRequestedGameId } from "../../../lib/game-config";
import { createCalculationFunctions } from "../../../lib/calculation-engine";
import { aggregateAllianceData } from "../../../lib/display-engine";
import { applyScoutLeadRatesToRows } from "../../../lib/timer-rate-processing";
import { getTeamOPRMap, getLast3OPRMap, getPerPeriodOPRMaps, getLast3PerPeriodOPRMaps, getPPROverTime, getPerPeriodTeamData } from "../../../lib/opr-service";

export const revalidate = 0; // Disable cache to ensure fresh data

export async function GET(request) {
  try {
    // First validate the auth token
    const { isValid, teamName: authTeamName, error } = await validateAuthToken(request);

    if (!isValid) {
      return NextResponse.json({
        message: error || "Authentication required"
      }, {
        status: 401,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    const { searchParams } = new URL(request.url);
    const requestedGameId = parseRequestedGameId(
      searchParams.get("gameId") || request.headers.get("X-Game-Id")
    );

    // Get active game - required
    let activeGame;
    try {
      activeGame = await getGameByIdOrActive(requestedGameId);
    } catch (e) {
      console.error("[get-alliance-data] Error getting active game:", e);
    }

    if (!activeGame || !activeGame.table_name) {
      if (requestedGameId !== null) {
        return NextResponse.json({
          message: `Selected game ${requestedGameId} was not found.`,
          error: "INVALID_GAME_SELECTION"
        }, { status: 400 });
      }
      return NextResponse.json({
        message: "No active game configured. Please go to /admin/games to create and activate a game.",
        error: "NO_ACTIVE_GAME"
      }, { status: 400 });
    }

    const tableName = activeGame.table_name;
    const gameConfig = activeGame.config_json;
    const calculationFunctions = createCalculationFunctions(gameConfig);

    const client = await pool.connect();
    let rows;
    let scoredRows;
    let unscoredMatches = [];
    try {
      const result = await client.query(`SELECT * FROM ${tableName}`);
      rows = result.rows;
      const timerProcessing = await applyScoutLeadRatesToRows(rows, activeGame, client);
      scoredRows = timerProcessing.scoredRows;
      unscoredMatches = timerProcessing.unscoredMatches;
    } finally {
      client.release();
    }

    // Optionally filter to last 3 matches per team
    const scope = searchParams.get('scope');
    if (scope === 'last3') {
      const byTeam = {};
      scoredRows.forEach(r => { (byTeam[r.team] = byTeam[r.team] || []).push(r); });
      scoredRows = Object.values(byTeam).flatMap(rows =>
        rows.sort((a, b) => a.match - b.match).slice(-3)
      );
    }

    // Use config-driven aggregation
    const responseObject = aggregateAllianceData(scoredRows, gameConfig, calculationFunctions);

    // If usePPR, override EPA fields with PPR (Peddie Power Rating) for each team
    if (gameConfig?.usePPR === true) {
      // Fetch main OPR and period OPR independently so a period OPR failure
      // doesn't block avgEpa/last3Epa injection.
      let oprMap = null, last3OprMap = null, periodMaps = null, last3PeriodMaps = null;
      try {
        [oprMap, last3OprMap] = await Promise.all([
          getTeamOPRMap(activeGame),
          getLast3OPRMap(activeGame),
        ]);
      } catch (oprError) {
        console.error("[get-alliance-data] PPR injection error:", oprError);
      }
      try {
        [periodMaps, last3PeriodMaps] = await Promise.all([
          getPerPeriodOPRMaps(activeGame),
          getLast3PerPeriodOPRMaps(activeGame),
        ]);
      } catch (periodError) {
        console.error("[get-alliance-data] Period OPR error:", periodError);
      }
      if (gameConfig?.display?.matchView?.showEpaOverTime === true) {
        const teamNumbers = Object.keys(responseObject).map(Number);
        const [pprOverTimeResults, periodOverTimeResults] = await Promise.all([
          Promise.allSettled(teamNumbers.map(num => getPPROverTime(activeGame, num))),
          Promise.allSettled(teamNumbers.map(num => getPerPeriodTeamData(activeGame, num))),
        ]);
        teamNumbers.forEach((num, i) => {
          const key = String(num);
          const epaResult = pprOverTimeResults[i];
          if (epaResult.status === 'fulfilled' && Array.isArray(epaResult.value) && epaResult.value.length > 0) {
            responseObject[key].epaOverTime = epaResult.value;
          }
          const periodResult = periodOverTimeResults[i];
          if (periodResult.status === 'fulfilled' && periodResult.value) {
            const pd = periodResult.value;
            if (pd.autoOverTime?.length > 0) responseObject[key].autoOverTime = pd.autoOverTime;
            if (pd.teleOverTime?.length > 0) responseObject[key].teleOverTime = pd.teleOverTime;
          }
        });
      }
      if (oprMap) {
        Object.keys(responseObject).forEach((teamNum) => {
          const num = Number(teamNum);
          const opr = oprMap.get(num);
          const last3Opr = last3OprMap?.get(num);
          if (opr != null) {
            responseObject[teamNum].avgEpa   = opr;
            responseObject[teamNum].last3Epa = last3Opr ?? opr;
          }
          if (periodMaps) {
            const autoOpr = periodMaps.auto?.get(num);
            const teleOpr = periodMaps.tele?.get(num);
            const endOpr  = periodMaps.end?.get(num);
            if (autoOpr != null) responseObject[teamNum].autoEpa = autoOpr;
            if (teleOpr != null) responseObject[teamNum].teleEpa = teleOpr;
            if (endOpr  != null) responseObject[teamNum].endEpa  = endOpr;
          }
          if (last3PeriodMaps) {
            const autoL3 = last3PeriodMaps.auto?.get(num);
            const teleL3 = last3PeriodMaps.tele?.get(num);
            const endL3  = last3PeriodMaps.end?.get(num);
            if (autoL3 != null) responseObject[teamNum].autoLast3Epa = autoL3;
            if (teleL3 != null) responseObject[teamNum].teleLast3Epa = teleL3;
            if (endL3  != null) responseObject[teamNum].endLast3Epa  = endL3;
          }
        });
      }
    }

    // Fetch team names from TBA (best effort)
    try {
      const tbaEventCode = gameConfig?.tbaEventCode || process.env.TBA_EVENT_CODE;
      if (!tbaEventCode) throw new Error("No TBA event code configured");
      const tbaResp = await fetch(`https://www.thebluealliance.com/api/v3/event/${tbaEventCode}/teams`, {
        headers: {
          "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY,
          "Accept": "application/json"
        },
      });

      if (tbaResp.ok) {
        const tbaTeams = await tbaResp.json();
        Object.keys(responseObject).forEach(team => {
          const tbaInfo = tbaTeams.filter(t => parseInt(t.team_number) === parseInt(team));
          responseObject[team].teamName = tbaInfo.length > 0 ? tbaInfo[0].nickname : "";
        });
      }
    } catch (tbaError) {
      console.error("[get-alliance-data] TBA fetch error:", tbaError);
      // Continue without team names
    }

    return NextResponse.json({
      teams: responseObject,
      unscoredMatches,
      skippedScoringRows: rows.length - scoredRows.length,
    }, { status: 200 });
  } catch (error) {
    console.error("Error fetching alliance data:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
