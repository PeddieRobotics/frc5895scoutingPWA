"use client";
import { useState, useEffect, useRef } from 'react';
import styles from './NumericInput.module.css';

export default function NumericInput({ visibleName, internalName, pieceType, min, max, quickButtons }) {
    min = min || 0;
    max = max || 99999;

    const lsKey = `form_field_${internalName}`;

    // Use a ref to keep track of the actual DOM input element
    const inputRef = useRef(null);
    // Initialize state from localStorage if available
    const [value, setValue] = useState(() => {
        if (typeof window === 'undefined') return 0;
        const stored = localStorage.getItem(`form_field_${internalName}`);
        if (stored !== null) return parseInt(stored, 10) || 0;
        return 0;
    });

    // Add listener for reset events
    useEffect(() => {
        // Handler for form reset events
        const handleReset = (event) => {
            console.log(`NumericInput ${internalName} received reset event`);
            localStorage.removeItem(lsKey);

            // Don't reset match field
            if (internalName === 'match') {
                if (event.detail?.preserve?.match) {
                    setValue(parseInt(event.detail.preserve.match, 10));
                    if (inputRef.current) {
                        inputRef.current.value = event.detail.preserve.match;
                    }
                }
                return;
            }

            // Reset to 0 for all other fields
            setValue(0);
            if (inputRef.current) {
                inputRef.current.value = "0";
            }
        };

        // Also handle a more direct reset event
        const handleNumericReset = () => {
            if (internalName !== 'match') {
                console.log(`NumericInput ${internalName} reset to 0`);
                localStorage.removeItem(lsKey);
                setValue(0);
                if (inputRef.current) {
                    inputRef.current.value = "0";
                }
            }
        };

        // Listen for both types of reset events
        window.addEventListener('reset_form_components', handleReset);
        window.addEventListener('reset_numeric_inputs', handleNumericReset);

        // Cleanup
        return () => {
            window.removeEventListener('reset_form_components', handleReset);
            window.removeEventListener('reset_numeric_inputs', handleNumericReset);
        };
    }, [internalName, lsKey]);

    function adjustValue(amount) {
        const newValue = Math.max(min, Math.min(max, value + amount));
        if (newValue !== value) {
            setValue(newValue);
            if (typeof window !== 'undefined') {
                localStorage.setItem(lsKey, String(newValue));
            }
            if (inputRef.current) {
                inputRef.current.value = newValue;
            }
        }
    }

    function increment() {
        adjustValue(1);
    }

    function decrement() {
        adjustValue(-1);
    }

    // Separate quick buttons by position
    const leftButtons = quickButtons?.filter(b => b.position === 'left') || [];
    const rightButtons = quickButtons?.filter(b => b.position === 'right') || [];

    return (
        <div className={styles.NumericInput}>
            <label className={styles.label} htmlFor={internalName}>{visibleName}</label>
            <div className={styles.QuickButtonsWrapper}>
                {leftButtons.map((btn, i) => (
                    <button
                        key={`left-${i}`}
                        type="button"
                        className={`${styles.QuickButton} ${styles.QuickButtonNegative} ${btn.style ? styles[btn.style] : ''}`}
                        onClick={() => adjustValue(btn.value)}
                    >
                        {btn.label}
                    </button>
                ))}
                <div className={styles.Container}>
                    <button type="button" className={styles[pieceType + 'ButtonLeft']} onClick={decrement}><h1><strong>-</strong></h1></button>
                    <input
                        ref={inputRef}
                        className={styles[pieceType]}
                        type="number"
                        id={internalName}
                        name={internalName}
                        value={value}
                        readOnly={true}
                        onFocus={(e) => e.target.blur()}
                        tabIndex="-1"
                        onChange={(e) => {
                            // Handle external changes to the input
                            const newValue = parseInt(e.target.value || '0', 10);
                            setValue(newValue);
                        }}
                    />
                    <button type="button" className={styles[pieceType + 'ButtonRight']} onClick={increment}><h1><strong>+</strong></h1></button>
                </div>
                {rightButtons.map((btn, i) => (
                    <button
                        key={`right-${i}`}
                        type="button"
                        className={`${styles.QuickButton} ${btn.value > 0 ? styles.QuickButtonPositive : styles.QuickButtonNegative} ${btn.style ? styles[btn.style] : ''}`}
                        onClick={() => adjustValue(btn.value)}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>
        </div>
    )
}