"use client";
import { useEffect, useState } from 'react';
import styles from "../page.module.css";

export default function GenericMatchView({ params }) {
  const teams = [params.team1, params.team2, params.team3, params.team4, params.team5, params.team6].filter(Boolean);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teams.length) { setLoading(false); return; }
    const headers = {};
    try {
      const creds = sessionStorage.getItem('auth_credentials') || localStorage.getItem('auth_credentials');
      if (creds) headers['Authorization'] = `Basic ${creds}`;
    } catch(_) {}
    Promise.all(
      teams.map(t => fetch(`/api/get-team-data-generic?team=${t}`, { headers }).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then(j => [t, j]))
    ).then(entries => {
      const obj = Object.fromEntries(entries);
      setData(obj);
      setLoading(false);
    }).catch(e => { setError(e.message); setLoading(false); });
  }, [JSON.stringify(teams)]);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error}</div>;

  const keys = Array.from(new Set(Object.values(data).flatMap(d => Object.keys(d?.stats?.averages || {}))));

  return (
    <div>
      <h2>Match Overview</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.coralTable}>
          <thead>
            <tr>
              <th>Team</th>
              {keys.map(k => (<th key={k}>{k} (avg)</th>))}
            </tr>
          </thead>
          <tbody>
            {teams.map(t => (
              <tr key={t}>
                <td>{t}</td>
                {keys.map(k => (
                  <td key={`${t}-${k}`}>{Math.round((data[t]?.stats?.averages?.[k] || 0)*100)/100}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

