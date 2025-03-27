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


    // let data={
    //   team: 2485,
    //   name: "Overclocked",
    //   avgEpa: 73,
    //   avgAuto: 20,
    //   avgTele: 56,
    //   avgEnd: 12,
    //   last3Epa: 70,
    //   last3Auto: 30,
    //   last3Tele: 53,
    //   last3End: 2,
    //   epaOverTime: [{match: 3, epa: 60},{match: 10, epa: 43},{match: 13, epa: 12}],
    //   epaRegression: [{match: 3, epa: 60}, {match: 13, epa: 12}], //not sure how we should do this one
    //   consistency: 98,
    //   defense: 11,
    //   lastBreakdown: 2,
    //   noShow: 1,
    //   breakdown: 9,
    //   matchesScouted: 3,
    //   scouts: ["Yael", "Ella", "Max",],
    //   generalComments: ["pretty good", "fragile intake","hooray!"],
    //   breakdownComments: ["stopped moving"],
    //   defenseComments: ["defended coral human player station"],
    //   autoOverTime: [{match: 8, epa: 60},{match: 10, epa: 10},{match: 13, epa: 2}],
    //   leave: 93,
    //   auto: {
    //     coral: {
    //       total: 7,
    //       success: 88,
    //       avgL1: 3,
    //       avgL2: 4,
    //       avgL3: 7,
    //       avgL4: 1,
    //       successL1: 90,
    //       successL2: 87,
    //       successL3: 23,
    //       successL4: 100
    //     },
    //     algae: {
    //       removed: 1,
    //       avgProcessor: 0,
    //       avgNet: 1,
    //       successProcessor: 0,
    //       successNet: 100,
    //     },
    //   },
    //   teleOverTime: [{match: 8, epa: 30}, {match: 10, epa: 78}, {match: 13, epa: 42}],
    //   tele: {
    //     coral: {
    //       total: 15,
    //       success: 82,
    //       avgL1: 9,
    //       avgL2: 3,
    //       avgL3: 6,
    //       avgL4: 2,
    //       successL1: 93,
    //       successL2: 81,
    //       successL3: 29,
    //       successL4: 80
    //     },
    //     algae: {
    //       removed: 3,
    //       avgProcessor: 2,
    //       avgNet: 4,
    //       successProcessor: 76,
    //       successNet: 11,
    //     },
    //     avgHp: 3,
    //     successHp: 13,
    //   },
    //   endPlacement: {
    //     none: 10,
    //     park: 20,
    //     deep: 12,
    //     shallow: 38,
    //     parkandFail: 10,
    //   },
    //   attemptCage: 94,
    //   successCage: 68,
    //   qualitative: [
    //     {name: "Coral Speed", rating: 5},
    //     {name: "Processor Speed", rating: 4},
    //     {name: "Net Speed", rating: 3},
    //     {name: "Algae Removal Speed", rating: 5},
    //     {name: "Climb Speed", rating: 3},
    //     {name: "Maneuverability", rating: 4},
    //     {name: "Defense Played", rating: 5},
    //     {name: "Defense Evasion", rating: 0},
    //     {name: "Aggression*", rating: 1},
    //     {name: "Cage Hazard*", rating: 2},
    //   ],
    //   coralGroundIntake: true,
    //   coralStationIntake: true,
    //   algaeGroundIntake: false,
    //   algaeLowReefIntake: false,
    //   algaeHighReefIntake: true,
    //   lollipop: true,
    // }
    // Fetch team data from backend
    function fetchTeamData(team) {
      setLoading(true);
      setError(null);
  
      fetch(`/api/get-team-data?team=${team}`)
          .then(response => {
              if (!response.ok) {
                  throw new Error("Failed to fetch data");
              }
              return response.json();
          })
          .then(data => {
              console.log("Fetched Data:", data);  // <-- Log the data received

              setData(data);
              console.log("Coral Total (Frontend):", data.leave);
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


    return (<div>
          <TopBar></TopBar>
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
                color={Colors[3]} 
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
            <h4 className={styles.graphTitle} >Qualitative Ratings</h4>
              <Qualitative data={data.qualitative} color1={Colors[4][2]} color2={Colors[4][2]}/>
            <p>*Inverted so outside is good</p>
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
    )

  }