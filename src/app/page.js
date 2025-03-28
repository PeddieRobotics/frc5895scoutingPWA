"use client";
import { useEffect, useRef, useState } from "react";
import Header from "./form-components/Header";
import TextInput from "./form-components/TextInput";
import styles from "./page.module.css";
import NumericInput from "./form-components/NumericInput";
import Checkbox from "./form-components/Checkbox";
import CommentBox from "./form-components/CommentBox";
import EndPlacement from "./form-components/EndPlacement";
import SubHeader from "./form-components/SubHeader";
import JSConfetti from 'js-confetti';
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';

export default function Home() {
  const [noShow, setNoShow] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [defense, setDefense] = useState(false);
  const [scoutProfile, setScoutProfile] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [formData, setFormData] = useState(null);
  const [qrCodeDataURL1, setQrCodeDataURL1] = useState("");
  const [qrCodeDataURL2, setQrCodeDataURL2] = useState("");
  const [isOnline, setIsOnline] = useState(true);


  const form = useRef();

  

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedProfile = localStorage.getItem("ScoutProfile");
      if (savedProfile) {
        const profileData = JSON.parse(savedProfile)
        setScoutProfile(profileData);
      }
    }
  }, []);

  const generateTabSeparatedString = (data) => {
    const boolToSheets = (value) => value ? "TRUE" : "FALSE";
    
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
  
    const climbStatus = data.stageplacement || -1;
    const parked = climbStatus === 0 ? "TRUE" : "FALSE";
    const shallowClimb = climbStatus === 1 ? "TRUE" : "FALSE";
    const deepClimb = climbStatus === 2 ? "TRUE" : "FALSE";
  
    const notes = [
      data.breakdowncomments,
      data.defensecomments,
      data.generalcomments
    ].filter(Boolean).join("; ") || "NULL";

    const values = [
      data.scoutname || "NULL",
      data.match || "NULL",
      data.team || "NULL",
      boolToSheets(!data.noshow),
      "NULL",
      boolToSheets(data.leave),
      autoCoralL1L2,
      data.autol3success || 0,
      data.autol4success || 0,
      data.autoprocessorsuccess || 0,
      data.autoalgaeremoved || 0,
      autoCoralMissed,
      teleCoralL1L2,
      data.telel3success || 0,
      data.telel4success || 0,
      data.teleprocessorsuccess || 0,
      data.telealgaeremoved || 0,
      teleCoralMissed,
      "NULL",
      parked,
      shallowClimb,
      deepClimb,
      notes
    ];
  
    return values.join("\t");
  };

  const generateQRDataURL = async (data) => {
    try {
      const compressedData = pako.gzip(new TextEncoder().encode(JSON.stringify(data)));
      const base58Encoded = base58.encode(compressedData);
  
      const dataURL1 = await QRCode.toDataURL(base58Encoded, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });
  
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
    setNoShow(e.target.checked);
  }

  function onBreakdownChange(e) {
    setBreakdown(e.target.checked);
  }

  function onDefenseChange(e) {
    setDefense(e.target.checked);
  }

  async function generateQRCode(e) {
    e.preventDefault();
    
    let data = {
      noshow: false, 
      leave: false, 
      breakdown: false, 
      defense: false, 
      stageplacement: -1, 
      breakdowncomments: null, 
      defensecomments: null, 
      generalcomments: null,
      scoutteam: "5895"
    };
    
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

    let preMatchInputs = document.querySelectorAll(".preMatchInput");
    for (let preMatchInput of preMatchInputs) {
      if(preMatchInput.value == "" || preMatchInput.value <= "0") {
        alert("Invalid Pre-Match Data!");
        return; 
      } 
    }

    data.timestamp = new Date().toISOString();
    data.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    setFormData(data);
    setShowQRCode(true);
    
    if (typeof document !== 'undefined')  {
      const newProfile = { 
        scoutname: data.scoutname, 
        scoutteam: "5895",
        match: Number(data.match)+1,
      };
      setScoutProfile(newProfile);
      localStorage.setItem("ScoutProfile", JSON.stringify(newProfile));
    }
  }
  
  const handleQRClose = () => {
    setShowQRCode(false);
    setNoShow(false);
    setBreakdown(false);
    setDefense(false);
    setFormData(null);

    new JSConfetti().addConfetti({
      emojis: ['🐠', '🐡', '🦀', '🪸'],
      emojiSize: 100,
      confettiRadius: 3,
      confettiNumber: 100,
    });
  };

  return (
    <div className={styles.MainDiv}>
      {showQRCode ? (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2>Scan QR Codes to Submit Form Data</h2>
            <div className={styles.QRCodeRow}>
              {qrCodeDataURL1 && <img src={qrCodeDataURL1} alt="QR Code 1" className={styles.QRCodeImage} />}
              {qrCodeDataURL2 && <img src={qrCodeDataURL2} alt="QR Code 2" className={styles.QRCodeImage} />}
            </div>
            <button onClick={handleQRClose} className={styles.QRCloseButton}>Done</button>
          </div>
        </div>
      ) : (
        <form ref={form} name="Scouting Form" onSubmit={generateQRCode}>
          <Header headerName={"JÖRMUNSCOUTR"} />
          <div className={styles.allMatchInfo}>
            <div className={styles.MatchInfo}>
              <TextInput 
                visibleName={"Scout Name:"} 
                internalName={"scoutname"} 
                defaultValue={scoutProfile?.scoutname || ""}
              />
              <TextInput
                visibleName={"Team Scouted:"}
                internalName={"team"}
                type={"number"}
              />
              <TextInput 
                visibleName={"Match #:"} 
                internalName={"match"} 
                defaultValue={scoutProfile?.match || ""}
                type={"number"}
              />
            </div>
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
                        <td><NumericInput pieceType={"Success"} internalName={"autol4success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"autol4fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L3</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"autol3success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"autol3fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L2</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"autol2success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"autol2fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L1</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"autol1success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"autol1fail"}/></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className={styles.AlgaeRemoved}>
                  <SubHeader subHeaderName={"Algae Removed Intentionally"}/>
                  <NumericInput pieceType={"Counter"} internalName={"autoalgaeremoved"}/>
                </div>
                <div className={styles.Processor}>
                  <SubHeader subHeaderName={"Processor"} />
                  <div className={styles.HBox}>
                    <NumericInput pieceType={"Success"} visibleName={"Success"} internalName={"autoprocessorsuccess"}/>
                    <NumericInput pieceType={"Fail"} visibleName={"Fail"} internalName={"autoprocessorfail"}/>
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
                        <td><NumericInput pieceType={"Success"} internalName={"telel4success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"telel4fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L3</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"telel3success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"telel3fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L2</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"telel2success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"telel2fail"}/></td>
                      </tr>
                      <tr>
                        <td><h2>L1</h2></td>
                        <td><NumericInput pieceType={"Success"} internalName={"telel1success"}/></td>
                        <td><NumericInput pieceType={"Fail"} internalName={"telel1fail"}/></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className={styles.AlgaeRemoved}>
                  <SubHeader subHeaderName={"Algae Removed Intentionally"}/>
                  <NumericInput pieceType={"Counter"} internalName={"telealgaeremoved"}/>
                </div>
                <div className={styles.Processor}>
                  <SubHeader subHeaderName={"Processor"} />
                  <div className={styles.HBox}>
                    <NumericInput visibleName={"Success"} pieceType={"Success"} internalName={"teleprocessorsuccess"}/>
                    <NumericInput visibleName={"Fail"} pieceType={"Fail"}  internalName={"teleprocessorfail"}/>
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

              <CommentBox
                  visibleName={"General Comments"}
                  internalName={"generalcomments"}
              />

              <Checkbox 
                  visibleName={"Playing Defense?"} 
                  internalName={"defense"} 
                  changeListener={onDefenseChange}
                />
                {defense && (
                  <CommentBox
                    visibleName={"Defense Elaboration"}
                    internalName={"defensecomments"}
                  />
                )}    


              </div>



              <div className={styles.Endgame}>
                <Header headerName={"Endgame"}/>
                <EndPlacement/>
              </div>

              <div className={styles.PostMatch}>
                <Header headerName={"Post-Match"}/>
                <SubHeader subHeaderName={"Intake"}/>
                <div className={styles.Intake}>
                  <Checkbox visibleName={"Coral Ground"} internalName={"coralgrndintake"}/>
                  <Checkbox visibleName={"Coral Station"} internalName={"coralstationintake"}/>
                  <Checkbox visibleName={"Algae Ground"} internalName={"algaegrndintake"}/>
                  <Checkbox visibleName={"Algae High Reef"} internalName={"algaehighreefintake"}/>
                  <Checkbox visibleName={"Algae Low Reef"} internalName={"algaelowreefintake"}/>
                </div>
                <Checkbox 
                  visibleName={"Broke down?"} 
                  internalName={"breakdown"} 
                  changeListener={onBreakdownChange} 
                />
                {breakdown && (
                  <CommentBox
                    visibleName={"Breakdown Elaboration"}
                    internalName={"breakdowncomments"}
                  />
                )}
               
                
              </div>
            </>
          )}
          <button id="submit" type="submit" >GENERATE QR CODE</button>
        </form>
      )}
    </div>
  );
}