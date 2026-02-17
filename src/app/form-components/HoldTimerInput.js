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

  const [committedSeconds, setCommittedSeconds] = useState(0);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const holdStartRef = useRef(null);
  const baseSecondsRef = useRef(0);
  const animationFrameRef = useRef(null);

  const clampSeconds = useCallback((value) => {
    return Math.min(max, Math.max(min, value));
  }, [min, max]);

  const roundSeconds = useCallback((value) => {
    const factor = 10 ** normalizedPrecision;
    const clamped = clampSeconds(value);
    return Math.round(clamped * factor) / factor;
  }, [clampSeconds, normalizedPrecision]);

  const stopHolding = useCallback((commit = true) => {
    if (holdStartRef.current === null) return;

    const elapsed = (nowMs() - holdStartRef.current) / 1000;
    const finalValue = roundSeconds(baseSecondsRef.current + elapsed);

    holdStartRef.current = null;
    setIsHolding(false);

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (commit) {
      setCommittedSeconds(finalValue);
      setLiveSeconds(finalValue);
    } else {
      setLiveSeconds(committedSeconds);
    }
  }, [committedSeconds, roundSeconds]);

  const startHolding = useCallback((event) => {
    event.preventDefault();
    if (holdStartRef.current !== null) return;

    if (event.pointerId !== undefined && event.currentTarget?.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore capture failures on unsupported browsers.
      }
    }

    baseSecondsRef.current = committedSeconds;
    holdStartRef.current = nowMs();
    setIsHolding(true);

    const tick = () => {
      if (holdStartRef.current === null) return;
      const elapsed = (nowMs() - holdStartRef.current) / 1000;
      setLiveSeconds(clampSeconds(baseSecondsRef.current + elapsed));
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [clampSeconds, committedSeconds]);

  const clearTimer = useCallback(() => {
    stopHolding(false);
    setCommittedSeconds(0);
    setLiveSeconds(0);
  }, [stopHolding]);

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

  const displayedSeconds = isHolding ? liveSeconds : committedSeconds;

  return (
    <div className={styles.container}>
      <label htmlFor={internalName} className={styles.label}>
        {visibleName}
      </label>

      <div className={styles.value}>
        {displayedSeconds.toFixed(normalizedPrecision)}s
      </div>

      <button
        type="button"
        className={`${styles.holdButton} ${isHolding ? styles.holding : ""}`}
        onPointerDown={startHolding}
        onPointerUp={() => stopHolding(true)}
        onPointerCancel={() => stopHolding(true)}
      >
        {isHolding ? "Timing..." : (buttonLabel || "Press and Hold")}
      </button>

      <button type="button" className={styles.clearButton} onClick={clearTimer}>
        Clear
      </button>

      <input
        id={internalName}
        name={internalName}
        type="number"
        step="0.001"
        value={committedSeconds}
        readOnly
        className={styles.hiddenInput}
      />
    </div>
  );
}
