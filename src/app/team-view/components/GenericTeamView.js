"use client";
import { useEffect, useState } from 'react';
import styles from "../page.module.css";

export default function GenericTeamView({ team }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!team) return;
    const headers = {};
    try {
      const creds = sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials');
      if (creds) headers['Authorization'] = `Basic ${creds}`;
    } catch (_) {}
    fetch(`/api/get-team-data-generic?team=${team}`, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(j => { setData(j); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [team]);

  if (loading) return <div><h1>Loading…</h1></div>;
  if (error) return <div><h1>Error: {error}</h1></div>;
  if (!data) return <div><h1>No data</h1></div>;

  const { rows, stats, fields } = data;
  const matchCount = rows?.length || 0;

  return (
    <div>
      <h2>Team {team}</h2>
      <div className={styles.matchNav} style={{ gap: 12, marginBottom: 12 }}>
        <div>Matches: {matchCount}</div>
      </div>

      {/* Endgame distribution if available */}
      {stats?.endgame?.byLabel?.length ? (
        <div style={{ marginBottom: 16 }}>
          <h3>Endgame</h3>
          <ul>
            {stats.endgame.byLabel.map(item => (
              <li key={item.value}>{item.label}: {Math.round(item.percent*100)}% ({item.count})</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Intake (from booleans for postMatchIntake options) */}
      {(fields?.endgameOptions || []) && (
        <></>
      )}

      {/* Numeric and qualitative averages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {Object.entries(stats?.averages || {}).map(([k, v]) => (
          <div key={k} className={styles.valueBoxes} style={{ padding: 12 }}>
            <div style={{ fontWeight: 'bold' }}>{k}</div>
            <div>{Math.round(v*100)/100}</div>
          </div>
        ))}
        {Object.entries(stats?.qualitatives || {}).map(([k, v]) => (
          <div key={k} className={styles.valueBoxes} style={{ padding: 12 }}>
            <div style={{ fontWeight: 'bold' }}>{k}</div>
            <div>{Math.round(v*100)/100}</div>
          </div>
        ))}
        {Object.entries(stats?.booleans || {}).map(([k, v]) => (
          <div key={k} className={styles.valueBoxes} style={{ padding: 12 }}>
            <div style={{ fontWeight: 'bold' }}>{k}</div>
            <div>{Math.round(v*100)}%</div>
          </div>
        ))}
      </div>

      {/* Comments */}
      {Object.entries(stats?.comments || {}).some(([k, arr]) => (arr || []).length) && (
        <div style={{ marginTop: 16 }}>
          <h3>Comments</h3>
          {Object.entries(stats?.comments || {}).map(([k, arr]) => (
            (arr || []).length ? (
              <div key={k} style={{ marginBottom: 8 }}>
                <strong>{k}</strong>
                <ul>
                  {arr.map((c, i) => (<li key={`${k}-${i}`}>{c}</li>))}
                </ul>
              </div>
            ) : null
          ))}
        </div>
      )}

      {/* Raw rows table for visibility */}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table className={styles.coralTable}>
          <thead>
            <tr>
              <th>match</th>
              <th>team</th>
              {Object.keys(rows[0] || {}).filter(k => !['id','created_at'].includes(k)).map(k => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r.match}</td>
                <td>{r.team}</td>
                {Object.keys(rows[0] || {}).filter(k => !['id','created_at'].includes(k)).map(k => (
                  <td key={`${idx}-${k}`}>{String(r[k] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

