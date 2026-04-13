"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './MatchPrediction.module.css';

export default function MatchPrediction({ matchNumber, tbaEventCode }) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchTimeoutRef = useRef(null);

  const fetchPrediction = useCallback(async (match) => {
    if (!match || !tbaEventCode) return;

    setLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const matchKey = `${tbaEventCode}_qm${match}`;
      const res = await fetch(`https://api.statbotics.io/v3/match/${matchKey}`);

      if (!res.ok) {
        setError('Match not found on Statbotics');
        return;
      }

      const data = await res.json();
      const redWinProb = data.pred?.red_win_prob ?? 0.5;
      setPrediction({
        redWinProb,
        blueWinProb: 1 - redWinProb,
      });
    } catch {
      setError('Failed to connect to Statbotics');
    } finally {
      setLoading(false);
    }
  }, [tbaEventCode]);

  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

    const match = parseInt(matchNumber, 10);
    if (!match || match < 1) {
      setPrediction(null);
      setError(null);
      return;
    }

    fetchTimeoutRef.current = setTimeout(() => fetchPrediction(match), 150);
    return () => clearTimeout(fetchTimeoutRef.current);
  }, [matchNumber, fetchPrediction]);

  if (!tbaEventCode) return null;

  const redPercent = prediction ? Math.round(prediction.redWinProb * 100) : null;
  const bluePercent = prediction ? Math.round(prediction.blueWinProb * 100) : null;
  const isRedFavored = prediction && prediction.redWinProb > prediction.blueWinProb;

  if (!prediction && !loading && !error) return null;

  return (
    <div className={styles.predictionCard}>
      <div className={styles.predictionLabel}>Statbotics Prediction</div>
      {loading && <p className={styles.hint}>Loading prediction...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {prediction && (
        <>
          <div className={styles.predictionRow}>
            <span className={styles.allianceLabel}>RED:</span>
            <span className={isRedFavored ? styles.winnerPercent : styles.loserPercent}>
              {redPercent}%
            </span>
          </div>
          <div className={styles.predictionRow}>
            <span className={styles.allianceLabel}>BLUE:</span>
            <span className={!isRedFavored ? styles.winnerPercent : styles.loserPercent}>
              {bluePercent}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}
