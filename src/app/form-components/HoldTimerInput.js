"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HoldTimerInput.module.css";

function nowMs() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

export default function HoldTimerInput({
  visibleName,
  internalName,
  buttonLabel,
  precision = 2,
  min = 0,
  max = 9999,
}) {
  const normalizedPrecision = Number.isInteger(precision)
    ? Math.min(Math.max(precision, 0), 4)
    : 2;

  const lsKey = `holdtimer_${internalName}`;

  const [recordings, setRecordings] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(lsKey)) || [];
    } catch {
      return [];
    }
  });
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ show: false, message: "", onConfirm: null });

  const showConfirm = useCallback((message, onConfirm) => {
    setConfirmDialog({ show: true, message, onConfirm });
  }, []);

  const handleConfirmOk = useCallback(() => {
    setConfirmDialog((prev) => {
      prev.onConfirm?.();
      return { show: false, message: "", onConfirm: null };
    });
  }, []);

  const handleConfirmCancel = useCallback(() => {
    setConfirmDialog({ show: false, message: "", onConfirm: null });
  }, []);

  const holdStartRef = useRef(null);
  const animationFrameRef = useRef(null);

  const totalSeconds = recordings.reduce((sum, r) => sum + r.duration, 0);

  const clampSeconds = useCallback(
    (value) => Math.min(max, Math.max(min, value)),
    [min, max]
  );

  const roundSeconds = useCallback(
    (value) => {
      const factor = 10 ** normalizedPrecision;
      return Math.round(clampSeconds(value) * factor) / factor;
    },
    [clampSeconds, normalizedPrecision]
  );

  // Persist recordings to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(lsKey, JSON.stringify(recordings));
    }
  }, [recordings, lsKey]);

  // Listen for form reset event
  useEffect(() => {
    const handleReset = () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(lsKey);
      }
      if (holdStartRef.current !== null) {
        holdStartRef.current = null;
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
      setIsHolding(false);
      setRecordings([]);
      setLiveSeconds(0);
    };

    window.addEventListener("reset_form_components", handleReset);
    return () => window.removeEventListener("reset_form_components", handleReset);
  }, [lsKey]);

  const stopHolding = useCallback(
    (commit = true) => {
      if (holdStartRef.current === null) return;

      const elapsed = (nowMs() - holdStartRef.current) / 1000;
      const rounded = roundSeconds(elapsed);

      holdStartRef.current = null;
      setIsHolding(false);

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (commit && rounded > 0) {
        setRecordings((prev) => [...prev, { id: Date.now(), duration: rounded }]);
      }
      setLiveSeconds(0);
    },
    [roundSeconds]
  );

  const startHolding = useCallback(
    (event) => {
      event.preventDefault();
      if (holdStartRef.current !== null) return;

      if (event.pointerId !== undefined && event.currentTarget?.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore capture failures on unsupported browsers.
        }
      }

      holdStartRef.current = nowMs();
      setIsHolding(true);

      const tick = () => {
        if (holdStartRef.current === null) return;
        const elapsed = (nowMs() - holdStartRef.current) / 1000;
        setLiveSeconds(clampSeconds(elapsed));
        animationFrameRef.current = requestAnimationFrame(tick);
      };

      tick();
    },
    [clampSeconds]
  );

  const clearAll = useCallback(() => {
    showConfirm("Clear all recordings?", () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem(lsKey);
      }
      stopHolding(false);
      setRecordings([]);
      setLiveSeconds(0);
    });
  }, [lsKey, stopHolding, showConfirm]);

  const deleteRecording = useCallback((id) => {
    showConfirm("Delete this recording?", () => {
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    });
  }, [showConfirm]);

  useEffect(() => {
    if (!isHolding) return undefined;

    const release = () => stopHolding(true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);

    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [isHolding, stopHolding]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const displayedSeconds = isHolding ? liveSeconds : totalSeconds;
  const idleHoldLabel = buttonLabel || "Press and Hold";
  const activeHoldLabel = "Timing...";
  const sizingHoldLabel =
    idleHoldLabel.length >= activeHoldLabel.length ? idleHoldLabel : activeHoldLabel;

  return (
    <div className={styles.container}>
      <label htmlFor={internalName} className={styles.label}>
        {visibleName}
      </label>

      <div className={styles.value} aria-live="polite" aria-atomic="true">
        {displayedSeconds.toFixed(normalizedPrecision)}s
      </div>

      <div className={styles.timerButtonsGroup}>
        <div className={styles.holdButtonWrap}>
          <span className={styles.holdButtonSizer} aria-hidden="true">
            {sizingHoldLabel}
          </span>
          <button
            type="button"
            className={`${styles.holdButton} ${isHolding ? styles.holding : ""}`}
            onPointerDown={startHolding}
            onPointerUp={() => stopHolding(true)}
            onPointerCancel={() => stopHolding(true)}
          >
            {isHolding ? activeHoldLabel : idleHoldLabel}
          </button>
        </div>

        <button type="button" className={styles.clearButton} onClick={clearAll}>
          Clear All
        </button>
      </div>

      <input
        id={internalName}
        name={internalName}
        type="number"
        step="0.001"
        value={Math.min(totalSeconds, max)}
        readOnly
        className={styles.hiddenInput}
      />

      {recordings.length > 0 && (
        <>
          <table className={styles.recordingsTable}>
            <thead>
              <tr>
                <th className={styles.indexColumn}>#</th>
                <th className={styles.durationColumn}>Duration</th>
                <th className={styles.actionColumn}></th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((r, idx) => (
                <tr key={r.id}>
                  <td className={styles.indexCell}>{idx + 1}</td>
                  <td className={styles.durationCell}>
                    {r.duration.toFixed(normalizedPrecision)}s
                  </td>
                  <td className={styles.actionCell}>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => deleteRecording(r.id)}
                      aria-label={`Delete recording ${idx + 1}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={styles.totalRow}>
                <td colSpan={2} className={styles.totalCell}>
                  Total: {totalSeconds.toFixed(normalizedPrecision)}s
                </td>
                <td className={styles.actionCell}></td>
              </tr>
            </tfoot>
          </table>

          <div
            className={styles.recordingsMobileList}
            role="list"
            aria-label={`${visibleName || internalName} recordings`}
          >
            {recordings.map((r, idx) => (
              <div key={`mobile-${r.id}`} className={styles.mobileRecordingRow} role="listitem">
                <div className={styles.mobileRecordingMain}>
                  <span className={styles.mobileRecordingIndex}>Recording #{idx + 1}</span>
                  <span className={styles.mobileRecordingDuration}>
                    {r.duration.toFixed(normalizedPrecision)}s
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => deleteRecording(r.id)}
                  aria-label={`Delete recording ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}

            <div className={styles.mobileTotalRow} role="listitem" aria-label="Total recorded time">
              <span className={styles.mobileTotalLabel}>Total</span>
              <span className={styles.mobileTotalValue}>
                {totalSeconds.toFixed(normalizedPrecision)}s
              </span>
            </div>
          </div>
        </>
      )}

      {confirmDialog.show && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogMessage}>{confirmDialog.message}</p>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.dialogConfirm} onClick={handleConfirmOk}>
                Confirm
              </button>
              <button type="button" className={styles.dialogCancel} onClick={handleConfirmCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
