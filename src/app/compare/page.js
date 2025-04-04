'use client';

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import styles from "./page.module.css";
import Link from "next/link";

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
  
  const teams = [
    searchParams.get('team1'),
    searchParams.get('team2'),
    searchParams.get('team3'),
    searchParams.get('team4')
  ].filter(team => team !== null && team !== "");

  // Colors for each team (same as match-view)
  const COLORS = [
    "#A4E5DF", // green
    "#B7D1F7", // blue
    "#DDB7F7", // purple
    "#F6C1D8", // pink
  ];

  useEffect(() => {
    async function fetchTeamData() {
      if (teams.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const teamDataPromises = teams.map(team => 
          fetch(`/api/get-team-data?team=${team}`)
            .then(response => {
              if (!response.ok) {
                throw new Error(`Failed to fetch data for team ${team}`);
              }
              return response.json();
            })
        );

        const results = await Promise.all(teamDataPromises);
        
        const teamsDataObj = {};
        results.forEach((data, index) => {
          teamsDataObj[teams[index]] = data;
        });

        setTeamsData(teamsDataObj);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching team data:", error);
        setError(error.message);
        setLoading(false);
      }
    }

    fetchTeamData();
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
      
      <div className={styles.comparisonGrid}>
        <MetricsComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <ScoreComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <EndgameComparison teamsData={teamsData} teams={teams} colors={COLORS} />
        <QualitativeComparison teamsData={teamsData} teams={teams} colors={COLORS} />
      </div>

      <div className={styles.linkContainer}>
        {teams.map((team, index) => (
          <Link key={index} href={`/team-view?team=${team}`}>
            <button style={{backgroundColor: COLORS[index]}}>
              View Team {team} Details
            </button>
          </Link>
        ))}
      </div>
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
    };
  });

  const chartData = [
    { name: 'EPA', ...formatChartData(metricsData, 'avgEpa') },
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
          <Tooltip />
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
  // Prepare data for coral & algae comparisons
  const chartData = teams.map((team, index) => {
    const data = teamsData[team] || {};
    const avgPieces = data.avgPieces || {};
    
    return {
      name: `Team ${team}`,
      "Avg Coral": data.avgCoral || 0,
      "Avg Net": avgPieces.net || 0,
      "Avg Processor": avgPieces.processor || 0,
      "Avg Algae": data.avgAlgae || 0,
      fill: colors[index]
    };
  });

  return (
    <div className={styles.chartContainer}>
      <h2>Scoring Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="Avg Coral" fill="#8884d8" />
          <Bar dataKey="Avg Net" fill="#82ca9d" />
          <Bar dataKey="Avg Processor" fill="#ffc658" />
          <Bar dataKey="Avg Algae" fill="#ff8042" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function EndgameComparison({ teamsData, teams, colors }) {
  // Format endgame data for comparison
  const endgameData = teams.map(team => {
    const data = teamsData[team] || {};
    const endgame = data.endgame || { none: 0, park: 0, shallow: 0, deep: 0, fail: 0 };
    
    return {
      team: team,
      name: `Team ${team}`,
      "None": endgame.none || 0,
      "Park": endgame.park || 0,
      "Shallow": endgame.shallow || 0, 
      "Deep": endgame.deep || 0,
      "Fail": endgame.fail || 0
    };
  });

  return (
    <div className={styles.chartContainer}>
      <h2>Endgame Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={endgameData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" />
          <Tooltip />
          <Legend />
          <Bar dataKey="None" stackId="a" fill="#cccccc" />
          <Bar dataKey="Park" stackId="a" fill="#82ca9d" />
          <Bar dataKey="Shallow" stackId="a" fill="#8884d8" />
          <Bar dataKey="Deep" stackId="a" fill="#ffc658" />
          <Bar dataKey="Fail" stackId="a" fill="#ff8042" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function QualitativeComparison({ teamsData, teams, colors }) {
  // Format qualitative metrics for radar chart
  const qualitativeData = [];
  
  // Define metrics to include
  const metrics = [
    { key: 'coralspeed', name: 'Coral Speed' },
    { key: 'processorspeed', name: 'Processor Speed' },
    { key: 'netspeed', name: 'Net Speed' },
    { key: 'algaeremovalspeed', name: 'Algae Speed' },
    { key: 'climbspeed', name: 'Climb Speed' },
    { key: 'maneuverability', name: 'Maneuverability' },
    { key: 'defenseplayed', name: 'Defense' },
    { key: 'defenseevasion', name: 'Defense Evasion' },
  ];
  
  // Prepare data in the format needed for the table
  metrics.forEach(metric => {
    const dataPoint = { metric: metric.name };
    
    teams.forEach(team => {
      const data = teamsData[team] || {};
      const qualitative = data.qualitative || {};
      dataPoint[`team${team}`] = qualitative[metric.key] || 0;
    });
    
    qualitativeData.push(dataPoint);
  });

  return (
    <div className={styles.tableContainer}>
      <h2>Qualitative Comparison</h2>
      <table className={styles.comparisonTable}>
        <thead>
          <tr>
            <th>Metric</th>
            {teams.map((team, index) => (
              <th key={team} style={{backgroundColor: colors[index]}}>Team {team}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {qualitativeData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <td>{row.metric}</td>
              {teams.map(team => (
                <td key={team}>{row[`team${team}`]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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