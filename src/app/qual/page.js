"use client";
import { useEffect, useRef, useState } from "react";
import Header from "../form-components/Header";
import TextInput from "../form-components/TextInput";
import styles from "../page.module.css";
import Checkbox from "../form-components/Checkbox";
import CommentBox from "../form-components/CommentBox";
import Qualitative from "../form-components/Qualitative";
import MatchType from "../form-components/MatchType";
import JSConfetti from 'js-confetti';
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';

export default function Home() {
  const [teamsData, setTeamsData] = useState([
    { noShow: false, breakdown: false, defense: false },
    { noShow: false, breakdown: false, defense: false },
    { noShow: false, breakdown: false, defense: false }
  ]);
  const [scoutProfile, setScoutProfile] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeDataURL1, setQrCodeDataURL1] = useState("");
  const [qrCodeDataURL2, setQrCodeDataURL2] = useState("");
  const [matchType, setMatchType] = useState("2");
  const [allianceColor, setAllianceColor] = useState("red");
  const form = useRef();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedProfile = localStorage.getItem("ScoutProfile");
      if (savedProfile) {
        const profile = JSON.parse(savedProfile);
        setScoutProfile(profile);
        setMatchType(profile.matchType || "2");
      }
    }
  }, []);

  const generateTSVString = (data) => {
    // Sort teams by maneuverability (1 = worst, 5 = best)
    const sortedTeams = [...data].sort((a, b) => a.maneuverability - b.maneuverability);
    
    // Combine all comments
    const allComments = data.map(team => [
      team.breakdownComments,
      team.defenseComments,
      team.generalComments
    ].filter(Boolean).join("; ") );

    return [
      data[0].match || "NULL",
      allianceColor.toUpperCase(),
      sortedTeams[0].team || "NULL",
      sortedTeams[1].team || "NULL",
      sortedTeams[2].team || "NULL",
      allComments || "NULL"
    ].join("\t");
  };

  const generateQRDataURL = async (data) => {
    try {
      // Generate JSON data
      const jsonData = {
        formType: 'tripleQualitative',
        allianceColor,
        matchType,
        teams: data.map(team => ({
          scoutname: team.scoutname,
          scoutteam: team.scoutteam,
          match: team.match,
          team: team.team,
          noShow: team.noShow,
          maneuverability: team.maneuverability,
          defensePlayed: team.defensePlayed,
          defenseEvasion: team.defenseEvasion,
          aggression: team.aggression,
          breakdown: team.breakdown,
          breakdownComments: team.breakdownComments,
          defense: team.defense,
          defenseComments: team.defenseComments,
          generalComments: team.generalComments
        }))
      };

      // Generate TSV data
      const tsvString = generateTSVString(data);

      // Create compressed JSON QR
      const compressedJson = pako.gzip(new TextEncoder().encode(JSON.stringify(jsonData)));
      const jsonQR = await QRCode.toDataURL(base58.encode(compressedJson), {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });

      // Create TSV QR
      const tsvQR = await QRCode.toDataURL(tsvString, {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      });

      setQrCodeDataURL1(jsonQR);
      setQrCodeDataURL2(tsvQR);
    } catch (error) {
      console.error("QR Generation Error:", error);
    }
  };

  const handleTeamChange = (index, field, value) => {
    const newTeams = [...teamsData];
    newTeams[index] = { ...newTeams[index], [field]: value };
    setTeamsData(newTeams);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form.current);
    
    const collectedData = [0, 1, 2].map(index => ({
      scoutname: formData.get('scoutname'),
      scoutteam: formData.get('scoutteam'),
      match: formData.get('match'),
      team: formData.get(`team${index}-team`),
      noShow: formData.get(`team${index}-noShow`) === 'on',
      maneuverability: formData.get(`team${index}-maneuverability`),
      defensePlayed: formData.get(`team${index}-defensePlayed`),
      defenseEvasion: formData.get(`team${index}-defenseEvasion`),
      aggression: formData.get(`team${index}-aggression`),
      breakdown: formData.get(`team${index}-breakdown`) === 'on',
      breakdownComments: formData.get(`team${index}-breakdownComments`),
      defense: formData.get(`team${index}-defense`) === 'on',
      defenseComments: formData.get(`team${index}-defenseComments`),
      generalComments: formData.get(`team${index}-generalComments`)
    }));

    await generateQRDataURL(collectedData);
    setShowQRCode(true);
  };

  const handleQRClose = () => {
    setShowQRCode(false);
    
    // Instead of form reset, manually clear inputs
    setTeamsData([
      { noShow: false, breakdown: false, defense: false },
      { noShow: false, breakdown: false, defense: false },
      { noShow: false, breakdown: false, defense: false }
    ]);
    setAllianceColor('red');
    setMatchType('2');
  
    // Update scout profile
    if (scoutProfile) {
      const newProfile = {
        ...scoutProfile,
        match: String(Number(scoutProfile.match) + 1)
      };
      setScoutProfile(newProfile);
      localStorage.setItem("ScoutProfile", JSON.stringify(newProfile));
    }
  
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
            <h2>Scan Both QR Codes</h2>
            <div className={styles.QRCodeRow}>
              <img src={qrCodeDataURL1} alt="JSON QR" className={styles.QRCodeImage} />
              <img src={qrCodeDataURL2} alt="TSV QR" className={styles.QRCodeImage} />
            </div>
            <button onClick={handleQRClose} className={styles.QRCloseButton}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form ref={form} onSubmit={handleSubmit}>
          <Header headerName="Match Info" />
          <div className={styles.allMatchInfo}>
            <div className={styles.MatchInfo}>
              <TextInput
                visibleName="Scout Name:"
                internalName="scoutname"
                defaultValue={scoutProfile?.scoutname || ""}
              />
              <TextInput
                visibleName="Scout Team:"
                internalName="scoutteam"
                defaultValue={scoutProfile?.scoutteam || ""}
                type="number"
              />
              <TextInput
                visibleName="Match #:"
                internalName="match"
                defaultValue={scoutProfile?.match || ""}
                type="number"
              />
            </div>
            
            <div className={styles.configSection}>
              <MatchType onMatchTypeChange={setMatchType} defaultValue={matchType} />
              
              <div className={styles.allianceToggle}>
                <button
                  type="button"
                  className={`${styles.allianceButton} ${allianceColor === 'red' ? styles.active : ''}`}
                  onClick={() => setAllianceColor('red')}
                >
                  RED ALLIANCE
                </button>
                <button
                  type="button"
                  className={`${styles.allianceButton} ${allianceColor === 'blue' ? styles.active : ''}`}
                  onClick={() => setAllianceColor('blue')}
                >
                  BLUE ALLIANCE
                </button>
              </div>
            </div>
          </div>

          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.TeamSection}>
              <Header headerName={`Team ${index + 1}`} />
              
              <div className={styles.teamHeader}>
                <TextInput
                  visibleName="Team Scouted:"
                  internalName={`team${index}-team`}
                  type="number"
                  className={styles.centeredInput}
                />
                <Checkbox
                  visibleName="No Show"
                  internalName={`team${index}-noShow`}
                  changeListener={(e) => handleTeamChange(index, 'noShow', e.target.checked)}
                  className={styles.centeredCheckbox}
                />
              </div>

              {!teamsData[index].noShow && (
                <div className={styles.qualitativeSection}>
                  <div className={styles.qualGrid}>
                    <Qualitative
                      visibleName="Maneuverability"
                      internalName={`team${index}-maneuverability`}
                    />
                    <Qualitative
                      visibleName="Defense Played"
                      internalName={`team${index}-defensePlayed`}
                    />
                    <Qualitative
                      visibleName="Defense Evasion"
                      internalName={`team${index}-defenseEvasion`}
                    />
                    <Qualitative
                      visibleName="Aggression"
                      internalName={`team${index}-aggression`}
                    />
                  </div>

                  <div className={styles.commentSections}>
                    <Checkbox
                      visibleName="Broke Down"
                      internalName={`team${index}-breakdown`}
                      changeListener={(e) => handleTeamChange(index, 'breakdown', e.target.checked)}
                    />
                    {teamsData[index].breakdown && (
                      <CommentBox
                        visibleName="Breakdown Comments"
                        internalName={`team${index}-breakdownComments`}
                      />
                    )}

                    <Checkbox
                      visibleName="Played Defense"
                      internalName={`team${index}-defense`}
                      changeListener={(e) => handleTeamChange(index, 'defense', e.target.checked)}
                    />
                    {teamsData[index].defense && (
                      <CommentBox
                        visibleName="Defense Comments"
                        internalName={`team${index}-defenseComments`}
                      />
                    )}

                    <CommentBox
                      visibleName="General Comments"
                      internalName={`team${index}-generalComments`}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button type="submit" className={styles.SubmitButton}>
            GENERATE QR CODE
          </button>
        </form>
      )}
    </div>
  );
}