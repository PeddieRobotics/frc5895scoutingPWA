"use client";
import styles from "./page.module.css";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import VBox from "./components/VBox";
import HBox from "./components/HBox";
import Comments from "./components/Comments";
import TwoByTwo from "./components/TwoByTwo";
import ThreeByThree from "./components/ThreeByThree";
import FourByTwo from "./components/FourByTwo";
import EPALineChart from './components/EPALineChart';
import CoralLineChart from './components/CoralLineChart';
import PiecePlacement from "./components/PiecePlacement";
import Endgame from "./components/Endgame";
import Qualitative from "./components/Qualitative";
import useGameConfig from "../../lib/useGameConfig";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, RadarChart, PolarRadiusAxis, PolarAngleAxis, PolarGrid, Radar, Legend } from 'recharts';

export default function TeamViewPage() {
    return <TeamView />;
}

// Helper to resolve a dotted path like "auto.coral.successL1" from an object
function resolvePath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// Format a value based on format type from config
function formatStatValue(value, format) {
    switch (format) {
        case 'percent':
            return `${Math.round(10 * (value || 0)) / 10}%`;
        case 'number':
            return Math.round(10 * (value || 0)) / 10;
        case 'text':
            return value || 'None';
        default:
            return value;
    }
}

function TeamView() {
    //for backend
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentUserTeam, setCurrentUserTeam] = useState('');
    const [urlParams, setUrlParams] = useState({});
    const [team, setTeam] = useState(null);
    const [hasTopBar, setHasTopBar] = useState(false);
    const [source, setSource] = useState(null);

    const { config, loading: configLoading } = useGameConfig();

    // Extract teamView config with defaults
    const tvConfig = config?.display?.teamView || {};
    const epaThresholds = tvConfig.epaThresholds || { overall: 12, auto: 6, tele: 10, end: 6 };
    const epaBreakdown = tvConfig.epaBreakdown || ["auto", "tele", "end"];
    const coralConfig = tvConfig.piecePlacement?.coral || { levels: [], autoFields: [], teleFields: [], autoFailFields: [], teleFailFields: [] };
    const algaeConfig = tvConfig.piecePlacement?.algae || { autoFields: [], teleFields: [], autoFailFields: [], teleFailFields: [] };
    const barsConfig = tvConfig.piecePlacement?.bars || [];
    const endgamePieConfig = tvConfig.endgamePie || { labels: [], values: [] };
    const endgameStatsConfig = tvConfig.endgameStats || {};
    const overallStatsConfig = tvConfig.overallStats || [];
    const sectionsConfig = tvConfig.sections || {};
    const commentsConfig = tvConfig.comments || ["generalcomments", "breakdowncomments", "defensecomments"];
    const intakeDisplayConfig = tvConfig.intakeDisplay || [];
    const defenseBarField = tvConfig.defenseBarField || "defenseplayed";

    // Initialize URL parameters on the client side
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const teamParam = params.get("team");
            setTeam(teamParam);
            setHasTopBar(params.get('team1') !== null);
            setSource(params.get('source'));

            // Store all URL parameters
            const paramsObj = {};
            for (const [key, value] of params.entries()) {
                paramsObj[key] = value;
            }
            setUrlParams(paramsObj);
        }
    }, []);

    // Effect to fetch data when team changes
    useEffect(() => {
        if (team) {
            fetchTeamData(team);
        }
    }, [team, currentUserTeam]);

    function AllianceButtons({t1, t2, t3, colors}) {
      const searchParamsString = new URLSearchParams(urlParams).toString();
      return <div className={styles.allianceBoard}>
        <Link href={`/team-view?team=${t1 || ""}&${searchParamsString}`}>
          <button style={team == t1 ? {background: 'black', color: 'yellow'} : {background: colors[0][1]}}>{t1 || 404}</button>
        </Link>
        <Link href={`/team-view?team=${t2 || ""}&${searchParamsString}`}>
          <button style={team == t2 ? {background: 'black', color: 'yellow'} : {background: colors[1][1]}}>{t2 || 404}</button>
        </Link>
        <Link href={`/team-view?team=${t3 || ""}&${searchParamsString}`}>
          <button style={team == t3 ? {background: 'black', color: 'yellow'} : {background: colors[2][1]}}>{t3 || 404}</button>
        </Link>
      </div>
    }

    function CompareTopBar() {
      const COLORS = [
        "#A4E5DF", // green
        "#B7D1F7", // blue
        "#DDB7F7", // purple
        "#F6C1D8", // pink
      ];

      // Get teams from URL parameters
      const compareTeams = [
        urlParams.team1,
        urlParams.team2,
        urlParams.team3,
        urlParams.team4
      ].filter(t => t !== undefined && t !== null && t !== "");

      if (source !== 'compare' || compareTeams.length === 0) {
        return <></>;
      }

      return (
        <div className={styles.matchNav}>
          <div className={styles.allianceBoard}>
            {compareTeams.map((t, index) => (
              <Link key={index} href={`/team-view?team=${t}&team1=${compareTeams[0] || ""}&team2=${compareTeams[1] || ""}&team3=${compareTeams[2] || ""}&team4=${compareTeams[3] || ""}&source=compare`}>
                <button style={team == t ? {background: 'black', color: 'yellow'} : {background: COLORS[index]}}>
                  {t || 404}
                </button>
              </Link>
            ))}
          </div>
          <Link href={`/compare?team1=${compareTeams[0] || ""}&team2=${compareTeams[1] || ""}&team3=${compareTeams[2] || ""}&team4=${compareTeams[3] || ""}`}>
            <button className={styles.goButton}>Compare</button>
          </Link>
        </div>
      );
    }

    function TopBar() {
      const COLORS = [
        ["#B7F7F2", "#A1E7E1", "#75C6BF", "#5EB5AE"],
        ["#8AB8FD", "#7D99FF", "#6184DD", "#306BDD"],
        ["#E1BFFA", "#E1A6FE", "#CA91F2", "#A546DF"],
        ["#FFC6F6", "#ECA6E0", "#ED75D9", "#C342AE"],
        ["#FABFC4", "#FEA6AD", "#F29199", "#E67983"],
        ["#FFE3D3", "#EBB291", "#E19A70", "#D7814F"],
      ];

      if (!hasTopBar || source === 'compare') {
        return <></>
      }

      // Teams 1-3 should use red colors (3-5) and teams 4-6 should use blue colors (0-2)
      // when viewing a match by match number
      const fromMatch = urlParams.from_match === 'true';

      return <div className={styles.matchNav}>
        <AllianceButtons
          t1={urlParams.team1}
          t2={urlParams.team2}
          t3={urlParams.team3}
          colors={fromMatch ? [COLORS[3], COLORS[4], COLORS[5]] : [COLORS[0], COLORS[1], COLORS[2]]}
        />
        <Link href={`/match-view?team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&go=go${fromMatch ? '&from_match=true' : ''}`}>
          <button style={{background: "#ffff88", color: "black"}}>Match</button>
        </Link>
        <AllianceButtons
          t1={urlParams.team4}
          t2={urlParams.team5}
          t3={urlParams.team6}
          colors={fromMatch ? [COLORS[0], COLORS[1], COLORS[2]] : [COLORS[3], COLORS[4], COLORS[5]]}
        />
      </div>
    }

    // Fetch team data from backend
    function fetchTeamData(team) {
      setLoading(true);
      setError(null);

      // Try to get the current user's team
      if (!currentUserTeam) {
        try {
          // Try localStorage first
          const storedTeam = localStorage.getItem('userTeam');
          if (storedTeam) {
            setCurrentUserTeam(storedTeam);
          } else {
            // Check cookies as fallback
            const cookies = document.cookie.split(';').reduce((acc, cookie) => {
              const [key, value] = cookie.trim().split('=');
              acc[key] = value;
              return acc;
            }, {});

            if (cookies.team_name) {
              setCurrentUserTeam(cookies.team_name);
              localStorage.setItem('userTeam', cookies.team_name);
            }
          }
        } catch (e) {
          console.error('Error getting user team:', e);
        }
      }

      fetch(`/api/get-team-data?team=${team}&includeRows=true`, {
          headers: (() => {
            const hdrs = {};
            try {
              const storedCreds = sessionStorage.getItem('auth_credentials') ||
                                  localStorage.getItem('auth_credentials');
              if (storedCreds) {
                hdrs['Authorization'] = `Basic ${storedCreds}`;
              }
            } catch (_) {/* ignore */}
            return hdrs;
          })()
      })
          .then(response => {
              if (response.status === 401) {
                  console.error("Authentication failed - triggering login dialog");
                  // Trigger auth required event to show login dialog
                  window.dispatchEvent(new CustomEvent('auth:required', {
                      detail: { message: 'Your session has expired. Please login again.' }
                  }));
                  throw new Error('Authentication required');
              }

              // Check for 404 Not Found
              if (response.status === 404) {
                  throw new Error('Team data not found');
              }

              return response.json();
          })
          .then(data => {
              console.log("Fetched Team Data:", data);

              // Ensure we have a rows array, even if empty
              if (!data.rows) {
                  data.rows = [];
              }

              console.log("Last 3 EPA values from API:", {
                epa: data.last3Epa,
                auto: data.last3Auto,
                tele: data.last3Tele,
                end: data.last3End
              });

              setData(data);
              setLoading(false);
          })
          .catch(error => {
              if (error.message !== 'Authentication required') {
                  console.error("Error fetching team data:", error);
              }
              setError(error.message);
              setLoading(false);
          });
    }

    if (!team) {
        return (
            <div>
                <form className={styles.teamInputForm}>
                    <span>{error}</span>
                    <label htmlFor="team">Team: </label>
                    <input id="team" name="team" placeholder="Team #" type="number"></input>
                    <br></br>
                    <button className={styles.goButton}>Go!</button>
                </form>
            </div>
        );
    }

    if (loading || configLoading) {
        return (
            <div>
                <h1>Loading...</h1>
            </div>
        );
    }

    if (!data) {
        return (
            <div>
                <h1>No data found for team {team}</h1>
            </div>
        );
    }

    // Process match data for coral success and failure charts
    // Uses coral config levels/fields instead of hardcoded L1-L4
    const prepareCoralData = (matches, phase, dataType = 'success') => {
        if (!matches || !Array.isArray(matches)) return [];

        const teamMatches = matches.filter(match => match.team == team);
        const levels = coralConfig.levels || [];

        // Pick the right field arrays based on phase and dataType
        let fields;
        if (dataType === 'success') {
            fields = phase === 'auto' ? coralConfig.autoFields : coralConfig.teleFields;
        } else {
            fields = phase === 'auto' ? coralConfig.autoFailFields : coralConfig.teleFailFields;
        }
        fields = fields || [];

        return teamMatches.map(match => {
            const result = { match: match.match };
            levels.forEach((level, i) => {
                result[level] = (fields[i] ? match[fields[i]] : 0) || 0;
            });
            return result;
        }).sort((a, b) => a.match - b.match);
    };

    // Process match data for algae data charts
    // Uses algae config fields instead of hardcoded field names
    const prepareAlgaeData = (matches, phase) => {
        if (!matches || !Array.isArray(matches)) return [];

        const teamMatches = matches.filter(match => match.team == team);
        const algaeFields = phase === 'auto' ? algaeConfig.autoFields : algaeConfig.teleFields;
        const algaeFailFields = phase === 'auto' ? algaeConfig.autoFailFields : algaeConfig.teleFailFields;

        // The algae fields follow a convention: [processorSuccess, netSuccess, algaeRemoved]
        // The fail fields follow: [processorFail, netFail]
        const processorSuccessField = algaeFields?.[0] || `${phase}processorsuccess`;
        const netSuccessField = algaeFields?.[1] || `${phase}netsuccess`;
        const removedField = algaeFields?.[2] || `${phase}algaeremoved`;
        const processorFailField = algaeFailFields?.[0] || `${phase}processorfail`;
        const netFailField = algaeFailFields?.[1] || `${phase}netfail`;

        return teamMatches.map(match => ({
            match: match.match,
            removed: match[removedField] || 0,
            processorSuccess: match[processorSuccessField] || 0,
            processorFail: match[processorFailField] || 0,
            netSuccess: match[netSuccessField] || 0,
            netFail: match[netFailField] || 0
        })).sort((a, b) => a.match - b.match);
    };

    // Use the data directly from the API with safe defaults
    const safeData = {
        team: data?.team || team || 'Unknown',
        name: data?.name || 'Unknown Team',
        rows: data?.rows || [],
        avgEpa: data?.avgEpa || 0,
        avgAuto: data?.avgAuto || 0,
        avgTele: data?.avgTele || 0,
        avgEnd: data?.avgEnd || 0,
        last3Epa: data?.last3Epa || 0,
        last3Auto: data?.last3Auto || 0,
        last3Tele: data?.last3Tele || 0,
        last3End: data?.last3End || 0,
        epaOverTime: data?.epaOverTime || [],
        autoOverTime: data?.autoOverTime || [],
        teleOverTime: data?.teleOverTime || [],
        consistency: data?.consistency || 0,
        defense: data?.defense || 0,
        lastBreakdown: data?.lastBreakdown || 'None',
        noShow: data?.noShow || 0,
        breakdown: data?.breakdown || 0,
        matchesScouted: data?.matchesScouted || 0,
        generalComments: data?.generalComments || 'No comments',
        breakdownComments: data?.breakdownComments || 'No comments',
        defenseComments: data?.defenseComments || 'No comments',
        scouts: data?.scouts || [],
        leave: data?.leave || 0,
        attemptCage: data?.attemptCage || 0,
        successCage: data?.successCage || 0,
        qualitative: data?.qualitative || [],
        auto: data?.auto || { coral: {}, algae: {} },
        tele: data?.tele || { coral: {}, algae: {} },
        endPlacement: data?.endPlacement || {},
        // Spread all remaining fields (includes intake booleans from API)
        ...data,
    };

    // Prepare data for the charts
    const autoCoralSuccessData = prepareCoralData(safeData.rows, 'auto', 'success');
    const autoCoralFailData = prepareCoralData(safeData.rows, 'auto', 'fail');
    const teleCoralSuccessData = prepareCoralData(safeData.rows, 'tele', 'success');
    const teleCoralFailData = prepareCoralData(safeData.rows, 'tele', 'fail');

    const autoAlgaeData = prepareAlgaeData(safeData.rows, 'auto');
    const teleAlgaeData = prepareAlgaeData(safeData.rows, 'tele');

    console.log(`Team ${team} Coral Data:`, {
        autoSuccess: autoCoralSuccessData,
        autoFail: autoCoralFailData,
        teleSuccess: teleCoralSuccessData,
        teleFail: teleCoralFailData,
        matches: (safeData.rows).filter(m => m.team == team).map(m => m.match)
    });

    console.log(`Team ${team} Algae Data:`, {
        auto: autoAlgaeData,
        tele: teleAlgaeData
    });

    const Colors = [
        //light to dark
        ["#CCFBF7", "#76E3D3", "#18a9a2", "#117772"], //green
        ["#D7F2FF", "#7dd4ff", "#38b6f4", "#0A6D9F"], //blue
        ["#D7D8FF", "#a0a3fb", "#8488FF", "#2022AA"], //blue-purple
        ["#F3D8FB", "#DBA2ED", "#C37DDB", "#8E639C"], //pink-purple
        ["#FFDDF3", "#EDA2DB", "#DD64C0", "#9C6392"], //pink
    ];

    const epaColors = {
      red1: "#fa8888",
      red2: "#F7AFAF",
      yellow1: "#ffe16b",
      yellow2: "#ffff9e",
      green1: "#7FD689",
      green2: "#c4f19f",
    }

    // Compute last3 EPA color indicators from config thresholds
    const computeLast3Color = (avg, last3, threshold, primaryColors) => {
        if ((avg + threshold) < last3) return primaryColors.green;
        if ((avg - threshold) > last3) return primaryColors.red;
        return primaryColors.yellow;
    };

    const overallLast3 = computeLast3Color(safeData.avgEpa, safeData.last3Epa, epaThresholds.overall, { green: epaColors.green1, red: epaColors.red1, yellow: epaColors.yellow1 });
    const autoLast3 = computeLast3Color(safeData.avgAuto, safeData.last3Auto, epaThresholds.auto, { green: epaColors.green2, red: epaColors.red2, yellow: epaColors.yellow2 });
    const teleLast3 = computeLast3Color(safeData.avgTele, safeData.last3Tele, epaThresholds.tele, { green: epaColors.green2, red: epaColors.red2, yellow: epaColors.yellow2 });
    const endLast3 = computeLast3Color(safeData.avgEnd, safeData.last3End, epaThresholds.end, { green: epaColors.green2, red: epaColors.red2, yellow: epaColors.yellow2 });

    // Build endgame pie data from config
    const endgamePieData = (endgamePieConfig.labels || []).map((label, i) => {
        // Map config labels to the endPlacement keys from the API
        // The API uses valueMapping keys from apiAggregation.endgameConfig
        const placementKeys = Object.keys(safeData.endPlacement);
        const placementKey = placementKeys[i];
        return {
            x: label,
            y: placementKey ? (safeData.endPlacement[placementKey] || 0) : 0
        };
    });

    // Custom color array for endgame pie chart with 5 distinct colors
    const endgameColors = ["#F3D8FB", "#DBA2ED", "#C37DDB", "#8E639C", "#6A4372"];

    // Build PiecePlacement values from config bars
    const piecePlacementProps = {};
    barsConfig.forEach(bar => {
        let value = 0;
        // Look up auto + tele averages from safeData based on the bar label
        // The API data uses keys like auto.coral.avgL1, tele.coral.avgL1, auto.algae.avgNet, etc.
        const label = bar.label;
        if (label.startsWith('L')) {
            // Coral level
            const autoVal = safeData.auto?.coral?.[`avg${label}`] || 0;
            const teleVal = safeData.tele?.coral?.[`avg${label}`] || 0;
            value = Math.round(10 * (autoVal + teleVal)) / 10;
        } else if (label === 'Net') {
            const autoVal = safeData.auto?.algae?.avgNet || 0;
            const teleVal = safeData.tele?.algae?.avgNet || 0;
            value = Math.round(10 * (autoVal + teleVal)) / 10;
        } else if (label === 'Prcsr') {
            const autoVal = safeData.auto?.algae?.avgProcessor || 0;
            const teleVal = safeData.tele?.algae?.avgProcessor || 0;
            value = Math.round(10 * (autoVal + teleVal)) / 10;
        } else if (label === 'HP') {
            value = Math.round(10 * (safeData.tele?.avgHp || 0)) / 10;
        }
        // Map label to prop name that PiecePlacement expects
        const propMap = { 'L1': 'L1', 'L2': 'L2', 'L3': 'L3', 'L4': 'L4', 'Net': 'net', 'Prcsr': 'processor', 'HP': 'HP' };
        const propName = propMap[label] || label;
        piecePlacementProps[propName] = value;
    });

    // Build overall stat VBoxes from config
    const renderOverallStats = () => {
        return overallStatsConfig.map((stat, i) => {
            const rawValue = safeData[stat.key];
            const formatted = formatStatValue(rawValue, stat.format);
            return (
                <VBox
                    key={stat.key || i}
                    id="box"
                    className={styles.boxes}
                    style={{width: "200px"}}
                    color1={Colors[0][1]}
                    color2={Colors[0][0]}
                    title={stat.title}
                    value={formatted}
                />
            );
        });
    };

    // Build comments from config
    const commentKeyMap = {
        'generalcomments': 'generalComments',
        'breakdowncomments': 'breakdownComments',
        'defensecomments': 'defenseComments',
    };
    const commentTitleMap = {
        'generalcomments': 'General Comments',
        'breakdowncomments': 'Breakdown Comments',
        'defensecomments': 'Defense Comments',
    };

    // Helper to render an algae table for a given phase and color set
    const renderAlgaeTable = (algaeData, colorSet) => {
        const algaeTableStyle = {
            fontSize: "clamp(10px, 2vw, 14px)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            padding: "4px"
        };

        return (
            <div style={{
                padding: "15px 0",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "100%",
                textAlign: "center"
            }}>
                <div style={{width: "90%", margin: "0 auto"}}>
                    <table className={styles.coralTable} style={{
                        width: "100%",
                        tableLayout: "fixed",
                        margin: "0 auto",
                        borderCollapse: "collapse"
                    }}>
                        <tbody>
                            <tr>
                                <td style={{backgroundColor: colorSet[2], width: "15%", ...algaeTableStyle}}>Match</td>
                                <td style={{backgroundColor: colorSet[2], width: "20%", ...algaeTableStyle}}>Algae Removed</td>
                                <td style={{backgroundColor: colorSet[2], width: "32.5%", ...algaeTableStyle}} colSpan="2">Processor</td>
                                <td style={{backgroundColor: colorSet[2], width: "32.5%", ...algaeTableStyle}} colSpan="2">Net</td>
                            </tr>
                            <tr>
                                <td style={{backgroundColor: colorSet[1]}}></td>
                                <td style={{backgroundColor: colorSet[1]}}></td>
                                <td style={{backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle}}>Success</td>
                                <td style={{backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle}}>Fail</td>
                                <td style={{backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle}}>Success</td>
                                <td style={{backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle}}>Fail</td>
                            </tr>
                            {algaeData.length > 0 ? (
                                algaeData.map((match, index) => (
                                    <tr key={index}>
                                        <td style={{backgroundColor: colorSet[1], ...algaeTableStyle}}>{match.match}</td>
                                        <td style={{backgroundColor: colorSet[0], ...algaeTableStyle}}>{match.removed}</td>
                                        <td style={{backgroundColor: colorSet[0], ...algaeTableStyle}}>{match.processorSuccess}</td>
                                        <td style={{backgroundColor: colorSet[0], ...algaeTableStyle}}>{match.processorFail}</td>
                                        <td style={{backgroundColor: colorSet[0], ...algaeTableStyle}}>{match.netSuccess}</td>
                                        <td style={{backgroundColor: colorSet[0], ...algaeTableStyle}}>{match.netFail}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" style={{backgroundColor: colorSet[0], textAlign: "center", ...algaeTableStyle}}>No match data available</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Helper to build FourByTwo props from config level table
    const buildFourByTwoProps = (levelTable, phaseData) => {
        const levels = levelTable?.levels || [];
        const successFields = levelTable?.successFields || [];
        const avgFields = levelTable?.avgFields || [];
        const props = { HC1: "Success", HC2: "Avg Coral" };

        levels.forEach((level, i) => {
            const rowNum = i + 1;
            const successVal = resolvePath(safeData, successFields[i]) || 0;
            const avgVal = resolvePath(safeData, avgFields[i]) || 0;
            props[`HR${rowNum}`] = level;
            props[`R${rowNum}C1`] = `${Math.round(10 * successVal) / 10}%`;
            props[`R${rowNum}C2`] = Math.round(10 * avgVal) / 10;
        });

        return props;
    };

    // Helper to build TwoByTwo props from config algae stats
    const buildTwoByTwoProps = (algaeStats) => {
        const levels = algaeStats?.levels || [];
        const successFields = algaeStats?.successFields || [];
        const avgFields = algaeStats?.avgFields || [];
        const props = { HC1: "Success", HC2: "Avg Algae" };

        levels.forEach((level, i) => {
            const rowNum = i + 1;
            const successVal = resolvePath(safeData, successFields[i]) || 0;
            const avgVal = resolvePath(safeData, avgFields[i]) || 0;
            props[`HR${rowNum}`] = level;
            props[`R${rowNum}C1`] = `${Math.round(10 * successVal) / 10}%`;
            props[`R${rowNum}C2`] = Math.round(10 * avgVal) / 10;
        });

        return props;
    };

    // Auto and Tele section configs
    const autoSectionConfig = sectionsConfig.auto || {};
    const teleSectionConfig = sectionsConfig.tele || {};

    // Build defense bar chart data
    const buildDefenseChartData = () => {
        const allRows = safeData.rows || [];
        const getDefenseValue = (row) => {
            // Use the config-driven field name, with common variants as fallback
            const fieldVariants = [defenseBarField, 'defensePlayed', 'DEFENSEPLAYED', 'defense_played', 'DefensePlayed'];
            for (const field of fieldVariants) {
                if (row[field] !== undefined && row[field] !== null && row[field] > 0) {
                    return row[field];
                }
            }
            return null;
        };

        const validDefenseRatings = allRows.filter(row => {
            const defenseValue = getDefenseValue(row);
            return row.team == safeData.team && defenseValue !== null;
        });

        if (validDefenseRatings.length > 0) {
            const totalSum = validDefenseRatings.reduce((sum, row) => sum + getDefenseValue(row), 0);
            const totalAvg = totalSum / validDefenseRatings.length;

            const chartData = [{ name: 'TOTAL', value: totalAvg }];

            const scoutMap = {};
            validDefenseRatings.forEach(row => {
                const scoutName = row.scoutname || 'Unknown';
                if (!scoutMap[scoutName]) scoutMap[scoutName] = [];
                scoutMap[scoutName].push(getDefenseValue(row));
            });

            Object.entries(scoutMap).forEach(([scout, ratings]) => {
                if (ratings.length > 0) {
                    const scoutAvg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
                    chartData.push({ name: scout, value: scoutAvg });
                }
            });

            return chartData;
        }

        if (safeData.qualitative) {
            const defenseItem = safeData.qualitative.find(q => q.name === "Defense Played");
            if (defenseItem && defenseItem.rating > 0) {
                return [{ name: 'TOTAL', value: defenseItem.rating }];
            }
        }

        return [{ name: 'TOTAL', value: 0 }];
    };

    return (
        <div className={styles.container}>
            <TopBar />
            <CompareTopBar />
            <div className={styles.header}>
                <div className={styles.MainDiv}>
                    <div className={styles.leftColumn}>
                        <h1 style={{ color: Colors[0][3] }}>Team {safeData.team} View</h1>
                        <h3>{safeData.name}</h3>
                        <div className={styles.EPAS}>
                            <div className={styles.EPA}>
                                <div className={styles.scoreBreakdownContainer}>
                                    <div style={{ background: Colors[0][1] }} className={styles.epaBox}>{Math.round(10*safeData.avgEpa)/10}</div>
                                    <div className={styles.epaBreakdown}>
                                        {epaBreakdown.map(key => (
                                            <div key={key} style={{ background: Colors[0][0] }}>
                                                {key.charAt(0).toUpperCase()}: {Math.round(10*(safeData[`avg${key.charAt(0).toUpperCase()}${key.slice(1)}`] || 0))/10}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className={styles.Last3EPA}>
                                <div className={styles.scoreBreakdownContainer}>
                                    <div style={{background: overallLast3}} className={styles.Last3EpaBox}>{Math.round(10*safeData.last3Epa)/10}</div>
                                    <div className={styles.epaBreakdown}>
                                        <div style={{background: autoLast3}}>A: {Math.round(10*safeData.last3Auto)/10}</div>
                                        <div style={{background: teleLast3}}>T: {Math.round(10*safeData.last3Tele)/10}</div>
                                        <div style={{background: endLast3}}>E: {Math.round(10*safeData.last3End)/10}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.matchesRow}>
                            <div className={styles.matchesContainer}>
                                <div style={{ background: Colors[0][1] }} className={styles.matchesHeader}>Matches</div>
                                <div className={styles.matchesList}>
                                    {safeData.rows && safeData.rows
                                        .filter(match => match.team == safeData.team)
                                        .sort((a, b) => a.match - b.match)
                                        .map((match, index) => (
                                            <Link
                                                key={index}
                                                href={`/match-view?match=${match.match}`}
                                                className={styles.matchLink}
                                            >
                                                <span style={{ background: Colors[0][0] }}>{match.match}</span>
                                            </Link>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                        <div className={styles.graphContainer}>
                            <h4 className={styles.graphTitle}>EPA Over Time</h4>
                            <EPALineChart data={safeData.epaOverTime} color={Colors[0][3]} label={"epa"}/>
                        </div>
                        <div className={styles.barGraphContainer}>
                            <h4 className={styles.graphTitle}>Piece Placement</h4>
                            <PiecePlacement
                                L1={piecePlacementProps.L1 || 0}
                                L2={piecePlacementProps.L2 || 0}
                                L3={piecePlacementProps.L3 || 0}
                                L4={piecePlacementProps.L4 || 0}
                                net={piecePlacementProps.net || 0}
                                processor={piecePlacementProps.processor || 0}
                                HP={piecePlacementProps.HP || 0}
                            />
                        </div>
                        <div className={styles.valueBoxes}>
                            <div className={styles.leftColumnBoxes}>
                                {renderOverallStats()}
                            </div>
                            <div className={styles.allComments}>
                                {commentsConfig.map((commentField, i) => {
                                    const dataKey = commentKeyMap[commentField] || commentField;
                                    const title = commentTitleMap[commentField] || commentField;
                                    return (
                                        <Comments
                                            key={commentField}
                                            color1={Colors[0][1]}
                                            color2={Colors[0][0]}
                                            title={title}
                                            value={safeData[dataKey] || 'No comments'}
                                        />
                                    );
                                })}
                            </div>
                            <HBox color1={Colors[0][1]} color2={Colors[0][0]} title={"Scouts"} value={safeData.scouts} />
                        </div>
                    </div>
                    <div className={styles.rightColumn}>
                        <div className={styles.topRow}>
                            <div className={styles.auto}>
                                <h1 style={{ color: Colors[1][3] }}>Auto</h1>
                                {/* Auto charts from config */}
                                {(autoSectionConfig.charts || []).map((chart, i) => {
                                    if (chart.type === 'epaLine') {
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <EPALineChart
                                                    data={safeData[chart.dataKey] || []}
                                                    color={Colors[1][3]}
                                                    label={chart.dataKey?.replace('OverTime', '') || "auto"}
                                                />
                                            </div>
                                        );
                                    }
                                    if (chart.type === 'coralLine') {
                                        const chartData = chart.dataType === 'success'
                                            ? (chart.phase === 'auto' ? autoCoralSuccessData : teleCoralSuccessData)
                                            : (chart.phase === 'auto' ? autoCoralFailData : teleCoralFailData);
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <CoralLineChart data={chartData} />
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                                <div className={styles.graphContainer}>
                                    <h4 className={styles.graphTitle}>Auto Algae Data</h4>
                                    {renderAlgaeTable(autoAlgaeData, Colors[1])}
                                </div>
                                <div style={{clear: "both"}}></div>
                                <div className={styles.autoRightAlignment}>
                                    <div className={styles.alignElements}>
                                        <div className={styles.valueBoxes}>
                                            <div className={styles.rightColumnBoxes}>
                                                {(autoSectionConfig.statBoxes || []).map((box, i) => (
                                                    <VBox
                                                        key={i}
                                                        color1={Colors[1][2]}
                                                        color2={Colors[1][0]}
                                                        color3={Colors[1][2]}
                                                        title={box.title}
                                                        value={formatStatValue(safeData[box.key], box.format)}
                                                    />
                                                ))}
                                            </div>
                                            {(autoSectionConfig.statTables || []).map((table, i) => (
                                                <table key={i} className={styles.coralTable}>
                                                    <tbody>
                                                        <tr>
                                                            <td style={{backgroundColor: Colors[1][2]}} rowSpan="2">{table.title}</td>
                                                            {table.columns.map((col, ci) => (
                                                                <td key={ci} style={{backgroundColor: Colors[1][1]}}>{col}</td>
                                                            ))}
                                                        </tr>
                                                        <tr>
                                                            {table.rows[0].values.map((valPath, vi) => {
                                                                const val = resolvePath(safeData, valPath) || 0;
                                                                const formatted = valPath.includes('success') ? `${Math.round(10*val)/10}%` : Math.round(10*val)/10;
                                                                return <td key={vi} style={{backgroundColor: Colors[1][0]}}>{formatted}</td>;
                                                            })}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            ))}
                                        </div>
                                        <div className={styles.fourByTwoContainer}>
                                            <FourByTwo
                                                {...buildFourByTwoProps(autoSectionConfig.levelTable)}
                                                color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.alignElements}>
                                        <div className={styles.rightColumnBoxesTwo}>
                                            {(autoSectionConfig.miscStats || []).map((stat, i) => (
                                                <VBox
                                                    key={i}
                                                    color1={Colors[1][2]}
                                                    color2={Colors[1][0]}
                                                    color3={Colors[1][2]}
                                                    title={stat.title}
                                                    value={formatStatValue(resolvePath(safeData, stat.key), stat.format)}
                                                />
                                            ))}
                                        </div>
                                        <div className={styles.twoByTwoContainer}>
                                            <TwoByTwo
                                                {...buildTwoByTwoProps(autoSectionConfig.algaeStats)}
                                                color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.tele}>
                                <h1 style={{ color: Colors[2][3] }}>Tele</h1>
                                {/* Tele charts from config */}
                                {(teleSectionConfig.charts || []).map((chart, i) => {
                                    if (chart.type === 'epaLine') {
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <EPALineChart
                                                    data={safeData[chart.dataKey] || []}
                                                    color={Colors[2][3]}
                                                    label={chart.dataKey?.replace('OverTime', '') || "tele"}
                                                />
                                            </div>
                                        );
                                    }
                                    if (chart.type === 'coralLine') {
                                        const chartData = chart.dataType === 'success'
                                            ? (chart.phase === 'auto' ? autoCoralSuccessData : teleCoralSuccessData)
                                            : (chart.phase === 'auto' ? autoCoralFailData : teleCoralFailData);
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <CoralLineChart data={chartData} />
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                                <div className={styles.graphContainer}>
                                    <h4 className={styles.graphTitle}>Tele Algae Data</h4>
                                    {renderAlgaeTable(teleAlgaeData, Colors[2])}
                                </div>
                                <div style={{clear: "both"}}></div>
                                <div className={styles.teleRightAlignment}>
                                    <div className={styles.alignElements}>
                                        <div className={styles.coralAndHP}>
                                            <div className={styles.valueBoxes}>
                                                {(teleSectionConfig.extraStats || []).map((table, i) => (
                                                    <table key={i} className={styles.differentTable}>
                                                        <tbody>
                                                            <tr>
                                                                <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][2], width:"34px"}} rowSpan="2">{table.title}</td>
                                                                {table.columns.map((col, ci) => (
                                                                    <td key={ci} className={styles.coloredBoxes} style={{backgroundColor: Colors[2][1]}}>{col}</td>
                                                                ))}
                                                            </tr>
                                                            <tr>
                                                                {table.rows[0].values.map((valPath, vi) => {
                                                                    const val = resolvePath(safeData, valPath) || 0;
                                                                    const formatted = valPath.includes('success') || valPath.includes('Success')
                                                                        ? `${Math.round(10*val)/10}%`
                                                                        : Math.round(10*val)/10;
                                                                    return <td key={vi} className={styles.coloredBoxes} style={{backgroundColor: Colors[2][0]}}>{formatted}</td>;
                                                                })}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                ))}
                                            </div>
                                            {(teleSectionConfig.statTables || []).map((table, i) => (
                                                <table key={i} className={styles.coralTable}>
                                                    <tbody>
                                                        <tr>
                                                            <td style={{backgroundColor: Colors[2][2]}} rowSpan="2">{table.title}</td>
                                                            {table.columns.map((col, ci) => (
                                                                <td key={ci} style={{backgroundColor: Colors[2][1]}}>{col}</td>
                                                            ))}
                                                        </tr>
                                                        <tr>
                                                            {table.rows[0].values.map((valPath, vi) => {
                                                                const val = resolvePath(safeData, valPath) || 0;
                                                                const formatted = valPath.includes('success') ? `${Math.round(10*val)/10}%` : Math.round(10*val)/10;
                                                                return <td key={vi} style={{backgroundColor: Colors[2][0]}}>{formatted}</td>;
                                                            })}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            ))}
                                        </div>
                                        <div className={styles.fourByTwoContainer}>
                                            <FourByTwo
                                                {...buildFourByTwoProps(teleSectionConfig.levelTable)}
                                                color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.alignElements}>
                                        <div className={styles.rightColumnBoxesTwo}>
                                            {(teleSectionConfig.miscStats || []).map((stat, i) => (
                                                <VBox
                                                    key={i}
                                                    color1={Colors[2][2]}
                                                    color2={Colors[2][0]}
                                                    color3={Colors[2][2]}
                                                    title={stat.title}
                                                    value={formatStatValue(resolvePath(safeData, stat.key), stat.format)}
                                                />
                                            ))}
                                        </div>
                                        <div className={styles.twoByTwoContainer}>
                                            <TwoByTwo
                                                {...buildTwoByTwoProps(teleSectionConfig.algaeStats)}
                                                color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.bottomRow}>
                            <div className={styles.endgame}>
                                <h1 className={styles.header} style={{ color: Colors[3][3] }}>Endgame</h1>
                                <div className={styles.chartContainer}>
                                    <h4 className={styles.graphTitle}>Endgame Placement</h4>
                                    <Endgame
                                        data={endgamePieData}
                                        color={endgameColors}
                                    />
                                </div>
                                <table className={styles.differentTable} style={{borderRadius: "5px"}}>
                                    <tbody>
                                        <tr>
                                            <td style={{backgroundColor: Colors[3][2]}} rowSpan="2">Cage</td>
                                            <td style={{backgroundColor: Colors[3][1]}}>Attempt</td>
                                            <td style={{backgroundColor: Colors[3][1]}}>Success</td>
                                        </tr>
                                        <tr>
                                            <td style={{backgroundColor: Colors[3][0]}}>{`${Math.round(10*safeData.attemptCage)/10}%`}</td>
                                            <td style={{backgroundColor: Colors[3][0]}}>{`${Math.round(10*safeData.successCage)/10}%`}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className={styles.qualitative}>
                                <h1 className={styles.header} style={{ color: Colors[4][3] }}>Qualitative</h1>
                                <div className={styles.radarContainer}>
                                    <h4 className={styles.graphTitle}>Defense Played Ratings</h4>
                                    <div style={{ marginTop: "50px", display: "flex", justifyContent: "center", width: "100%" }}>
                                        <BarChart
                                            width={400}
                                            height={300}
                                            data={buildDefenseChartData()}
                                            margin={{ top: 10, right: 30, left: 20, bottom: 70 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="name"
                                                angle={-90}
                                                textAnchor="end"
                                                height={70}
                                                tick={{ dy: 10 }}
                                            />
                                            <YAxis
                                                domain={[0, 6]}
                                                ticks={[0, 1, 2, 3, 4, 5, 6]}
                                                interval={0}
                                            />
                                            <Tooltip formatter={(value) => value.toFixed(1)} />
                                            <Bar dataKey="value" fill={Colors[4][2]} />
                                        </BarChart>
                                    </div>
                                </div>
                                <table className={styles.differentTable}>
                                    <tbody>
                                        {intakeDisplayConfig.map((intake, idx) => (
                                            <React.Fragment key={idx}>
                                                <tr>
                                                    <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][2], width: "40px"}} rowSpan="2">{intake.category}</td>
                                                    {intake.labels.map((label, li) => (
                                                        <td key={li} className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px", height: li === 0 ? "10px" : undefined}}>{label}</td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    {intake.fields.map((field, fi) => (
                                                        <td key={fi} className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}>
                                                            <input type="checkbox" readOnly checked={!!safeData[field]} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
