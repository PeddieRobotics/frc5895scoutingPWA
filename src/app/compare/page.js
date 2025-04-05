'use client';

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import styles from "./page.module.css";
import Link from "next/link";

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
  return (
    <Suspense>
      <Compare />
    </Suspense>
  );
}

function Compare() {
  const [teamsData, setTeamsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const searchParams = useSearchParams();
  
  // Memoize the teams array to prevent re-rendering loops
  const teams = useMemo(() => {
    return [
      searchParams.get('team1'),
      searchParams.get('team2'),
      searchParams.get('team3'),
      searchParams.get('team4')
    ].filter(team => team !== null && team !== "");
  }, [searchParams]);

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
        const teamDataPromises = teams.map(team => 
          fetch(`/api/get-team-data?team=${team}&includeRows=true`)
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
            })
        );

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
  }, [teams]);

  if (loading) {
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
      
      <div className={styles.linkContainer} style={{margin: "20px 0"}}>
        {teams.map((team, index) => (
          <Link key={index} href={`/team-view?team=${team}&team1=${teams[0] || ""}&team2=${teams[1] || ""}&team3=${teams[2] || ""}&team4=${teams[3] || ""}&source=compare`}>
            <button style={{backgroundColor: COLORS[index]}}>
              View Team {team} Details
            </button>
          </Link>
        ))}
      </div>
      
      <div className={styles.comparisonGrid}>
        <MetricsComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <ScoreComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <CoralLevelComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <EndgameComparison teamsData={teamsData} teams={teams} colors={COLORS} />
      </div>
      
      {/* Defense ratings section outside the grid to span full width */}
      <QualitativeComparison teamsData={teamsData} teams={teams} colors={COLORS} />
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

function MetricsComparison({ teamsData, teams, colors }) {
  // Prepare data for metric comparison chart
  const metricsData = teams.map((team, index) => {
    const data = teamsData[team] || {};
    return {
      team: team,
      teamName: data.name || `Team ${team}`,
      color: colors[index],
      avgEpa: data.avgEpa || 0,
      avgAuto: data.avgAuto || 0,
      avgTele: data.avgTele || 0,
      avgEnd: data.avgEnd || 0,
      last3EPA: data.last3Epa || 0,
    };
  });

  const chartData = [
    { name: 'EPA', ...formatChartData(metricsData, 'avgEpa') },
    { name: 'Last 3 EPA', ...formatChartData(metricsData, 'last3EPA') },
    { name: 'Auto', ...formatChartData(metricsData, 'avgAuto') },
    { name: 'Teleop', ...formatChartData(metricsData, 'avgTele') },
    { name: 'Endgame', ...formatChartData(metricsData, 'avgEnd') },
  ];

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

function ScoreComparison({ teamsData, teams, colors }) {
  // Restructure data for comparison to match the pattern in MetricsComparison
  
  // First determine all the scoring metrics we want to show
  const metrics = ["Coral", "Net", "Processor", "Algae"];
  
  // Create charts for each metric
  const chartData = metrics.map(metric => {
    const dataPoint = { name: metric };
    
    // Add each team's value for this metric
    teams.forEach(team => {
      const data = teamsData[team] || {};
      const avgPieces = data.avgPieces || {};
      
      let value = 0;
      if (metric === "Coral") {
        value = data.auto?.coral?.total + data.tele?.coral?.total || data.avgCoral || 0;
      } else if (metric === "Net") {
        value = avgPieces.net || (data.auto?.algae?.avgNet || 0) + (data.tele?.algae?.avgNet || 0);
      } else if (metric === "Processor") {
        value = avgPieces.processor || (data.auto?.algae?.avgProcessor || 0) + (data.tele?.algae?.avgProcessor || 0);
      } else if (metric === "Algae") {
        value = data.avgAlgae || (data.auto?.algae?.removed || 0) + (data.tele?.algae?.removed || 0);
      }
      
      dataPoint[`team${team}`] = value;
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

function CoralLevelComparison({ teamsData, teams, colors }) {
  // Restructure data for comparison to match the pattern in MetricsComparison
  
  // First determine all the coral level metrics we want to show
  const metrics = ["L1", "L2", "L3", "L4", "Fail %"];
  
  // Create charts for each metric
  const chartData = metrics.map(metric => {
    const dataPoint = { name: metric };
    
    // Add each team's value for this metric
    teams.forEach(team => {
      const data = teamsData[team] || {};
      const auto = data.auto?.coral || {};
      const tele = data.tele?.coral || {};
      
      let value = 0;
      if (metric === "L1") {
        value = (auto.avgL1 || 0) + (tele.avgL1 || 0);
      } else if (metric === "L2") {
        value = (auto.avgL2 || 0) + (tele.avgL2 || 0);
      } else if (metric === "L3") {
        value = (auto.avgL3 || 0) + (tele.avgL3 || 0);
      } else if (metric === "L4") {
        value = (auto.avgL4 || 0) + (tele.avgL4 || 0);
      } else if (metric === "Fail %") {
        value = 100 - ((auto.success || 0) + (tele.success || 0)) / 2;
      }
      
      dataPoint[`team${team}`] = value;
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

function EndgameComparison({ teamsData, teams, colors }) {
  // Restructure data for comparison to match the pattern in other components
  
  // Define endgame metrics
  const metrics = ["None", "Park", "Shallow", "Deep", "Fail"];
  
  // Create charts for each metric
  const chartData = metrics.map(metric => {
    const dataPoint = { name: metric };
    
    // Add each team's value for this metric
    teams.forEach(team => {
      const data = teamsData[team] || {};
      // Try to get data from two possible sources - direct endgame object or endPlacement
      const endgame = data.endgame || {};
      const endPlacement = data.endPlacement || {};
      
      let value = 0;
      if (metric === "None") {
        value = endgame.none || endPlacement.none || 0;
      } else if (metric === "Park") {
        value = endgame.park || endPlacement.park || 0;
      } else if (metric === "Shallow") {
        value = endgame.shallow || endPlacement.shallow || 0;
      } else if (metric === "Deep") {
        value = endgame.deep || endPlacement.deep || 0;
      } else if (metric === "Fail") {
        value = endgame.fail || endPlacement.parkandFail || 0;
      }
      
      dataPoint[`team${team}`] = value;
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

function QualitativeComparison({ teamsData, teams, colors }) {
  // Format team-specific defense data using bar charts like in team-view
  return (
    <div className={styles.qualitativeContainer}>
      <h2>Defense Ratings</h2>
      <div className={styles.defenseGridContainer}>
        {teams.map((team, index) => {
          const data = teamsData[team] || {};
          const rows = data.rows || [];
          
          // Get defense played ratings using the same method as team-view
          const getDefensePlayed = (row) => {
            const fieldVariants = ['defenseplayed', 'defensePlayed', 'DEFENSEPLAYED', 'defense_played', 'DefensePlayed'];
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