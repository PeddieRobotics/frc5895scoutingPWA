"use client";
import { useEffect, useRef, useState } from 'react'
import styles from './Qualitative.module.css'

const DEFAULT_RATING_LABELS = [
    "Low",
    "Relatively Low",
    "Just Below Average",
    "Just Above Average",
    "Relatively High",
    "High",
];

export default function Qualitative ({ visibleName, internalName, description, symbol="★", forcedMinRating = 0, max = 6, zeroLabel, ratingLabels }) {
    const lsKey = `form_field_${internalName}`;
    const [rating, setRating] = useState(() => {
        if (typeof window === 'undefined') return forcedMinRating;
        const stored = localStorage.getItem(`form_field_${internalName}`);
        if (stored !== null) return parseInt(stored, 10) || 0;
        return forcedMinRating;
    });
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimerRef = useRef(null);

    // Listen for form reset events
    useEffect(() => {
        const handleReset = () => {
            localStorage.removeItem(lsKey);
            setRating(0);
            setConfirmClear(false);
        };
        window.addEventListener('reset_form_components', handleReset);
        return () => window.removeEventListener('reset_form_components', handleReset);
    }, [lsKey]);

    // Update rating if forcedMinRating changes
    useEffect(() => {
        if (forcedMinRating > 0 && rating < forcedMinRating) {
            setRating(forcedMinRating);
        } else if (forcedMinRating === 0) {
            setRating(0);
        }
    }, [forcedMinRating]);

    // Cancel confirm state when rating is cleared externally
    useEffect(() => {
        if (rating === 0) {
            setConfirmClear(false);
            clearTimeout(confirmTimerRef.current);
        }
    }, [rating]);

    const handleClearClick = () => {
        if (!confirmClear) {
            setConfirmClear(true);
            confirmTimerRef.current = setTimeout(() => setConfirmClear(false), 3000);
        } else {
            clearTimeout(confirmTimerRef.current);
            setConfirmClear(false);
            setRating(0);
            if (typeof window !== 'undefined') {
                localStorage.removeItem(lsKey);
            }
        }
    };

    const effectiveLabels = (ratingLabels && ratingLabels.length === max)
        ? ratingLabels
        : DEFAULT_RATING_LABELS;

    return (
        <div className={styles.qual}>
            <label htmlFor={internalName}>{visibleName}</label>
            <input type="hidden" name={internalName} value={rating}/>
            <hr></hr>
            {description && <div className={styles.description}>{description}</div>}
            <div className={styles.ratings}>
                {Array.from({ length: max }, (_, i) => i + 1).map(ratingValue => {
                    const isActive = ratingValue <= rating;
                    return (
                        <div
                            className={styles.starCell}
                            key={ratingValue}
                            onClick={() => {
                                setRating(ratingValue);
                                setConfirmClear(false);
                                clearTimeout(confirmTimerRef.current);
                                if (typeof window !== 'undefined') {
                                    localStorage.setItem(lsKey, String(ratingValue));
                                }
                            }}
                        >
                            <div className={styles.symbol + (isActive ? " " + styles.selected : "")}>{symbol}</div>
                            <div className={`${styles.starNum} ${isActive ? styles.starNumActive : ''}`}>{ratingValue}</div>
                        </div>
                    );
                })}
            </div>

            {rating === 0 && zeroLabel && (
                <div className={styles.ratingLabel}>{zeroLabel}</div>
            )}

            {rating > 0 && (
                <div className={styles.ratingLabel}>
                    {effectiveLabels[rating - 1]}
                </div>
            )}

            {rating > 0 && (
                <button
                    type="button"
                    className={`${styles.clearButton} ${confirmClear ? styles.clearConfirm : ''}`}
                    onClick={handleClearClick}
                >
                    {confirmClear ? '⚠ Tap again to clear' : 'Clear Rating'}
                </button>
            )}
        </div>
    )
}
