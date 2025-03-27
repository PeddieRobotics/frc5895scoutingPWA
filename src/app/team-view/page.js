"use client";
import { useEffect, useRef, useState } from "react";
import Header from "./form-components/Header";
import TextInput from "./form-components/TextInput";
import styles from "./page.module.css";
import NumericInput from "./form-components/NumericInput";
import Checkbox from "./form-components/Checkbox";
import CommentBox from "./form-components/CommentBox";
import EndPlacement from "./form-components/EndPlacement";
import Qualitative from "./form-components/Qualitative";
import SubHeader from "./form-components/SubHeader";
import MatchType from "./form-components/MatchType";
import JSConfetti from 'js-confetti';


export default function Home() {
  const [noShow, setNoShow] = useState(false);
  const [humanplayer, setHumanPlayer] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [defense, setDefense] = useState(false);
  const [matchType, setMatchType] = useState("2");
  const [scoutProfile, setScoutProfile] = useState(null);

  const form = useRef();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedProfile = localStorage.getItem("ScoutProfile");
      if (savedProfile) {
        const profileData = JSON.parse(savedProfile)
        setScoutProfile(profileData);
        setMatchType(profileData.matchType || "2")
      }
    }
  }, []);
  
  function onNoShowChange(e) {
    let checked = e.target.checked;
    setNoShow(checked);
  }

  function onHumanPlayerChange(e) {
    let checked = e.target.checked;
    setHumanPlayer(checked);
  }

  function onBreakdownChange(e) {
    let checked = e.target.checked;
    setBreakdown(checked);
  }
  function onDefenseChange(e) {
    let checked = e.target.checked;
    setDefense(checked);
  }

  
  function handleMatchTypeChange(value){
    setMatchType(value);
    console.log("Selected match type:", value);
};


  // added from last years code (still review)
  async function submit(e) {
    e.preventDefault();
    //disable submit
    let submitButton = document.querySelector("#submit");//todo: get changed to a useRef
    submitButton.disabled = true;
    //import values from form to data variable

    let data = {noshow: false, leave: false, algaelowreefintake: false, algaehighreefintake: false, lollipop: false, algaegrndintake: false, coralgrndintake: false, coralstationintake: false, srcintake: false, breakdown: false, defense: false, stageplacement: -1, breakdowncomments: null, defensecomments: null, generalcomments: null };
    [...new FormData(form.current).entries()].forEach(([name, value]) => {
      if (value == 'on') {
        data[name] = true;
      } else {
        if (!isNaN(value) && value != "") {
          data[name] = +value;
        } else {
          data[name] = value;
        }
      }
    });
    //clear unneeded checkbox values
    data.breakdown = undefined;
    data.defense = undefined;

    //check pre-match data
    let preMatchInputs = document.querySelectorAll(".preMatchInput"); //todo: use the data object
    for (let preMatchInput of preMatchInputs) {
      if(preMatchInput.value == "" || preMatchInput.value <= "0") {
        alert("Invalid Pre-Match Data!");
        submitButton.disabled = false;
        return;
      } 
    }
    if (matchType == 2) {
      try {
        const response = await fetch(`/api/get-valid-team?team=${data.team}&match=${data.match}`)
        const validationData = await response.json();
        
        if (!validationData.valid) {
          alert("Invalid Team and Match Combination!");
          submitButton.disabled = false;
          return;
        }
      } catch (error) {
        console.error("Validation error:", error);
        alert("Error validating team and match. Please try again.");
        submitButton.disabled = false;
        return;
      }
    }

    //confirm and submit
    if (confirm("Are you sure you want to submit?") == true) {
      fetch('/api/add-match-data', {
        method: "POST",
        body: JSON.stringify(data)
      }).then((response)=> {
        if(response.status === 201) {
          return response.json();
        } else {
          return response.json().then(err => Promise.reject(err.message));
        }
      }) 
      .then(data => {
        alert("Thank you!");
        const jsConfetti = new JSConfetti();
        jsConfetti.addConfetti({
        emojis: ['🐠', '🐡', '🦀', '🪸'],
        emojiSize: 100,
        confettiRadius: 3,
        confettiNumber: 100,
       })
       
        if (typeof document !== 'undefined')  {
          let ScoutName = document.querySelector("input[name='scoutname']").value;
          let ScoutTeam = document.querySelector("input[name='scoutteam']").value;
          let Match = document.querySelector("input[name='match']").value;
          let newProfile = { 
            scoutname: ScoutName, 
            scoutteam: ScoutTeam, 
            match: Number(Match)+1,
            matchType: matchType 
          };
          setScoutProfile(newProfile);
          localStorage.setItem("ScoutProfile", JSON.stringify(newProfile));
          console.log(scoutProfile)
        }

        globalThis.scrollTo({ top: 0, left: 0, behavior: "smooth" });

        setTimeout(() => {
          location.reload()
        }, 2000);
      })
      .catch(error => {
        alert(error);
        submitButton.disabled = false;
      });

    } else {
      //user didn't want to submit
      submitButton.disabled = false;
    };
  }
