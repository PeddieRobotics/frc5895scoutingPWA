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
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';




export default function Home() {
  const [noShow, setNoShow] = useState(false);
  const [humanplayer, setHumanPlayer] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [defense, setDefense] = useState(false);
  const [matchType, setMatchType] = useState("2");
  const [scoutProfile, setScoutProfile] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [formData, setFormData] = useState(null);
  const [qrCodeDataURL, setQrCodeDataURL] = useState("");
  const [qrCodeDataURL1, setQrCodeDataURL1] = useState("");
  const [qrCodeDataURL2, setQrCodeDataURL2] = useState("");
  const [viewMode, setViewMode] = useState('qualitative'); // 'qualitative' or 'quantitative'


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

  const generateTabSeparatedString = (data) => {
    const boolToSheets = (value) => value ? "TRUE" : "FALSE";
    
    // Calculate composite values
    const autoCoralL1L2 = (data.autol1success || 0) + (data.autol2success || 0);
    const autoCoralMissed = 
      (data.autol1fail || 0) + 
      (data.autol2fail || 0) + 
      (data.autol3fail || 0) + 
      (data.autol4fail || 0) +
      (data.autoprocessorfail || 0);
  
    const teleCoralL1L2 = (data.telel1success || 0) + (data.telel2success || 0);
    const teleCoralMissed = 
      (data.telel1fail || 0) + 
      (data.telel2fail || 0) + 
      (data.telel3fail || 0) + 
      (data.telel4fail || 0) +
      (data.teleprocessorfail || 0);
  
    // Climb status calculations
    const climbStatus = data.stageplacement || -1;
    const parked = climbStatus === 0 ? "TRUE" : "FALSE";
    const shallowClimb = climbStatus === 1 ? "TRUE" : "FALSE";
    const deepClimb = climbStatus === 2 ? "TRUE" : "FALSE";
  
    // Combine notes
    const notes = [
      data.breakdowncomments,
      data.defensecomments,
      data.generalcomments
    ].filter(Boolean).join("; ") || "NULL";
  
    // New order mapping
    const values = [
      data.scoutname || "NULL",         // scouter name
      data.match || "NULL",             // match num
      data.team || "NULL",              // team scouted
      boolToSheets(!data.noshow),       // showed up
      "NULL",                           // starting position (not collected)
      boolToSheets(data.leave),         // leave
      autoCoralL1L2,                    // auto coral L1/2
      data.autol3success || 0,          // auto coral L3
      data.autol4success || 0,          // auto coral L4
      data.autoprocessorsuccess || 0,   // auto processor
      data.autoalgaeremoved || 0,       // auto barge
      autoCoralMissed,                  // auto missed
      teleCoralL1L2,                    // tele coral l1/2
      data.telel3success || 0,          // tele coral l3
      data.telel4success || 0,          // tele coral l4
      data.teleprocessorsuccess || 0,   // tele processor
      data.telealgaeremoved || 0,       // tele barge
      teleCoralMissed,                  // tele missed
      "NULL",                           // climb time (not collected)
      parked,                           // parked
      shallowClimb,                     // shallow climb
      deepClimb,                        // deep climb
      notes                             // notes
    ];
  
    return values.join("\t");
  };


  
  // Generate QR code data URL using the qrcode library
  const generateQRDataURL = async (data) => {
    try {
      const compressedData = pako.gzip(new TextEncoder().encode(JSON.stringify(data)));
      const base58Encoded = base58.encode(compressedData);
  
      // Generate original QR code
      const dataURL1 = await QRCode.toDataURL(base58Encoded, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });
  
      // Generate TSV QR code
      const tsvString = generateTabSeparatedString(data);
      const dataURL2 = await QRCode.toDataURL(tsvString, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });
  
      setQrCodeDataURL1(dataURL1);
      setQrCodeDataURL2(dataURL2);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  useEffect(() => {
    if (formData) {
      generateQRDataURL(formData);
    }
  }, [formData]);



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
 async function generateQRCode(e) {
    e.preventDefault();
    
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

    // Add timestamp and unique identifier to data
    data.timestamp = new Date().toISOString();
    data.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Store the form data for QR code generation
    setFormData(data);
    setShowQRCode(true);
    
    // Save scout profile for next time
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
    }
  }
  
  // Handle QR code scan completion
  const handleQRClose = () => {
    setShowQRCode(false);
    
    // Reset all form states
    setNoShow(false);
    setHumanPlayer(false);
    setBreakdown(false);
    setDefense(false);
    setMatchType("2");
    setFormData(null);
  
    // Update scout profile
    if (scoutProfile) {
      const newProfile = {
        ...scoutProfile,
        match: String(Number(scoutProfile.match) + 1),
        matchType: "2" // Reset match type
      };
      setScoutProfile(newProfile);
      localStorage.setItem("ScoutProfile", JSON.stringify(newProfile));
    }
  
    // Confetti effect
    new JSConfetti().addConfetti({
      emojis: ['🐠', '🐡', '🦀', '🪸'],
      emojiSize: 100,
      confettiRadius: 3,
      confettiNumber: 100,
    });
  };

  console.log("page", matchType);

  return (

    <div className={styles.MainDiv}>

  

     {showQRCode ? (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2>Scan QR Codes to Submit Form Data</h2>
            <div className={styles.QRCodeRow}>
              {qrCodeDataURL1 && (
                <img 
                  src={qrCodeDataURL1} 
                  alt="QR Code 1" 
                  className={styles.QRCodeImage}
                />
              )}
              {qrCodeDataURL2 && (
                <img 
                  src={qrCodeDataURL2} 
                  alt="QR Code 2" 
                  className={styles.QRCodeImage}
                />
              )}
            </div>
            <p>After scanning, click the button below to close</p>
            <button onClick={handleQRClose} className={styles.QRCloseButton}>
              Done
            </button>
          </div>
        </div>
      ) : (

      <form ref={form} name="Scouting Form" onSubmit={generateQRCode}>
        <Header headerName={"JORMUNSCOUTR"} />
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
                    visibleName={"Cage Hazard"}
                    internalName={"cagehazard"}
                    description={"Cage Hazard"}
                    symbol={"ⵔ"}/>
                </div>
              <br></br>
              <span className={styles.subsubheading}>Intake</span>
              <hr className={styles.subsubheading}></hr>
              <div className={styles.Intake}>
                <Checkbox
                  visibleName={"Coral Ground"}
                  internalName={"coralgrndintake"}
                />
                <Checkbox
                  visibleName={"Coral Station"}
                  internalName={"coralstationintake"}
                />
                <Checkbox
                  visibleName={"Lollipop"}
                  internalName={"lollipop"}
                />
                <Checkbox
                  visibleName={"Algae Ground"}
                  internalName={"algaegrndintake"}
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
        <button id="submit" type="submit">GENERATE QR CODE</button>
      </form> ) }
    </div>
    
  );
}