"use client";
import styles from "./Checkbox.module.css";
import { useState, useEffect, useRef } from "react";

export default function Checkbox ({ visibleName, internalName, changeListener, className, style }) {
    const lsKey = `form_field_${internalName}`;
    const [checked, setChecked] = useState(() => {
        if (typeof window === 'undefined') return false;
        const stored = localStorage.getItem(`form_field_${internalName}`);
        return stored === 'true';
    });
    const checkboxRef = useRef(null);
    
    // Add listener for reset events
    useEffect(() => {
        // Handler for form reset events
        const handleReset = () => {
            console.log(`Checkbox ${internalName} received reset event`);
            localStorage.removeItem(lsKey);
            setChecked(false);
            if (checkboxRef.current) {
                checkboxRef.current.checked = false;

                // Also notify parent components of this change
                if (changeListener) {
                    const syntheticEvent = {
                        target: {
                            checked: false
                        }
                    };
                    changeListener(syntheticEvent);
                }
            }
        };

        // Listen for reset events
        window.addEventListener('reset_form_components', handleReset);

        // Cleanup
        return () => {
            window.removeEventListener('reset_form_components', handleReset);
        };
    }, [internalName, lsKey, changeListener]);
    
    const handleChange = (e) => {
        // Update React state
        setChecked(e.target.checked);
        if (typeof window !== 'undefined') {
            localStorage.setItem(lsKey, String(e.target.checked));
        }

        // Call external change listener if provided
        if (changeListener) changeListener(e);
    };
    
    // Handle click on the box div
    const handleBoxClick = (e) => {
        // Only trigger if the click wasn't on the input itself
        if (e.target.tagName !== 'INPUT') {
            // Stop propagation to prevent double handling
            e.preventDefault();
            e.stopPropagation();
            
            // Programmatically click the checkbox
            if (checkboxRef.current) {
                checkboxRef.current.click();
            }
        }
    };
    
    // Determine if this is a long label that needs special handling
    const isLongLabel = visibleName && visibleName.length > 10;
    
    return (
        <div 
            className={`${styles.boxContainer} ${className || ''} ${isLongLabel ? styles.longLabel : ''}`}
            style={style}
        >
            <div className={styles.box} onClick={handleBoxClick}>
                <input 
                    ref={checkboxRef}
                    type="checkbox" 
                    id={internalName} 
                    name={internalName} 
                    checked={checked} 
                    onChange={handleChange}
                    className={className && className.includes('preMatchInput') ? styles.checkboxInput : ''}
                />
                <label htmlFor={internalName}>{visibleName}</label>
            </div>
        </div>
    )
}