'use client';
import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, ResponsiveContainer, Cell, LineChart, Line, RadarChart, PolarRadiusAxis, PolarAngleAxis, PolarGrid, Radar, Legend } from 'recharts';
import { VictoryPie } from "victory";
import Link from "next/link";
import styles from "./page.module.css"
import PiecePlacement from "./components/PiecePlacement";
import Endgame from "./components/Endgame";
import DefenseBarChart from "./components/DefenseBarChart";
import EPALineChart from "./components/EPALineChart";
import TeamEPALineChart from "../team-view/components/EPALineChart";
import useGameConfig from "../../lib/useGameConfig";
import { getMatchViewConfigIssues } from "../../lib/display-config-validation";


export default function MatchViewPage() {
  return <MatchView />;
}

function MatchView() {
  const { config, gameId, loading: configLoading } = useGameConfig();
  const matchViewConfig = config?.display?.matchView;
  const configIssues = useMemo(() => {
    if (configLoading || !config) return [];
    return getMatchViewConfigIssues(config);
  }, [config, configLoading]);

  const [allData, setAllData] = useState(null);
  const [data, setData] = useState(false);
  const [urlParams, setUrlParams] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unscoredMatches, setUnscoredMatches] = useState([]);
  const [useRecent, setUseRecent] = useState(false);

  //light to dark
  const COLORS = [
    ["#A4E5DF", "#6FDCD3", "#93C8C4", "#73CEC7", "#5EACB5"], //green
    ["#B7D1F7", "#9FBCEC", "#8FA5F5", "#838FDC", "#5E6CB5"], //blue
    ["#DDB7F7", "#B38DDE", "#B16FDC", "#9051BE", "#975EB5"], //purple
    ["#F6C1D8", "#F2A8C9", "#D883A2", "#D883AC", "#B55E7B"], //pink
    ["#FFD1D0", "#F7B7B7", "#DC8683", "#BE5151", "#B55E5E"], //red
    ["#FFD4AB", "#FABD7C", "#FFAF72", "#FFA75A", "#FF9F4B"], //orange
  ];


  // --- Derive shapes from config (null-safe since guard is after hooks) ---
  const barsConfig = matchViewConfig?.piecePlacement?.bars || [];
  const endgamePieConfig = matchViewConfig?.endgamePie || {};
  const qualitativeFields = matchViewConfig?.qualitativeFields || [];
  const rankingPointsConfig = matchViewConfig?.rankingPoints || [];
  const epaBreakdownKeys = matchViewConfig?.epaBreakdown || [];
  const showEpaOverTime = matchViewConfig?.showEpaOverTime === true;
  const teamStatsConfig = matchViewConfig?.teamStats || [];
  const formatUnscoredMatch = (issue) => {
    const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"][issue?.matchType] || `Type ${issue?.matchType}`;
    const matchLabel = issue?.displayMatch ?? issue?.match ?? "Unknown";
    return `Team ${issue?.team} - ${matchTypeLabel} Match ${matchLabel}: ${issue?.reason || "Missing scout-leads rate."}`;
  };

  // Get URL parameters on client-side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const paramsObj = {};
      for (const [key, value] of searchParams.entries()) {
        paramsObj[key] = value;
      }
      setUrlParams(paramsObj);

      // If no parameters are provided, or in edit mode, show the form
      if (Object.keys(paramsObj).length === 0 || paramsObj.edit) {
        setData({});
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (configLoading || configIssues.length > 0) return;

    // Only fetch data if we have URL parameters (and not in edit mode)
    if (Object.keys(urlParams).length === 0 || urlParams.edit) return;

    setLoading(true);
    setError(null);

    // Get the current user's team
    let currentUserTeam = null;
    try {
      // Try localStorage first
      const storedTeam = localStorage.getItem('userTeam');
      if (storedTeam) {
        currentUserTeam = storedTeam;
      } else {
        // Check cookies as fallback
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {});

        if (cookies.team_name) {
          currentUserTeam = cookies.team_name;
          localStorage.setItem('userTeam', cookies.team_name);
        }
      }
    } catch (e) {
      console.error('Error getting user team:', e);
    }

    const allianceParams = new URLSearchParams();
    if (useRecent) allianceParams.set('scope', 'last3');
    if (gameId) allianceParams.set('gameId', String(gameId));

    fetch(`/api/get-alliance-data?${allianceParams.toString()}`, {
      headers: {
        'Authorization': (() => {
          try {
            const creds = sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials');
            return creds ? `Basic ${creds}` : undefined;
          } catch (_) { return undefined; }
        })()
      }
    })
      .then(resp => {
        if (resp.status === 401) {
          console.error("Authentication failed - triggering login dialog");
          // Trigger auth required event to show login dialog
          window.dispatchEvent(new CustomEvent('auth:required', {
            detail: { message: 'Session expired or invalid. Please login again.' }
          }));
          throw new Error('Authentication required');
        }
        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }
        return resp.json();
      })
      .then(data => {
        console.log("Fetched Data from API:", data);  // <-- Check what the API returns
        const teamMap = data?.teams || data || {};
        setAllData(teamMap);
        setUnscoredMatches(Array.isArray(data?.unscoredMatches) ? data.unscoredMatches : []);
        setLoading(false);
      })
      .catch(error => {
        if (error.message !== 'Authentication required') {
          console.error("Error fetching alliance data:", error);
          setError(error.message);
        }
        setLoading(false);
      });
  }, [urlParams, configLoading, configIssues.length, useRecent, gameId]);

  useEffect(() => {
    if (configLoading || configIssues.length > 0) return;

    if (Object.keys(urlParams).length > 0 && allData) {
      if (!urlParams.match) {
        //search by teams
        let [team1, team2, team3, team4, team5, team6] = [
          urlParams.team1,
          urlParams.team2,
          urlParams.team3,
          urlParams.team4,
          urlParams.team5,
          urlParams.team6
        ];
        setData({ team1: allData[team1], team2: allData[team2], team3: allData[team3], team4: allData[team4], team5: allData[team5], team6: allData[team6] });
        setLoading(false);
      } else {
        // Get the current user's team
        let currentUserTeam = null;
        try {
          // Try localStorage first
          const storedTeam = localStorage.getItem('userTeam');
          if (storedTeam) {
            currentUserTeam = storedTeam;
          } else {
            // Check cookies as fallback
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
              const [key, value] = cookie.trim().split('=');
              acc[key] = value;
              return acc;
            }, {});

            if (cookies.team_name) {
              currentUserTeam = cookies.team_name;
              localStorage.setItem('userTeam', cookies.team_name);
            }
          }
        } catch (e) {
          console.error('Error getting user team:', e);
        }

        const matchParams = new URLSearchParams({ match: String(urlParams.match) });
        if (gameId) matchParams.set('gameId', String(gameId));
        fetch(`/api/get-teams-of-match?${matchParams.toString()}`, {
          headers: {
            'Authorization': (() => {
              try {
                const creds = sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials');
                return creds ? `Basic ${creds}` : undefined;
              } catch (_) { return undefined; }
            })()
          }
        })
          .then(resp => {
            if (resp.status === 401) {
              console.error("Authentication failed - triggering login dialog");
              // Trigger auth required event to show login dialog
              window.dispatchEvent(new CustomEvent('auth:required', {
                detail: { message: 'Session expired or invalid. Please login again.' }
              }));
              throw new Error('Authentication required');
            }
            if (!resp.ok) {
              throw new Error(`HTTP error! status: ${resp.status}`);
            }
            return resp.json();
          })
          .then(data => {
            if (data.message) {
              console.log(data.message);
              setError(data.message);
              setLoading(false);
            } else {
              //update url with teams
              const newParams = new URLSearchParams();
              // Swap team positions as requested: team1<->team4, team2<->team5, team3<->team6
              newParams.set('team1', data.team4);
              newParams.set('team2', data.team5);
              newParams.set('team3', data.team6);
              newParams.set('team4', data.team1);
              newParams.set('team5', data.team2);
              newParams.set('team6', data.team3);
              // Add a flag to indicate the teams were loaded from a match and swapped
              newParams.set('from_match', 'true');

              const newUrl = `${window.location.pathname}?${newParams.toString()}`;
              window.history.replaceState(null, 'Picklist', newUrl);

              // Update our local urlParams state
              const updatedParams = {
                team1: data.team4,
                team2: data.team5,
                team3: data.team6,
                team4: data.team1,
                team5: data.team2,
                team6: data.team3,
                from_match: 'true'
              };
              setUrlParams(updatedParams);

              // Also swap the data assignment
              setData({
                team1: allData[data.team4],
                team2: allData[data.team5],
                team3: allData[data.team6],
                team4: allData[data.team1],
                team5: allData[data.team2],
                team6: allData[data.team3]
              });
              setLoading(false);
            }
          })
          .catch(error => {
            if (error.message !== 'Authentication required') {
              console.error("Error fetching teams of match:", error);
              setError(error.message);
            }
            setLoading(false);
          });
      }
    }
  }, [urlParams, allData, configLoading, configIssues.length, gameId]);

  if (configLoading) {
    return (
      <div>
        <h1>Loading...</h1>
      </div>
    );
  }

  if (configIssues.length > 0) {
    return <div>
      <div style={{ maxWidth: "900px", margin: "2rem auto", padding: "1.5rem", background: "#2a0e0e", color: "#ffd9d9", borderRadius: "8px", border: "1px solid #a44" }}>
        <h2 style={{ marginTop: 0 }}>Match View Config Error</h2>
        <p style={{ marginBottom: "0.75rem" }}>
          The active game config is missing required match-view settings.
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {configIssues.map((issue, index) => (
            <li key={index}>
              <code>{issue.path}</code>: {issue.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  }

  // Guard: if no matchView config, show fallback (must be after all hooks)
  if (!matchViewConfig) {
    return <div>
      <h2>Match View Not Configured</h2>
      <p>Add a &quot;matchView&quot; section to your game config&apos;s display settings.</p>
    </div>
  }

  //show loading state
  if (loading) {
    return <div>
      <h1>Loading...</h1>
    </div>
  }

  //show error state
  if (error) {
    return <div>
      <h1>Error: {error}</h1>
      <p>Please try again or contact support if the problem persists.</p>
    </div>
  }

  //show form if no parameters, in edit mode, or data not loaded yet
  if (!data || Object.keys(urlParams).length === 0 || urlParams.edit) {
    return (
      <div>
        <form className={styles.teamForm}>
          <span>View by Teams...</span>
          <div className={styles.horizontalBox}>
            <div className={styles.RedInputs}>
              <div>
                <label htmlFor="team1">Red 1:</label>
                <br />
                <input id="team1" name="team1" defaultValue={urlParams.team1}></input>
              </div>
              <div>
                <label htmlFor="team2">Red 2:</label>
                <br />
                <input id="team2" name="team2" defaultValue={urlParams.team2}></input>
              </div>
              <div>
                <label htmlFor="team3">Red 3:</label>
                <br />
                <input id="team3" name="team3" defaultValue={urlParams.team3}></input>
              </div>
            </div>
            <div className={styles.BlueInputs}>
              <div>
                <label htmlFor="team4">Blue 1:</label>
                <br />
                <input id="team4" name="team4" defaultValue={urlParams.team4}></input>
              </div>
              <div>
                <label htmlFor="team5">Blue 2:</label>
                <br />
                <input id="team5" name="team5" defaultValue={urlParams.team5}></input>
              </div>
              <div>
                <label htmlFor="team6">Blue 3:</label>
                <br />
                <input id="team6" name="team6" defaultValue={urlParams.team6}></input>
              </div>
            </div>
            <input type="hidden" name="go" value="go"></input>
          </div>
          <span>Or by Match...</span>
          <label htmlFor="match">Match #</label>
          <input id="match" name="match" type="number"></input>
          <button className={styles.goButton}>Go!</button>
        </form>
      </div>
    );
  }

  // --- Build defaultTeam dynamically from config ---
  const defaultAvgPieces = {};
  for (const bar of barsConfig) {
    defaultAvgPieces[bar.key] = null;
  }

  const defaultEndgame = {};
  for (let i = 0; i < (endgamePieConfig.keys || []).length; i++) {
    // First key gets 100 (so the pie shows something), rest get 0
    defaultEndgame[endgamePieConfig.keys[i]] = i === 0 ? 100 : 0;
  }

  const defaultQualitative = {};
  for (const field of qualitativeFields) {
    defaultQualitative[field] = null;
  }

  const defaultTeam = {
    team: "N/A",
    teamName: "No Data",
    auto: null,
    tele: null,
    end: null,
    avgPieces: defaultAvgPieces,
    leave: null,
    customSums: {},
    endgame: defaultEndgame,
    qualitative: defaultQualitative,
  };

  const resolveStatPath = (teamData, key) => {
    if (!teamData || !key) return null;
    return key.split('.').reduce((obj, part) => (obj != null ? obj[part] : null), teamData);
  };

  const formatStat = (value, format) => {
    if (value == null) return 'N/A';
    if (format === 'percent') return `${Math.round(value * 100)}%`;
    return `${Math.round(value * 10) / 10}`;
  };

  const resolveTeamMetric = (teamObj, keyOrPath) => {
    if (!teamObj || !keyOrPath) return 0;
    if (typeof teamObj[keyOrPath] === 'number') return teamObj[keyOrPath];
    if (typeof teamObj.avgPieces?.[keyOrPath] === 'number') return teamObj.avgPieces[keyOrPath];
    if (typeof teamObj.customSums?.[keyOrPath] === 'number') return teamObj.customSums[keyOrPath];

    if (typeof keyOrPath === 'string' && keyOrPath.includes('.')) {
      const pathValue = keyOrPath.split('.').reduce((acc, key) => acc?.[key], teamObj);
      return typeof pathValue === 'number' ? pathValue : 0;
    }

    if (teamObj.avgPieces && typeof keyOrPath === 'string') {
      const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
      const compact = keyOrPath
        .replace(/^(auto|tele)/i, '')
        .replace(/(success|fail)/gi, '');
      const target = normalize(compact);
      const alias = Object.keys(teamObj.avgPieces).find((key) => normalize(key) === target);
      if (alias && typeof teamObj.avgPieces[alias] === 'number') {
        return teamObj.avgPieces[alias];
      }
    }

    return 0;
  };

  function AllianceButtons({ t1, t2, t3, colors }) {
    // Preserve original team order in the URL by getting team values from the current URL params
    // This maintains consistency when teams were swapped due to match number lookup
    return <div className={styles.allianceBoard}>
      <Link href={`/team-view?team=${t1.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{ background: colors[0][1], '--btn-color': colors[0][1] }}>{t1.team}</button>
      </Link>
      <Link href={`/team-view?team=${t2.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{ background: colors[1][1], '--btn-color': colors[1][1] }}>{t2.team}</button>
      </Link>
      <Link href={`/team-view?team=${t3.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{ background: colors[2][1], '--btn-color': colors[2][1] }}>{t3.team}</button>
      </Link>
    </div>
  }

  function AllianceDisplay({ teams, opponents, colors }) {
    //calc alliance score breakdown
    const usePPR = config?.usePPR === true;
    // For PPR box: only teams with OPR computed; for A/T/E: period OPR if available, else scouting
    const pprTeams = teams.filter(team => team && team.last3Epa != null);
    const hasPeriodOPR = usePPR && teams.some(team => team?.autoEpa != null);
    const periodTeams = hasPeriodOPR ? teams.filter(team => team && team.autoEpa != null) : null;
    const scoutingTeams = teams.filter(team => team && team.auto !== null);
    const auto = hasPeriodOPR
      ? periodTeams.reduce((sum, team) => sum + (team.autoEpa || 0), 0)
      : scoutingTeams.reduce((sum, team) => sum + (team.auto || 0), 0);
    const tele = hasPeriodOPR
      ? periodTeams.reduce((sum, team) => sum + (team.teleEpa || 0), 0)
      : scoutingTeams.reduce((sum, team) => sum + (team.tele || 0), 0);
    const end = hasPeriodOPR
      ? periodTeams.reduce((sum, team) => sum + (team.endEpa || 0), 0)
      : scoutingTeams.reduce((sum, team) => sum + (team.end || 0), 0);
    const alliancePPR = usePPR ? pprTeams.reduce((sum, team) => sum + (team.last3Epa || 0), 0) : null;

    //calc ranking points
    const RGBColors = {
      red: "#FF9393",
      green: "#BFFEC1",
      yellow: "#FFDD9A"
    }
    //win = higher score than opponents
    const teamEPA = (team) => {
      if (!team) return 0;
      if (usePPR) return team.last3Epa || 0;
      return team.auto !== null ? team.auto + team.tele + team.end : 0;
    };
    const validOpponents = opponents.filter(opponent => opponent && (usePPR ? opponent.last3Epa != null : opponent.auto !== null));
    const opponentsEPA = validOpponents.reduce((sum, opponent) => sum + teamEPA(opponent), 0);
    const currentAllianceEPA = usePPR ? (alliancePPR || 0) : auto + tele + end;
    let RP_WIN = RGBColors.red;
    if (currentAllianceEPA > opponentsEPA) RP_WIN = RGBColors.green;
    else if (currentAllianceEPA == opponentsEPA) RP_WIN = RGBColors.yellow;

    // --- Config-driven ranking point calculations ---
    const rpResults = rankingPointsConfig.map(rpConfig => {
      let color = RGBColors.red;

      if (rpConfig.type === "allLeaveAndCoral" || rpConfig.type === "allFieldsAndThreshold") {
        const allianceCoral = (() => {
          if (Array.isArray(rpConfig.coralFields) && rpConfig.coralFields.length > 0) {
            return teams.reduce((sum, team) => {
              const teamSum = rpConfig.coralFields.reduce((fieldSum, fieldName) => {
                return fieldSum + resolveTeamMetric(team, fieldName);
              }, 0);
              return sum + teamSum;
            }, 0);
          }

          const coralField = rpConfig.coralField || 'autoCoral';
          return teams.reduce((sum, team) => sum + resolveTeamMetric(team, coralField), 0);
        })();

        const allLeave = teams.every(team => team && team[rpConfig.leaveField || "leave"] === true);
        const threshold = rpConfig.minCoral ?? rpConfig.threshold ?? 1;
        if (allianceCoral >= threshold && allLeave) {
          color = RGBColors.green;
        }
      } else if (rpConfig.type === "levelThreshold") {
        let conditions = [];

        if (Array.isArray(rpConfig.levels)) {
          conditions = rpConfig.levels.map(level => {
            if (!level?.key) return false;
            const total = teams.reduce((sum, team) => sum + resolveTeamMetric(team, level.key), 0);
            const threshold = level.threshold ?? rpConfig.threshold ?? 0;
            return total >= threshold;
          });
        } else if (rpConfig.levels && typeof rpConfig.levels === "object") {
          conditions = Object.entries(rpConfig.levels).map(([levelKey, fields]) => {
            let total = teams.reduce((sum, team) => sum + resolveTeamMetric(team, levelKey), 0);
            if (total === 0 && Array.isArray(fields) && fields.length > 0) {
              total = teams.reduce((sum, team) => {
                const teamSum = fields.reduce((fieldSum, fieldName) => {
                  return fieldSum + resolveTeamMetric(team, fieldName);
                }, 0);
                return sum + teamSum;
              }, 0);
            }
            const threshold = rpConfig.threshold ?? 0;
            return total >= threshold;
          });
        }

        const trueCount = conditions.filter(Boolean).length;
        const totalConditions = conditions.length;
        if (trueCount >= (rpConfig.greenCount ?? totalConditions)) {
          color = RGBColors.green;
        } else if (trueCount >= (rpConfig.yellowCount ?? Math.max(0, totalConditions - 1))) {
          color = RGBColors.yellow;
        }
      } else if (rpConfig.type === "endgameThreshold") {
        const fieldName = rpConfig.field || rpConfig.calcKey || "end";
        const total = teams.reduce((sum, team) => {
          return sum + resolveTeamMetric(team, fieldName);
        }, 0);
        if (total >= (rpConfig.threshold ?? 0)) {
          color = RGBColors.green;
        }
      }

      return { label: rpConfig.label, color };
    });

    return <div className={styles.lightBorderBox} style={{ paddingTop: '20px' }}>
      <div className={styles.scoreBreakdownContainer}>
        <div style={{ background: colors[0], minWidth: "60px", textAlign: "center", '--epa-box-label': usePPR ? '"3 PPR"' : '"EPA"' }} className={styles.EPABox}>{usePPR ? (alliancePPR || 0).toFixed(1) : ((auto + tele + end) || 0).toFixed(1)}</div>
        <div className={styles.EPABreakdown}>
          <div style={{ background: colors[1], minWidth: "50px", textAlign: "center" }}>A: {(auto || 0).toFixed(1)}</div>
          <div style={{ background: colors[1], minWidth: "50px", textAlign: "center" }}>T: {(tele || 0).toFixed(1)}</div>
          <div style={{ background: colors[1], minWidth: "50px", textAlign: "center" }}>E: {(end || 0).toFixed(1)}</div>
        </div>
      </div>
      <div className={styles.RPs}>
        <div style={{ background: RP_WIN }}>Victory</div>
        {rpResults.map((rp, i) => (
          <div key={i} style={{ background: rp.color }}>{rp.label}</div>
        ))}
      </div>
    </div>

  }

  function TeamDisplay({ teamData, colors, matchMax }) {
    // Check if endgame data is valid
    const hasEndgameData = teamData.endgame &&
      Object.values(teamData.endgame).some(value => value !== null && value > 0);

    // Build endgame data from config
    const endgameData = hasEndgameData
      ? endgamePieConfig.keys.map((key, i) => ({
        x: endgamePieConfig.labels[i] || key,
        y: teamData.endgame[key] || 0,
      }))
      : [{ x: 'N/A', y: 100 }];

    return <div className={styles.lightBorderBox}>
      <h1 style={{ color: colors[3], marginTop: "10px", marginBottom: "0px" }}>{teamData.team}</h1>
      <h2 style={{ color: colors[3], marginTop: "0px", marginBottom: "0px" }}>{teamData.teamName}</h2>
      <div className={styles.scoreBreakdownContainer} style={{ marginTop: "30px" }}>
        <div style={{ background: colors[0], minWidth: "60px", textAlign: "center", '--epa-box-label': config?.usePPR ? '"3 PPR"' : '"EPA"' }} className={styles.EPABox}>
          {config?.usePPR ? (teamData.last3Epa != null ? (teamData.last3Epa || 0).toFixed(1) : "N/A") : teamData.auto !== null ? ((teamData.auto || 0) + (teamData.tele || 0) + (teamData.end || 0)).toFixed(1) : "N/A"}
        </div>
        <div className={styles.EPABreakdown}>
          <div style={{ background: colors[2], minWidth: "50px", textAlign: "center" }}>A: {config?.usePPR ? (teamData.autoLast3Epa != null ? (teamData.autoLast3Epa || 0).toFixed(1) : "N/A") : (teamData.auto !== null ? (teamData.auto || 0).toFixed(1) : "N/A")}</div>
          <div style={{ background: colors[2], minWidth: "50px", textAlign: "center" }}>T: {config?.usePPR ? (teamData.teleLast3Epa != null ? (teamData.teleLast3Epa || 0).toFixed(1) : "N/A") : (teamData.tele !== null ? (teamData.tele || 0).toFixed(1) : "N/A")}</div>
          <div style={{ background: colors[2], minWidth: "50px", textAlign: "center" }}>E: {config?.usePPR ? (teamData.endLast3Epa != null ? (teamData.endLast3Epa || 0).toFixed(1) : "N/A") : (teamData.end !== null ? (teamData.end || 0).toFixed(1) : "N/A")}</div>
        </div>
      </div>
      {barsConfig.length > 0 && (
        <div className={styles.barchartContainer}>
          <h2 style={{ marginBottom: "0px", marginTop: "0px" }}>Average Piece Placement</h2>
          <PiecePlacement
            colors={colors}
            matchMax={matchMax}
            bars={barsConfig.map(bar => ({
              label: bar.label,
              value: teamData.avgPieces?.[bar.key] !== null && teamData.avgPieces?.[bar.key] !== undefined
                ? Math.round(10 * teamData.avgPieces[bar.key]) / 10
                : null,
            }))}
          />
        </div>
      )}
      {showEpaOverTime && teamData.epaOverTime?.length > 0 && (
        <div style={{ width: '100%', marginTop: "16px", marginBottom: "8px", padding: "0 12px", boxSizing: "border-box" }}>
          <h2 style={{ marginBottom: "0px", marginTop: "0px" }}>
            {config?.usePPR ? "PPR Over Time" : "EPA Over Time"}
          </h2>
          <TeamEPALineChart
            data={teamData.epaOverTime}
            color={colors[3]}
            label="epa"
            displayLabel={config?.usePPR ? "PPR" : "EPA"}
            height={175}
            responsive={true}
          />
        </div>
      )}
      {endgamePieConfig?.keys?.length > 0 && (
        <>
          <h2 style={{ textAlign: "center", marginTop: "20px", marginBottom: "0px" }}>
            {endgamePieConfig.label || "Endgame %"}
          </h2>
          <div className={styles.chartContainer}>
            <Endgame
              colors={colors}
              endgameData={endgameData}
            />
          </div>
        </>
      )}
      {teamStatsConfig.length > 0 && (
        <div style={{ padding: "0 12px 12px" }}>
          {teamStatsConfig.map((statDef, i) => {
            const rawValue = resolveStatPath(teamData, statDef.key);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderTop: '1px solid rgba(160,124,48,0.15)', color: '#0d1f35' }}>
                <span style={{ fontWeight: 600 }}>{statDef.label}</span>
                <span>{formatStat(rawValue, statDef.format)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  }
  let get = (alliance, thing) => {
    let sum = 0;
    for (let i = 0; i < alliance.length; i++) {
      if (alliance[i] && alliance[i][thing] !== null) {
        sum += alliance[i][thing];
      }
    }
    return sum;
  }



  const redAlliance = [data.team1 || defaultTeam, data.team2 || defaultTeam, data.team3 || defaultTeam];
  const blueAlliance = [data.team4 || defaultTeam, data.team5 || defaultTeam, data.team6 || defaultTeam];
  const visibleTeamNumbers = new Set([
    urlParams.team1,
    urlParams.team2,
    urlParams.team3,
    urlParams.team4,
    urlParams.team5,
    urlParams.team6,
    data?.team1?.team,
    data?.team2?.team,
    data?.team3?.team,
    data?.team4?.team,
    data?.team5?.team,
    data?.team6?.team,
  ].filter((value) => value !== undefined && value !== null).map((value) => String(value)));
  const visibleUnscoredMatches = unscoredMatches.filter((issue) => visibleTeamNumbers.has(String(issue.team)));
  const hasPeriodOPRGraph = config?.usePPR && blueAlliance.concat(redAlliance).some(t => t?.autoEpa != null);
  const getField = (alliance, pprField, scoutField) => hasPeriodOPRGraph
    ? alliance.reduce((s, t) => s + (t?.[pprField] ?? 0), 0)
    : get(alliance, scoutField);
  const blueAuto = getField(blueAlliance, "autoEpa", "auto");
  const blueTele = getField(blueAlliance, "teleEpa", "tele");
  const blueEnd  = getField(blueAlliance, "endEpa",  "end");
  const redAuto  = getField(redAlliance,  "autoEpa", "auto");
  const redTele  = getField(redAlliance,  "teleEpa", "tele");
  const redEnd   = getField(redAlliance,  "endEpa",  "end");
  const epaData = [
    { name: "Start", blue: 0, red: 0 },
    { name: "Auto", blue: blueAuto, red: redAuto },
    { name: "Tele", blue: blueAuto + blueTele, red: redAuto + redTele },
    { name: "End",  blue: blueAuto + blueTele + blueEnd, red: redAuto + redTele + redEnd },
  ];

  //getting radar data from config
  let radarData = [];
  for (let qual of qualitativeFields) {
    radarData.push({
      qual,
      team1: data?.team1?.qualitative?.[qual] !== undefined ? data.team1.qualitative[qual] : null,
      team2: data?.team2?.qualitative?.[qual] !== undefined ? data.team2.qualitative[qual] : null,
      team3: data?.team3?.qualitative?.[qual] !== undefined ? data.team3.qualitative[qual] : null,
      team4: data?.team4?.qualitative?.[qual] !== undefined ? data.team4.qualitative[qual] : null,
      team5: data?.team5?.qualitative?.[qual] !== undefined ? data.team5.qualitative[qual] : null,
      team6: data?.team6?.qualitative?.[qual] !== undefined ? data.team6.qualitative[qual] : null,
      fullMark: 5
    });
  }
  console.log(radarData);

  // Calculate matchMax from config-driven bar keys
  let matchMax = 0;
  for (let teamData of [data.team1, data.team2, data.team3, data.team4, data.team5, data.team6]) {
    if (teamData && teamData.avgPieces) {
      const pieceValues = barsConfig
        .map(bar => teamData.avgPieces[bar.key])
        .filter(value => value !== null && value !== undefined);

      if (pieceValues.length > 0) {
        matchMax = Math.max(...pieceValues, matchMax);
      }
    }
  }
  matchMax = Math.floor(matchMax) + 2;
  console.log("Team 1 Data:", data.team1);
  console.log("Team 2 Data:", data.team2);
  console.log("Team 3 Data:", data.team3);


  return (
    <div>
      {visibleUnscoredMatches.length > 0 && (
        <div style={{ margin: "12px", padding: "12px 14px", background: "#ffebe9", border: "1px solid #ff8182", borderRadius: "10px", color: "#7d1f1f" }}>
          <strong>Unscored matches were skipped.</strong>
          <ul style={{ margin: "8px 0 0 18px" }}>
            {visibleUnscoredMatches.map((issue, index) => (
              <li key={`${issue.team}-${issue.match}-${issue.matchType}-${index}`}>
                {formatUnscoredMatch(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.dataRangeContainer}>
        <span className={styles.dataRangeLabel}>Data Range:</span>
        <div className={styles.dataRangeToggle}>
          <button
            onClick={() => setUseRecent(false)}
            className={`${styles.dataRangeBtn}${!useRecent ? ` ${styles.dataRangeBtnActive}` : ''}`}
          >
            All Time
          </button>
          <button
            onClick={() => setUseRecent(true)}
            className={`${styles.dataRangeBtn}${useRecent ? ` ${styles.dataRangeBtnActive}` : ''}`}
          >
            Last 3 Matches
          </button>
        </div>
      </div>
      <div className={styles.matchNav}>
        <AllianceButtons t1={data.team1 || defaultTeam} t2={data.team2 || defaultTeam} t3={data.team3 || defaultTeam} colors={[COLORS[3], COLORS[4], COLORS[5]]}></AllianceButtons>
        <button className={styles.navActionButton} onClick={() => { window.location.href = `/match-view?edit=true&team1=${data.team1?.team || ""}&team2=${data.team2?.team || ""}&team3=${data.team3?.team || ""}&team4=${data.team4?.team || ""}&team5=${data.team5?.team || ""}&team6=${data.team6?.team || ""}`; }}>Edit</button>
        <AllianceButtons t1={data.team4 || defaultTeam} t2={data.team5 || defaultTeam} t3={data.team6 || defaultTeam} colors={[COLORS[0], COLORS[1], COLORS[2]]}></AllianceButtons>
      </div>
      <div className={styles.allianceEPAs}>
        <AllianceDisplay teams={redAlliance} opponents={blueAlliance} colors={["#FFD5E1", "#F29FA6"]}></AllianceDisplay>
        <AllianceDisplay teams={blueAlliance} opponents={redAlliance} colors={["#D3DFFF", "#8FA5F5"]}></AllianceDisplay>
      </div>
      <div className={styles.allianceGraphs}>
        <div className={styles.graphContainer}>
          <DefenseBarChart
            allianceData={redAlliance}
            colors={[COLORS[3][2], COLORS[4][1], COLORS[5][2]]}
            defenseField={matchViewConfig?.defenseBarField}
            scope={useRecent ? 'last3' : 'all'}
            gameId={gameId}
            teamNumbers={[
              (data.team1 || defaultTeam).team,
              (data.team2 || defaultTeam).team,
              (data.team3 || defaultTeam).team
            ]}
          />
        </div>
        <div className={styles.lineGraphContainer}>
          <h2>{config?.usePPR ? "PPR / time" : "EPA / time"}</h2>
          <br></br>
          <EPALineChart data={epaData} />
        </div>
        <div className={styles.graphContainer}>
          <DefenseBarChart
            allianceData={blueAlliance}
            colors={[COLORS[0][2], COLORS[1][1], COLORS[2][2]]}
            defenseField={matchViewConfig?.defenseBarField}
            scope={useRecent ? 'last3' : 'all'}
            gameId={gameId}
            teamNumbers={[
              (data.team4 || defaultTeam).team,
              (data.team5 || defaultTeam).team,
              (data.team6 || defaultTeam).team
            ]}
          />
        </div>
      </div>
      <div className={styles.matches}>
        <TeamDisplay teamData={data.team1 || defaultTeam} colors={COLORS[3]} matchMax={matchMax}></TeamDisplay>
        <TeamDisplay teamData={data.team2 || defaultTeam} colors={COLORS[4]} matchMax={matchMax}></TeamDisplay>
        <TeamDisplay teamData={data.team3 || defaultTeam} colors={COLORS[5]} matchMax={matchMax}></TeamDisplay>
      </div>
      <div className={styles.matches}>
        <TeamDisplay teamData={data.team4 || defaultTeam} colors={COLORS[0]} matchMax={matchMax}></TeamDisplay>
        <TeamDisplay teamData={data.team5 || defaultTeam} colors={COLORS[1]} matchMax={matchMax}></TeamDisplay>
        <TeamDisplay teamData={data.team6 || defaultTeam} colors={COLORS[2]} matchMax={matchMax}></TeamDisplay>
      </div>
    </div>
  )
}
