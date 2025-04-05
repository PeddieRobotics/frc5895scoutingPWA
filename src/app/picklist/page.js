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

  const weightsFormRef = useRef();
  const alliancesFormRef = useRef();

  const greenToRedColors = ["#9ADC83", "#BECC72", "#E1BB61", "#F0A56C", "#FF8E76"];

  // Function to process raw match data into coral vs algae scatter plot data
  function processTeamData(rows) {
    // Group by team
    const teamMap = {};
    
    rows.forEach(row => {
      if (!teamMap[row.team]) {
        teamMap[row.team] = {
          team: row.team,
          totalCoral: 0,
          totalAlgae: 0,
          matches: 0
        };
      }
      
      // Sum up coral successes (auto and tele)
      const autoCoralSuccesses = (row.autol1success || 0) + (row.autol2success || 0) + 
                                (row.autol3success || 0) + (row.autol4success || 0);
                                
      const teleCoralSuccesses = (row.telel1success || 0) + (row.telel2success || 0) + 
                                (row.telel3success || 0) + (row.telel4success || 0);
                                
      // Sum up algae (auto and tele)
      const autoAlgae = (row.autonetprocessorsuccess || 0) + (row.autonetsuccess || 0);
      const teleAlgae = (row.teleprocessorsuccess || 0) + (row.telenetsuccess || 0);
      
      teamMap[row.team].totalCoral += (autoCoralSuccesses + teleCoralSuccesses);
      teamMap[row.team].totalAlgae += (autoAlgae + teleAlgae);
      teamMap[row.team].matches += 1;
    });
    
    // Convert to array and filter out teams with no matches
    return Object.values(teamMap)
      .filter(team => team.matches > 0)
      .map(team => ({
        team: team.team,
        x: team.totalCoral, // X-axis: Coral
        y: team.totalAlgae, // Y-axis: Algae
        z: team.matches     // Z-axis (size): Number of matches
      }));
  }

  // Function to fetch data for all teams - moved outside of useEffect
  async function fetchTeamData() {
    try {
      const response = await fetch('/api/get-data');
      if (!response.ok) {
        throw new Error(`Failed to fetch data with status: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || !data.rows) {
        throw new Error('Invalid data format received');
      }
      
      // Process data to calculate total coral and algae per team
      const processedData = processTeamData(data.rows);
      setTeamData(processedData);
    } catch (error) {
      console.error('Error fetching team data:', error);
    }
  }

  // Split the initialization into separate effects to avoid unnecessary re-fetches
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const urlParams = new URLSearchParams(window.location.search);
    const urlWeights = Object.fromEntries(urlParams);
    setWeights(urlWeights);

    const storedRatings = localStorage.getItem('teamRatings');
    if (storedRatings) {
      setTeamRatings(JSON.parse(storedRatings));
    }

    const urlAlliances = {};
    let urlTeamsToExclude = teamsToExclude;
    for (const [key, value] of urlParams.entries()) {
      if (key.startsWith('A')) {
        const [, allianceNumber, teamPosition] = key.match(/A(\d+)T(\d+)/);
        if (!urlAlliances[allianceNumber]) {
          urlAlliances[allianceNumber] = [];
        }
        urlAlliances[allianceNumber][parseInt(teamPosition) - 1] = value;
        urlTeamsToExclude[((allianceNumber - 1) * 4) + (teamPosition-1)] = +value;
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

    const urlParams = new URLSearchParams([...weightEntries, ...Object.entries(allianceData).flatMap(([allianceNumber, teams]) => teams.map((team, index) => [`T${allianceNumber}A${index + 1}`, team]))]);
    window.history.replaceState(null, '', `?${urlParams.toString()}`);
    
    try {
      const response = await fetch('/api/compute-picklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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

    const urlParams = new URLSearchParams([...Object.entries(weights), ...Object.entries(updateAllianceData).flatMap(([allianceNumber, teams]) => teams.map((team, index) => [`A${allianceNumber}T${index + 1}`, team]))]);
    window.history.replaceState(null, '', `?${urlParams.toString()}`);
  };

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