console.log("page",matchType)

  return (
    <div className={styles.MainDiv}>
      <form ref={form} name="Scouting Form" onSubmit={submit}>
        <Header headerName={"Match Info"} />
        <div className={styles.allMatchInfo}>
        <div className={styles.MatchInfo}>
        <TextInput 
            visibleName={"Scout Name:"} 
            internalName={"scoutname"} 
            defaultValue={scoutProfile?.scoutname || ""}
          />
          <TextInput 
            visibleName={"Team #:"} 
            internalName={"scoutteam"} 
            defaultValue={scoutProfile?.scoutteam || ""}
            type={"number"}
          />
          <TextInput
            visibleName={"Team Scouted:"}
            internalName={"team"}
            defaultValue={""}
            type={"number"}
          />
          <TextInput 
            visibleName={"Match #:"} 
            internalName={"match"} 
            defaultValue={scoutProfile?.match || ""}
            type={"number"}
          />
        </div>
        <MatchType onMatchTypeChange={handleMatchTypeChange} defaultValue={matchType}/>
        <Checkbox
          visibleName={"No Show"}
          internalName={"noshow"}
          changeListener={onNoShowChange}
        />
        </div>
        {!noShow && (
          <>
            <div className={styles.Auto}>
              <Header headerName={"Auto"}/>
              <Checkbox visibleName={"Leave"} internalName={"leave"} />
              <div className={styles.Coral}>
                <SubHeader subHeaderName={"Coral"}/>
                <table className={styles.Table}>
                <thead >
                <tr>
                    <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                    </tr>
                </thead>
                  <tbody>
                  <tr>
                    <td><h2>L4</h2></td>
                    <td><NumericInput 
                      pieceType={"Success"}
                      internalName={"autol4success"}/>
                      </td>
                    <td><NumericInput 
                      pieceType={"Fail"}
                      internalName={"autol4fail"}/>
                      </td>
                    </tr> 
                  <tr>
                  <td><h2>L3</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"autol3success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"autol3fail"}/>
                    </td>
                  </tr>
                   <tr>
                  <td><h2>L2</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"autol2success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"autol2fail"}/>
                    </td>
                  </tr>
                   <tr>
                  <td><h2>L1</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"autol1success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"autol1fail"}/>
                    </td>
                  </tr>
                  </tbody>
                </table>
                </div>
              </div>
              <div className={styles.AlgaeRemoved}>
                <SubHeader subHeaderName={"Algae Removed Intentionally"}/>
                <div className={styles.HBox}>
                  <NumericInput 
                    pieceType={"Counter"}
                    internalName={"autoalgaeremoved"}/>
                </div>
              </div>
              <div className={styles.Processor}>
                <SubHeader subHeaderName={"Processor"} />
                <div className={styles.HBox}>
                  <NumericInput 
                    visibleName={"Success"}
                    pieceType={"Success"}
                    internalName={"autoprocessorsuccess"}/>
                  <NumericInput 
                    visibleName={"Fail"}
                    pieceType={"Fail"}
                    internalName={"autoprocessorfail"}/>
                </div>
              </div>
              <div className={styles.Net}>
                <SubHeader subHeaderName={"Net"} />
                <div className={styles.HBox}>
                  <NumericInput 
                    visibleName={"Success"}
                    pieceType={"Success"}
                    internalName={"autonetsuccess"}/>
                  <NumericInput 
                    visibleName={"Fail"}
                    pieceType={"Fail"}
                    internalName={"autonetfail"}/>
                </div>
              </div>
            <div className={styles.Auto}>
              <Header headerName={"Tele"}/>
              <div className={styles.Coral}>
                <SubHeader subHeaderName={"Coral"}/>
                <table className={styles.Table}>
                <thead>
                <tr>
                    <th></th>
                      <th>Success</th>
                      <th>Fail</th>
                    </tr>
                </thead>
                  <tbody>
                  <tr>
                    <td><h2>L4</h2></td>
                    <td><NumericInput 
                      pieceType={"Success"}
                      internalName={"telel4success"}/>
                      </td>
                    <td><NumericInput 
                      pieceType={"Fail"}
                      internalName={"telel4fail"}/>
                      </td>
                    </tr> 
                  <tr>
                  <td><h2>L3</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"telel3success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"telel3fail"}/>
                    </td>
                  </tr>
                   <tr>
                  <td><h2>L2</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"telel2success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"telel2fail"}/>
                    </td>
                  </tr>
                   <tr>
                  <td><h2>L1</h2></td>
                  <td><NumericInput 
                    pieceType={"Success"}
                    internalName={"telel1success"}/>
                    </td>
                  <td><NumericInput 
                    pieceType={"Fail"}
                    internalName={"telel1fail"}/>
                    </td>
                  </tr>
                  </tbody>
                </table>
                </div>
              </div>
              <div className={styles.AlgaeRemoved}>
                <SubHeader subHeaderName={"Algae Removed Intentionally"}/>
                <div className={styles.HBox}>
                  <NumericInput 
                    pieceType={"Counter"}
                    internalName={"telealgaeremoved"}/>
                </div>
              </div>
              <div className={styles.Processor}>
                <SubHeader subHeaderName={"Processor"} />
                <div className={styles.HBox}>
                  <NumericInput 
                    visibleName={"Success"}
                    pieceType={"Success"}
                    internalName={"teleprocessorsuccess"}/>
                  <NumericInput 
                    visibleName={"Fail"}
                    pieceType={"Fail"}
                    internalName={"teleprocessorfail"}/>
                </div>
              </div>
              <div className={styles.Net}>
                <SubHeader subHeaderName={"Net"} />
                <div className={styles.HBox}>
                <NumericInput 
                      visibleName={"Success"}
                      pieceType={"Success"}
                      internalName={"telenetsuccess"}/>
                    <NumericInput 
                      visibleName={"Fail"}
                      pieceType={"Fail"}
                      internalName={"telenetfail"}/>
                </div>
              </div>
              <div className={styles.HumanPlayer}>
              <SubHeader subHeaderName={"Human Player"}/>
              <Checkbox visibleName={"Human Player From Team?"} internalName={"humanplayer"} changeListener={onHumanPlayerChange}/>
              { humanplayer &&
                <div className={styles.HBox}>
                  <NumericInput 
                    visibleName={"Success"}
                    pieceType={"Success"}
                    internalName={"hpsuccess"}/>
                  <NumericInput 
                    visibleName={"Fail"}
                    pieceType={"Fail"}
                    internalName={"hpfail"}/>
                </div>
              }
              </div>
            <div className={styles.Endgame}>
              <Header headerName={"Endgame"}/>
              <EndPlacement/>
            </div>
            <div className={styles.PostMatch}>
              <br></br>
              <Header headerName={"Post-Match"}/>
              <span className={styles.subsubheading}>Intake</span>
              <hr className={styles.subsubheading}></hr>
              <div className={styles.Intake}>
                <Checkbox
                  visibleName={"Coral Ground"}
                  internalName={"coralgndintake"}
                />
                <Checkbox
                  visibleName={"Coral Station"}
                  internalName={"coralstationintake"}
                />
                <Checkbox
                  visibleName={"Lollipop"}
                  internalName={"algaegndintake"}
                />
                <Checkbox
                  visibleName={"Algae Ground"}
                  internalName={"algaegndintake"}
                />
                <Checkbox
                  visibleName={"Algae High Reef"}
                  internalName={"algaehighreefintake"}
                />
                <Checkbox
                  visibleName={"Algae Low Reef"}
                  internalName={"algaelowreefintake"}
                />
              </div>
                <div className={styles.Qual}>
                  <Qualitative                   
                    visibleName={"Coral Speed"}
                    internalName={"coralspeed"}
                    description={"Coral Speed"}/>
                  <Qualitative                   
                    visibleName={"Processor Speed"}
                    internalName={"processorspeed"}
                    description={"Processor Speed"}/>
                  <Qualitative                   
                    visibleName={"Net Speed"}
                    internalName={"netspeed"}
                    description={"Net Speed"}/>
                  <Qualitative                   
                    visibleName={"Algae Removal Speed"}
                    internalName={"algaeremovalspeed"}
                    description={"Algae Removal Speed"}/>
                  <Qualitative                   
                    visibleName={"Climb Speed"}
                    internalName={"climbspeed"}
                    description={"Climb Speed"}/>
                  <Qualitative                   
                    visibleName={"Maneuverability"}
                    internalName={"maneuverability"}
                    description={"Maneuverability"}/>
                  <Qualitative                   
                    visibleName={"Defense Played"}
                    internalName={"defenseplayed"}
                    description={"Ability to Play Defense"}/>
                  <Qualitative                   
                    visibleName={"Defense Evasion"}
                    internalName={"defenseevasion"}
                    description={"Defense Evasion Ability"}/>
                  <Qualitative
                    visibleName={"Aggression"}
                    internalName={"aggression"}
                    description={"Aggression"}
                    symbol={"ⵔ"}/>
                  <Qualitative
                    visibleName={"Cage Hazard"}
                    internalName={"cagehazard"}
                    description={"Cage Hazard"}
                    symbol={"ⵔ"}/>
                </div>
              <br></br>

              <Checkbox visibleName={"Broke down?"} internalName={"breakdown"} changeListener={onBreakdownChange} />
              { breakdown &&
                <CommentBox
                  visibleName={"Breakdown Elaboration"}
                  internalName={"breakdowncomments"}
                />
              }
              <Checkbox visibleName={"Played Defense?"} internalName={"defense"} changeListener={onDefenseChange}/>
              { defense &&
                <CommentBox
                  visibleName={"Defense Elaboration"}
                  internalName={"defensecomments"}
                />
              }
              <CommentBox
                visibleName={"General Comments"}
                internalName={"generalcomments"}
              />
            </div>
          </>
        )}
        <br></br>
        <button id="submit" type="submit">SUBMIT</button>
      </form>
    </div>
  );
}