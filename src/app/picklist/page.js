'use client';

import styles from "./page.module.css";
import { Fragment, useEffect, useState, useRef, useMemo } from "react";
import useGameConfig from "../../lib/useGameConfig";
import TeamScatterPlot from "../components/TeamScatterPlot";


export default function Picklist() {
  const { config, gameId, loading: configLoading } = useGameConfig();

  const [fields, setFields] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [maxScore, setMaxScore] = useState(1);
  const [teamsToExclude, setTeamsToExclude] = useState(new Array(24));
  const [allianceData, setAllianceData] = useState({});
  const [weights, setWeights] = useState({});
  const [teamRatings, setTeamRatings] = useState({});
  const [weightsChanged, setWeightsChanged] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [scatterX, setScatterX] = useState('');
  const [scatterY, setScatterY] = useState('');
  const [scatterTeams, setScatterTeams] = useState([]);
  const [eventCode, setEventCode] = useState('');
  const [fetchingAlliances, setFetchingAlliances] = useState(false);
  const [currentUserTeam, setCurrentUserTeam] = useState(''); // Add current user team state
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Add authentication state
  const [unscoredMatches, setUnscoredMatches] = useState([]);

  const weightsFormRef = useRef();
  const alliancesFormRef = useRef();

  const greenToRedColors = ["#9ADC83", "#BECC72", "#E1BB61", "#F0A56C", "#FF8E76"];

  // ── Derive picklist config from game config ──

  const picklistConfig = config?.display?.picklist || {};


  const weightsConfig = picklistConfig.weights || [];
  const tableColumnsConfig = picklistConfig.tableColumns || [];
  const scatterFieldsConfig = picklistConfig.scatterFields || [];

  const weightsFirstKey = weightsConfig[0]?.key ?? null;
  const scatterFirstKey = scatterFieldsConfig[0]?.key ?? null;

  // Initialize scatter axis defaults when config loads
  useEffect(() => {
    if (!scatterFirstKey && !weightsFirstKey) return;
    setScatterX(prev => prev || scatterFieldsConfig[0]?.key || weightsConfig[0]?.key || '');
    setScatterY(prev => prev || scatterFieldsConfig[1]?.key || weightsConfig[1]?.key || scatterFieldsConfig[0]?.key || '');
  }, [scatterFirstKey, weightsFirstKey]);

  // Auto-fetch scatter data independently (no manual recalculation required)
  useEffect(() => {
    if (!isAuthenticated || (!weightsFirstKey && !scatterFirstKey)) return;
    const equalWeights = weightsConfig.map(w => [w.key, '1']);
    const headers = { 'Content-Type': 'application/json' };
    if (gameId) headers['X-Game-Id'] = String(gameId);
    fetch('/api/compute-picklist', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(equalWeights),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.teamTable) setScatterTeams(data.teamTable); })
      .catch(() => {});
  }, [isAuthenticated, gameId, weightsFirstKey, scatterFirstKey]);

  const resolveAxisValue = (t, key) => key === 'team' ? Number(t.team) : (t[key] ?? 0);
  const axisOptions = scatterFieldsConfig.length > 0 ? scatterFieldsConfig : weightsConfig;
  const resolveAxisLabel = (key) => key === 'team' ? 'Team Number' : (axisOptions.find(w => w.key === key)?.label ?? key);

  // Scatter data derived from auto-fetched team metrics
  const scatterData = useMemo(() =>
    scatterTeams.map(t => ({
      team: t.team,
      x: resolveAxisValue(t, scatterX),
      y: resolveAxisValue(t, scatterY),
      z: 1,
    })),
    [scatterTeams, scatterX, scatterY]
  );

  const formatUnscoredMatch = (issue) => {
    const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"][issue?.matchType] || `Type ${issue?.matchType}`;
    const matchLabel = issue?.displayMatch ?? issue?.match ?? "Unknown";
    return `Team ${issue?.team} - ${matchTypeLabel} Match ${matchLabel}: ${issue?.reason || "Missing scout-leads rate."}`;
  };

  // Simplified token validation
  useEffect(() => {
    if (!isClient) return;

    async function validateToken() {
      try {
        console.log('Validating token for scatter plot graph...');

        // First try to get data - if we can get data, we're authenticated
        const tokenParams = new URLSearchParams();
        if (gameId) tokenParams.set('gameId', String(gameId));
        const dataResponse = await fetch(`/api/get-data${tokenParams.toString() ? `?${tokenParams.toString()}` : ''}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Source-Page': 'picklist',
            'X-Token-Check': 'true'
          }
        });

        if (dataResponse.ok) {
          console.log('Successfully fetched data - user is authenticated');
          setIsAuthenticated(true);

          // Parse the data and use it
          const data = await dataResponse.json();
          setUnscoredMatches(Array.isArray(data.unscoredMatches) ? data.unscoredMatches : []);

          if (data.userTeam) {
            console.log('Setting team from data response:', data.userTeam);
            setCurrentUserTeam(data.userTeam);
          }

          return;
        }

        console.log(`Data fetch returned ${dataResponse.status} - trying explicit token validation`);

        // If that fails, try explicit token validation
        const tokenResponse = await fetch('/api/auth/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ validateOnly: true })
        });

        if (tokenResponse.ok) {
          try {
            const result = await tokenResponse.json();
            console.log('Token validation result:', result);

            const isValid = result.valid === true;
            console.log('Token is valid:', isValid);
            setIsAuthenticated(isValid);

            if (isValid && result.team) {
              setCurrentUserTeam(result.team);
            }
          } catch (parseError) {
            console.error('Error parsing token response:', parseError);
            setIsAuthenticated(false);
          }
        } else {
          console.log(`Token validation failed with status: ${tokenResponse.status}`);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error during auth check:', error);
        setIsAuthenticated(false);
      }
    }

    validateToken();
  }, [isClient, gameId]);

  // Set default event code from game config (URL param takes priority)
  useEffect(() => {
    if (config?.tbaEventCode && !eventCode) {
      setEventCode(config.tbaEventCode);
    }
  }, [config]);

  // Split the initialization into separate effects to avoid unnecessary re-fetches
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initialize data from URL parameters and localStorage
  useEffect(() => {
    if (!isClient) return;

    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlWeights = Object.fromEntries(urlParams);
    setWeights(urlWeights);

    // Check for event code in URL
    if (urlParams.has('eventCode')) {
      setEventCode(urlParams.get('eventCode'));
    }

    // Load team ratings from localStorage
    const storedRatings = localStorage.getItem('teamRatings');
    if (storedRatings) {
      setTeamRatings(JSON.parse(storedRatings));
    }

    // Parse alliance data from URL
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
        urlTeamsToExclude[((allianceNumber - 1) * 4) + (teamPosition - 1)] = +value;
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
          urlTeamsToExclude[((allianceNumber - 1) * 4) + (parseInt(position) - 1)] = +value;
        }
      }
    }
    setAllianceData(urlAlliances);
    setTeamsToExclude(urlTeamsToExclude);
  }, [isClient]);

  useEffect(() => {
    setPicklist([]);
    setScatterTeams([]);
    setUnscoredMatches([]);
  }, [gameId]);

  // Guard: if no picklist config, show fallback (must be after all hooks)
  if (!configLoading && !picklistConfig.weights) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h2>Picklist Not Configured</h2>
        <p>Add a &quot;picklist&quot; section to your game config&apos;s display settings.</p>
      </div>
    );
  }

  async function recalculate(event) {
    // Don't block based on client-side authentication state
    // Let the server validate the session through cookies

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
      // Create request headers
      const headers = {
        'Content-Type': 'application/json',
        'X-Source-Page': 'picklist'
      };
      if (gameId) {
        headers['X-Game-Id'] = String(gameId);
      }

      // Add Authorization header if we have client-side team info
      const storedCreds = (typeof window !== 'undefined') ? (sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials')) : null;
      if (storedCreds) {
        headers['Authorization'] = `Basic ${storedCreds}`;
      }

      const response = await fetch('/api/compute-picklist', {
        method: 'POST',
        headers,
        credentials: 'include', // Include cookies for session validation
        body: JSON.stringify(weightEntries)
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(`Unauthorized access. Please log in.`);
        }
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }

      const payload = JSON.parse(text);
      const nextPicklist = Array.isArray(payload) ? payload : (payload.teamTable || []);
      setUnscoredMatches(Array.isArray(payload.unscoredMatches) ? payload.unscoredMatches : []);

      // If we received valid data, update the team information
      if (payload && payload.userTeam && !currentUserTeam) {
        setCurrentUserTeam(payload.userTeam);
        localStorage.setItem('userTeam', payload.userTeam);
      }

      if (nextPicklist.length > 0) {
        setPicklist(nextPicklist);
        setMaxScore(nextPicklist[0].score);
        setWeightsChanged(false);
      } else {
        setPicklist([]);
        setMaxScore(1);
        setWeightsChanged(false);
        console.error('Received empty picklist array');
      }
    } catch (error) {
      console.error('Error calculating picklist:', error);
      alert('Error calculating picklist: ' + error.message);
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

      // Create request headers
      const headers = {
        'X-Source-Page': 'picklist'
      };

      // Add Authorization header if we have client-side team info
      const storedCreds = (typeof window !== 'undefined') ? (sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials')) : null;
      if (storedCreds) {
        headers['Authorization'] = `Basic ${storedCreds}`;
      }

      const response = await fetch(`/api/get-alliance-selections?eventCode=${eventCode}`, {
        headers,
        credentials: 'include' // Include cookies for session validation
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

    // Group weight items into rows of 3
    const rows = [];
    for (let i = 0; i < weightsConfig.length; i += 3) {
      rows.push(weightsConfig.slice(i, i + 3));
    }

    return (
      <div className={styles.weightsTableContainer}>
        <table className={styles.weightsTable}>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ height: '50px' }}>
                {row.map((w) => (
                  <Fragment key={w.key}>
                    <td><label htmlFor={w.key}>{w.label}:</label></td>
                    <td><input id={w.key} type="number" value={weights[w.key] || 0} name={w.key} onChange={handleWeightChange}></input></td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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

    const getColor = (col, teamData) => {
      if (col.colorScale === "normal") {
        return valueToColor(teamData[col.key]);
      }
      if (col.colorScale === "inverse") {
        return inverseValueToColor(teamData[col.key] || 0);
      }
      // For named scales (e.g. "epa", "defense", "avgCoral"), color by the normalized value
      return valueToColor(teamData[col.colorScale] || 0);
    };

    const roundToThree = (x) => Math.round(x * 1000) / 1000;
    const roundToOne = (x) => Math.round(x * 10) / 10;

    const formatValue = (col, teamData) => {
      const value = teamData[col.key];
      if (col.format === "three") {
        return roundToThree(value);
      }
      if (col.format === "one") {
        return value ? roundToOne(value) : '0';
      }
      if (col.format === "breakdownPercent") {
        return value ? `${roundToOne(value * 100)}%` : '0%';
      }
      return value;
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

    return (
      <div className={styles.picklistContainer}>
        <h1>Picklist</h1>
        <div className={styles.picklistTableContainer}>
          <table className={styles.picklistTable} id="teamTable">
            <thead>
              <tr>
                <th>Picklist Rank</th>
                <th>TBA Rank</th>
                <th>Team</th>
                {tableColumnsConfig.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {picklist.map((teamData, index) => {
                if (teamsToExclude.includes(teamData.team)) {
                  return <tr key={teamData.team} style={{ display: "none" }}></tr>
                } else {
                  const displayRank = `#${index + 1}`;
                  const tbaRank = (teamData.tbaRank !== -1 ? `${teamData.tbaRank}` : "");

                  return (
                    <tr key={teamData.team}>
                      <td>
                        <div className={styles.picklistRank}>
                          {displayRank}
                        </div>
                      </td>
                      <td>#{tbaRank}</td>
                      <td><a href={`/team-view?team=${teamData.team}`}>{teamData.team}
                        {teamRatings[teamData.team] === true && '\u2705'}
                        {teamRatings[teamData.team] === false && '\u274C'}
                      </a>
                      </td>
                      {tableColumnsConfig.map((col) => (
                        <td key={col.key} style={{ backgroundColor: getColor(col, teamData) }}>
                          {formatValue(col, teamData)}
                        </td>
                      ))}
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>
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
            <label style={{ color: "red" }} htmlFor="redAlliance">Red:</label>
            <input className={styles.redInput} name="redAlliance" type="number" min="1" max="8" />
          </div>
          <div className={styles.blue}>
            <label style={{ color: "blue" }} htmlFor="blueAlliance">Blue:</label>
            <input className={styles.blueInput} name="blueAlliance" type="number" min="1" max="8" />
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
    <div style={{ overflowX: 'hidden', maxWidth: '100vw' }}>
      {unscoredMatches.length > 0 && (
        <div style={{ margin: "12px", padding: "12px 14px", background: "#ffebe9", border: "1px solid #ff8182", borderRadius: "10px", color: "#7d1f1f" }}>
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
      <div className={styles.MainDiv}>
        <div className={styles.configSection}>
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

          {/* Scatter plot with configurable axes */}
          {axisOptions.length > 0 && (
            <div className={styles.scatterAxisSelectors}>
              <label className={styles.scatterAxisLabel}>
                X Axis
                <select
                  className={styles.scatterAxisSelect}
                  value={scatterX}
                  onChange={e => setScatterX(e.target.value)}
                >
                  <option value="team">Team Number</option>
                  {axisOptions.map(w => (
                    <option key={w.key} value={w.key}>{w.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.scatterAxisLabel}>
                Y Axis
                <select
                  className={styles.scatterAxisSelect}
                  value={scatterY}
                  onChange={e => setScatterY(e.target.value)}
                >
                  <option value="team">Team Number</option>
                  {axisOptions.map(w => (
                    <option key={w.key} value={w.key}>{w.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <TeamScatterPlot
            teamData={scatterData}
            isAuthenticated={isAuthenticated}
            xLabel={resolveAxisLabel(scatterX)}
            yLabel={resolveAxisLabel(scatterY)}
          />

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
                  placeholder="e.g. 2025njbe"
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
                <div className={styles.allianceTableContainer}>
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
                </div>
              </form>
              <AllianceMatchView />
            </div>
          </div>
        </div>
        <PicklistTable></PicklistTable>
      </div>
    </div>
  )
}
