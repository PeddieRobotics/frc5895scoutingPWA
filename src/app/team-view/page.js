"use client";
import styles from "./page.module.css";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import VBox from "./components/VBox";
import HBox from "./components/HBox";
import Comments from "./components/Comments";
import TwoByTwo from "./components/TwoByTwo";
import ThreeByThree from "./components/ThreeByThree";
import FourByTwo from "./components/FourByTwo";
import EPALineChart from './components/EPALineChart';
import CoralLineChart from './components/CoralLineChart';
import PiecePlacement from "./components/PiecePlacement";
import Endgame from "./components/Endgame";
import Qualitative from "./components/Qualitative";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, RadarChart, PolarRadiusAxis, PolarAngleAxis, PolarGrid, Radar, Legend } from 'recharts';

export default function TeamViewPage() {
    return (
        <Suspense>
            <TeamView />
        </Suspense>
    );
}

function TeamView() {

    //for backend
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const searchParams = useSearchParams();
    const team = searchParams.get("team");
    const hasTopBar = searchParams.get('team1') !== null;

    function AllianceButtons({t1, t2, t3, colors}) {
      console.log(searchParams.get('team6'))
      return <div className={styles.allianceBoard}>
        <Link href={`/team-view?team=${t1 || ""}&${searchParams.toString()}`}>
          <button style={team == t1 ? {background: 'black', color: 'yellow'} : {background: colors[0][1]}}>{t1 || 404}</button>
        </Link>
        <Link href={`/team-view?team=${t2 || ""}&${searchParams.toString()}`}>
          <button style={team == t2 ? {background: 'black', color: 'yellow'} : {background: colors[1][1]}}>{t2 || 404}</button>
        </Link>
        <Link href={`/team-view?team=${t3 || ""}&${searchParams.toString()}`}>
          <button style={team == t3 ? {background: 'black', color: 'yellow'} : {background: colors[2][1]}}>{t3 || 404}</button>
        </Link>
      </div>
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
      if (!hasTopBar) {
        return <></>
      }
      return <div className={styles.matchNav}>
        <AllianceButtons t1={searchParams.get('team1')} t2={searchParams.get('team2')} t3={searchParams.get('team3')} colors={[COLORS[0], COLORS[1], COLORS[2]]}></AllianceButtons>
        <Link href={`/match-view?team1=${searchParams.get('team1') || ""}&team2=${searchParams.get('team2') || ""}&team3=${searchParams.get('team3') || ""}&team4=${searchParams.get('team4') || ""}&team5=${searchParams.get('team5') || ""}&team6=${searchParams.get('team6') || ""}&go=go`}><button style={{background: "#ffff88", color: "black"}}>Match</button></Link>
        <AllianceButtons t1={searchParams.get('team4')} t2={searchParams.get('team5')} t3={searchParams.get('team6')} colors={[COLORS[3], COLORS[4], COLORS[5]]}></AllianceButtons>
      </div>
    }

    // Fetch team data from backend
    function fetchTeamData(team) {
      setLoading(true);
      setError(null);
  
      fetch(`/api/get-team-data?team=${team}&includeRows=true`)
          .then(response => {
              if (!response.ok) {
                  throw new Error("Failed to fetch data");
              }
              return response.json();
          })
          .then(data => {
              console.log("Fetched Team Data:", data);  // Log the complete data object
              
              // Ensure we have a rows array, even if empty
              if (!data.rows) {
                  data.rows = [];
              }
              
              setData(data);
              
              // Process remaining data as before...
              if (data.matches && Array.isArray(data.matches) && data.matches.length > 0) {
                const last3Matches = data.matches.slice(-3);
                
                const last3Epa = last3Matches.reduce((sum, match) => sum + match.epa, 0) / last3Matches.length;
                const last3Auto = last3Matches.reduce((sum, match) => sum + match.auto, 0) / last3Matches.length;
                const last3Tele = last3Matches.reduce((sum, match) => sum + match.tele, 0) / last3Matches.length;
                const last3End = last3Matches.reduce((sum, match) => sum + match.end, 0) / last3Matches.length;

                // Add the calculated metrics to the data object
                data.last3Epa = last3Epa;
                data.last3Auto = last3Auto;
                data.last3Tele = last3Tele;
                data.last3End = last3End;
              } else {
                // Provide default values if there are no matches
                data.last3Epa = data.avgEpa || 0;
                data.last3Auto = data.avgAuto || 0;
                data.last3Tele = data.avgTele || 0;
                data.last3End = data.avgEnd || 0;
              }
              
              setLoading(false);
          })
          .catch(error => {
              console.error("Fetch error:", error);
              
              setError(error.message);
              setLoading(false);
          });
  }

  

    useEffect(() => {
        if (team) {
            fetchTeamData(team);
        }
    }, [team]);

    if (!team) {
        return (
            <div>
                <form className={styles.teamInputForm}>
                    <span>{error}</span>
                    <label htmlFor="team">Team: </label>
                    <input id="team" name="team" placeholder="Team #" type="number"></input>
                    <br></br>
                    <button>Go!</button>
                </form>
            </div>
        );
    }

    if (loading) {
        return (
            <div>
                <h1>Loading...</h1>
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
    const prepareCoralData = (matches, phase, dataType = 'success') => {
        if (!matches || !Array.isArray(matches)) return [];
        
        // Filter to only include matches for this team
        const teamMatches = matches.filter(match => match.team == team);
        
        return teamMatches.map(match => {
            let result;
            
            if (dataType === 'success') {
                // Extract L1-L4 successes from match data
                const l1Success = match[`${phase.toLowerCase()}l1success`] || 0;
                const l2Success = match[`${phase.toLowerCase()}l2success`] || 0;
                const l3Success = match[`${phase.toLowerCase()}l3success`] || 0;
                const l4Success = match[`${phase.toLowerCase()}l4success`] || 0;
                
                result = {
                    match: match.match,
                    L1: l1Success,
                    L2: l2Success,
                    L3: l3Success,
                    L4: l4Success,
                };
            } else {
                // Extract L1-L4 failures from match data
                const l1Fail = match[`${phase.toLowerCase()}l1fail`] || 0;
                const l2Fail = match[`${phase.toLowerCase()}l2fail`] || 0;
                const l3Fail = match[`${phase.toLowerCase()}l3fail`] || 0;
                const l4Fail = match[`${phase.toLowerCase()}l4fail`] || 0;
                
                result = {
                    match: match.match,
                    L1: l1Fail,
                    L2: l2Fail,
                    L3: l3Fail,
                    L4: l4Fail,
                };
            }
            
            return result;
        }).sort((a, b) => a.match - b.match); // Ensure matches are in order
    };

    // Add this function after prepareCoralData
    // Process match data for algae data charts
    const prepareAlgaeData = (matches, phase) => {
        if (!matches || !Array.isArray(matches)) return [];
        
        // Filter to only include matches for this team
        const teamMatches = matches.filter(match => match.team == team);
        
        return teamMatches.map(match => {
            // Process algae data
            const removed = match[`${phase.toLowerCase()}algaeremoved`] || 0;
            const processorSuccess = match[`${phase.toLowerCase()}processorsuccess`] || 0;
            const processorFail = match[`${phase.toLowerCase()}processorfail`] || 0;
            const netSuccess = match[`${phase.toLowerCase()}netsuccess`] || 0;
            const netFail = match[`${phase.toLowerCase()}netfail`] || 0;
            
            return {
                match: match.match,
                removed: removed,
                processorSuccess: processorSuccess,
                processorFail: processorFail,
                netSuccess: netSuccess,
                netFail: netFail
            };
        }).sort((a, b) => a.match - b.match); // Ensure matches are in order
    };

    // Prepare data for the charts
    const autoCoralSuccessData = prepareCoralData(data.rows || [], 'auto', 'success');
    const autoCoralFailData = prepareCoralData(data.rows || [], 'auto', 'fail');
    const teleCoralSuccessData = prepareCoralData(data.rows || [], 'tele', 'success');
    const teleCoralFailData = prepareCoralData(data.rows || [], 'tele', 'fail');
    
    // Add these lines to prepare algae data
    const autoAlgaeData = prepareAlgaeData(data.rows || [], 'auto');
    const teleAlgaeData = prepareAlgaeData(data.rows || [], 'tele');
    
    console.log(`Team ${team} Coral Data:`, { 
        autoSuccess: autoCoralSuccessData, 
        autoFail: autoCoralFailData,
        teleSuccess: teleCoralSuccessData,
        teleFail: teleCoralFailData,
        matches: (data.rows || []).filter(m => m.team == team).map(m => m.match)
    });

    // Also log algae data
    console.log(`Team ${team} Algae Data:`, {
        auto: autoAlgaeData,
        tele: teleAlgaeData
    });

    const Colors = [
        //light to dark
        ["#CCFBF7", "#76E3D3", "#18a9a2", "#117772"], //green
        ["#D7F2FF", "#7dd4ff", "#38b6f4", "#0A6D9F"], //blue
        ["#D7D8FF", "#a0a3fb", "#8488FF", "#2022AA"], //blue-purple
        ["#F3D8FB", "#DBA2ED", "#C37DDB", "#8E639C"], //pink-purple
        ["#FFDDF3", "#EDA2DB", "#DD64C0", "#9C6392"], //pink
    ];

    const epaColors = {
      red1: "#fa8888",
      red2: "#F7AFAF",
      yellow1: "#ffe16b",
      yellow2: "#ffff9e",
      green1: "#7FD689",
      green2: "#c4f19f",
    }

    //overall last3epa
    let overallLast3 = epaColors.yellow1;
    if ((data.avgEpa + 12) < data.last3Epa) overallLast3 = epaColors.green1;
    else if ((data.avgEpa - 12) > data.last3Epa) overallLast3 = epaColors.red1;

    //auto last3epa
    let autoLast3 = epaColors.yellow2;
    if ((data.avgAuto + 6) < data.last3Auto) autoLast3 = epaColors.green2;
    else if ((data.avgAuto - 6) > data.last3Auto) autoLast3 = epaColors.red2;

    //tele last3epa
    let teleLast3 = epaColors.yellow2;
    if ((data.avgTele + 10) < data.last3Tele) teleLast3 = epaColors.green2;
    else if ((data.avgTele - 10) > data.last3Tele) teleLast3 = epaColors.red2;

    //tele last3epa
    let endLast3 = epaColors.yellow2;
    if ((data.avgEnd + 6) < data.last3End) endLast3 = epaColors.green2;
    else if ((data.avgEnd - 6) > data.last3End) endLast3 = epaColors.red2;

    const endgamePieData = [
        { x: 'None', y: data.endPlacement.none },
        { x: 'Park', y: data.endPlacement.park },
        { x: 'Fail', y: data.endPlacement.parkandFail },
        { x: 'Shallow', y: data.endPlacement.shallow },
        { x: 'Deep', y: data.endPlacement.deep }
    ];

    // Custom color array for endgame pie chart with 5 distinct colors
    const endgameColors = ["#F3D8FB", "#DBA2ED", "#C37DDB", "#8E639C", "#6A4372"];

    return (
        <div>
            <TopBar />
            <div className={styles.MainDiv}>
                <div className={styles.leftColumn}>
                    <h1 style={{ color: Colors[0][3] }}>Team {data.team} View</h1>
                    <h3>{data.name}</h3>
                    <div className={styles.EPAS}>
                        <div className={styles.EPA}>
                            <div className={styles.scoreBreakdownContainer}>
                                <div style={{ background: Colors[0][1] }} className={styles.epaBox}>{Math.round(10*data.avgEpa)/10}</div>
                                <div className={styles.epaBreakdown}>
                                    <div style={{ background: Colors[0][0] }}>A: {Math.round(10*data.avgAuto)/10}</div>
                                    <div style={{ background: Colors[0][0] }}>T: {Math.round(10*data.avgTele)/10}</div>
                                    <div style={{ background: Colors[0][0] }}>E: {Math.round(10*data.avgEnd)/10}</div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.Last3EPA}>
                            <div className={styles.scoreBreakdownContainer}> 
                                <div style={{background: overallLast3}} className={styles.Last3EpaBox}>{Math.round(10*data.last3Epa)/10}</div>
                                <div className={styles.epaBreakdown}>
                                    <div style={{background: autoLast3}}>A: {Math.round(10*data.last3Auto)/10}</div>
                                    <div style={{background: teleLast3}}>T: {Math.round(10*data.last3Tele)/10}</div>
                                    <div style={{background: endLast3}}>E: {Math.round(10*data.last3End)/10}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={styles.graphContainer}>
                        <h4 className={styles.graphTitle}>EPA Over Time</h4>
                        <EPALineChart data={data.epaOverTime} color={Colors[0][3]} label={"epa"}/>
                    </div>
                    <div className={styles.barGraphContainer}>
                        <h4 className={styles.graphTitle}>Piece Placement</h4>
                        <PiecePlacement
                            L1={Math.round(10*(data.auto.coral.avgL1 + data.tele.coral.avgL1))/10}
                            L2={Math.round(10*(data.auto.coral.avgL2 + data.tele.coral.avgL2))/10}
                            L3={Math.round(10*(data.auto.coral.avgL3 + data.tele.coral.avgL3))/10}
                            L4={Math.round(10*(data.auto.coral.avgL4 + data.tele.coral.avgL4))/10}
                            net={Math.round(10*(data.auto.algae.avgNet + data.tele.algae.avgNet))/10}
                            processor={Math.round(10*(data.auto.algae.avgProcessor + data.tele.algae.avgProcessor))/10}
                            HP={Math.round(10*data.tele.avgHp)/10}
                        />
                    </div>
                    <div className={styles.valueBoxes}>
                        <div className={styles.leftColumnBoxes}>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"Consistency"} value={`${Math.round(10*data.consistency)/10}%`}/>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"Defense"} value={`${Math.round(10*data.defense)/10}%`}/>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"Last Breakdown"} value={data.lastBreakdown}/>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"No Show"} value={`${Math.round(10*data.noShow)*10}%`}/>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"Breakdown"} value={`${Math.round(data.breakdown)}%`}/>
                            <VBox id="box" className={styles.boxes} style={{width: "200px"}} color1={Colors[0][1]} color2={Colors[0][0]} title={"Matches Scouted"} value={Math.round(10*data.matchesScouted)/10}/>
                        </div>
                        <div className={styles.allComments}>
                            <Comments color1={Colors[0][1]} color2={Colors[0][0]} title={"General Comments"} value={data.generalComments} />
                            <Comments color1={Colors[0][1]} color2={Colors[0][0]} title={"Breakdown Comments"} value={data.breakdownComments} />
                            <Comments color1={Colors[0][1]} color2={Colors[0][0]} title={"Defense Comments"} value={data.defenseComments} />
                        </div>
                        <HBox color1={Colors[0][1]} color2={Colors[0][0]} title={"Scouts"} value={data.scouts} />
                    </div>
                </div>
                <div className={styles.rightColumn}>
                    <div className={styles.topRow}>
                        <div className={styles.auto}>
                            <h1 style={{ color: Colors[1][3] }}>Auto</h1>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Auto Over Time</h4>
                                <EPALineChart 
                                    data={data.autoOverTime} 
                                    color={Colors[1][3]} 
                                    label={"auto"}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Auto Coral Success</h4>
                                <CoralLineChart 
                                    data={autoCoralSuccessData}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Auto Coral Failures</h4>
                                <CoralLineChart 
                                    data={autoCoralFailData}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Auto Algae Data</h4>
                                <div style={{
                                    padding: "15px 0", 
                                    display: "flex", 
                                    justifyContent: "center", 
                                    alignItems: "center",
                                    width: "100%", 
                                    textAlign: "center"
                                }}>
                                    <div style={{width: "90%", margin: "0 auto"}}>
                                        <table className={styles.coralTable} style={{
                                            width: "100%", 
                                            tableLayout: "fixed", 
                                            margin: "0 auto",
                                            borderCollapse: "collapse"
                                        }}> 
                                            <tbody>
                                                <tr>
                                                    <td style={{
                                                        backgroundColor: Colors[1][2], 
                                                        width: "15%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Match</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][2], 
                                                        width: "20%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Algae Removed</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][2], 
                                                        width: "32.5%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }} colSpan="2">Processor</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][2], 
                                                        width: "32.5%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }} colSpan="2">Net</td>
                                                </tr>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[1][1]}}></td>
                                                    <td style={{backgroundColor: Colors[1][1]}}></td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Success</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Fail</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Success</td>
                                                    <td style={{
                                                        backgroundColor: Colors[1][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Fail</td>
                                                </tr>
                                                {autoAlgaeData.length > 0 ? (
                                                    autoAlgaeData.map((match, index) => (
                                                        <tr key={index}>
                                                            <td style={{
                                                                backgroundColor: Colors[1][1],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.match}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[1][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.removed}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[1][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.processorSuccess}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[1][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.processorFail}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[1][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.netSuccess}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[1][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.netFail}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="6" style={{
                                                            backgroundColor: Colors[1][0], 
                                                            textAlign: "center",
                                                            fontSize: "clamp(10px, 2vw, 14px)",
                                                            padding: "4px"
                                                        }}>No match data available</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            <div style={{clear: "both"}}></div>
                            <div className={styles.autoRightAlignment}>
                                <div className={styles.alignElements}>
                                    <div className={styles.valueBoxes}>
                                        <div className={styles.rightColumnBoxes}>
                                            <VBox color1={Colors[1][2]} color2={Colors[1][0]} color3={Colors[1][2]} title={"Leave"} value={`${Math.round(data.leave*100)}%`}/>
                                        </div>
                                        <table className={styles.coralTable}> 
                                            <tbody>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[1][2]}} rowSpan="2">Coral</td>
                                                    <td style={{backgroundColor: Colors[1][1]}}>Success</td>
                                                    <td style={{backgroundColor: Colors[1][1]}}>Total</td>
                                                </tr>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[1][0]}}>{`${Math.round(10*data.auto.coral.success)/10}%`}</td>
                                                    <td style={{backgroundColor: Colors[1][0]}}>{Math.round(10*data.auto.coral.total)/10}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className={styles.fourByTwoContainer}>
                                        <FourByTwo
                                            HC1="Success"
                                            HC2="Avg Coral"
                                            HR1="L4"
                                            R1C1={`${Math.round(10*data.auto.coral.successL4)/10}%`}
                                            R1C2={Math.round(10*data.auto.coral.avgL4)/10}
                                            HR2="L3"
                                            R2C1={`${Math.round(10*data.auto.coral.successL3)/10}%`}
                                            R2C2={Math.round(10*data.auto.coral.avgL3)/10}
                                            HR3="L2"
                                            R3C1={`${Math.round(10*data.auto.coral.successL2)/10}%`}
                                            R3C2={Math.round(10*data.auto.coral.avgL2)/10}
                                            HR4="L1"
                                            R4C1={`${Math.round(10*data.auto.coral.successL1)/10}%`}
                                            R4C2={Math.round(10*data.auto.coral.avgL1)/10}
                                            color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                        />
                                    </div>
                                </div>
                                <div className={styles.alignElements}>
                                    <div className={styles.rightColumnBoxesTwo}>
                                        <VBox color1={Colors[1][2]} color2={Colors[1][0]} color3={Colors[1][2]} title={"Algae Removed"} value={Math.round(10*data.auto.algae.removed)/10} />  
                                    </div>
                                    <div className={styles.twoByTwoContainer}>
                                        <TwoByTwo
                                            HC1="Success"
                                            HC2="Avg Algae"
                                            HR1="Prcsr"
                                            R1C1={`${Math.round(10*data.auto.algae.successProcessor)/10}%`}
                                            R1C2={Math.round(10*data.auto.algae.avgProcessor)/10}
                                            HR2="Net"
                                            R2C1={`${Math.round(10*data.auto.algae.successNet)/10}%`}
                                            R2C2={Math.round(10*data.auto.algae.avgNet)/10}
                                            color1={Colors[1][2]} color2={Colors[1][1]} color3={Colors[1][0]}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={styles.tele}>
                            <h1 style={{ color: Colors[2][3] }}>Tele</h1>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Tele Over Time</h4>
                                <EPALineChart 
                                    data={data.teleOverTime} 
                                    color={Colors[2][3]} 
                                    label={"tele"}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Tele Coral Success</h4>
                                <CoralLineChart 
                                    data={teleCoralSuccessData}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Tele Coral Failures</h4>
                                <CoralLineChart 
                                    data={teleCoralFailData}
                                />
                            </div>
                            <div className={styles.graphContainer}>
                                <h4 className={styles.graphTitle}>Tele Algae Data</h4>
                                <div style={{
                                    padding: "15px 0", 
                                    display: "flex", 
                                    justifyContent: "center", 
                                    alignItems: "center",
                                    width: "100%", 
                                    textAlign: "center"
                                }}>
                                    <div style={{width: "90%", margin: "0 auto"}}>
                                        <table className={styles.coralTable} style={{
                                            width: "100%", 
                                            tableLayout: "fixed", 
                                            margin: "0 auto",
                                            borderCollapse: "collapse"
                                        }}> 
                                            <tbody>
                                                <tr>
                                                    <td style={{
                                                        backgroundColor: Colors[2][2], 
                                                        width: "15%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Match</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][2], 
                                                        width: "20%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Algae Removed</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][2], 
                                                        width: "32.5%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }} colSpan="2">Processor</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][2], 
                                                        width: "32.5%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }} colSpan="2">Net</td>
                                                </tr>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[2][1]}}></td>
                                                    <td style={{backgroundColor: Colors[2][1]}}></td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Success</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Fail</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Success</td>
                                                    <td style={{
                                                        backgroundColor: Colors[2][1], 
                                                        width: "16.25%",
                                                        fontSize: "clamp(10px, 2vw, 14px)",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        padding: "4px"
                                                    }}>Fail</td>
                                                </tr>
                                                {teleAlgaeData.length > 0 ? (
                                                    teleAlgaeData.map((match, index) => (
                                                        <tr key={index}>
                                                            <td style={{
                                                                backgroundColor: Colors[2][1],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.match}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[2][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.removed}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[2][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.processorSuccess}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[2][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.processorFail}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[2][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.netSuccess}</td>
                                                            <td style={{
                                                                backgroundColor: Colors[2][0],
                                                                fontSize: "clamp(10px, 2vw, 14px)",
                                                                padding: "4px"
                                                            }}>{match.netFail}</td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td colSpan="6" style={{
                                                            backgroundColor: Colors[2][0], 
                                                            textAlign: "center",
                                                            fontSize: "clamp(10px, 2vw, 14px)",
                                                            padding: "4px"
                                                        }}>No match data available</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            <div style={{clear: "both"}}></div>
                            <div className={styles.teleRightAlignment}>
                                <div className={styles.alignElements}>
                                    <div className={styles.coralAndHP}>
                                        <div className={styles.valueBoxes}>
                                            <table className={styles.differentTable}> 
                                                <tbody>
                                                    <tr>
                                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][2], width:"34px"}} rowSpan="2">HP</td>
                                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][1]}}>Success</td>
                                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][1]}}>Scored</td>
                                                    </tr>
                                                    <tr>
                                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][0]}}>{`${Math.round(10*data.tele.successHp)/10}%`}</td>
                                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[2][0]}}>{Math.round(10*data.tele.avgHp)/10}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                        <table className={styles.coralTable}> 
                                            <tbody>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[2][2]}} rowSpan="2">Coral</td>
                                                    <td style={{backgroundColor: Colors[2][1]}} >Success</td>
                                                    <td style={{backgroundColor: Colors[2][1],  width:"44px"}} >Total</td>
                                                </tr>
                                                <tr>
                                                    <td style={{backgroundColor: Colors[2][0]}}>{`${Math.round(10*data.tele.coral.success)/10}%`}</td>
                                                    <td style={{backgroundColor: Colors[2][0]}}>{Math.round(10*data.tele.coral.total)/10}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className={styles.fourByTwoContainer}>
                                        <FourByTwo
                                            HC1="Success"
                                            HC2="Avg Coral"
                                            HR1="L4"
                                            R1C1={`${Math.round(10*data.tele.coral.successL4)/10}%`}
                                            R1C2={Math.round(10*data.tele.coral.avgL4)/10}
                                            HR2="L3"
                                            R2C1={`${Math.round(10*data.tele.coral.successL3)/10}%`}
                                            R2C2={Math.round(10*data.tele.coral.avgL3)/10}
                                            HR3="L2"
                                            R3C1={`${Math.round(10*data.tele.coral.successL2)/10}%`}
                                            R3C2={Math.round(10*data.tele.coral.avgL2)/10}
                                            HR4="L1"
                                            R4C1={`${Math.round(10*data.tele.coral.successL1)/10}%`}
                                            R4C2={Math.round(10*data.tele.coral.avgL1)/10}
                                            color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                        />
                                    </div>
                                </div>
                                <div className={styles.alignElements}>
                                    <div className={styles.rightColumnBoxesTwo}>
                                        <VBox color1={Colors[2][2]} color2={Colors[2][0]} color3={Colors[2][2]} title={"Algae Removed"} value={Math.round(10*data.tele.algae.removed)/10} />
                                    </div>
                                    <div className={styles.twoByTwoContainer}>
                                        <TwoByTwo
                                            HC1="Success" 
                                            HC2="Avg Algae"
                                            HR1="Prcsr"
                                            R1C1={`${Math.round(10*data.tele.algae.successProcessor)/10}%`}
                                            R1C2={Math.round(10*data.tele.algae.avgProcessor)/10}
                                            HR2="Net"
                                            R2C1={`${Math.round(10*data.tele.algae.successNet)/10}%`}
                                            R2C2={Math.round(10*data.tele.algae.avgNet)/10}
                                            color1={Colors[2][2]} color2={Colors[2][1]} color3={Colors[2][0]}
                                        />
                                    </div>
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
                            <table className={styles.differentTable} style={{borderRadius: "5px"}}>
                                <tbody>
                                    <tr>
                                        <td style={{backgroundColor: Colors[3][2]}} rowSpan="2">Cage</td>
                                        <td style={{backgroundColor: Colors[3][1]}}>Attempt</td>
                                        <td style={{backgroundColor: Colors[3][1]}}>Success</td>
                                    </tr>
                                    <tr>
                                        <td style={{backgroundColor: Colors[3][0]}}>{`${Math.round(10*data.attemptCage)/10}%`}</td>
                                        <td style={{backgroundColor: Colors[3][0]}}>{`${Math.round(10*data.successCage)/10}%`}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.qualitative}>
                            <h1 className={styles.header} style={{ color: Colors[4][3] }}>Qualitative</h1>
                            <div className={styles.radarContainer}>
                                <h4 className={styles.graphTitle}>Defense Played Ratings</h4>
                                <div style={{ marginTop: "50px", display: "flex", justifyContent: "center", width: "100%" }}>
                                    <BarChart
                                        width={400}
                                        height={300}
                                        data={(() => {
                                            const allRows = data.rows || [];
                                            const getDefensePlayed = (row) => {
                                                const fieldVariants = ['defenseplayed', 'defensePlayed', 'DEFENSEPLAYED', 'defense_played', 'DefensePlayed'];
                                                for (const field of fieldVariants) {
                                                    if (row[field] !== undefined && row[field] !== null && row[field] > 0) {
                                                        return row[field];
                                                    }
                                                }
                                                return null;
                                            };
                                            
                                            if (team == 69) {
                                                console.log("TEAM 69 DETECTED - DEBUGGING DEFENSE RATINGS");
                                                console.log("Number of rows:", allRows.length);
                                                allRows.forEach((row, index) => {
                                                    const defenseValue = getDefensePlayed(row);
                                                    console.log(`Row ${index} - Match ${row.match} - Scout: ${row.scoutname} - Defense: ${defenseValue}`);
                                                });
                                            }
                                            
                                            const validDefenseRatings = allRows.filter(row => {
                                                const defenseValue = getDefensePlayed(row);
                                                return row.team == team && defenseValue !== null;
                                            });
                                            
                                            if (validDefenseRatings.length > 0) {
                                                const totalSum = validDefenseRatings.reduce((sum, row) => {
                                                    const defenseValue = getDefensePlayed(row);
                                                    return sum + defenseValue;
                                                }, 0);
                                                
                                                const totalAvg = totalSum / validDefenseRatings.length;
                                                
                                                const chartData = [
                                                    { name: 'TOTAL', value: totalAvg }
                                                ];
                                                
                                                const scoutMap = {};
                                                validDefenseRatings.forEach(row => {
                                                    const scoutName = row.scoutname || 'Unknown';
                                                    if (!scoutMap[scoutName]) {
                                                        scoutMap[scoutName] = [];
                                                    }
                                                    scoutMap[scoutName].push(getDefensePlayed(row));
                                                });
                                                
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
                                                
                                                return chartData;
                                            } 
                                            
                                            if (data.qualitative) {
                                                const defenseItem = data.qualitative.find(q => q.name === "Defense Played");
                                                if (defenseItem && defenseItem.rating > 0) {
                                                    return [{ name: 'TOTAL', value: defenseItem.rating }];
                                                }
                                            }
                                            
                                            return [{ name: 'TOTAL', value: 0 }];
                                        })()}
                                        margin={{ top: 10, right: 30, left: 20, bottom: 70 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis 
                                            dataKey="name" 
                                            angle={-90} 
                                            textAnchor="end" 
                                            height={70} 
                                            tick={{ dy: 10 }}
                                        />
                                        <YAxis 
                                            domain={[0, 6]} 
                                            ticks={[0, 1, 2, 3, 4, 5, 6]}
                                            interval={0}
                                        />
                                        <Tooltip formatter={(value) => value.toFixed(1)} />
                                        <Bar dataKey="value" fill={Colors[4][2]} />
                                    </BarChart>
                                </div>
                            </div>
                            <table className={styles.differentTable}> 
                                <tbody>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][2], width: "40px"}} rowSpan="2">Coral Intake</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px", height: "10px"}}>Ground</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px"}}>Source</td>
                                    </tr>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="groundcheck" type="checkbox" readOnly checked={data.coralGroundIntake}></input></td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="sourcecheck" type="checkbox" readOnly checked={data.coralStationIntake}></input></td>
                                    </tr>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][2], width: "40px"}} rowSpan="2">Algae Intake</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px", height: "10px"}}>Ground</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px"}}>Lollipop</td>
                                    </tr>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="groundcheck" type="checkbox" readOnly checked={data.algaeGroundIntake}></input></td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="sourcecheck" type="checkbox" readOnly checked={data.lollipop}></input></td>
                                    </tr>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][2], width: "40px"}} rowSpan="2">Reef Intake</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px", height: "10px"}}>Low</td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][1], width: "50px"}}>High</td>
                                    </tr>
                                    <tr>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="groundcheck" type="checkbox" readOnly checked={data.algaeLowReefIntake}></input></td>
                                        <td className={styles.coloredBoxes} style={{backgroundColor: Colors[4][0], width: "50px", height: "30px"}}><input id="sourcecheck" type="checkbox" readOnly checked={data.algaeHighReefIntake}></input></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}