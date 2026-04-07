'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './prescout-upload.module.css';

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export default function PrescoutUploadPage() {
  const [activeGame, setActiveGame] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const [clearArmed, setClearArmed] = useState(false);
  const clearTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
    return () => clearTimerRef.current && clearTimeout(clearTimerRef.current);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const gameRes = await fetch('/api/admin/games/active', { credentials: 'include' });
      const gameData = await gameRes.json();
      if (!gameData.success || !gameData.gameName) {
        setError('No active game configured. Please activate a game first.');
        setLoading(false);
        return;
      }
      setActiveGame(gameData);

      const prescoutRes = await fetch(`/api/prescout/teams?gameName=${encodeURIComponent(gameData.gameName)}`, { credentials: 'include' });
      if (prescoutRes.ok) {
        const pd = await prescoutRes.json();
        setTeams(pd.teams || []);
      }
    } catch (err) {
      setError('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!file.name.endsWith('.xlsx')) {
      setError('Please select an .xlsx file.');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');
    setUploadResult(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('gameName', activeGame.gameName);

      const res = await fetch('/api/prescout/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = await res.json();

      if (res.ok) {
        setUploadResult(data);
        setSuccess(`Imported prescout data for ${data.imported} team${data.imported !== 1 ? 's' : ''}.`);
        setTeams(data.teams || []);
      } else {
        setError(data.message || 'Upload failed.');
      }
    } catch (err) {
      setError('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClearArm = () => {
    if (clearArmed) return;
    setClearArmed(true);
    clearTimerRef.current = setTimeout(() => setClearArmed(false), 3000);
  };

  const handleClear = async () => {
    if (!clearArmed) return;
    setClearArmed(false);
    clearTimeout(clearTimerRef.current);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/prescout?gameName=${encodeURIComponent(activeGame.gameName)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setTeams([]);
        setUploadResult(null);
        setSuccess('Prescout data cleared.');
      } else {
        const d = await res.json();
        setError(d.message || 'Failed to clear data.');
      }
    } catch (err) {
      setError('Failed to clear: ' + err.message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <a href="/scout-leads/prescout" className={styles.backBtn}><BackIcon /> Prescout</a>
          <div>
            <h1 className={styles.title}>Upload Prescout Data</h1>
            {activeGame && (
              <p className={styles.subtitle}>Active game: <strong>{activeGame.displayName}</strong></p>
            )}
          </div>
        </div>

        {/* Alerts */}
        {error && <div className={styles.errorBanner}>{error}</div>}
        {success && <div className={styles.successBanner}>{success}</div>}

        {activeGame && (
          <>
            {/* Upload card */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Upload Prescout Sheet</h2>
              <p className={styles.cardDesc}>
                Upload an <code>.xlsx</code> spreadsheet with a <strong>Prescout</strong> sheet.
                Layout: row 1 = team numbers (starting from column B), column A = field names.
                Existing data for each team will be replaced.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className={styles.uploadBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <UploadIcon />
                {uploading ? 'Importing...' : 'Choose .xlsx file'}
              </button>

              {uploadResult && (
                <div className={styles.uploadResult}>
                  <p className={styles.uploadResultText}>
                    Imported <strong>{uploadResult.imported}</strong> teams.
                  </p>
                  <div className={styles.teamPills}>
                    {uploadResult.teams?.map(t => (
                      <span key={t} className={styles.teamPill}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Current data card */}
            <div className={styles.card}>
              <div className={styles.cardTitleRow}>
                <h2 className={styles.cardTitle}>
                  Current Data{teams.length > 0 ? ` \u2014 ${teams.length} team${teams.length !== 1 ? 's' : ''}` : ''}
                </h2>
                {teams.length > 0 && (
                  <button
                    className={clearArmed ? styles.clearBtnArmed : styles.clearBtn}
                    onClick={clearArmed ? handleClear : handleClearArm}
                  >
                    <TrashIcon />
                    {clearArmed ? 'Confirm clear?' : 'Clear all'}
                  </button>
                )}
              </div>

              {loading ? (
                <p className={styles.loadingText}>Loading...</p>
              ) : teams.length === 0 ? (
                <p className={styles.emptyText}>No prescout data uploaded yet.</p>
              ) : (
                <div className={styles.teamPills}>
                  {teams.map(t => (
                    <span key={t} className={styles.teamPill}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
