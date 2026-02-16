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
import useGameConfig from "../../lib/useGameConfig";

export default function Home() {
  const { config, loading: configLoading } = useGameConfig();
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

  // Read qual config from game config
  const qualConfig = config?.display?.qual || {};
  const qualitativeFields = qualConfig.qualitativeFields || [
    { name: "maneuverability", label: "Maneuverability" },
    { name: "defensePlayed", label: "Defense Played" },
    { name: "defenseEvasion", label: "Defense Evasion" },
    { name: "aggression", label: "Aggression" }
  ];
  const checkboxFields = qualConfig.checkboxFields || [
    { name: "breakdown", label: "Broke Down", commentField: "breakdownComments", commentLabel: "Breakdown Comments" },
    { name: "defense", label: "Played Defense", commentField: "defenseComments", commentLabel: "Defense Comments" }
  ];
  const commentFields = qualConfig.commentFields || [
    { name: "generalComments", label: "General Comments" }
  ];
  const qrFieldOrder = qualConfig.qrFieldOrder || [
    "scoutname", "scoutteam", "match", "team", "noShow",
    ...qualitativeFields.map(f => f.name),
    ...checkboxFields.flatMap(f => [f.name, f.commentField]),
    ...commentFields.map(f => f.name)
  ];

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
    const sortedTeams = [...data].sort((a, b) => {
      const firstQual = qualitativeFields[0]?.name || 'maneuverability';
      return (a[firstQual] || 0) - (b[firstQual] || 0);
    });

    const allComments = data.map(team =>
      checkboxFields.map(f => team[f.commentField])
        .concat(commentFields.map(f => team[f.name]))
        .filter(Boolean).join("; ")
    );

    return [
      data[0].match || "NULL",
      allianceColor.toUpperCase(),
      sortedTeams[0].team || "NULL",
      sortedTeams[1].team || "NULL",
      sortedTeams[2].team || "NULL",
      allComments.join(" | ") || "NULL"
    ].join("\t");
  };

  const generateQRDataURL = async (data) => {
    try {
      const jsonData = {
        formType: 'tripleQualitative',
        allianceColor,
        matchType,
        teams: data.map(team => {
          const teamObj = {
            scoutname: team.scoutname,
            scoutteam: team.scoutteam,
            match: team.match,
            team: team.team,
            noShow: team.noShow,
          };
          // Add qualitative fields
          qualitativeFields.forEach(f => { teamObj[f.name] = team[f.name]; });
          // Add checkbox + comment fields
          checkboxFields.forEach(f => {
            teamObj[f.name] = team[f.name];
            teamObj[f.commentField] = team[f.commentField];
          });
          // Add comment fields
          commentFields.forEach(f => { teamObj[f.name] = team[f.name]; });
          return teamObj;
        })
      };

      const tsvString = generateTSVString(data);

      const compressedJson = pako.gzip(new TextEncoder().encode(JSON.stringify(jsonData)));
      const jsonQR = await QRCode.toDataURL(base58.encode(compressedJson), {
        width: 400, margin: 3, errorCorrectionLevel: 'L'
      });

      const tsvQR = await QRCode.toDataURL(tsvString, {
        width: 400, margin: 3, errorCorrectionLevel: 'L'
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

    const collectedData = [0, 1, 2].map(index => {
      const teamData = {
        scoutname: formData.get('scoutname'),
        scoutteam: formData.get('scoutteam'),
        match: formData.get('match'),
        team: formData.get(`team${index}-team`),
        noShow: formData.get(`team${index}-noShow`) === 'on',
      };
      // Collect qualitative fields
      qualitativeFields.forEach(f => {
        teamData[f.name] = formData.get(`team${index}-${f.name}`);
      });
      // Collect checkbox + comment fields
      checkboxFields.forEach(f => {
        teamData[f.name] = formData.get(`team${index}-${f.name}`) === 'on';
        teamData[f.commentField] = formData.get(`team${index}-${f.commentField}`);
      });
      // Collect comment fields
      commentFields.forEach(f => {
        teamData[f.name] = formData.get(`team${index}-${f.name}`);
      });
      return teamData;
    });

    await generateQRDataURL(collectedData);
    setShowQRCode(true);
  };

  const handleQRClose = () => {
    setShowQRCode(false);

    const resetState = {};
    checkboxFields.forEach(f => { resetState[f.name] = false; });
    setTeamsData([
      { noShow: false, ...resetState },
      { noShow: false, ...resetState },
      { noShow: false, ...resetState }
    ]);
    setAllianceColor('red');
    setMatchType('2');

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

  if (configLoading) {
    return <div className={styles.MainDiv}><h1>Loading config...</h1></div>;
  }

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
              <TextInput visibleName="Scout Name:" internalName="scoutname" defaultValue={scoutProfile?.scoutname || ""} />
              <TextInput visibleName="Scout Team:" internalName="scoutteam" defaultValue={scoutProfile?.scoutteam || ""} type="number" />
              <TextInput visibleName="Match #:" internalName="match" defaultValue={scoutProfile?.match || ""} type="number" />
            </div>

            <div className={styles.configSection}>
              <MatchType onMatchTypeChange={setMatchType} defaultValue={matchType} />

              <div className={styles.allianceToggle}>
                <button type="button" className={`${styles.allianceButton} ${allianceColor === 'red' ? styles.active : ''}`} onClick={() => setAllianceColor('red')}>
                  RED ALLIANCE
                </button>
                <button type="button" className={`${styles.allianceButton} ${allianceColor === 'blue' ? styles.active : ''}`} onClick={() => setAllianceColor('blue')}>
                  BLUE ALLIANCE
                </button>
              </div>
            </div>
          </div>

          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.TeamSection}>
              <Header headerName={`Team ${index + 1}`} />

              <div className={styles.teamHeader}>
                <TextInput visibleName="Team Scouted:" internalName={`team${index}-team`} type="number" className={styles.centeredInput} />
                <Checkbox visibleName="No Show" internalName={`team${index}-noShow`} changeListener={(e) => handleTeamChange(index, 'noShow', e.target.checked)} className={styles.centeredCheckbox} />
              </div>

              {!teamsData[index].noShow && (
                <div className={styles.qualitativeSection}>
                  <div className={styles.qualGrid}>
                    {qualitativeFields.map(field => (
                      <Qualitative key={field.name} visibleName={field.label} internalName={`team${index}-${field.name}`} />
                    ))}
                  </div>

                  <div className={styles.commentSections}>
                    {checkboxFields.map(field => (
                      <div key={field.name}>
                        <Checkbox
                          visibleName={field.label}
                          internalName={`team${index}-${field.name}`}
                          changeListener={(e) => handleTeamChange(index, field.name, e.target.checked)}
                        />
                        {teamsData[index][field.name] && (
                          <CommentBox visibleName={field.commentLabel} internalName={`team${index}-${field.commentField}`} />
                        )}
                      </div>
                    ))}

                    {commentFields.map(field => (
                      <CommentBox key={field.name} visibleName={field.label} internalName={`team${index}-${field.name}`} />
                    ))}
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
