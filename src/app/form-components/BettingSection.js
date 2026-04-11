"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './BettingSection.module.css';

export default function BettingSection({
  matchNumber,
  gameId,
  tbaEventCode,
  enabled,
  onBetStateChange,
  authCredentials,
  scoutName,
}) {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAlliance, setSelectedAlliance] = useState(null);
  const [betPlaced, setBetPlaced] = useState(false);
  const [placedBet, setPlacedBet] = useState(null);
  const [balance, setBalance] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const fetchTimeoutRef = useRef(null);

  const lsKey = `betting_state_${gameId}`;

  // Save betting state to localStorage whenever it changes
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const match = parseInt(matchNumber, 10);
    if (!match || match < 1) return;

    if (betPlaced) {
      const saved = {
        match,
        betPlaced: true,
        alliance: selectedAlliance,
        placedBet,
        scoutName,
      };
      localStorage.setItem(lsKey, JSON.stringify(saved));
    }
  }, [betPlaced, selectedAlliance, placedBet, matchNumber, enabled, lsKey, scoutName]);

  // Restore betting state from localStorage on mount
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const match = parseInt(matchNumber, 10);
    if (!match || match < 1) return;

    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.match === match && saved.scoutName === scoutName && saved.betPlaced) {
        setBetPlaced(true);
        setSelectedAlliance(saved.alliance || null);
        setPlacedBet(saved.placedBet || null);
        onBetStateChange?.('placed');
      }
    } catch {
      // Corrupt data — ignore
    }
  }, [matchNumber, enabled, lsKey, scoutName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch prediction directly from Statbotics (public API, no auth needed)
  const fetchPrediction = useCallback(async (match) => {
    if (!match || !enabled || !tbaEventCode) return;

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
        predictedWinner: data.pred?.winner || 'unknown',
        matchStatus: data.status || 'Unknown',
        resultWinner: data.result?.winner || null,
      });
    } catch {
      setError('Failed to connect to Statbotics');
    } finally {
      setLoading(false);
    }
  }, [enabled, tbaEventCode]);

  useEffect(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

    const match = parseInt(matchNumber, 10);
    if (!match || match < 1 || !enabled) {
      setPrediction(null);
      return;
    }

    // Debounce 150ms
    fetchTimeoutRef.current = setTimeout(() => fetchPrediction(match), 150);
    return () => clearTimeout(fetchTimeoutRef.current);
  }, [matchNumber, fetchPrediction, enabled]);

  // Check for existing bet when match/scoutName changes
  useEffect(() => {
    if (!matchNumber || !scoutName || !enabled) return;

    const match = parseInt(matchNumber, 10);
    if (!match || match < 1) return;

    const checkExistingBet = async () => {
      // Skip DB restore if the form was just submitted or cleared
      if (gameId && typeof sessionStorage !== 'undefined') {
        const skipKey = `betting_skip_restore_${gameId}`;
        if (sessionStorage.getItem(skipKey)) {
          sessionStorage.removeItem(skipKey);
          return;
        }
      }

      try {
        const headers = {};
        if (authCredentials) headers['Authorization'] = `Basic ${authCredentials}`;
        if (gameId) headers['X-Game-Id'] = String(gameId);

        const res = await fetch(
          `/api/betting/my-bet?match=${match}&scoutname=${encodeURIComponent(scoutName)}${gameId ? `&gameId=${gameId}` : ''}`,
          { headers, cache: 'no-store' }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.bet) {
            setPlacedBet(data.bet);
            setBetPlaced(true);
            setSelectedAlliance(data.bet.alliance);
            onBetStateChange?.('placed');
          }
        } else if (res.status === 401) {
          setAuthExpired(true);
        }
      } catch {
        // Silently fail — user can still place bet
      }
    };

    checkExistingBet();
  }, [matchNumber, scoutName, enabled, authCredentials, gameId, onBetStateChange]);

  // Fetch balance
  useEffect(() => {
    if (!scoutName || !enabled) return;

    const fetchBalance = async () => {
      try {
        const headers = {};
        if (authCredentials) headers['Authorization'] = `Basic ${authCredentials}`;
        if (gameId) headers['X-Game-Id'] = String(gameId);

        const res = await fetch(
          `/api/betting/balance?scoutname=${encodeURIComponent(scoutName)}${gameId ? `&gameId=${gameId}` : ''}`,
          { headers, cache: 'no-store' }
        );

        if (res.ok) {
          const data = await res.json();
          setBalance(data.balance);
        } else if (res.status === 401) {
          setAuthExpired(true);
        }
      } catch {
        // Silently fail
      }
    };

    fetchBalance();
  }, [scoutName, enabled, authCredentials, gameId, betPlaced]);

  // Listen for form reset
  useEffect(() => {
    const handleReset = () => {
      setPrediction(null);
      setSelectedAlliance(null);
      setBetPlaced(false);
      setPlacedBet(null);
      setError(null);
      setLocked(false);
      setAuthExpired(false);
      localStorage.removeItem(lsKey);
    };

    window.addEventListener('reset_form_components', handleReset);
    return () => window.removeEventListener('reset_form_components', handleReset);
  }, []);

  const handleAllianceSelect = (alliance) => {
    if (betPlaced || locked) return;
    setSelectedAlliance(alliance === selectedAlliance ? null : alliance);
  };

  const handleAbstain = () => {
    if (betPlaced || locked) return;
    setSelectedAlliance(null);
  };

  const handlePlaceBet = async () => {
    if (!selectedAlliance || !prediction || betPlaced || placing) return;

    setPlacing(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (authCredentials) headers['Authorization'] = `Basic ${authCredentials}`;
      if (gameId) headers['X-Game-Id'] = String(gameId);

      const res = await fetch('/api/betting/place', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          match: parseInt(matchNumber, 10),
          alliance: selectedAlliance,
          scoutname: scoutName,
          gameId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setAuthExpired(true);
          setError('Session expired — please log in again');
        } else {
          setError(data.message || 'Failed to place bet');
        }
        return;
      }

      setPlacedBet(data.bet);
      setBetPlaced(true);
      onBetStateChange?.('placed');
    } catch {
      setError('Network error placing bet');
    } finally {
      setPlacing(false);
    }
  };

  // Lock betting when form interaction detected
  const lockBetting = useCallback(() => {
    if (!betPlaced && !locked) {
      setLocked(true);
      onBetStateChange?.('locked');
    }
  }, [betPlaced, locked, onBetStateChange]);

  // Expose lock function for parent
  useEffect(() => {
    window.__lockBetting = lockBetting;
    return () => { delete window.__lockBetting; };
  }, [lockBetting]);

  if (!enabled) return null;

  const redPercent = prediction ? Math.round(prediction.redWinProb * 100) : null;
  const bluePercent = prediction ? Math.round(prediction.blueWinProb * 100) : null;
  const LOSS_PENALTY = 25;
  const pointsIfWin = prediction && selectedAlliance
    ? Math.max(1, Math.round(1000 * Math.exp(-5.3 * (selectedAlliance === 'red' ? prediction.redWinProb : prediction.blueWinProb))))
    : null;

  const isRedFavored = prediction && prediction.redWinProb > prediction.blueWinProb;

  return (
    <div className={styles.bettingSection}>
      <div className={styles.header}>BETTING</div>
      <hr className={styles.divider} />

      {!prediction && !loading && !error && (
        <p className={styles.hint}>Enter a match number above to see predictions</p>
      )}

      {loading && (
        <p className={styles.hint}>Loading prediction...</p>
      )}

      {error && (
        <p className={styles.error}>{error}</p>
      )}

      {(!authCredentials || authExpired) && !betPlaced && (
        <div className={styles.stakeInfo}>
          <button
            type="button"
            className={styles.loginButton}
            onClick={() => { window.location.href = '/?authRequired=true'; }}
          >
            Log In to Place Bets
          </button>
        </div>
      )}

      {/* Skip button — always available when no bet placed yet and no prediction loaded or not logged in */}
      {!betPlaced && !prediction && (
        <div className={styles.stakeInfo}>
          <button
            type="button"
            className={styles.skipButton}
            onClick={() => {
              setBetPlaced(true);
              onBetStateChange?.('placed');
            }}
          >
            Skip Betting
          </button>
        </div>
      )}

      {prediction && (
        <>
          <div className={styles.predictionCard}>
            <div className={styles.predictionLabel}>Statbotics Prediction</div>
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
          </div>

          {!betPlaced && !locked && !authExpired && (
            <div className={styles.allianceButtons}>
              <button
                type="button"
                className={`${styles.redButton} ${selectedAlliance === 'red' ? styles.selected : ''}`}
                onClick={() => handleAllianceSelect('red')}
              >
                RED
              </button>
              <button
                type="button"
                className={`${styles.blueButton} ${selectedAlliance === 'blue' ? styles.selected : ''}`}
                onClick={() => handleAllianceSelect('blue')}
              >
                BLUE
              </button>
              <button
                type="button"
                className={styles.abstainButton}
                onClick={handleAbstain}
                title="Abstain / Skip betting"
              >
                X
              </button>
            </div>
          )}

          {betPlaced && placedBet && (
            <div className={styles.betConfirmed}>
              <span>Bet placed: <strong className={placedBet.alliance === 'red' ? styles.redText : styles.blueText}>
                {placedBet.alliance.toUpperCase()}
              </strong></span>
            </div>
          )}

          {locked && !betPlaced && (
            <div className={styles.lockedMessage}>
              Form started — betting locked
            </div>
          )}

          {!betPlaced && !locked && pointsIfWin !== null && authCredentials && !authExpired && (
            <div className={styles.stakeInfo}>
              <div className={styles.stakeAmount}>
                Win: <strong>+{pointsIfWin}</strong> · Loss: <strong>-{LOSS_PENALTY}</strong>
              </div>
              <button
                type="button"
                className={styles.placeBetButton}
                onClick={handlePlaceBet}
                disabled={placing}
              >
                {placing ? 'Placing...' : 'Place Bet'}
              </button>
            </div>
          )}

          {!betPlaced && !locked && !(pointsIfWin !== null && authCredentials && !authExpired) && (
            <div className={styles.stakeInfo}>
              <button
                type="button"
                className={styles.skipButton}
                onClick={() => {
                  setBetPlaced(true);
                  onBetStateChange?.('placed');
                }}
              >
                Skip Betting
              </button>
            </div>
          )}

          {betPlaced && placedBet && (
            <div className={styles.stakeInfo}>
              <div className={styles.stakeAmount}>
                Win: <strong>+{placedBet.points_wagered}</strong> · Loss: <strong>-{placedBet.points_if_loss || LOSS_PENALTY}</strong>
              </div>
            </div>
          )}

          {balance !== null && (
            <div className={styles.balanceDisplay}>
              Your balance: <strong className={`${styles.balanceNumber} ${balance >= 0 ? styles.positiveBalance : styles.negativeBalance}`}>{balance}</strong>
            </div>
          )}
        </>
      )}
    </div>
  );
}
