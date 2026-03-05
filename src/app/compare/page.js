'use client';

import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import styles from "./page.module.css";
import Link from "next/link";
import useGameConfig from "../../lib/useGameConfig";

// Helper to resolve a dotted path like "auto.coral.total" on an object
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// Helper to evaluate a compute string like "auto.coral.total + tele.coral.total"
function computeValue(data, computeStr) {
  const parts = computeStr.split(' + ');
  return parts.reduce((sum, path) => sum + (resolvePath(data, path.trim()) || 0), 0);
}

// Custom tooltip formatter to show 1 decimal place
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className={styles.customTooltip}>
        <p className={styles.label}>{`${label}`}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {`${entry.name}: ${parseFloat(entry.value).toFixed(1)}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

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

  const compareConfig = useMemo(
    () => config?.display?.compare,
    [config]
  );


  // Parse URL parameters on the client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const parsedTeams = [
        urlParams.get('team1'),
        urlParams.get('team2'),
        urlParams.get('team3'),
        urlParams.get('team4')
      ].filter(team => team !== null && team !== "");

      setTeams(parsedTeams);
    }
  }, []);

  // Guard: if no compare config, show fallback (must be after all hooks)
  if (!configLoading && !compareConfig) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h2>Compare Not Configured</h2>
        <p>Add a &quot;compare&quot; section to your game config&apos;s display settings.</p>
      </div>
    );
  }

  // Colors for each team (same as match-view)
  const COLORS = [
    "#A4E5DF", // green
    "#B7D1F7", // blue
    "#DDB7F7", // purple
    "#F6C1D8", // pink
  ];

  useEffect(() => {
    let isMounted = true;

    async function fetchTeamData() {
      if (teams.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
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

        const teamDataPromises = teams.map(team => {
          const params = new URLSearchParams({
            team: String(team),
            includeRows: "true",
          });
          if (gameId) params.set("gameId", String(gameId));

          return fetch(`/api/get-team-data?${params.toString()}`, {
            headers: {
              'Authorization': `Basic ${btoa(`${currentUserTeam || team || 'guest'}:`)}`
            }
          })
            .then(async response => {
              if (!response.ok) {
                console.error(`Error fetching team ${team} data:`, response.status);
                throw new Error(`Failed to fetch data for team ${team}`);
              }
              const data = await response.json();
              // Check if the API returned an error message
              if (data.message && data.message.startsWith('ERROR:')) {
                console.error(`API error for team ${team}:`, data.message);
                throw new Error(data.message);
              }
              return data;
            });
        });

        const results = await Promise.all(teamDataPromises);

        if (isMounted) {
          const teamsDataObj = {};
          results.forEach((data, index) => {
            // Check if data has required fields, if not provide defaults
            if (!data.avgEpa && data.avgEpa !== 0) {
              console.warn(`Team ${teams[index]} data is missing avgEpa field`);
            }

            teamsDataObj[teams[index]] = data || {
              team: teams[index],
              name: `Team ${teams[index]}`,
              avgEpa: 0,
              avgAuto: 0,
              avgTele: 0,
              avgEnd: 0,
              last3Epa: 0,
              last3Auto: 0,
              last3Tele: 0,
              last3End: 0
            };

            // Log last3EPA values from API
            console.log(`Team ${teams[index]} Last 3 EPA values:`, {
              epa: teamsDataObj[teams[index]].last3Epa,
              auto: teamsDataObj[teams[index]].last3Auto,
              tele: teamsDataObj[teams[index]].last3Tele,
              end: teamsDataObj[teams[index]].last3End
            });
          });

          console.log('Processed team data:', teamsDataObj);
          setTeamsData(teamsDataObj);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error fetching team data:", error);
          setError(error.message || "Failed to fetch team data");
          setLoading(false);
        }
      }
    }

    fetchTeamData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [teams, gameId]);

  async function fetchTbaRanks() {
    setFetchingTbaRanks(true);
    try {
      const results = await Promise.all(
        teams.map(team =>
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
    return (
      <div className={styles.container}>
        <h1>Loading...</h1>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className={styles.container}>
        <h1>Team Comparison</h1>
        <p>Enter up to 4 teams to compare</p>
        <TeamInputForm />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1>Team Comparison</h1>
      <TeamInputForm initialTeams={teams} />

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.linkContainer} style={{ margin: "20px 0" }}>
        {teams.map((team, index) => (
          <Link key={index} href={`/team-view?team=${team}&team1=${teams[0] || ""}&team2=${teams[1] || ""}&team3=${teams[2] || ""}&team4=${teams[3] || ""}&source=compare`}>
            <button style={{ backgroundColor: COLORS[index] }}>
              {tbaRanks[team] && <span style={{ marginRight: '0.4rem', opacity: 0.8 }}>{tbaRanks[team]}</span>}
              View Team {team}
            </button>
          </Link>
        ))}
        <button onClick={fetchTbaRanks} disabled={fetchingTbaRanks} style={{ marginLeft: '0.5rem' }}>
          {fetchingTbaRanks ? 'Fetching...' : 'TBA Ranks'}
        </button>
      </div>

      <div className={styles.comparisonGrid}>
        <MetricsComparison teamsData={teamsData} teams={teams} colors={COLORS} compareConfig={compareConfig} />
        <ScoreComparison teamsData={teamsData} teams={teams} colors={COLORS} compareConfig={compareConfig} />
        {compareConfig?.coralLevelChart && <LevelComparison teamsData={teamsData} teams={teams} colors={COLORS} compareConfig={compareConfig} />}
        {compareConfig?.endgameChart && <EndgameComparison teamsData={teamsData} teams={teams} colors={COLORS} compareConfig={compareConfig} />}
      </div>

      {/* Defense ratings section outside the grid to span full width */}
      <QualitativeComparison teamsData={teamsData} teams={teams} colors={COLORS} compareConfig={compareConfig} />
    </div>
  );
}

function TeamInputForm({ initialTeams = ["", "", "", ""] }) {
  const [teamInputs, setTeamInputs] = useState(initialTeams.concat(Array(4 - initialTeams.length).fill("")));

  const handleSubmit = (e) => {
    e.preventDefault();

    // Filter out empty team numbers
    const validTeams = teamInputs.filter(team => team !== "");

    if (validTeams.length === 0) {
      alert("Please enter at least one team number");
      return;
    }

    // Construct the URL with team parameters
    const params = new URLSearchParams();
    validTeams.forEach((team, index) => {
      params.append(`team${index + 1}`, team);
    });

    window.location.href = `/compare?${params.toString()}`;
  };

  const handleTeamChange = (index, value) => {
    const newInputs = [...teamInputs];
    newInputs[index] = value;
    setTeamInputs(newInputs);
  };

  return (
    <form className={styles.teamInputForm} onSubmit={handleSubmit}>
      <div className={styles.formFields}>
        {teamInputs.map((team, index) => (
          <div key={index} className={styles.inputGroup}>
            <label htmlFor={`team${index + 1}`}>Team {index + 1}</label>
            <input
              id={`team${index + 1}`}
              type="number"
              placeholder="Team #"
              value={team}
              onChange={(e) => handleTeamChange(index, e.target.value)}
            />
          </div>
        ))}
      </div>
      <button type="submit" className={styles.compareButton}>Compare Teams</button>
    </form>
  );
}

function MetricsComparison({ teamsData, teams, colors, compareConfig }) {
  const metricsChart = compareConfig?.metricsChart || [];

  // Prepare data for metric comparison chart
  const metricsData = teams.map((team, index) => {
    const data = teamsData[team] || {};
    const entry = {
      team: team,
      teamName: data.name || `Team ${team}`,
      color: colors[index],
    };
    metricsChart.forEach(metric => {
      entry[metric.key] = data[metric.key] || 0;
    });
    return entry;
  });

  const chartData = metricsChart.map(metric => ({
    name: metric.label,
    ...formatChartData(metricsData, metric.key),
  }));

  return (
    <div className={styles.chartContainer}>
      <h2>Overall Metrics</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {teams.map((team, index) => (
            <Bar key={team} dataKey={`team${team}`} name={`Team ${team}`} fill={colors[index]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScoreComparison({ teamsData, teams, colors, compareConfig }) {
  const scoringChart = compareConfig?.scoringChart || [];

  const chartData = scoringChart.map(metric => {
    const dataPoint = { name: metric.label };

    teams.forEach(team => {
      const data = teamsData[team] || {};
      dataPoint[`team${team}`] = computeValue(data, metric.compute);
    });

    return dataPoint;
  });

  return (
    <div className={styles.chartContainer}>
      <h2>Scoring Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {teams.map((team, index) => (
            <Bar key={team} dataKey={`team${team}`} name={`Team ${team}`} fill={colors[index]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LevelComparison({ teamsData, teams, colors, compareConfig }) {
  const coralConfig = compareConfig?.coralLevelChart || {};
  const { levels, autoPrefix, telePrefix, failMetric } = coralConfig;

  // Build metric list: levels + optional fail metric
  const allMetrics = [...levels];
  if (failMetric) {
    allMetrics.push(failMetric.label);
  }

  const chartData = allMetrics.map(metric => {
    const dataPoint = { name: metric };

    teams.forEach(team => {
      const data = teamsData[team] || {};

      if (failMetric && metric === failMetric.label) {
        const autoSuccess = resolvePath(data, failMetric.autoSuccessKey) || 0;
        const teleSuccess = resolvePath(data, failMetric.teleSuccessKey) || 0;
        dataPoint[`team${team}`] = 100 - (autoSuccess + teleSuccess) / 2;
      } else {
        // Level metric: resolve autoPrefix + level + telePrefix + level
        const autoVal = resolvePath(data, `${autoPrefix}${metric}`) || 0;
        const teleVal = resolvePath(data, `${telePrefix}${metric}`) || 0;
        dataPoint[`team${team}`] = autoVal + teleVal;
      }
    });

    return dataPoint;
  });

  return (
    <div className={styles.chartContainer}>
      <h2>Coral Level Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {teams.map((team, index) => (
            <Bar key={team} dataKey={`team${team}`} name={`Team ${team}`} fill={colors[index]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EndgameComparison({ teamsData, teams, colors, compareConfig }) {
  const endgameConfig = compareConfig?.endgameChart || {};
  const { metrics, keys, endgameSource, fallbackSource } = endgameConfig;

  const chartData = metrics.map((metric, metricIndex) => {
    const dataPoint = { name: metric };
    const key = keys[metricIndex];

    teams.forEach(team => {
      const data = teamsData[team] || {};
      const primary = data[endgameSource] || {};
      const fallback = data[fallbackSource] || {};

      dataPoint[`team${team}`] = primary[key] || fallback[key] || 0;
    });

    return dataPoint;
  });

  return (
    <div className={styles.chartContainer}>
      <h2>Endgame Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {teams.map((team, index) => (
            <Bar key={team} dataKey={`team${team}`} name={`Team ${team}`} fill={colors[index]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function QualitativeComparison({ teamsData, teams, colors, compareConfig }) {
  const defenseField = compareConfig?.defenseField || '';

  // Build case-variant list from the configured field name
  const baseField = defenseField;
  const fieldVariants = [
    baseField,
    baseField.charAt(0).toUpperCase() + baseField.slice(1),
    baseField.toUpperCase(),
    baseField.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, ''),
    baseField.charAt(0).toUpperCase() + baseField.slice(1).replace(/([a-z])([A-Z])/g, '$1$2'),
  ];

  // Format team-specific defense data using bar charts like in team-view
  return (
    <div className={styles.qualitativeContainer}>
      <h2>Defense Ratings</h2>
      <div className={styles.defenseGridContainer}>
        {teams.map((team, index) => {
          const data = teamsData[team] || {};
          const rows = data.rows || [];

          // Get defense played ratings using configured field with case variants
          const getDefensePlayed = (row) => {
            for (const field of fieldVariants) {
              if (row[field] !== undefined && row[field] !== null && row[field] > 0) {
                return row[field];
              }
            }
            return null;
          };

          // Filter valid defense ratings
          const validDefenseRatings = rows.filter(row => {
            const defenseValue = getDefensePlayed(row);
            return row.team == team && defenseValue !== null;
          });

          // Debug for when there's no row data
          if (rows.length === 0) {
            console.log(`Team ${team}: No row data available from API.`);
          } else if (validDefenseRatings.length === 0) {
            console.log(`Team ${team}: Has ${rows.length} rows but no defense ratings found.`);
          }

          // Prepare chart data
          let chartData = [];

          if (validDefenseRatings.length > 0) {
            // Calculate average defense rating
            const totalSum = validDefenseRatings.reduce((sum, row) => {
              const defenseValue = getDefensePlayed(row);
              return sum + defenseValue;
            }, 0);

            const totalAvg = totalSum / validDefenseRatings.length;

            // Debug log defense data
            console.log(`Team ${team} Defense Ratings:`, {
              numRows: rows.length,
              validRatings: validDefenseRatings.length,
              totalAvg,
              ratings: validDefenseRatings.map(row => ({
                match: row.match,
                scout: row.scoutname,
                rating: getDefensePlayed(row)
              }))
            });

            chartData = [{ name: 'TOTAL', value: totalAvg }];

            // Group by scout
            const scoutMap = {};
            validDefenseRatings.forEach(row => {
              const scoutName = row.scoutname || 'Unknown';
              if (!scoutMap[scoutName]) {
                scoutMap[scoutName] = [];
              }
              scoutMap[scoutName].push(getDefensePlayed(row));
            });

            // Add scout averages
            Object.entries(scoutMap).forEach(([scout, ratings]) => {
              if (ratings.length > 0) {
                const scoutSum = ratings.reduce((sum, rating) => sum + rating, 0);
                const scoutAvg = scoutSum / ratings.length;
                chartData.push({
                  name: scout,
                  value: scoutAvg
                });
              }
            });
          }
          // If no row-level data but has qualitative array
          else if (data.qualitative) {
            // Check for defense rating in qualitative data
            const defenseItem = Array.isArray(data.qualitative)
              ? data.qualitative.find(q => q.name === "Defense Played")
              : null;

            if (defenseItem && defenseItem.rating > 0) {
              chartData = [{ name: 'TOTAL', value: defenseItem.rating }];
            } else {
              chartData = [{ name: 'TOTAL', value: 0 }];
            }
          } else {
            chartData = [{ name: 'TOTAL', value: 0 }];
          }

          return (
            <div key={team} className={styles.defenseChart}>
              <h3 style={{ color: colors[index] }}>Team {team}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 70 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    tick={{ dy: 10, fontSize: 12 }}
                  />
                  <YAxis
                    domain={[0, 6]}
                    ticks={[0, 1, 2, 3, 4, 5, 6]}
                    interval={0}
                  />
                  <Tooltip formatter={(value) => parseFloat(value).toFixed(1)} />
                  <Bar dataKey="value" fill={colors[index]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to format data for charts
function formatChartData(teamsData, metric) {
  const formattedData = {};

  teamsData.forEach(data => {
    formattedData[`team${data.team}`] = data[metric];
  });

  return formattedData;
}
