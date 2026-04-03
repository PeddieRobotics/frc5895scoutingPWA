'use client';

import styles from "./page.module.css";
import { useEffect, useState } from "react";
import useGameConfig from "../../lib/useGameConfig";

export default function BettingLeaderboard() {
  const { config, gameId, loading: configLoading } = useGameConfig();

  const [leaderboard, setLeaderboard] = useState([]);
  const [gameName, setGameName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (configLoading) return;

    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        const creds = sessionStorage.getItem('auth_credentials') ||
          localStorage.getItem('auth_credentials');
        const headers = {};
        if (creds) headers['Authorization'] = `Basic ${creds}`;
        if (gameId) headers['X-Game-Id'] = String(gameId);

        const res = await fetch(
          `/api/betting/leaderboard${gameId ? `?gameId=${gameId}` : ''}`,
          { headers, cache: 'no-store' }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || 'Failed to load leaderboard');
          return;
        }

        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        setGameName(data.gameName || '');
      } catch {
        setError('Network error loading leaderboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [configLoading, gameId]);

  if (!config?.enableBetting && !configLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          Betting is not enabled for the active game.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Betting Leaderboard</h1>
      {gameName && <p className={styles.subtitle}>{gameName}</p>}

      {loading && <p className={styles.loadingText}>Loading leaderboard...</p>}
      {error && <p className={styles.errorText}>{error}</p>}

      {!loading && !error && leaderboard.length === 0 && (
        <p className={styles.emptyState}>No bets placed yet.</p>
      )}

      {!loading && !error && leaderboard.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.rankCol}>#</th>
                <th className={styles.nameCol}>Scout</th>
                <th className={styles.teamCol}>Team</th>
                <th className={styles.balanceCol}>Balance</th>
                <th className={styles.recordCol}>W</th>
                <th className={styles.recordCol}>L</th>
                <th className={styles.recordCol}>P</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => (
                <tr key={`${entry.scoutname}-${entry.scoutteam}`} className={i % 2 === 0 ? styles.evenRow : styles.oddRow}>
                  <td className={styles.rankCol}>{i + 1}</td>
                  <td className={styles.nameCol}>{entry.scoutname}</td>
                  <td className={styles.teamCol}>{entry.scoutteam}</td>
                  <td className={`${styles.balanceCol} ${Number(entry.balance) >= 0 ? styles.positive : styles.negative}`}>
                    {Number(entry.balance)}
                  </td>
                  <td className={styles.recordCol}>{Number(entry.wins)}</td>
                  <td className={styles.recordCol}>{Number(entry.losses)}</td>
                  <td className={styles.recordCol}>{Number(entry.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
