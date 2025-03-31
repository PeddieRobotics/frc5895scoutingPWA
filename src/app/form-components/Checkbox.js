"use client";
import styles from "./Checkbox.module.css";
import { useState, useEffect, useRef } from "react";

export default function Checkbox ({ visibleName, internalName, changeListener }) {
    const [checked, setChecked] = useState(false);
    const checkboxRef = useRef(null);
    
    // Sync the React state with the actual DOM element when component mounts
    useEffect(() => {
        if (checkboxRef.current) {
            // If the checkbox has a different checked state, update our state
            if (checkboxRef.current.checked !== checked) {
                setChecked(checkboxRef.current.checked);
            }
        }
    }, []);
    
    // Add listener for reset events
    useEffect(() => {
        // Handler for form reset events
        const handleReset = () => {
            console.log(`Checkbox ${internalName} received reset event`);
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
    }, [internalName, changeListener]);
    
    const handleChange = (e) => {
        // Update React state
        setChecked(e.target.checked);
        
        // Call external change listener if provided
        if (changeListener) changeListener(e);
    };
    
    return (
        <div className={styles.boxContainer}>
            <div className={styles.box}>
                <input 
                    ref={checkboxRef}
                    type="checkbox" 
                    id={internalName} 
                    name={internalName} 
                    checked={checked} 
                    onChange={handleChange}
                />
                <label htmlFor={internalName}>{visibleName}</label>
            </div>
        </div>
    )
}