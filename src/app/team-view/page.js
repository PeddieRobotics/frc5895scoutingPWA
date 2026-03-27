"use client";
import styles from "./page.module.css";
import React, { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import VBox from "./components/VBox";
import HBox from "./components/HBox";
import Comments from "./components/Comments";
import TwoByTwo from "./components/TwoByTwo";
import ThreeByThree from "./components/ThreeByThree";
import FourByTwo from "./components/FourByTwo";
import EPALineChart from './components/EPALineChart';
import CoralLineChart from './components/CoralLineChart';
import Endgame from "./components/Endgame";
import Qualitative from "./components/Qualitative";
import useGameConfig from "../../lib/useGameConfig";
import { getTeamViewConfigIssues } from "../../lib/display-config-validation";
import { LineChart, Line, RadarChart, PolarRadiusAxis, PolarAngleAxis, PolarGrid, Radar } from 'recharts';

export default function TeamViewPage() {
    return <Suspense><TeamView /></Suspense>;
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
        case 'decimal':
        case 'number':
            return Math.round(10 * (value || 0)) / 10;
        case 'text':
            return value || 'None';
        default:
            return value;
    }
}

function formatUnscoredMatch(issue) {
    const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"][issue?.matchType] || `Type ${issue?.matchType}`;
    const matchLabel = issue?.displayMatch ?? issue?.match ?? "Unknown";
    return `Team ${issue?.team} - ${matchTypeLabel} Match ${matchLabel}: ${issue?.reason || "Missing scout-leads rate."}`;
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
    const [scoutLeadComments, setScoutLeadComments] = useState([]);
    const [tbaRank, setTbaRank] = useState(null);
    const [fetchingTbaRank, setFetchingTbaRank] = useState(false);
    const [tbaRankError, setTbaRankError] = useState(null);
    const [loadingMatch, setLoadingMatch] = useState(null);
    const [slCommentsOpen, setSlCommentsOpen] = useState(false);
    const router = useRouter();

    const searchParams = useSearchParams();
    const { config, gameId, loading: configLoading } = useGameConfig();
    const configIssues = useMemo(() => {
        if (configLoading || !config) return [];
        return getTeamViewConfigIssues(config);
    }, [config, configLoading]);

    // Extract teamView config with defaults
    const tvConfig = config?.display?.teamView || {};
    const epaThresholds = tvConfig.epaThresholds || { overall: 12, auto: 6, tele: 10, end: 6 };
    const epaBreakdown = tvConfig.epaBreakdown || ["auto", "tele", "end"];
    // Dynamic piecePlacement group discovery
    const ppConfig = tvConfig.piecePlacement || {};
    const coralConfig = ppConfig.coral || null;
    const hasCoralConfig = !!(coralConfig && coralConfig.levels?.length);
    // Find any group with metrics (e.g. algae) — dynamic discovery
    const metricGroupEntries = Object.entries(ppConfig).filter(
        ([key, val]) => key !== 'bars' && typeof val === 'object' && val.metrics?.length
    );
    const hasMetricGroups = metricGroupEntries.length > 0;
    // For backward compat, pick the first metric group as the "secondary" group (algae in Reefscape)
    const [metricGroupName, metricGroupConfig] = metricGroupEntries[0] || [null, null];
    // Derive table columns from metric group metrics for the table header
    const metricTableConfig = metricGroupConfig ? {
        columns: metricGroupConfig.metrics.map(m => ({
            label: m.key,
            type: m.type, // 'count' or 'successFail'
        })),
    } : { columns: [] };
    const autoPieConfig = tvConfig.autoPie || null;
    const endgamePieConfig = tvConfig.endgamePie || { labels: [], values: [] };
    const endgameStatsConfig = tvConfig.endgameStats || {};
    const overallStatsConfig = tvConfig.overallStats || [];
    const sectionsConfig = tvConfig.sections || {};
    const commentsConfig = tvConfig.comments || [];
    const intakeDisplayConfig = tvConfig.intakeDisplay || [];
    const defenseBarField = tvConfig.defenseBarField || "";
    const scouterConfidenceField = tvConfig.scouterConfidenceField || null;

    // Sync URL parameters reactively (re-runs on soft navigation)
    useEffect(() => {
        setTeam(searchParams.get("team"));
        setHasTopBar(searchParams.get('team1') !== null);
        setSource(searchParams.get('source'));

        const paramsObj = {};
        for (const [key, value] of searchParams.entries()) {
            paramsObj[key] = value;
        }
        setUrlParams(paramsObj);
    }, [searchParams]);

    // Effect to fetch data when team changes
    useEffect(() => {
        if (!configLoading && team && configIssues.length === 0) {
            fetchTeamData(team);
        }
    }, [team, currentUserTeam, configIssues.length, gameId, configLoading]);

    // Fetch scout lead comments for this team
    useEffect(() => {
        if (!team) return;
        const creds = (() => {
            try { return sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials'); } catch (_) { return null; }
        })();
        const headers = creds ? { Authorization: `Basic ${creds}` } : {};
        const commentsParams = new URLSearchParams({ team: String(team) });
        if (gameId) commentsParams.set("gameId", String(gameId));
        fetch(`/api/scout-lead-comments?${commentsParams.toString()}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.comments) setScoutLeadComments(d.comments); })
            .catch(() => {});
    }, [team, gameId]);

    useEffect(() => {
        if (team) {
            setTbaRank(null);
            setTbaRankError(null);
            fetchTbaRank();
        }
    }, [team]);

    async function fetchTbaRank() {
        setFetchingTbaRank(true);
        setTbaRankError(null);
        try {
            const res = await fetch(`/api/get-tba-rank?team=${team}`);
            const data = await res.json();
            if (!res.ok) {
                setTbaRankError(data.message || 'TBA fetch failed');
            } else {
                setTbaRank(data.rank ? `#${data.rank} of ${data.totalTeams}` : 'Not ranked');
            }
        } catch {
            setTbaRankError('TBA fetch failed');
        } finally {
            setFetchingTbaRank(false);
        }
    }

    async function handleMatchClick(matchNumber) {
        setLoadingMatch(matchNumber);
        try {
            const params = new URLSearchParams({ match: matchNumber });
            if (gameId) params.set('gameId', String(gameId));
            const res = await fetch(`/api/get-teams-of-match?${params.toString()}`);
            const data = await res.json();
            if (data.team1 && data.team2 && data.team3) {
                router.push(`/match-view?match=${matchNumber}&team1=${data.team1}&team2=${data.team2}&team3=${data.team3}&team4=${data.team4}&team5=${data.team5}&team6=${data.team6}`);
            } else {
                router.push(`/match-view?match=${matchNumber}`);
            }
        } catch {
            router.push(`/match-view?match=${matchNumber}`);
        } finally {
            setLoadingMatch(null);
        }
    }

    function AllianceButtons({ t1, t2, t3, colors }) {
        const searchParamsString = new URLSearchParams(urlParams).toString();
        return <div className={styles.allianceBoard}>
            <Link href={`/team-view?team=${t1 || ""}&${searchParamsString}`}>
                <button className={team == t1 ? styles.activeTeamButton : undefined} style={team == t1 ? undefined : { background: colors[0][1] }}>{t1 || 404}</button>
            </Link>
            <Link href={`/team-view?team=${t2 || ""}&${searchParamsString}`}>
                <button className={team == t2 ? styles.activeTeamButton : undefined} style={team == t2 ? undefined : { background: colors[1][1] }}>{t2 || 404}</button>
            </Link>
            <Link href={`/team-view?team=${t3 || ""}&${searchParamsString}`}>
                <button className={team == t3 ? styles.activeTeamButton : undefined} style={team == t3 ? undefined : { background: colors[2][1] }}>{t3 || 404}</button>
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
                            <button
                                className={team == t ? styles.activeTeamButton : undefined}
                                style={team == t ? undefined : { background: COLORS[index] }}
                            >
                                {t || 404}
                            </button>
                        </Link>
                    ))}
                </div>
                <Link href={`/compare?team1=${compareTeams[0] || ""}&team2=${compareTeams[1] || ""}&team3=${compareTeams[2] || ""}&team4=${compareTeams[3] || ""}`}>
                    <button className={styles.navActionButton}>Compare</button>
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
                <button className={styles.navActionButton}>Match</button>
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

        const params = new URLSearchParams({
            team: String(team),
            includeRows: "true",
        });
        if (gameId) params.set("gameId", String(gameId));

        fetch(`/api/get-team-data?${params.toString()}`, {
            headers: (() => {
                const hdrs = {};
                try {
                    const storedCreds = sessionStorage.getItem('auth_credentials') ||
                        localStorage.getItem('auth_credentials');
                    if (storedCreds) {
                        hdrs['Authorization'] = `Basic ${storedCreds}`;
                    }
                } catch (_) {/* ignore */ }
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

                // Check for 404 Not Found and surface server details
                if (response.status === 404) {
                    return response.json().then((payload) => {
                        throw new Error(payload?.message || 'Team data not found');
                    });
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

    if (configIssues.length > 0) {
        return (
            <div className={styles.container}>
                <div style={{ maxWidth: "900px", margin: "2rem auto", padding: "1.5rem", background: "#2a0e0e", color: "#ffd9d9", borderRadius: "8px", border: "1px solid #a44" }}>
                    <h2 style={{ marginTop: 0 }}>Team View Config Error</h2>
                    <p style={{ marginBottom: "0.75rem" }}>
                        The active game config is missing required display settings. Fix these entries in <code>display.teamView</code> / <code>display.apiAggregation</code>.
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

    // Process match data for metric group data table (e.g. algae)
    // Uses metric group config fields instead of hardcoded field names
    const prepareMetricGroupData = (matches, phase) => {
        if (!metricGroupConfig || !matches || !Array.isArray(matches)) return [];

        const teamMatches = matches.filter(match => match.team == team);
        const fields = phase === 'auto' ? metricGroupConfig.autoFields : metricGroupConfig.teleFields;
        const failFields = phase === 'auto' ? (metricGroupConfig.autoFailFields || []) : (metricGroupConfig.teleFailFields || []);
        const metrics = metricGroupConfig.metrics || [];

        return teamMatches.map(match => {
            const row = { match: match.match };
            metrics.forEach(metric => {
                const field = fields?.[metric.fieldIndex];
                if (metric.type === 'count') {
                    row[metric.key] = match[field] || 0;
                } else if (metric.type === 'successFail') {
                    row[`${metric.key}Success`] = match[field] || 0;
                    const failField = failFields?.[metric.failIndex];
                    row[`${metric.key}Fail`] = failField ? (match[failField] || 0) : 0;
                }
            });
            return row;
        }).sort((a, b) => a.match - b.match);
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
        qualitative: data?.qualitative || [],
        scouterConfidenceOverTime: data?.scouterConfidenceOverTime || [],
        avgScouterConfidence: data?.avgScouterConfidence ?? null,
        auto: data?.auto || {},
        tele: data?.tele || {},
        endPlacement: data?.endPlacement || {},
        autoClimbPlacement: data?.autoClimbPlacement || {},
        // Spread all remaining fields (includes intake booleans from API)
        ...data,
    };
    const unscoredMatches = Array.isArray(safeData.unscoredMatches) ? safeData.unscoredMatches : [];

    // Prepare data for the charts — guarded on config existence
    const autoCoralSuccessData = hasCoralConfig ? prepareCoralData(safeData.rows, 'auto', 'success') : [];
    const autoCoralFailData = hasCoralConfig ? prepareCoralData(safeData.rows, 'auto', 'fail') : [];
    const teleCoralSuccessData = hasCoralConfig ? prepareCoralData(safeData.rows, 'tele', 'success') : [];
    const teleCoralFailData = hasCoralConfig ? prepareCoralData(safeData.rows, 'tele', 'fail') : [];

    const autoMetricGroupData = hasMetricGroups ? prepareMetricGroupData(safeData.rows, 'auto') : [];
    const teleMetricGroupData = hasMetricGroups ? prepareMetricGroupData(safeData.rows, 'tele') : [];

    const Colors = [
        // design system palette — index[2] is the primary shade
        ["#d4edda", "#6cbf84", "#1a7f3c", "#145c2c"], //green
        ["#dbeafe", "#7eb3f5", "#2563eb", "#1e40af"], //blue
        ["#ede9fe", "#a78bfa", "#7c3aed", "#5b21b6"], //purple
        ["#fce7f3", "#f9a8d4", "#c0392b", "#991b1b"], //red/pink
        ["#fef3c7", "#d4a97a", "#a07c30", "#7c5c22"], //gold
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

    // Auto and Tele section configs
    const autoSectionConfig = sectionsConfig.auto || {};
    const teleSectionConfig = sectionsConfig.tele || {};

    const hasAutoLevelTable = (autoSectionConfig.levelTable?.levels || []).length > 0;
    const hasAutoAlgaeStats = (autoSectionConfig.algaeStats?.levels || []).length > 0;
    const hasTeleLevelTable = (teleSectionConfig.levelTable?.levels || []).length > 0;
    const hasTeleAlgaeStats = (teleSectionConfig.algaeStats?.levels || []).length > 0;

    // Build endgame pie data from config
    const endgameValueMapping = config?.display?.apiAggregation?.endgameConfig?.valueMapping || {};
    const endgamePieData = (endgamePieConfig.labels || []).map((label, i) => {
        const valueCode = (endgamePieConfig.values || [])[i];
        const mappedKey = endgameValueMapping[String(valueCode)] ?? Object.keys(safeData.endPlacement || {})[i];
        return {
            x: label,
            y: mappedKey ? (safeData.endPlacement?.[mappedKey] || 0) : 0
        };
    });

    // Build auto climb pie data from config (if autoPie config exists)
    const autoclimbValueMapping = config?.display?.apiAggregation?.autoclimbConfig?.valueMapping || {};
    const autoPieData = autoPieConfig
        ? (autoPieConfig.labels || []).map((label, i) => {
            const valueCode = (autoPieConfig.values || [])[i];
            const mappedKey = autoclimbValueMapping[String(valueCode)] ?? Object.keys(safeData.autoClimbPlacement || {})[i];
            return {
                x: label,
                y: mappedKey ? (safeData.autoClimbPlacement?.[mappedKey] || 0) : 0
            };
        })
        : null;

    // Design system chart palettes
    const endgameColors = ["#a07c30", "#2563eb", "#1a7f3c", "#c0392b", "#7c3aed"];
    const autoPieColors = ["#a07c30", "#2563eb", "#1a7f3c"];

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
                    style={{ width: "200px" }}
                    title={stat.title}
                    value={formatted}
                />
            );
        });
    };

    // Build comments from commentFields config (fully generic)
    const cfgComments = tvConfig.commentFields || [];
    // Fallback to legacy comments array with generated titles
    const resolvedComments = cfgComments.length > 0
        ? cfgComments
        : (commentsConfig || []).map(field => ({
            field,
            dataKey: field.replace(/([a-z])([a-z]*)/gi, (_, first, rest, idx) =>
                idx === 0 ? first.toLowerCase() + rest : first.toUpperCase() + rest
            ),
            title: field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()),
        }));

    // Helper to render a metric group table for a given phase and color set
    const renderMetricGroupTable = (groupData, colorSet) => {
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
                <div style={{ width: "90%", margin: "0 auto" }}>
                    <table className={styles.coralTable} style={{
                        width: "100%",
                        tableLayout: "fixed",
                        margin: "0 auto",
                        borderCollapse: "collapse"
                    }}>
                        <tbody>
                            <tr>
                                <td style={{ backgroundColor: colorSet[2], width: "15%", ...algaeTableStyle }}>Match</td>
                                {(metricTableConfig?.columns || []).map((col, ci) => {
                                    const isCount = col.type === 'count';
                                    return (
                                        <td key={ci} style={{ backgroundColor: colorSet[2], width: isCount ? "20%" : "32.5%", ...algaeTableStyle }}
                                            colSpan={isCount ? 1 : 2}
                                        >{col.label}</td>
                                    );
                                })}
                            </tr>
                            <tr>
                                <td style={{ backgroundColor: colorSet[1] }}></td>
                                {(metricTableConfig?.columns || []).map((col, ci) => {
                                    if (col.type === 'count') {
                                        return <td key={ci} style={{ backgroundColor: colorSet[1] }}></td>;
                                    }
                                    return [
                                        <td key={`${ci}-s`} style={{ backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle }}>Success</td>,
                                        <td key={`${ci}-f`} style={{ backgroundColor: colorSet[1], width: "16.25%", ...algaeTableStyle }}>Fail</td>
                                    ];
                                })}
                            </tr>
                            {groupData.length > 0 ? (
                                groupData.map((match, index) => {
                                    const metrics = metricGroupConfig?.metrics || [];
                                    return (
                                        <tr key={index}>
                                            <td style={{ backgroundColor: colorSet[1], ...algaeTableStyle }}>{match.match}</td>
                                            {metrics.map((metric, mi) => {
                                                if (metric.type === 'count') {
                                                    return <td key={mi} style={{ backgroundColor: colorSet[0], ...algaeTableStyle }}>{match[metric.key] || 0}</td>;
                                                } else if (metric.type === 'successFail') {
                                                    return [
                                                        <td key={`${mi}-s`} style={{ backgroundColor: colorSet[0], ...algaeTableStyle }}>{match[`${metric.key}Success`] || 0}</td>,
                                                        <td key={`${mi}-f`} style={{ backgroundColor: colorSet[0], ...algaeTableStyle }}>{match[`${metric.key}Fail`] || 0}</td>
                                                    ];
                                                }
                                                return null;
                                            })}
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={1 + (metricTableConfig?.columns || []).reduce((sum, col) => sum + (col.type === 'successFail' ? 2 : 1), 0)} style={{ backgroundColor: colorSet[0], textAlign: "center", ...algaeTableStyle }}>No match data available</td>
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
        const props = { HC1: "Success", HC2: levelTable?.avgLabel || "Average" };

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
        const props = { HC1: "Success", HC2: metricGroupConfig?.avgLabel || "Average" };

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

    // Group scout lead comments by match, deduped by (scoutname, match, matchtype, comment)
    const commentMatchGroups = (() => {
        const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"];
        const seen = new Set();
        const byMatch = {};
        scoutLeadComments.forEach((c) => {
            const key = `${c.scoutname}|${c.match}|${c.matchtype}|${c.comment}`;
            if (seen.has(key)) return;
            seen.add(key);
            const matchKey = `${c.matchtype}_${c.match}`;
            if (!byMatch[matchKey]) {
                byMatch[matchKey] = {
                    match: c.match,
                    matchtype: c.matchtype,
                    label: `${matchTypeLabel[c.matchtype] ?? `Type ${c.matchtype}`} ${c.match}`,
                    entries: [],
                };
            }
            byMatch[matchKey].entries.push(c);
        });
        return Object.values(byMatch).sort((a, b) => a.match - b.match);
    })();

    return (
        <div className={styles.container}>
            <title>{team ? `${team} - Team View` : 'Team View'}</title>
            {unscoredMatches.length > 0 && (
                <div style={{ margin: "12px 0", padding: "12px 14px", background: "#ffebe9", border: "1px solid #ff8182", borderRadius: "10px", color: "#7d1f1f" }}>
                    <strong>Unscored matches were skipped.</strong>
                    <ul style={{ margin: "8px 0 0 18px" }}>
                        {unscoredMatches.map((issue, index) => (
                            <li key={`${issue.team}-${issue.match}-${issue.matchType}-${index}`}>
                                {formatUnscoredMatch(issue)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
                                    <div style={{ '--epa-box-label': config?.usePPR ? '"Avg PPR"' : '"Avg EPA"' }} className={styles.epaBox}>{Math.round(10 * safeData.avgEpa) / 10}</div>
                                    <div className={styles.epaBreakdown}>
                                        {epaBreakdown.map(key => (
                                            <div key={key}>
                                                {key.charAt(0).toUpperCase()}: {Math.round(10 * (safeData[`avg${key.charAt(0).toUpperCase()}${key.slice(1)}`] || 0)) / 10}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className={styles.Last3EPA}>
                                <div className={styles.scoreBreakdownContainer}>
                                    <div style={{ background: overallLast3, '--last3-epa-label': config?.usePPR ? '"Last 3 PPR"' : '"Last 3 Epa"' }} className={styles.Last3EpaBox}>{Math.round(10 * safeData.last3Epa) / 10}</div>
                                    <div className={styles.epaBreakdown}>
                                        <div style={{ background: autoLast3 }}>A: {Math.round(10 * safeData.last3Auto) / 10}</div>
                                        <div style={{ background: teleLast3 }}>T: {Math.round(10 * safeData.last3Tele) / 10}</div>
                                        <div style={{ background: endLast3 }}>E: {Math.round(10 * safeData.last3End) / 10}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.matchesRow}>
                            <div className={styles.matchesContainer}>
                                <div className={styles.matchesHeader}>Matches</div>
                                <div className={styles.matchesList}>
                                    {safeData.rows && safeData.rows
                                        .filter(match => match.team == safeData.team)
                                        .sort((a, b) => a.match - b.match)
                                        .map((match, index) => (
                                            <button
                                                key={index}
                                                className={styles.matchLink}
                                                onClick={() => handleMatchClick(match.match)}
                                                disabled={loadingMatch === match.match}
                                            >
                                                <span style={{ background: loadingMatch === match.match ? '#aaa' : undefined }}>
                                                    {loadingMatch === match.match ? '…' : match.match}
                                                </span>
                                            </button>
                                        ))
                                    }
                                </div>
                                <div className={styles.tbaRankRow}>
                                    {tbaRank && <span className={styles.tbaRankBadge}>TBA Rank: {tbaRank}</span>}
                                    {tbaRankError && <span className={styles.tbaRankError}>{tbaRankError}</span>}
                                    <button
                                        className={styles.tbaRankButton}
                                        onClick={fetchTbaRank}
                                        disabled={fetchingTbaRank}
                                    >
                                        {fetchingTbaRank ? 'Fetching...' : 'TBA Rank'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className={styles.graphContainer}>
                            <h4 className={styles.graphTitle}>{config?.usePPR ? "PPR Over Time" : "EPA Over Time"}</h4>
                            <EPALineChart data={safeData.epaOverTime} color={Colors[0][3]} label={"epa"} displayLabel={config?.usePPR ? "PPR" : "epa"} />
                        </div>
                        <div className={styles.valueBoxes}>
                            <div className={styles.leftColumnBoxes}>
                                {renderOverallStats()}
                            </div>
                            <div className={styles.allComments}>
                                {resolvedComments.map((cf, i) => {
                                    return (
                                        <Comments
                                            key={cf.field || i}
                                            color1={Colors[0][1]}
                                            color2={Colors[0][0]}
                                            title={cf.title}
                                            value={safeData[cf.dataKey] || 'No comments'}
                                        />
                                    );
                                })}
                                <Comments
                                    color1={Colors[0][1]}
                                    color2={Colors[0][0]}
                                    title="Scouts"
                                    value={safeData.scouts}
                                />
                            </div>
                        </div>
                        {commentMatchGroups.length > 0 && (
                            <section className={styles.slCommentsSection}>
                                <button
                                    className={styles.slCommentsSectionToggle}
                                    onClick={() => setSlCommentsOpen(o => !o)}
                                    aria-expanded={slCommentsOpen}
                                >
                                    <span className={styles.slCommentsSectionTitle}>Scout Lead Comments</span>
                                    <span className={styles.slCommentsChevron} aria-hidden="true">{slCommentsOpen ? '▲' : '▼'}</span>
                                </button>
                                {slCommentsOpen && (
                                    <div className={styles.slMatchList}>
                                        {commentMatchGroups.map((group) => (
                                            <div key={`${group.matchtype}_${group.match}`} className={styles.slMatchGroup}>
                                                <div className={styles.slMatchLabel}>{group.label}</div>
                                                {group.entries.map((c) => (
                                                    <div key={c.id} className={styles.slCommentEntry}>
                                                        <span className={styles.slCommentAuthor}>{c.scoutname || "Unknown"}</span>
                                                        <p className={styles.slCommentText}>{c.comment}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
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
                                    if (chart.type === 'passLine') {
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <EPALineChart
                                                    data={safeData[chart.dataKey] || []}
                                                    color={Colors[1][3]}
                                                    label={chart.valueKey}
                                                />
                                            </div>
                                        );
                                    }
                                    if (chart.type === 'coralLine' || chart.type === 'groupLine') {
                                        if (!hasCoralConfig) return null;
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
                                {/* Auto climb pie chart (if autoPie config present) */}
                                {autoPieData && (
                                    <div className={styles.chartContainer}>
                                        <h4 className={styles.graphTitle}>Auto Climb Outcomes</h4>
                                        <Endgame data={autoPieData} color={autoPieColors} />
                                    </div>
                                )}
                                {hasMetricGroups && (
                                    <div className={styles.graphContainer}>
                                        <h4 className={styles.graphTitle}>Auto {metricGroupName ? metricGroupName.charAt(0).toUpperCase() + metricGroupName.slice(1) : 'Data'}</h4>
                                        {renderMetricGroupTable(autoMetricGroupData, Colors[1])}
                                    </div>
                                )}
                                <div style={{ clear: "both" }}></div>
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
                                                            <td style={{ backgroundColor: Colors[1][2] }} rowSpan="2">{table.title}</td>
                                                            {table.columns.map((col, ci) => (
                                                                <td key={ci} style={{ backgroundColor: Colors[1][1] }}>{col}</td>
                                                            ))}
                                                        </tr>
                                                        <tr>
                                                            {table.rows[0].values.map((valPath, vi) => {
                                                                const val = resolvePath(safeData, valPath) || 0;
                                                                const formatted = valPath.includes('success') ? `${Math.round(10 * val) / 10}%` : Math.round(10 * val) / 10;
                                                                return <td key={vi} style={{ backgroundColor: Colors[1][0] }}>{formatted}</td>;
                                                            })}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            ))}
                                        </div>
                                        {hasAutoLevelTable && (
                                            <div className={styles.fourByTwoContainer}>
                                                <FourByTwo
                                                    {...buildFourByTwoProps(autoSectionConfig.levelTable)}
                                                    color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                                />
                                            </div>
                                        )}
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
                                        {hasAutoAlgaeStats && (
                                            <div className={styles.twoByTwoContainer}>
                                                <TwoByTwo
                                                    {...buildTwoByTwoProps(autoSectionConfig.algaeStats)}
                                                    color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                                />
                                            </div>
                                        )}
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
                                    if (chart.type === 'passLine') {
                                        return (
                                            <div key={i} className={styles.graphContainer}>
                                                <h4 className={styles.graphTitle}>{chart.label}</h4>
                                                <EPALineChart
                                                    data={safeData[chart.dataKey] || []}
                                                    color={Colors[2][3]}
                                                    label={chart.valueKey}
                                                />
                                            </div>
                                        );
                                    }
                                    if (chart.type === 'coralLine' || chart.type === 'groupLine') {
                                        if (!hasCoralConfig) return null;
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
                                {hasMetricGroups && (
                                    <div className={styles.graphContainer}>
                                        <h4 className={styles.graphTitle}>Tele {metricGroupName ? metricGroupName.charAt(0).toUpperCase() + metricGroupName.slice(1) : 'Data'}</h4>
                                        {renderMetricGroupTable(teleMetricGroupData, Colors[2])}
                                    </div>
                                )}
                                <div style={{ clear: "both" }}></div>
                                <div className={styles.teleRightAlignment}>
                                    <div className={styles.alignElements}>
                                        <div className={styles.coralAndHP}>
                                            <div className={styles.valueBoxes}>
                                                {(teleSectionConfig.extraStats || []).map((table, i) => (
                                                    <table key={i} className={styles.differentTable}>
                                                        <tbody>
                                                            <tr>
                                                                <td className={styles.coloredBoxes} style={{ backgroundColor: Colors[2][2], width: "34px" }} rowSpan="2">{table.title}</td>
                                                                {table.columns.map((col, ci) => (
                                                                    <td key={ci} className={styles.coloredBoxes} style={{ backgroundColor: Colors[2][1] }}>{col}</td>
                                                                ))}
                                                            </tr>
                                                            <tr>
                                                                {table.rows[0].values.map((valPath, vi) => {
                                                                    const val = resolvePath(safeData, valPath) || 0;
                                                                    const formatted = valPath.includes('success') || valPath.includes('Success')
                                                                        ? `${Math.round(10 * val) / 10}%`
                                                                        : Math.round(10 * val) / 10;
                                                                    return <td key={vi} className={styles.coloredBoxes} style={{ backgroundColor: Colors[2][0] }}>{formatted}</td>;
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
                                                            <td style={{ backgroundColor: Colors[2][2] }} rowSpan="2">{table.title}</td>
                                                            {table.columns.map((col, ci) => (
                                                                <td key={ci} style={{ backgroundColor: Colors[2][1] }}>{col}</td>
                                                            ))}
                                                        </tr>
                                                        <tr>
                                                            {table.rows[0].values.map((valPath, vi) => {
                                                                const val = resolvePath(safeData, valPath) || 0;
                                                                const formatted = valPath.includes('success') ? `${Math.round(10 * val) / 10}%` : Math.round(10 * val) / 10;
                                                                return <td key={vi} style={{ backgroundColor: Colors[2][0] }}>{formatted}</td>;
                                                            })}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            ))}
                                        </div>
                                        {hasTeleLevelTable && (
                                            <div className={styles.fourByTwoContainer}>
                                                <FourByTwo
                                                    {...buildFourByTwoProps(teleSectionConfig.levelTable)}
                                                    color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                                />
                                            </div>
                                        )}
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
                                        {hasTeleAlgaeStats && (
                                            <div className={styles.twoByTwoContainer}>
                                                <TwoByTwo
                                                    {...buildTwoByTwoProps(teleSectionConfig.algaeStats)}
                                                    color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                                />
                                            </div>
                                        )}
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
                            </div>
                            <div className={styles.qualitative}>
                                <h1 className={styles.header} style={{ color: Colors[4][3] }}>Qualitative</h1>
                                <div className={styles.radarContainer}>
                                    <h4 className={styles.graphTitle}>Defense Played Ratings</h4>
                                    <table className={styles.differentTable}>
                                        <tbody>
                                            <tr>
                                                {buildDefenseChartData().map(entry => (
                                                    <td key={entry.name} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][1] }}>{entry.name}</td>
                                                ))}
                                            </tr>
                                            <tr>
                                                {buildDefenseChartData().map(entry => (
                                                    <td key={entry.name} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][0] }}>{entry.value.toFixed(1)}</td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                {scouterConfidenceField && safeData.scouterConfidenceOverTime.length > 0 && (
                                    <div className={styles.radarContainer}>
                                        <h4 className={styles.graphTitle}>Scouter Confidence Per Match</h4>
                                        <table className={styles.differentTable}>
                                            <tbody>
                                                <tr>
                                                    {safeData.scouterConfidenceOverTime.map(e => (
                                                        <td key={e.match} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][1] }}>Q{e.match}</td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    {safeData.scouterConfidenceOverTime.map(e => (
                                                        <td key={e.match} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][0] }}>{e.confidence.toFixed(1)}</td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <table className={styles.differentTable}>
                                    <tbody>
                                        {intakeDisplayConfig.map((intake, idx) => (
                                            <React.Fragment key={idx}>
                                                <tr>
                                                    <td className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][2], width: "40px" }} rowSpan="2">{intake.category}</td>
                                                    {intake.labels.map((label, li) => (
                                                        <td key={li} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][1], width: "50px", height: li === 0 ? "10px" : undefined }}>{label}</td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    {intake.fields.map((field, fi) => (
                                                        <td key={fi} className={styles.coloredBoxes} style={{ backgroundColor: Colors[4][0], width: "50px", height: "30px" }}>
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
