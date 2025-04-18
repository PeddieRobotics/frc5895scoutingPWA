'use client';
import { useState, useEffect } from "react";
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, ResponsiveContainer, Cell, LineChart, Line, RadarChart, PolarRadiusAxis, PolarAngleAxis, PolarGrid, Radar, Legend } from 'recharts';
import { VictoryPie } from "victory";
import Link from "next/link";
import styles from "./page.module.css"
import PiecePlacement from "./components/PiecePlacement";
import dynamic from 'next/dynamic';
import Endgame from "./components/Endgame";
import DefenseBarChart from "./components/DefenseBarChart";
import EPALineChart from "./components/EPALineChart";


export default function MatchViewPage() {
  return <MatchView />;
}

function MatchView() {
  const [allData, setAllData] = useState(null);
  const [data, setData] = useState(false);
  const [urlParams, setUrlParams] = useState({});
  //light to dark
  const COLORS = [
    ["#A4E5DF", "#6FDCD3", "#93C8C4", "#73CEC7", "#5EACB5"], //green
    ["#B7D1F7", "#9FBCEC", "#8FA5F5", "#838FDC", "#5E6CB5"], //blue
    ["#DDB7F7", "#B38DDE", "#B16FDC", "#9051BE", "#975EB5"], //purple
    ["#F6C1D8", "#F2A8C9", "#D883A2", "#D883AC", "#B55E7B"], //pink
    ["#FFD1D0", "#F7B7B7", "#DC8683", "#BE5151", "#B55E5E"], //red
    ["#FFD4AB", "#FABD7C", "#FFAF72", "#FFA75A", "#FF9F4B"], //orange
    
  ];
  
  // Get URL parameters on client-side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const paramsObj = {};
      for (const [key, value] of searchParams.entries()) {
        paramsObj[key] = value;
      }
      setUrlParams(paramsObj);
    }
  }, []);

  useEffect(() => {
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
    
    fetch("/api/get-alliance-data", {
      headers: {
        'Authorization': `Basic ${btoa(`${currentUserTeam || 'guest'}:`)}`
      }
    })
      .then(resp => {
        if (resp.status === 401) {
          console.error("Authentication failed - triggering login dialog");
          // Trigger auth required event to show login dialog
          window.dispatchEvent(new CustomEvent('auth:required', {
            detail: { message: 'Session expired or invalid. Please login again.' }
          }));
          throw new Error('Authentication required');
        }
        return resp.json();
      })
      .then(data => {
          console.log("Fetched Data from API:", data);  // <-- Check what the API returns
          setAllData(data);
      })
      .catch(error => {
        if (error.message !== 'Authentication required') {
          console.error("Error fetching alliance data:", error);
        }
      });
  }, []);

  useEffect(() => {
    if (Object.keys(urlParams).length > 0 && allData) {
      if (!urlParams.match) {
        //search by teams
        let [team1, team2, team3, team4, team5, team6] = [
          urlParams.team1, 
          urlParams.team2, 
          urlParams.team3, 
          urlParams.team4, 
          urlParams.team5, 
          urlParams.team6
        ];
        setData({team1: allData[team1], team2: allData[team2], team3: allData[team3], team4: allData[team4], team5: allData[team5], team6: allData[team6]});
      } else {
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
        
        //search by match
        fetch('/api/get-teams-of-match?match=' + urlParams.match, {
          headers: {
            'Authorization': `Basic ${btoa(`${currentUserTeam || 'guest'}:`)}`
          }
        })
        .then(resp => {
          if (resp.status === 401) {
            console.error("Authentication failed - triggering login dialog");
            // Trigger auth required event to show login dialog
            window.dispatchEvent(new CustomEvent('auth:required', {
              detail: { message: 'Session expired or invalid. Please login again.' }
            }));
            throw new Error('Authentication required');
          }
          return resp.json();
        })
        .then(data => {
          if (data.message) {
            console.log(data.message);
          } else {
            //update url with teams
            const newParams = new URLSearchParams();
            // Swap team positions as requested: team1<->team4, team2<->team5, team3<->team6
            newParams.set('team1', data.team4);
            newParams.set('team2', data.team5);
            newParams.set('team3', data.team6);
            newParams.set('team4', data.team1);
            newParams.set('team5', data.team2);
            newParams.set('team6', data.team3);
            // Add a flag to indicate the teams were loaded from a match and swapped
            newParams.set('from_match', 'true');

            const newUrl = `${window.location.pathname}?${newParams.toString()}`;
            window.history.replaceState(null, 'Picklist', newUrl);
            
            // Update our local urlParams state
            const updatedParams = {
              team1: data.team4,
              team2: data.team5,
              team3: data.team6,
              team4: data.team1,
              team5: data.team2,
              team6: data.team3,
              from_match: 'true'
            };
            setUrlParams(updatedParams);
            
            // Also swap the data assignment
            setData({
              team1: allData[data.team4], 
              team2: allData[data.team5], 
              team3: allData[data.team6], 
              team4: allData[data.team1], 
              team5: allData[data.team2], 
              team6: allData[data.team3]
            });
          }
        })
        .catch(error => {
          if (error.message !== 'Authentication required') {
            console.error("Error fetching teams of match:", error);
          }
        });
      }
    }
  }, [urlParams, allData]);

  //until url loads show loading
  if (!data || Object.keys(urlParams).length === 0) {
    return <div>
      <h1>Loading...</h1>
    </div>
  }

  const defaultTeam = {
    team: "N/A",
    teamName: "No Data",
    auto: null,
    tele: null,
    end: null,
    avgPieces: {
      L1: null,
      L2: null,
      L3: null,
      L4: null,
      net: null, 
      processor: null,
      HP: null,
    },
    leave: null,
    autoCoral: null,
    removedAlgae: null,
    endgame: { none: 100, park: 0, shallow: 0, deep: 0, fail: 0},
    qualitative: { coralspeed: null, processorspeed: null, netspeed: null, algaeremovalspeed: null, climbspeed: null, maneuverability: null, defenseplayed: null, defenseevasion: null, aggression: null, cagehazard: null }
  };

  //show form if systems are not a go
  if (urlParams.go != "go") {
    return (
      <div>
        <form className={styles.teamForm}>
          <span>View by Teams...</span>
          <div className={styles.horizontalBox}>
          <div className={styles.RedInputs}>
            <div>
              <label htmlFor="team1">Red 1:</label>
              <br />
              <input id="team1" name="team1" defaultValue={urlParams.team1}></input>
            </div>
            <div>
              <label htmlFor="team2">Red 2:</label>
              <br />
              <input id="team2" name="team2" defaultValue={urlParams.team2}></input>
            </div>
            <div>
              <label htmlFor="team3">Red 3:</label>
              <br />
              <input id="team3" name="team3" defaultValue={urlParams.team3}></input>
            </div>
          </div>
          <div className={styles.BlueInputs}>
            <div>
              <label htmlFor="team4">Blue 1:</label>
              <br />
              <input id="team4" name="team4" defaultValue={urlParams.team4}></input>
            </div>
            <div>
              <label htmlFor="team5">Blue 2:</label>
              <br />
              <input id="team5" name="team5" defaultValue={urlParams.team5}></input>
            </div>
            <div>
              <label htmlFor="team6">Blue 3:</label>
              <br />
              <input id="team6" name="team6" defaultValue={urlParams.team6}></input>
            </div>
            </div>
            <input type="hidden" name="go" value="go"></input>
          </div>
          <span>Or by Match...</span>
          <label htmlFor="match">Match #</label>
          <input id="match" name="match" type="number"></input>
          <button className={styles.goButton}>Go!</button>
        </form>
      </div>
    );
  }

  function AllianceButtons({t1, t2, t3, colors}) {
    // Check if we're viewing a match that was loaded by match number
    const fromMatch = urlParams.match !== null || urlParams.toString().includes('from_match=true');
    
    // Preserve original team order in the URL by getting team values from the current URL params
    // This maintains consistency when teams were swapped due to match number lookup
    return <div className={styles.allianceBoard}>
      <Link href={`/team-view?team=${t1.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{background: colors[0][1]}}>{t1.team}</button>
      </Link>
      <Link href={`/team-view?team=${t2.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{background: colors[1][1]}}>{t2.team}</button>
      </Link>
      <Link href={`/team-view?team=${t3.team}&team1=${urlParams.team1 || ""}&team2=${urlParams.team2 || ""}&team3=${urlParams.team3 || ""}&team4=${urlParams.team4 || ""}&team5=${urlParams.team5 || ""}&team6=${urlParams.team6 || ""}&from_match=true`}>
        <button style={{background: colors[2][1]}}>{t3.team}</button>
      </Link>
    </div>
  }

    function AllianceDisplay({teams, opponents, colors}) {
      //calc alliance espm breakdown
      const validTeams = teams.filter(team => team && team.last3Auto !== null);
      const auto = validTeams.reduce((sum, team) => sum + (team.last3Auto || 0), 0);
      const tele = validTeams.reduce((sum, team) => sum + (team.last3Tele || 0), 0);
      const end = validTeams.reduce((sum, team) => sum + (team.last3End || 0), 0);

      console.log(auto)
      console.log(tele)
      console.log(end)




      //calc ranking points
      const RGBColors = {
        red: "#FF9393",
        green: "#BFFEC1",
        yellow: "#FFDD9A"
      }
      //win = higher espm than opponents
      const teamEPA = (team) => team && team.auto !== null ? team.auto + team.tele + team.end : 0;
      const validOpponents = opponents.filter(opponent => opponent && opponent.auto !== null);
      const opponentsEPA = validOpponents.reduce((sum, opponent) => sum + teamEPA(opponent), 0);
      const currentAllianceEPA = auto + tele + end;
      let RP_WIN = RGBColors.red;
      if (currentAllianceEPA > opponentsEPA) RP_WIN = RGBColors.green;
      else if (currentAllianceEPA == opponentsEPA) RP_WIN = RGBColors.yellow;

      //auto rp = all robots leave and alliance scores one coral
      const allianceCoral = teams.reduce((sum, team) => {
        return sum + (team && team.autoCoral !== null ? Math.floor(team.autoCoral) : 0);
      }, 0);
      
      let RP_AUTO = RGBColors.red;
      if ((allianceCoral >= 1) && 
          teams.every(team => team && team.leave === true)) {
        RP_AUTO = RGBColors.green;
      }

      //coral rp = 5 coral scored on each level (5 on 3 levels is yellow)
      const sumValidPieces = (pieceType) => {
        return teams.reduce((sum, team) => {
          return sum + (team && team.avgPieces && team.avgPieces[pieceType] !== null ? team.avgPieces[pieceType] : 0);
        }, 0);
      };
      
      const allianceL1 = sumValidPieces('L1');
      const allianceL2 = sumValidPieces('L2'); 
      const allianceL3 = sumValidPieces('L3');
      const allianceL4 = sumValidPieces('L4');
      
      let RP_CORAL = RGBColors.red;
      const conditions = [
        allianceL1 >= 5,
        allianceL2 >= 5,
        allianceL3 >= 5,
        allianceL4 >= 5
      ];
      //count the number of true conditions
      const trueCount = conditions.filter(Boolean).length;
      //if all 4 conditions are true
      if (trueCount == 4) RP_CORAL = RGBColors.green;
      //if 3 conditions are true
      else if (trueCount == 3) RP_CORAL = RGBColors.yellow;
    
      //barge rp = 14 points in the barge
      const endgamePoints = teams.reduce((sum, team) => {
        return sum + (team && team.end !== null ? Math.floor(team.end) : 0);
      }, 0);
      
      let RP_BARGE = RGBColors.red;
      if (endgamePoints >= 14) RP_BARGE = RGBColors.green;

      return <div className={styles.lightBorderBox}>
        <div className={styles.scoreBreakdownContainer}>
        <div style={{background: colors[0], padding: "0 5px", minWidth: "60px", textAlign: "center"}} className={styles.EPABox}>{((auto + tele + end) || 0).toFixed(1)}</div>        <div className={styles.EPABreakdown}>
            <div style={{background: colors[1], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>A: {(auto || 0).toFixed(1)}</div>
            <div style={{background: colors[1], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>T: {(tele || 0).toFixed(1)}</div>
            <div style={{background: colors[1], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>E: {(end || 0).toFixed(1)}</div>
          </div>
        </div>
        <div className={styles.RPs}>
          <div style={{background: colors[1]}}>RPs:</div>
          <div style={{background: RP_WIN}}>Victory</div>
          <div style={{background: RP_AUTO}}>Auto</div>
          <div style={{background: RP_CORAL}}>Coral</div>
          <div style={{background: RP_BARGE}}>Barge</div>
        </div>
      </div>
      
    }

    function TeamDisplay({teamData, colors, matchMax}) {

      const PiecePlacement = dynamic(() => import('./components/PiecePlacement'), { ssr: false });
      
      // Check if endgame data is valid
      const hasEndgameData = teamData.endgame && 
        Object.values(teamData.endgame).some(value => value !== null && value > 0);
      
      const endgameData = hasEndgameData ? [
        { x: 'None', y: teamData.endgame.none },
        { x: 'Fail', y: teamData.endgame.fail},
        { x: 'Park', y: teamData.endgame.park },
        { x: 'Shallow', y: teamData.endgame.shallow },
        { x: 'Deep', y: teamData.endgame.deep },
      ] : [
        { x: 'N/A', y: 100 }
      ];

    return <div className={styles.lightBorderBox}>
      <h1 style={{color: colors[3]}}>{teamData.team}</h1>
      <h2 style={{color: colors[3]}}>{teamData.teamName}</h2>
      <div className={styles.scoreBreakdownContainer}>
      <div style={{background: colors[0], padding: "0 5px", minWidth: "60px", textAlign: "center"}} className={styles.EPABox}>
        {(teamData.last3EPA !== null ? (teamData.last3EPA || 0).toFixed(1) : "N/A")}
      </div>
      <div className={styles.EPABreakdown}>
        <div style={{background: colors[2], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>A: {teamData.last3Auto !== null ? (teamData.last3Auto || 0).toFixed(1) : "N/A"}</div>
        <div style={{background: colors[2], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>T: {teamData.last3Tele !== null ? (teamData.last3Tele || 0).toFixed(1) : "N/A"}</div>
        <div style={{background: colors[2], padding: "0 3px", minWidth: "50px", textAlign: "center"}}>E: {teamData.last3End !== null ? (teamData.last3End || 0).toFixed(1) : "N/A"}</div>
      </div>
      </div>
      <div className={styles.barchartContainer}>
        <h2>Average Piece Placement</h2>
        <PiecePlacement 
          colors={colors}
          matchMax={matchMax} 
          L1={teamData.avgPieces.L1 !== null ? Math.round(10*teamData.avgPieces.L1)/10 : null}
          L2={teamData.avgPieces.L2 !== null ? Math.round(10*teamData.avgPieces.L2)/10 : null}
          L3={teamData.avgPieces.L3 !== null ? Math.round(10*teamData.avgPieces.L3)/10 : null} 
          L4={teamData.avgPieces.L4 !== null ? Math.round(10*teamData.avgPieces.L4)/10 : null} 
          net={teamData.avgPieces.processor !== null ? Math.round(10*teamData.avgPieces.processor)/10 : null}
          processor={teamData.avgPieces.net !== null ? Math.round(10*teamData.avgPieces.net)/10 : null}
          HP={teamData.avgPieces.HP !== null ? Math.round(10*teamData.avgPieces.HP)/10 : null}
        />
      </div>
      <div className={styles.chartContainer}>
        <h2 style={{marginBottom: "-40px"}}>Endgame %</h2>
        <Endgame 
          colors={colors}
          endgameData={endgameData}
        />
      </div>
    </div>
  }
    let get = (alliance, thing) => {
    let sum = 0;
    for (let i = 0; i < alliance.length; i++) {
      if (alliance[i] && alliance[i][thing] !== null) {
        sum += alliance[i][thing];
      }
    }
    return sum;
  }

  
  
  const redAlliance = [data.team1 || defaultTeam, data.team2 || defaultTeam, data.team3 || defaultTeam];
  const blueAlliance = [data.team4 || defaultTeam, data.team5 || defaultTeam, data.team6 || defaultTeam];
  let blueScores = [0, get(blueAlliance, "last3Auto")]  // last 3?? 
  blueScores.push(blueScores[1] + get(blueAlliance, "last3Tele"))
  blueScores.push(blueScores[2] + get(blueAlliance, "last3End"))
  let redScores = [0, get(redAlliance, "last3Auto")]
  redScores.push(redScores[1] + get(redAlliance, "last3Tele"))
  redScores.push(redScores[2] + get(redAlliance, "last3End"));
  let epaData = [
    {name: "Start", blue: 0, red: 0},
    {name: "Auto", blue: blueScores[1], red: redScores[1]},
    {name: "Tele", blue: blueScores[2], red: redScores[2]},
    {name: "End", blue: blueScores[3], red: redScores[3]},
  ]; 

    //getting radar data
    let radarData = [];
    for (let qual of ['coralspeed', 'processorspeed', 'netspeed', 'algaeremovalspeed', 'climbspeed', 'maneuverability', 'defenseplayed', 'defenseevasion', 'aggression', 'cagehazard']) {
      radarData.push({qual, 
        team1: data?.team1?.qualitative?.[qual] !== undefined ? data.team1.qualitative[qual] : null,
        team2: data?.team2?.qualitative?.[qual] !== undefined ? data.team2.qualitative[qual] : null,
        team3: data?.team3?.qualitative?.[qual] !== undefined ? data.team3.qualitative[qual] : null,
        team4: data?.team4?.qualitative?.[qual] !== undefined ? data.team4.qualitative[qual] : null,
        team5: data?.team5?.qualitative?.[qual] !== undefined ? data.team5.qualitative[qual] : null,
        team6: data?.team6?.qualitative?.[qual] !== undefined ? data.team6.qualitative[qual] : null,
        fullMark: 5});
    }
    console.log(radarData);

    let matchMax = 0;
    for (let teamData of [data.team1, data.team2, data.team3, data.team4, data.team5, data.team6]) {
     if (teamData && teamData.avgPieces) {
      const pieceValues = [
        teamData.avgPieces.L4, 
        teamData.avgPieces.L3, 
        teamData.avgPieces.L2, 
        teamData.avgPieces.L1, 
        teamData.avgPieces.net, 
        teamData.avgPieces.processor, 
        teamData.avgPieces.HP
      ].filter(value => value !== null);
      
      if (pieceValues.length > 0) {
        matchMax = Math.max(...pieceValues, matchMax);
      }
     }
    }
    matchMax = Math.floor(matchMax) + 2; 
    console.log("Team 1 Data:", data.team1);
    console.log("Team 2 Data:", data.team2);
    console.log("Team 3 Data:", data.team3);


    return (
      <div>
        <div className={styles.matchNav}>
          <AllianceButtons t1={data.team1 || defaultTeam} t2={data.team2 || defaultTeam} t3={data.team3 || defaultTeam} colors={[COLORS[3], COLORS[4], COLORS[5]]}></AllianceButtons>
          <Link href={`/match-view?team1=${data.team1?.team || ""}&team2=${data.team2?.team || ""}&team3=${data.team3?.team || ""}&team4=${data.team4?.team || ""}&team5=${data.team5?.team || ""}&team6=${data.team6?.team || ""}`}><button style={{background: "#ffff88", color: "black"}}>Edit</button></Link>
          <AllianceButtons t1={data.team4 || defaultTeam} t2={data.team5 || defaultTeam} t3={data.team6 || defaultTeam} colors={[COLORS[0], COLORS[1], COLORS[2]]}></AllianceButtons>
        </div>
        <div className={styles.allianceEPAs}>
          <AllianceDisplay teams={redAlliance} opponents={blueAlliance} colors={["#FFD5E1", "#F29FA6"]}></AllianceDisplay>
          <AllianceDisplay teams={blueAlliance} opponents={redAlliance} colors={["#D3DFFF", "#8FA5F5"]}></AllianceDisplay>
        </div>
        <div className={styles.allianceGraphs}>
          <div className={styles.graphContainer}>
            <DefenseBarChart 
              allianceData={redAlliance}
              colors={[COLORS[3][2], COLORS[4][1], COLORS[5][2]]}
              teamNumbers={[
                (data.team1 || defaultTeam).team,
                (data.team2 || defaultTeam).team,
                (data.team3 || defaultTeam).team
              ]}
            />
          </div>
          <div className={styles.lineGraphContainer}>
            <h2>EPA / time</h2>
            <br></br>
            <EPALineChart data={epaData}/>
          </div>
          <div className={styles.graphContainer}>
            <DefenseBarChart 
              allianceData={blueAlliance}
              colors={[COLORS[0][2], COLORS[1][1], COLORS[2][2]]}
              teamNumbers={[
                (data.team4 || defaultTeam).team,
                (data.team5 || defaultTeam).team,
                (data.team6 || defaultTeam).team
              ]}
            />
          </div>
        </div>
        <div className={styles.matches}>
          <TeamDisplay teamData={data.team1 || defaultTeam} colors={COLORS[3]} matchMax={matchMax}></TeamDisplay>
          <TeamDisplay teamData={data.team2 || defaultTeam} colors={COLORS[4]} matchMax={matchMax}></TeamDisplay>
          <TeamDisplay teamData={data.team3 || defaultTeam} colors={COLORS[5]} matchMax={matchMax}></TeamDisplay>
        </div>
        <div className={styles.matches}>
          <TeamDisplay teamData={data.team4 || defaultTeam} colors={COLORS[0]} matchMax={matchMax}></TeamDisplay>
          <TeamDisplay teamData={data.team5 || defaultTeam} colors={COLORS[1]} matchMax={matchMax}></TeamDisplay>
          <TeamDisplay teamData={data.team6 || defaultTeam} colors={COLORS[2]} matchMax={matchMax}></TeamDisplay>
        </div>
      </div>
    )
  }