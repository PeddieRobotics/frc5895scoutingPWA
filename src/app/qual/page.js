"use client";
import { useEffect, useRef, useState } from "react";
import Header from "../form-components/Header";
import DynamicField from "../form-components/DynamicField";
import styles from "../page.module.css";
import JSConfetti from 'js-confetti';
import QRCode from "qrcode";
import pako from 'pako';
import base58 from 'base-58';
// Load active form config from server

export default function QualForm() {
  const form = useRef();
  const [formConfig, setFormConfig] = useState(undefined); // undefined=loading, null=not set
  const [matchState, setMatchState] = useState({});
  const [teamsState, setTeamsState] = useState([]);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeDataURL1, setQrCodeDataURL1] = useState("");
  const [qrCodeDataURL2, setQrCodeDataURL2] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch('/api/themes/active', { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
        let cfg = null;
        if ((resp.headers.get('content-type') || '').includes('application/json')) {
          const json = await resp.json();
          cfg = json?.item?.config || null;
        }
        setFormConfig(cfg);
        const ims = {};
        (cfg?.matchInfo || []).forEach(f => { ims[f.name] = f.default || ""; });
        const its = {};
        (cfg?.teamFields || []).forEach(f => { its[f.name] = f.type === 'checkbox' ? false : ""; });
        setMatchState(ims);
        setTeamsState(Array.from({ length: (cfg?.teamsCount || 0) }, () => ({ ...its })));
      } catch (e) {
        console.error('Failed to load active theme config', e);
        setFormConfig(null);
      }
    };
    load();
  }, []);

  const generateTSVString = (data, match) => {
    const sortedTeams = [...data].sort((a, b) => (a[formConfig?.sortField] || 0) - (b[formConfig?.sortField] || 0));
    const allComments = data
      .map(team => (formConfig?.commentFields || []).map(f => team[f]).filter(Boolean).join("; "))
      .join("; ");
    return [
      match.match || "NULL",
      (match.allianceColor || "").toUpperCase(),
      sortedTeams[0]?.team || "NULL",
      sortedTeams[1]?.team || "NULL",
      sortedTeams[2]?.team || "NULL",
      allComments || "NULL"
    ].join("\t");
  };

  const generateQRDataURL = async (teams, match) => {
    const jsonData = { formType: 'dynamic', match, teams };
    const tsvString = generateTSVString(teams, match);
    const compressedJson = pako.gzip(new TextEncoder().encode(JSON.stringify(jsonData)));
    const jsonQR = await QRCode.toDataURL(base58.encode(compressedJson), { width: 400, margin: 3, errorCorrectionLevel: 'L' });
    const tsvQR = await QRCode.toDataURL(tsvString, { width: 400, margin: 3, errorCorrectionLevel: 'L' });
    setQrCodeDataURL1(jsonQR);
    setQrCodeDataURL2(tsvQR);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form.current);

    const matchData = {};
    (formConfig?.matchInfo || []).forEach(f => {
      let val = formData.get(f.name);
      if (f.type === 'checkbox') val = formData.get(f.name) === 'on';
      matchData[f.name] = val;
    });

    const teamsData = teamsState.map((_, index) => {
      const obj = {};
      (formConfig?.teamFields || []).forEach(f => {
        const fieldName = `team${index}-${f.name}`;
        let val = formData.get(fieldName);
        if (f.type === 'checkbox') val = formData.get(fieldName) === 'on';
        obj[f.name] = val;
      });
      return obj;
    });

    await generateQRDataURL(teamsData, matchData);
    setShowQRCode(true);
  };

  const handleQRClose = () => {
    setShowQRCode(false);
    setMatchState(initialMatchState);
    setTeamsState(Array.from({ length: formConfig.teamsCount }, () => ({ ...initialTeamState })));
    new JSConfetti().addConfetti({ emojis: ['🐠', '🐡', '🦀', '🪸'], emojiSize: 100, confettiRadius: 3, confettiNumber: 100 });
  };

  return (
    <div className={styles.MainDiv}>
      {formConfig === undefined && (
        <div>Loading theme…</div>
      )}
      {formConfig === null && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <h3>No active theme configured</h3>
          <p>Go to <a href="/setup" style={{ color: '#fcec91' }}>Setup</a> to create and activate a theme.</p>
        </div>
      )}
      {formConfig && (showQRCode ? (
        <div className={styles.QRCodeOverlay}>
          <div className={styles.QRCodeContainer}>
            <h2>Scan Both QR Codes</h2>
            <div className={styles.QRCodeRow}>
              <img src={qrCodeDataURL1} alt="JSON QR" className={styles.QRCodeImage} />
              <img src={qrCodeDataURL2} alt="TSV QR" className={styles.QRCodeImage} />
            </div>
            <button onClick={handleQRClose} className={styles.QRCloseButton}>Done</button>
          </div>
        </div>
      ) : (
        <form ref={form} onSubmit={handleSubmit}>
          <Header headerName="Match Info" />
          <div className={styles.MatchInfo}>
            {formConfig.matchInfo.map(field => (
              <DynamicField key={field.name} field={field} state={matchState} setState={setMatchState} />
            ))}
          </div>
          {teamsState.map((teamState, index) => (
            <div key={index} className={styles.TeamSection}>
              <Header headerName={`Team ${index + 1}`} />
              {formConfig.teamFields.map(field => (
                <DynamicField
                  key={field.name}
                  field={field}
                  prefix={`team${index}-`}
                  state={teamsState[index]}
                  setState={updater =>
                    setTeamsState(prev =>
                      prev.map((t, i) => (i === index ? updater(t) : t))
                    )
                  }
                />
              ))}
            </div>
          ))}
          <button type="submit" className={styles.SubmitButton}>GENERATE QR CODE</button>
        </form>
      ))}
    </div>
  );
}
