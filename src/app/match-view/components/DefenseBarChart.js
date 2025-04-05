'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function DefenseBarChart({ allianceData, colors, teamNumbers }) {
  const [defenseRatings, setDefenseRatings] = useState({
    team1: 0,
    team2: 0,
    team3: 0,
    alliance: 0
  });

  // Helper function to get defense played value from a row
  const getDefensePlayed = (row) => {
    if (!row) return null;
    
    const fieldVariants = ['defenseplayed', 'defensePlayed', 'DEFENSEPLAYED', 'defense_played', 'DefensePlayed'];
    for (const field of fieldVariants) {
      if (row[field] !== undefined && row[field] !== null && row[field] > 0) {
        return row[field];
      }
    }
    return null;
  };

  // Helper function to calculate average defense rating for a team based on its rows
  const calculateTeamDefenseRating = (rows, teamNumber) => {
    if (!rows || rows.length === 0) return 0;
    
    const validDefenseRatings = rows.filter(row => {
      const defenseValue = getDefensePlayed(row);
      return row.team == teamNumber && defenseValue !== null;
    });
    
    if (validDefenseRatings.length === 0) return 0;
    
    const totalSum = validDefenseRatings.reduce((sum, row) => {
      const defenseValue = getDefensePlayed(row);
      return sum + defenseValue;
    }, 0);
    
    return Math.min(totalSum / validDefenseRatings.length, 6); // Cap at 6
  };

  // Fetch and process defense ratings for each team
  useEffect(() => {
    const fetchTeamData = async (teamNumber) => {
      if (!teamNumber) return { rows: [] };
      
      try {
        const response = await fetch(`/api/get-team-data?team=${teamNumber}&includeRows=true`);
        if (!response.ok) {
          console.error(`Failed to fetch data for team ${teamNumber}`);
          return { rows: [] };
        }
        return await response.json();
      } catch (error) {
        console.error(`Error fetching data for team ${teamNumber}:`, error);
        return { rows: [] };
      }
    };

    const fetchAllTeamData = async () => {
      // Only fetch data for valid team numbers
      const validTeamNumbers = teamNumbers.filter(num => num && num !== 404);
      if (validTeamNumbers.length === 0) return;
      
      const teamData = await Promise.all(
        validTeamNumbers.map(teamNumber => fetchTeamData(teamNumber))
      );
      
      // Calculate defense ratings
      const ratings = {
        team1: validTeamNumbers[0] ? calculateTeamDefenseRating(teamData[0].rows, validTeamNumbers[0]) : 0,
        team2: validTeamNumbers[1] ? calculateTeamDefenseRating(teamData[1].rows, validTeamNumbers[1]) : 0,
        team3: validTeamNumbers[2] ? calculateTeamDefenseRating(teamData[2].rows, validTeamNumbers[2]) : 0
      };
      
      // Calculate alliance average from valid ratings (those greater than 0)
      const validRatings = Object.values(ratings).filter(rating => rating > 0);
      ratings.alliance = validRatings.length > 0 
        ? Math.min(validRatings.reduce((sum, val) => sum + val, 0) / validRatings.length, 6) 
        : 0;
      
      setDefenseRatings(ratings);
    };
    
    fetchAllTeamData();
  }, [teamNumbers]);

  // Format data for the bar chart
  const data = [
    {
      name: 'Defense Rating',
      team1: defenseRatings.team1,
      team2: defenseRatings.team2,
      team3: defenseRatings.team3,
      alliance: defenseRatings.alliance
    }
  ];

  return (
    <div>
      <h3>Alliance Defense Rating</h3>
      <BarChart
        width={400}
        height={300}
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis 
          domain={[0, 6]} 
          ticks={[0, 1, 2, 3, 4, 5, 6]}
          interval={0}
        />
        <Tooltip formatter={(value) => value.toFixed(1)} />
        <Legend />
        <Bar dataKey="team1" name={`Team ${teamNumbers[0] || 'N/A'}`} fill={colors[0]} />
        <Bar dataKey="team2" name={`Team ${teamNumbers[1] || 'N/A'}`} fill={colors[1]} />
        <Bar dataKey="team3" name={`Team ${teamNumbers[2] || 'N/A'}`} fill={colors[2]} />
        <Bar dataKey="alliance" name="Alliance Average" fill="#000000" />
      </BarChart>
    </div>
  );
} 