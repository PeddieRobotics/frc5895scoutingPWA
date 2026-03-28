'use client';

import { useState, useEffect, useMemo } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import useGameConfig from "../../lib/useGameConfig";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Resolve a dotted path like "endPlacement.l3" on an object
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// Evaluate "path1 + path2" style expressions (single path also works)
function computeValue(data, computeStr) {
  const parts = computeStr.split(' + ');
  return parts.reduce((sum, path) => sum + (resolvePath(data, path.trim()) || 0), 0);
}

function formatStatVal(v, format) {
  const n = Math.round(10 * (v || 0)) / 10;
  if (format === 'percent') return `${n.toFixed(1)}%`;
  return n.toFixed(1);
}

// Colors for each team — design system palette
const COLORS = [
  "#a07c30", // gold (primary)
  "#2563eb", // blue
  "#1a7f3c", // green
  "#c0392b", // red
];

// Transparent tints for pill backgrounds
function pillBg(hex) {
  return `${hex}18`;
}

export default function ComparePage() {
  return <Compare />;
}

function Compare() {
  const [teamsData, setTeamsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [tbaRanks, setTbaRanks] = useState({});
  const [fetchingTbaRanks, setFetchingTbaRanks] = useState(false);
  const { config, gameId, loading: configLoading } = useGameConfig();

  const compareConfig = useMemo(() => config?.display?.compare, [config]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const parsedTeams = [
        urlParams.get('team1'),
        urlParams.get('team2'),
      ].filter(t => t !== null && t !== "");
      setTeams(parsedTeams);
    }
  }, []);

  // Guard: must be after all hooks
  if (!configLoading && !compareConfig) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h2>Compare Not Configured</h2>
        <p>Add a &quot;compare&quot; section to your game config&apos;s display settings.</p>
      </div>
    );
  }

  useEffect(() => {
    let isMounted = true;

    async function fetchTeamData() {
      if (teams.length === 0) { setLoading(false); return; }
      setLoading(true);
      setError(null);

      try {
        let currentUserTeam = null;
        try {
          const storedTeam = localStorage.getItem('userTeam');
          if (storedTeam) {
            currentUserTeam = storedTeam;
          } else {
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

        const teamDataPromises = teams.map(team => {
          const params = new URLSearchParams({ team: String(team), includeRows: "true" });
          if (gameId) params.set("gameId", String(gameId));
          return fetch(`/api/get-team-data?${params.toString()}`, {
            headers: { 'Authorization': `Basic ${btoa(`${currentUserTeam || team || 'guest'}:`)}` }
          }).then(async response => {
            if (!response.ok) throw new Error(`Failed to fetch data for team ${team}`);
            const data = await response.json();
            if (data.message?.startsWith('ERROR:')) throw new Error(data.message);
            return data;
          });
        });

        const results = await Promise.all(teamDataPromises);

        if (isMounted) {
          const teamsDataObj = {};
          results.forEach((data, index) => {
            teamsDataObj[teams[index]] = data || { team: teams[index], name: `Team ${teams[index]}` };
          });
          setTeamsData(teamsDataObj);
          setLoading(false);
          fetchTbaRanksForTeams(teams);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Failed to fetch team data");
          setLoading(false);
        }
      }
    }

    fetchTeamData();
    return () => { isMounted = false; };
  }, [teams, gameId]);

  async function fetchTbaRanksForTeams(teamList) {
    setFetchingTbaRanks(true);
    try {
      const results = await Promise.all(
        teamList.map(team =>
          fetch(`/api/get-tba-rank?team=${team}`)
            .then(r => r.json())
            .then(d => ({ team, rank: d.rank, total: d.totalTeams, error: d.message }))
            .catch(() => ({ team, rank: null, error: 'Failed' }))
        )
      );
      const ranks = {};
      results.forEach(({ team, rank, total, error }) => {
        ranks[team] = rank ? `#${rank}/${total}` : (error || 'N/A');
      });
      setTbaRanks(ranks);
    } finally {
      setFetchingTbaRanks(false);
    }
  }

  if (loading || configLoading) {
    return <div className={styles.container}><h1>Loading...</h1></div>;
  }

  if (teams.length === 0) {
    return (
      <div className={styles.container}>
        <h1>Team Comparison</h1>
        <p>Enter 2 teams to compare</p>
        <TeamInputForm />
      </div>
    );
  }

  const sections = compareConfig?.sections || [];
  const qualSection = compareConfig?.qualitativeSection || null;

  return (
    <div className={styles.container}>
      <h1>Team Comparison</h1>
      <TeamInputForm initialTeams={teams} />

      {error && <div className={styles.error}>{error}</div>}

      {/* Team legend + links */}
      <div className={styles.linkContainer} style={{ margin: "20px 0" }}>
        {teams.map((team, index) => (
          <Link key={index} href={`/team-view?team=${team}&team1=${teams[0] || ""}&team2=${teams[1] || ""}&source=compare`}>
            <button style={{ backgroundColor: COLORS[index], color: '#FFFFFF' }}>
              {tbaRanks[team] && <span style={{ marginRight: '0.4rem', opacity: 0.8 }}>{tbaRanks[team]}</span>}
              View Team {team}
            </button>
          </Link>
        ))}
        <button onClick={() => fetchTbaRanksForTeams(teams)} disabled={fetchingTbaRanks} style={{ marginLeft: '0.5rem' }}>
          {fetchingTbaRanks ? 'Fetching...' : 'TBA Ranks'}
        </button>
      </div>

      {/* PPR/EPA over time — both teams on one chart */}
      <EpaOverTimeChart teams={teams} teamsData={teamsData} colors={COLORS} usePPR={config?.usePPR} overlayOptions={config?.display?.teamView?.epaChartOverlayOptions || []} />

      {/* Config-driven sections */}
      {sections.map(section => (
        <SectionCard
          key={section.label}
          section={section}
          teamsData={teamsData}
          teams={teams}
          colors={COLORS}
        />
      ))}

      {/* Qualitative section */}
      {qualSection && (
        <QualitativeSection
          config={qualSection}
          teamsData={teamsData}
          teams={teams}
          colors={COLORS}
        />
      )}
    </div>
  );
}

function TeamInputForm({ initialTeams = ["", ""] }) {
  const [teamInputs, setTeamInputs] = useState(initialTeams.concat(Array(2 - initialTeams.length).fill("")).slice(0, 2));

  const handleSubmit = (e) => {
    e.preventDefault();
    const validTeams = teamInputs.filter(t => t !== "");
    if (validTeams.length === 0) { alert("Please enter at least one team number"); return; }
    const params = new URLSearchParams();
    validTeams.forEach((team, index) => params.append(`team${index + 1}`, team));
    window.location.href = `/compare?${params.toString()}`;
  };

  return (
    <form className={styles.teamInputForm} onSubmit={handleSubmit}>
      <div className={styles.formFields}>
        {teamInputs.map((team, index) => (
          <div key={index} className={styles.inputGroup}>
            <label htmlFor={`team${index + 1}`} style={{ color: COLORS[index] }}>Team {index + 1}</label>
            <input
              id={`team${index + 1}`}
              type="number"
              placeholder="Team #"
              value={team}
              onChange={(e) => {
                const newInputs = [...teamInputs];
                newInputs[index] = e.target.value;
                setTeamInputs(newInputs);
              }}
              style={{ borderColor: COLORS[index] }}
            />
          </div>
        ))}
      </div>
      <button type="submit" className={styles.compareButton}>Compare Teams</button>
    </form>
  );
}

// A section card containing a grid of stat cards
function SectionCard({ section, teamsData, teams, colors }) {
  return (
    <div className={styles.section}>
      <h2>{section.label}</h2>
      <div className={styles.statGrid}>
        {(section.stats || []).map(stat => (
          <StatCard key={stat.label} stat={stat} teamsData={teamsData} teams={teams} colors={colors} />
        ))}
      </div>
    </div>
  );
}

// A single metric card with one pill per team
function StatCard({ stat, teamsData, teams, colors }) {
  const getValue = (teamData) => {
    if (stat.key !== undefined) return teamData[stat.key] ?? 0;
    if (stat.compute !== undefined) return computeValue(teamData, stat.compute);
    return 0;
  };

  return (
    <div className={styles.statCard}>
      <div className={styles.statCardLabel}>{stat.label}</div>
      <div className={styles.pillList}>
        {teams.map((team, i) => {
          const v = getValue(teamsData[team] || {});
          return (
            <span
              key={team}
              className={styles.pill}
              style={{ borderColor: colors[i], color: colors[i], background: pillBg(colors[i]) }}
            >
              {formatStatVal(v, stat.format)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Qualitative section: pills with hover tooltip showing per-scout/match breakdown
function QualitativeSection({ config, teamsData, teams, colors }) {
  const stats = config.stats || [];

  return (
    <div className={styles.section}>
      <h2>{config.label || "Qualitative"}</h2>
      <div className={styles.statGrid}>
        {stats.map(stat => (
          <QualStatCard
            key={stat.label}
            stat={stat}
            teamsData={teamsData}
            teams={teams}
            colors={colors}
          />
        ))}
      </div>
    </div>
  );
}

function EpaOverTimeChart({ teams, teamsData, colors, usePPR, overlayOptions = [] }) {
  const [isClient, setIsClient] = useState(false);
  const [selectedVar, setSelectedVar] = useState(null);
  useEffect(() => { setIsClient(true); }, []);
  if (!isClient) return null;

  function getTeamArr(team, sel) {
    const d = teamsData[team];
    if (!d) return [];
    if (!sel) return d.epaOverTime || [];
    if (sel === 'auto') return d.autoOverTime || [];
    if (sel === 'tele') return d.teleOverTime || [];
    if (sel === 'end')  return d.endOverTime  || [];
    return d.overlayOverTime?.[sel] || [];
  }
  function getVarKey(sel) {
    if (!sel) return 'epa';
    if (['auto', 'tele', 'end'].includes(sel)) return sel;
    return 'value';
  }

  const allMatches = new Set();
  teams.forEach(team => getTeamArr(team, selectedVar).forEach(p => allMatches.add(p.match)));
  if (allMatches.size === 0) return null;

  const sortedMatches = Array.from(allMatches).sort((a, b) => a - b);
  const maxMatch = sortedMatches[sortedMatches.length - 1] ?? 0;
  const xTickInterval = Math.ceil(maxMatch / 9) || 1;
  const xDomainEnd = (Math.floor(maxMatch / xTickInterval) + 1) * xTickInterval;
  const xTicks = Array.from({ length: Math.floor(xDomainEnd / xTickInterval) + 1 }, (_, i) => i * xTickInterval);

  const varKey = getVarKey(selectedVar);
  const chartData = sortedMatches.map(match => {
    const point = { match };
    teams.forEach((team, i) => {
      const entry = getTeamArr(team, selectedVar).find(p => p.match === match);
      point[`team${i}`] = entry != null ? Math.round((entry[varKey] ?? 0) * 10) / 10 : null;
    });
    return point;
  });

  const chartLabel = selectedVar ? (overlayOptions.find(o => o.field === selectedVar)?.label || selectedVar) : (usePPR ? 'PPR' : 'EPA');

  const CustomTooltip = ({ active, payload, label: matchLabel }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#0d1f35', border: '1px solid rgba(189,151,72,0.6)', padding: '10px', borderRadius: '8px', fontFamily: 'Montserrat', fontSize: '13px', color: '#e8d5a3' }}>
        <p style={{ margin: '0 0 4px', fontWeight: '700' }}>Match {matchLabel}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ margin: '0', color: entry.stroke }}>{entry.name}: {entry.value ?? '—'}</p>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.section}>
      <h2>{chartLabel} Over Time</h2>
      {overlayOptions.length > 0 && (
        <select
          className={styles.overlaySelect}
          value={selectedVar || ''}
          onChange={e => setSelectedVar(e.target.value || null)}
        >
          <option value="">{usePPR ? 'PPR' : 'EPA'}</option>
          {overlayOptions.map(opt => (
            <option key={opt.field} value={opt.field}>{opt.label}</option>
          ))}
        </select>
      )}
      <div style={{ touchAction: 'pan-y', width: '100%' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,124,48,0.15)" />
            <XAxis type="number" dataKey="match" domain={[0, xDomainEnd]} ticks={xTicks} tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fill: 'rgba(13,31,53,0.55)', fontFamily: 'Montserrat', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            {teams.map((team, i) => (
              <Line key={team} yAxisId="left" type="monotone" dataKey={`team${i}`} name={`Team ${team}`} stroke={colors[i]} strokeWidth={3} dot={{ r: 3, fill: colors[i] }} connectNulls={true} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function QualStatCard({ stat, teamsData, teams, colors }) {
  // Build per-team: { avg, tooltipLines[] }
  const teamEntries = teams.map((team, i) => {
    const data = teamsData[team] || {};

    if (stat.defenseField) {
      const field = stat.defenseField;
      const fieldVariants = [
        field,
        field.charAt(0).toUpperCase() + field.slice(1),
        field.toUpperCase(),
      ];

      const getVal = (row) => {
        for (const f of fieldVariants) {
          if (row[f] !== undefined && row[f] !== null && row[f] > 0) return row[f];
        }
        return null;
      };

      const rows = (data.rows || []).filter(r => r.team == team);
      const valid = rows.filter(r => getVal(r) !== null);

      const avg = valid.length > 0
        ? valid.reduce((s, r) => s + getVal(r), 0) / valid.length
        : null;

      const tooltipLines = valid.map(r => {
        const rating = getVal(r);
        return `${r.scoutname || 'Unknown'} #Q${r.match}: ${rating}`;
      });

      return { team, color: colors[i], avg, tooltipLines };
    }

    // Fallback: plain key or compute
    const v = stat.key !== undefined
      ? (data[stat.key] ?? 0)
      : stat.compute !== undefined
        ? computeValue(data, stat.compute)
        : 0;
    return { team, color: colors[i], avg: v, tooltipLines: [] };
  });

  return (
    <div className={styles.statCard}>
      <div className={styles.statCardLabel}>{stat.label}</div>
      <div className={styles.pillList}>
        {teamEntries.map(entry => (
          <span
            key={entry.team}
            className={`${styles.pill} ${entry.tooltipLines.length > 0 ? styles.pillHoverable : ''}`}
            style={{ borderColor: entry.color, color: entry.color, background: pillBg(entry.color) }}
          >
            {entry.avg !== null ? formatStatVal(entry.avg, stat.format) : '—'}
            {entry.tooltipLines.length > 0 && (
              <span className={styles.qualTooltip}>
                {entry.tooltipLines.map((line, i) => (
                  <span key={i} className={styles.qualTooltipLine}>{line}</span>
                ))}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
