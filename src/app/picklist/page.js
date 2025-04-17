'use client';

import styles from "./page.module.css";
import { useEffect, useState, useRef, memo, useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ZAxis, Legend, ResponsiveContainer } from 'recharts';

// Custom tooltip component for scatter plot
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className={styles.customTooltip}>
        <p className={styles.tooltipTeam}>{`Team: ${data.team}`}</p>
        <p>{`Coral: ${data.x}`}</p>
        <p>{`Algae: ${data.y}`}</p>
        <p>{`Matches: ${data.z}`}</p>
      </div>
    );
  }
  return null;
};

// Memoized ScatterPlot component to prevent re-renders
const MemoizedScatterPlot = memo(function ScatterPlot({ teamData }) {
  const [teamHighlight, setTeamHighlight] = useState('');
  const [highlightedTeams, setHighlightedTeams] = useState([]);
  
  // Update highlighted teams when the input changes
  useEffect(() => {
    if (!teamData || teamData.length === 0) return;
    
    if (!teamHighlight.trim()) {
      setHighlightedTeams([]);
    } else {
      // Parse team numbers from the input
      const teamNumbers = teamHighlight
        .split(',')
        .map(val => val.trim())
        .filter(val => val !== ''); // Filter out empty entries (like trailing commas)
      
      setHighlightedTeams(teamNumbers);
    }
  }, [teamHighlight, teamData]);
  
  if (!teamData || teamData.length === 0) {
    return <div className={styles.loadingGraph}>Loading team data...</div>;
  }
  
  // Determine point color based on whether it's highlighted
  const getPointColor = (team) => {
    if (highlightedTeams.length > 0 && highlightedTeams.some(t => team.toString().includes(t))) {
      return '#FF5733'; // Highlighted color (orange)
    }
    return '#8884d8'; // Default color (purple)
  };

  // Determine point size based on whether it's highlighted
  const getPointSize = (team) => {
    if (highlightedTeams.length > 0 && highlightedTeams.some(t => team.toString().includes(t))) {
      return 150; // Larger size for highlighted teams
    }
    return 100; // Default size
  };
  
  return (
    <div className={styles.scatterPlotContainer}>
      <h1>Coral vs Algae Scoring</h1>
      <div className={styles.teamFilterContainer}>
        <input 
          type="text" 
          placeholder="Highlight teams (comma separated)" 
          value={teamHighlight}
          onChange={(e) => setTeamHighlight(e.target.value)}
          className={styles.teamFilterInput}
        />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart
          margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        >
          <CartesianGrid />
          <XAxis 
            type="number" 
            dataKey="x" 
            name="Coral"
            label={{ value: 'Total Coral', position: 'bottom', offset: 0 }}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name="Algae" 
            label={{ value: 'Total Algae', angle: -90, position: 'insideLeft' }}
          />
          <ZAxis 
            type="number" 
            dataKey="z" 
            range={[30, 400]} 
            name="Matches" 
          />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
          {/* Render background points (regular teams) */}
          <Scatter 
            name="Teams" 
            data={teamData}
            fill="#8884d8" 
            onClick={(data) => {
              window.open(`/team-view?team=${data.team}`, '_blank');
            }}
          />
          {/* Render highlighted teams if any */}
          {highlightedTeams.length > 0 && (
            <Scatter
              name="Highlighted Teams"
              data={teamData.filter(team => 
                highlightedTeams.some(t => team.team.toString() === t) // Exact match, not includes
              )}
              fill="#FF5733"
              onClick={(data) => {
                window.open(`/team-view?team=${data.team}`, '_blank');
              }}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the data length has changed or data is loaded for the first time
  if (!prevProps.teamData && nextProps.teamData) return false;
  if (!nextProps.teamData && prevProps.teamData) return false;
  if (prevProps.teamData.length !== nextProps.teamData.length) return false;
  
  // Consider it equal (don't re-render) in all other cases
  return true;
});

export default function Picklist() {
  const [fields, setFields] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [maxScore, setMaxScore] = useState(1);
  const [teamsToExclude, setTeamsToExclude] = useState(new Array(24));
  const [allianceData, setAllianceData] = useState({});
  const [weights, setWeights] = useState({});
  const [teamRatings, setTeamRatings] = useState({});
  const [weightsChanged, setWeightsChanged] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [teamData, setTeamData] = useState([]);
  const [eventCode, setEventCode] = useState('2025mil'); // Default event code
  const [fetchingAlliances, setFetchingAlliances] = useState(false);
  const [currentUserTeam, setCurrentUserTeam] = useState(''); // Add current user team state

  const weightsFormRef = useRef();
  const alliancesFormRef = useRef();

  const greenToRedColors = ["#9ADC83", "#BECC72", "#E1BB61", "#F0A56C", "#FF8E76"];

  // Function to process raw match data into coral vs algae scatter plot data
  function processTeamData(rows) {
    console.log('Processing team data with', rows.length, 'rows');
    // Check if rows is valid
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.error('Invalid or empty rows data:', rows);
      return [];
    }
    
    // Log a sample row to see the structure
    console.log('Sample data row:', JSON.stringify(rows[0]));
    
    // Group by team
    const teamMap = {};
    
    let processedCount = 0;
    let skippedCount = 0;
    
    rows.forEach(row => {
      // Skip invalid rows
      if (!row || typeof row !== 'object' || !row.team) {
        skippedCount++;
        return;
      }
      
      if (!teamMap[row.team]) {
        teamMap[row.team] = {
          team: row.team,
          totalCoral: 0,
          totalAlgae: 0,
          matches: 0
        };
      }
      
      // Sum up coral successes (auto and tele)
      // Safely access properties with fallbacks to 0
      const autoCoralSuccesses = (Number(row.autol1success) || 0) + (Number(row.autol2success) || 0) + 
                               (Number(row.autol3success) || 0) + (Number(row.autol4success) || 0);
                               
      const teleCoralSuccesses = (Number(row.telel1success) || 0) + (Number(row.telel2success) || 0) + 
                                (Number(row.telel3success) || 0) + (Number(row.telel4success) || 0);
                                
      // Sum up algae (auto and tele)
      const autoAlgae = (Number(row.autonetprocessorsuccess) || 0) + (Number(row.autonetsuccess) || 0);
      const teleAlgae = (Number(row.teleprocessorsuccess) || 0) + (Number(row.telenetsuccess) || 0);
      
      teamMap[row.team].totalCoral += (autoCoralSuccesses + teleCoralSuccesses);
      teamMap[row.team].totalAlgae += (autoAlgae + teleAlgae);
      teamMap[row.team].matches += 1;
      processedCount++;
    });
    
    console.log(`Processed ${processedCount} rows, skipped ${skippedCount} invalid rows`);
    console.log(`Created data for ${Object.keys(teamMap).length} teams`);
    
    // Convert to array and filter out teams with no matches
    const result = Object.values(teamMap)
      .filter(team => team.matches > 0)
      .map(team => ({
        team: team.team,
        x: team.totalCoral, // X-axis: Coral
        y: team.totalAlgae, // Y-axis: Algae
        z: team.matches     // Z-axis (size): Number of matches
      }));
    
    console.log(`Final result has ${result.length} teams`);
    
    // Log a sample processed team
    if (result.length > 0) {
      console.log('Sample processed team:', result[0]);
    }
    
    return result;
  }

  // Function to fetch data for all teams
  async function fetchTeamData() {
    try {
      console.log('Fetching team data for coral vs algae graph');
      
      // Create headers for the request
      const headers = {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'X-Source-Page': 'picklist' // Custom header to identify requests from picklist
      };
      
      // Add Authorization header with team information if available
      if (currentUserTeam) {
        // Use the same Basic auth format as other requests in the app
        headers['Authorization'] = `Basic ${btoa(`${currentUserTeam}:`)}`;
        console.log(`Adding Authorization header for team: ${currentUserTeam}`);
      }
      
      console.log('Sending request to /api/get-data with headers:', JSON.stringify(headers));
      
      // Use credentials: 'include' to send cookies with the request
      const response = await fetch('/api/get-data', {
        method: 'GET',
        credentials: 'include', // Keep this to include cookies
        headers,
        // Add cache busting parameter
        cache: 'no-store'
      });
      
      // Log the response status and headers
      console.log(`Response status: ${response.status}, statusText: ${response.statusText}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch data with status: ${response.status}, statusText: ${response.statusText}`);
        
        // Try to read the error message from the response
        try {
          const errorData = await response.json();
          console.error('Error details:', errorData);
          throw new Error(`Failed to fetch data: ${errorData.error || response.statusText}`);
        } catch (parseError) {
          throw new Error(`Failed to fetch data with status: ${response.status}`);
        }
      }
      
      // Parse the response as text first to debug
      const responseText = await response.text();
      console.log(`Response text (first 100 chars): ${responseText.substring(0, 100)}...`);
      
      // Then parse as JSON
      const data = JSON.parse(responseText);
      
      if (data.error) {
        console.error('Error in fetch response:', data.error);
        setTeamData([]);
        return;
      }
      
      if (!data.rows || data.rows.length === 0) {
        console.log('No data rows returned');
        setTeamData([]);
        return;
      }
      
      console.log(`Fetched ${data.rows.length} data rows for graph`);
      
      // Log a sample row to see the structure
      if (data.rows.length > 0) {
        console.log('Sample row:', JSON.stringify(data.rows[0]));
      }
      
      // Process data to calculate total coral and algae per team
      const processedData = processTeamData(data.rows);
      console.log(`Processed team data into ${processedData.length} teams`);
      setTeamData(processedData);
      
      // If there's a user team in the response, update the state
      if (data.userTeam && !currentUserTeam) {
        setCurrentUserTeam(data.userTeam);
        console.log('Updated current user team to:', data.userTeam);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
      setTeamData([]);
    }
  }

  // Split the initialization into separate effects to avoid unnecessary re-fetches
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    // Get the current user's team from auth cookie or localStorage
    try {
      // Try to get the current user team from localStorage
      const storedTeam = localStorage.getItem('userTeam');
      if (storedTeam) {
        console.log('Using stored team from localStorage:', storedTeam);
        setCurrentUserTeam(storedTeam);
      } else {
        // Updated auth cookie parsing logic
        console.log('Checking auth cookies...');
        const cookies = {};
        document.cookie.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            // Join with = in case the value itself contains = characters
            const value = parts.slice(1).join('=');
            cookies[key] = value;
          }
        });
        
        console.log('Available cookies:', Object.keys(cookies));
        
        // Check for auth_session cookie in any of its variants
        const possibleAuthCookies = ['auth_session', 'auth_session_lax', 'auth_session_secure'];
        let foundTokenData = null;
        
        for (const cookieName of possibleAuthCookies) {
          if (cookies[cookieName]) {
            try {
              console.log(`Found ${cookieName} cookie`);
              // Try to decode and parse
              const decodedCookie = decodeURIComponent(cookies[cookieName]);
              const tokenData = JSON.parse(decodedCookie);
              
              if (tokenData && tokenData.team) {
                console.log(`Valid team found in ${cookieName}:`, tokenData.team);
                foundTokenData = tokenData;
                break;
              }
            } catch (e) {
              console.log(`Error parsing ${cookieName}:`, e.message);
            }
          }
        }
        
        // If we found valid token data, use it
        if (foundTokenData && foundTokenData.team) {
          console.log('Setting current user team to:', foundTokenData.team);
          setCurrentUserTeam(foundTokenData.team);
          localStorage.setItem('userTeam', foundTokenData.team);
        } else {
          // No valid auth cookie found - default to a value or try hardcoding a team for testing
          console.log('No valid auth cookie found. Using default team.');
          // For testing, you can uncomment and set a default team:
          // setCurrentUserTeam('5895');
          
          // Check for any cookie that might have team info
          for (const [key, value] of Object.entries(cookies)) {
            if (key.includes('auth') || key.includes('team') || key.includes('session')) {
              console.log(`Potential auth cookie ${key}:`, value.substring(0, 50) + (value.length > 50 ? '...' : ''));
              // Try to extract "team" from the value if it looks like JSON
              if (value.includes('"team"')) {
                try {
                  const jsonValue = JSON.parse(decodeURIComponent(value));
                  if (jsonValue && jsonValue.team) {
                    console.log('Found team in cookie value:', jsonValue.team);
                    setCurrentUserTeam(jsonValue.team);
                    localStorage.setItem('userTeam', jsonValue.team);
                    break;
                  }
                } catch (e) {
                  // Ignore parse errors for non-JSON cookies
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error getting user team:', e);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlWeights = Object.fromEntries(urlParams);
    setWeights(urlWeights);

    // Check for event code in URL
    if (urlParams.has('eventCode')) {
      setEventCode(urlParams.get('eventCode'));
    }

    const storedRatings = localStorage.getItem('teamRatings');
    if (storedRatings) {
      setTeamRatings(JSON.parse(storedRatings));
    }

    const urlAlliances = {};
    let urlTeamsToExclude = teamsToExclude;
    for (const [key, value] of urlParams.entries()) {
      // Check for alliance team parameters in various formats
      if (key.startsWith('A') && key.includes('T')) {
        // Original format: A1T1 (Alliance 1, Position 1)
        const [, allianceNumber, teamPosition] = key.match(/A(\d+)T(\d+)/);
        if (!urlAlliances[allianceNumber]) {
          urlAlliances[allianceNumber] = [];
        }
        urlAlliances[allianceNumber][parseInt(teamPosition) - 1] = value;
        urlTeamsToExclude[((allianceNumber - 1) * 4) + (teamPosition-1)] = +value;
      } else if (key.startsWith('T') && key.includes('A')) {
        // Format: T1A1 (Alliance 1, Position 1 is team 341)
        const matches = key.match(/T(\d+)A(\d+)/);
        if (matches) {
          const allianceNumber = matches[1];
          const position = matches[2];
          
          if (!urlAlliances[allianceNumber]) {
            urlAlliances[allianceNumber] = [];
          }
          urlAlliances[allianceNumber][parseInt(position) - 1] = value;
          urlTeamsToExclude[((allianceNumber - 1) * 4) + (parseInt(position)-1)] = +value;
        }
      }
    }
    setAllianceData(urlAlliances);
    setTeamsToExclude(urlTeamsToExclude);
  }, [isClient]);

  // Separate effect for data fetching
  useEffect(() => {
    if (isClient) {
      fetchTeamData();
    }
  }, [isClient]);

  async function recalculate(event) {
    const formData = new FormData(weightsFormRef.current);
    const weightEntries = [...formData.entries()];
    const newWeights = Object.fromEntries(weightEntries);
    setWeights(newWeights);

    // Generate URL parameters in T1A1 format (Alliance 1, Position 1 is team 341)
    const urlParams = new URLSearchParams([
      ...weightEntries, 
      ...Object.entries(allianceData).flatMap(([allianceNumber, teams]) => 
        teams.map((team, index) => [`T${allianceNumber}A${index + 1}`, team])
      )
    ]);
    window.history.replaceState(null, '', `?${urlParams.toString()}`);
    
    try {
      const response = await fetch('/api/compute-picklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${btoa(`${currentUserTeam || 'guest'}:`)}`
        },
        body: JSON.stringify(weightEntries)
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      const picklist = JSON.parse(text);
      
      if (picklist && picklist.length > 0) {
        setPicklist(picklist);
        setMaxScore(picklist[0].score);
        setWeightsChanged(false);
      } else {
        console.error('Received empty picklist array');
      }
    } catch (error) {
      console.error('Error calculating picklist:', error);
      alert('Error calculating picklist. Please check the console for details.');
    }
  }

  function updateAlliancesData(allianceNumber, allianceTeams) {
    let formData = new FormData(alliancesFormRef.current);
    let teams = [...formData.entries()].map(entry => +entry[1]);
    setTeamsToExclude(teams);

    let updateAllianceData = {
      ...allianceData,
      [allianceNumber]: allianceTeams
    }

    // Generate URL parameters in T1A1 format (Alliance 1, Position 1 is team 341)
    const urlParams = new URLSearchParams([
      ...Object.entries(weights), 
      ...Object.entries(updateAllianceData).flatMap(([allianceNumber, teams]) => 
        teams.map((team, index) => [`T${allianceNumber}A${index + 1}`, team])
      )
    ]);
    window.history.replaceState(null, '', `?${urlParams.toString()}`);
  };

  // Fetch alliance selections from The Blue Alliance API
  async function fetchTBAAlliances() {
    try {
      setFetchingAlliances(true);
      const response = await fetch(`/api/get-alliance-selections?eventCode=${eventCode}`, {
        headers: {
          'Authorization': `Basic ${btoa(`${currentUserTeam || 'guest'}:`)}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('TBA API Error Response:', errorData);
        
        // Specific message for 404 errors which likely indicate the event doesn't have alliance data yet
        if (response.status === 404) {
          throw new Error(`No alliance data found for event code: ${eventCode}. This event may not have completed alliance selections yet, or the event code may be incorrect. Try using a past event code like '2023cmptx' or '2024gal'.`);
        }
        
        throw new Error(`Failed to fetch alliances: ${response.status}${errorData.message ? ' - ' + errorData.message : ''}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.alliances) {
        throw new Error('Invalid alliance data format');
      }
      
      if (!Array.isArray(data.alliances) || data.alliances.length === 0) {
        throw new Error('No alliance data available for this event');
      }
      
      // Transform the data to match our alliance data format
      const newAllianceData = {};
      
      data.alliances.forEach((alliance, index) => {
        const allianceNumber = (index + 1).toString();
        // The API returns teams as "frc123", so we need to remove the "frc" prefix
        const teams = alliance.picks.map(team => team.replace('frc', ''));
        newAllianceData[allianceNumber] = teams;
      });
      
      setAllianceData(newAllianceData);
      
      // Update teams to exclude
      const teamsArray = new Array(24);
      Object.entries(newAllianceData).forEach(([allianceNumber, teams]) => {
        teams.forEach((team, index) => {
          teamsArray[((parseInt(allianceNumber) - 1) * 3) + index] = parseInt(team);
        });
      });
      
      setTeamsToExclude(teamsArray);
      
      // Update URL with new alliance data
      const urlParams = new URLSearchParams([
        ['eventCode', eventCode], // Include the event code in the URL
        ...Object.entries(weights),
        ...Object.entries(newAllianceData).flatMap(([allianceNumber, teams]) => 
          teams.map((team, index) => [`T${allianceNumber}A${index + 1}`, team])
        )
      ]);
      window.history.replaceState(null, '', `?${urlParams.toString()}`);
      
    } catch (error) {
      console.error('Error fetching TBA alliances:', error);
      alert(`Error fetching alliance data: ${error.message || 'Unknown error'}\n\nPossible reasons:\n1. The Blue Alliance API key may not be set up\n2. The event might not have alliance selections yet\n3. The event code may be incorrect`);
    } finally {
      setFetchingAlliances(false);
    }
  }

  const Weights = () => {
    const handleWeightChange = (e) => {
      setWeightsChanged(true);
      const { name, value } = e.target;
      setWeights(prevWeights => ({ ...prevWeights, [name]: parseFloat(value) }));
    }

    // BIG MUST: CHANGE THE BACKEND LOGIC FOR EACH OF THESE NEW VALUE NAMES
    return <table className={styles.weightsTable}>
      <tbody>
        <tr style={{ height: '50px' }}>
          <td><label htmlFor="epa">EPA:</label></td>
          <td><input id="epa" type="number" value={weights.epa || 0} name="epa" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="epa3">3 EPA:</label></td>
          <td><input id="epa3" type="number" value={weights.epa3 || 0} name="epa3" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="auto">Auto Pts:</label></td>
          <td><input id="auto" type="number" value={weights.auto || 0} name="auto" onChange={handleWeightChange}></input></td>
        </tr>
        <tr style={{ height: '50px' }}>
          <td><label htmlFor="tele">Tele Pts:</label></td>
          <td><input id="tele" type="number" value={weights.tele || 0} name="tele" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="consistency">Cnstcy:</label></td>
          <td><input id="consistency" type="number" value={weights.consistency || 0} name="consistency" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="coral">Coral Focus:</label></td>
          <td><input id="coral" type="number" value={weights.coral || 0} name="coral" onChange={handleWeightChange}></input></td>
        </tr>
        <tr style={{ height: '50px' }}>
          <td><label htmlFor="algae">Algae Focus:</label></td>
          <td><input id="algae" type="number" value={weights.algae || 0} name="algae" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="defense">Defense:</label></td>
          <td><input id="defense" type="number" value={weights.defense || 0} name="defense" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="breakdown">Break %:</label></td>
          <td><input id="breakdown" type="number" value={weights.breakdown || 0} name="breakdown" onChange={handleWeightChange}></input></td>
        </tr>
        <tr style={{ height: '50px' }}>
          <td><label htmlFor="avgCoral">Avg Coral:</label></td>
          <td><input id="avgCoral" type="number" value={weights.avgCoral || 0} name="avgCoral" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="avgNet">Avg Net:</label></td>
          <td><input id="avgNet" type="number" value={weights.avgNet || 0} name="avgNet" onChange={handleWeightChange}></input></td>
          <td><label htmlFor="avgProcessor">Avg Prcsr:</label></td>
          <td><input id="avgProcessor" type="number" value={weights.avgProcessor || 0} name="avgProcessor" onChange={handleWeightChange}></input></td>
        </tr>
      </tbody>
    </table>
  }

  function CommentCell({ team }) {
    const [comment, setComment] = useState('');
    const [mounted, setMounted] = useState(false);
  
    useEffect(() => {
      setMounted(true);
      const savedComments = localStorage.getItem('teamComments');
      if (savedComments) {
        const comments = JSON.parse(savedComments);
        setComment(comments[team] || '');
      }
    }, [team]);
  
    const handleChange = (e) => {
      const newComment = e.target.value;
      setComment(newComment);
      
      const savedComments = JSON.parse(localStorage.getItem('teamComments') || '{}');
      savedComments[team] = newComment;
      localStorage.setItem('teamComments', JSON.stringify(savedComments));
    };
  
    if (!mounted) {
      return <textarea className={styles.commentBox} />;
    }
  
    return (
      <textarea 
        value={comment}
        onChange={handleChange}
        className={styles.commentBox}
      />
    );
  }

  const AllianceRow = ({ allianceNumber, allianceData, handleAllianceChange }) => {
    const firstValue = allianceData ? allianceData[0] : '';
    const secondValue = allianceData ? allianceData[1] : '';
    const thirdValue = allianceData ? allianceData[2] : '';
    return (
      <tr>
        <td>A{allianceNumber}</td>
        <td><label htmlFor={`A${allianceNumber}T1`}></label><input name={`A${allianceNumber}T1`} type="number" defaultValue={firstValue}
          onBlur={e => {
            handleAllianceChange(allianceNumber, [e.target.value, secondValue, thirdValue]);
          }}></input></td>
        <td><label htmlFor={`A${allianceNumber}T2`}></label><input name={`A${allianceNumber}T2`} type="number" defaultValue={secondValue}
          onBlur={e => {
            handleAllianceChange(allianceNumber, [firstValue, e.target.value, thirdValue])
          }}></input></td>
        <td><label htmlFor={`A${allianceNumber}T3`}></label><input name={`A${allianceNumber}T3`} type="number" defaultValue={thirdValue}
          onBlur={e => {
            handleAllianceChange(allianceNumber, [firstValue, secondValue, e.target.value])
          }}></input></td>
      </tr>
    )
  };

  const handleAllianceChange = (allianceNumber, allianceTeams) => {
    setAllianceData({
      ...allianceData,
      [allianceNumber]: allianceTeams
    });
    updateAlliancesData(allianceNumber, allianceTeams);
  };

  function PicklistTable() {
    
    const valueToColor = (value) => {
      if (value > 0.8) return greenToRedColors[0];
      if (value > 0.6) return greenToRedColors[1];
      if (value > 0.4) return greenToRedColors[2];
      if (value > 0.2) return greenToRedColors[3];
      return greenToRedColors[4];
    };

    // Inverse color function for breakdown (where 0% is good, 100% is bad)
    const inverseValueToColor = (value) => {
      if (value < 0.2) return greenToRedColors[0]; // 0-20% breakdown is great (green)
      if (value < 0.4) return greenToRedColors[1];
      if (value < 0.6) return greenToRedColors[2];
      if (value < 0.8) return greenToRedColors[3];
      return greenToRedColors[4]; // 80-100% breakdown is bad (red)
    };

    function handleThumbsUp(team) {
      const newRatings = { ...teamRatings, [team]: true };
      setTeamRatings(newRatings);
      localStorage.setItem('teamRatings', JSON.stringify(newRatings));
    }
  
    function handleThumbsDown(team) {
      const newRatings = { ...teamRatings, [team]: false };
      setTeamRatings(newRatings);
      localStorage.setItem('teamRatings', JSON.stringify(newRatings));
    }
  
    function handleMeh(team) {
      const newRatings = { ...teamRatings, [team]: undefined };
      setTeamRatings(newRatings);
      localStorage.setItem('teamRatings', JSON.stringify(newRatings));
    }
    

    if (!picklist || picklist.length === 0) {
      return (
        <div className={styles.picklistContainer}>
          <h1>Picklist</h1>
          <span>Hit recalculate to view the picklist according to the weights you entered...</span>
        </div>
      );
    }
    

    const roundToThree = (x) => Math.round(x * 1000) / 1000;
    const roundToOne = (x) => Math.round(x * 10) / 10;
    

    return (
      <div className={styles.picklistContainer}>
        <h1>Picklist</h1>
        {/* <div className={styles.picklistTableContainer}> */}
          <table className={styles.picklistTable} id="teamTable">
          <thead>
          <tr>
            <th>Picklist Rank</th>
            <th>TBA Rank</th>
            <th>Team</th>
            <th>Norm EPA</th>
            <th>Real EPA</th>
            <th>Norm 3 EPA</th>
            <th>Real 3 EPA</th>
            <th>Auto Points</th>
            <th>Tele Points</th>
            <th>Cnstcy</th>
            <th>Coral Focus</th>
            <th>Algae Focus</th>
            <th>Avg Defense Rating</th>
            <th>Break %</th>
            <th>Avg Coral</th>
            <th>Avg Net</th>
            <th>Avg Prcsr</th>
            <th>Rating</th>
            <th>Comments</th>
          </tr>
        </thead>
        <tbody>
            {picklist.map((teamData, index) => {
              if (teamsToExclude.includes(teamData.team)) {
                return <tr key={teamData.team} style={{display: "none"}}></tr>
              } else {
                const displayRank = `#${index + 1}`;
                const tbaRank = (teamData.tbaRank !== -1 ? `${teamData.tbaRank}` : "");
                
                return (
                  <tr key={teamData.team}>
                    <td>
                      <div className={styles.picklistRank}>
                        {/* <div className={styles.arrows}>
                          <button onClick={() => handleUp()}>⬆️</button>
                          <button onClick={() => handleDown()}>⬇️</button>
                        </div> */}
                        {displayRank}
                      </div>
                    </td>
                      <td>#{tbaRank}</td>
                      <td><a href={`/team-view?team=${teamData.team}`}>{teamData.team}
                        {teamRatings[teamData.team] === true && '✅'}
                        {teamRatings[teamData.team] === false && '❌'}
                        </a>
                      </td>
                      <td style={{ backgroundColor: valueToColor(teamData.epa) }}>{roundToThree(teamData.epa)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.epa) }}>{teamData.realEpa ? roundToOne(teamData.realEpa) : 'N/A'}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.epa3 || 0) }}>{roundToThree(teamData.epa3 || 0)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.epa3 || 0) }}>{teamData.realEpa3 ? roundToOne(teamData.realEpa3) : 'N/A'}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.auto) }}>{roundToThree(teamData.auto)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.tele) }}>{roundToThree(teamData.tele)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.consistency) }}>{roundToThree(teamData.consistency)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.coral) }}>{roundToThree(teamData.coral)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.algae) }}>{roundToThree(teamData.algae)}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.defense) }}>{teamData.realDefense ? roundToOne(teamData.realDefense) : '0'}</td>
                      <td style={{ backgroundColor: inverseValueToColor(teamData.breakdown || 0) }}>{teamData.breakdown ? `${roundToOne(teamData.breakdown * 100)}%` : '0%'}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.avgCoral) }}>{teamData.realAvgCoral ? roundToOne(teamData.realAvgCoral) : '0'}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.avgNet) }}>{teamData.realAvgNet ? roundToOne(teamData.realAvgNet) : '0'}</td>
                      <td style={{ backgroundColor: valueToColor(teamData.avgProcessor) }}>{teamData.realAvgProcessor ? roundToOne(teamData.realAvgProcessor) : '0'}</td>
                      <td>
                        {teamRatings[teamData.team] !== true &&
                          <button onClick={() => handleThumbsUp(teamData.team)}>✅</button>
                        }
                        {teamRatings[teamData.team] !== false &&
                          <button onClick={() => handleThumbsDown(teamData.team)}>❌</button>
                        }
                        {teamRatings[teamData.team] !== undefined &&
                          <button onClick={() => handleMeh(teamData.team)}>🫳</button>
                        }
                      </td>
                      <td>  
                        <CommentCell team={teamData.team} />
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        {/* </div> */}
      </div>
    );
  };

  function AllianceMatchView() {
  
    const handleMatchViewSubmit = (e) => {
      e.preventDefault();
      const redAlliance = e.target.redAlliance.value;
      const blueAlliance = e.target.blueAlliance.value;
  
      // Find the teams for the selected red and blue alliances
      const redTeams = allianceData[redAlliance] || [];
      const blueTeams = allianceData[blueAlliance] || [];
  
      // Construct the URL with the teams
      const matchViewParams = new URLSearchParams({
        team1: redTeams[0] || '',
        team2: redTeams[1] || '',
        team3: redTeams[2] || '',
        team4: blueTeams[0] || '',
        team5: blueTeams[1] || '',
        team6: blueTeams[2] || '',
        go: 'go',
        match: ''
      });
  
      // Navigate to match view
      window.location.href = `/match-view?${matchViewParams.toString()}`;
    };
  
    return (
      <form onSubmit={handleMatchViewSubmit}>
        <div className={styles.allianceMatchView}>
          <div className={styles.red}>
            <label style={{color: "red"}} htmlFor="redAlliance">Red:</label>
            <input className={styles.redInput} name="redAlliance" type="number" min="1" max="8" ></input>
          </div>
          <div className={styles.blue}>
            <label style={{color: "blue"}} htmlFor="blueAlliance">Blue:</label>
            <input className={styles.blueInput} name="blueAlliance" type="number" min="1" max="8" ></input>
          </div>
          <button type="submit">Go!</button>
        </div>
      </form>
    );
  }

  if (!isClient) {
    return <div>Loading...</div>;
  }

  return (
    <div className={styles.MainDiv}>
      <div>
        <form ref={weightsFormRef} className={styles.weightsForm}>
          <div className={styles.weights}>
            <h1>Weights</h1>
            <Weights></Weights>
          </div>
          <button type="button" onClick={recalculate} style={{
            marginBottom: '30px',
            fontSize: "20px",
          }} className={weightsChanged ? styles.recalculateIsMad : ""}>Recalculate Picklist</button>
        </form>
        
        {/* Use the memoized scatter plot component */}
        <MemoizedScatterPlot teamData={teamData} />
        
        <div className={styles.alliances}>
          <h1>Alliances</h1>
          <div className={styles.tbaFetchContainer}>
            <div className={styles.eventCodeInput}>
              <label htmlFor="eventCode">Event Code:</label>
              <input 
                id="eventCode" 
                type="text" 
                value={eventCode} 
                onChange={(e) => setEventCode(e.target.value)}
                placeholder="e.g. 2025mil"
              />
            </div>
            <button 
              type="button" 
              onClick={fetchTBAAlliances}
              disabled={fetchingAlliances}
              className={styles.tbaFetchButton}
            >
              {fetchingAlliances ? 'Fetching...' : 'TBA Fetch'}
            </button>
          </div>
          <div className={styles.wholeAlliance}>
            <form ref={alliancesFormRef}>
              <table className={styles.allianceTable}>
                <thead>
                  <tr key="head">
                    <th></th>
                    <th>T1</th>
                    <th>T2</th>
                    <th>T3</th>
                  </tr>
                </thead>
                <tbody>
                  <AllianceRow allianceNumber={"1"} allianceData={allianceData["1"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"2"} allianceData={allianceData["2"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"3"} allianceData={allianceData["3"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"4"} allianceData={allianceData["4"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"5"} allianceData={allianceData["5"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"6"} allianceData={allianceData["6"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"7"} allianceData={allianceData["7"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                  <AllianceRow allianceNumber={"8"} allianceData={allianceData["8"]} handleAllianceChange={handleAllianceChange}></AllianceRow>
                </tbody>
              </table>
            </form>
            <AllianceMatchView/>
          </div>
        </div>
      </div>
      <PicklistTable></PicklistTable>
    </div>
  )
}