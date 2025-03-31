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