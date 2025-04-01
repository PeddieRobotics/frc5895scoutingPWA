"use client";
import { useState, useEffect, useRef } from 'react';
import styles from './NumericInput.module.css';

export default function NumericInput({ visibleName, internalName, pieceType, min, max }) {
    min = min || 0;
    max = max || 99999;

    // Use a ref to keep track of the actual DOM input element
    const inputRef = useRef(null);
    // Initialize state to 0 but we'll update it from DOM if needed
    const [value, setValue] = useState(0);

    // Effect to sync state with actual DOM value (important after re-renders)
    useEffect(() => {
        if (inputRef.current) {
            // If the DOM element has a value, use that instead of the initial state
            const currentValue = parseInt(inputRef.current.value || '0', 10);
            if (currentValue !== value) {
                setValue(currentValue);
            }
        }
    }, []);

    // Add listener for reset events
    useEffect(() => {
        // Handler for form reset events
        const handleReset = (event) => {
            console.log(`NumericInput ${internalName} received reset event`);
            
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
    }, [internalName]);

    function increment() {
        if (value + 1 <= max) {
            const newValue = value + 1;
            setValue(newValue);
            
            // Also update the actual DOM element value to ensure form.elements captures it
            if (inputRef.current) {
                inputRef.current.value = newValue;
            }
        }
    }

    function decrement() {
        if (value - 1 >= min) {
            const newValue = value - 1;
            setValue(newValue);
            
            // Also update the actual DOM element value
            if (inputRef.current) {
                inputRef.current.value = newValue;
            }
        }
    }

    return (
        <div className={styles.NumericInput}>
            <label className={styles.label} htmlFor={internalName}>{visibleName}</label>
            <div className={styles.Container}>
                <button type="button" className={styles[pieceType + 'ButtonLeft']} onClick={decrement}><h1><strong>-</strong></h1></button>
                <input
                    ref={inputRef}
                    className={styles[pieceType]}
                    type="number"
                    id={internalName}
                    name={internalName}
                    value={value}
                    onChange={(e) => {
                        // Handle external changes to the input
                        const newValue = parseInt(e.target.value || '0', 10);
                        setValue(newValue);
                    }}
                />
                <button type="button" className={styles[pieceType + 'ButtonRight']} onClick={increment}><h1><strong>+</strong></h1></button>
            </div>
        </div>
    )
}