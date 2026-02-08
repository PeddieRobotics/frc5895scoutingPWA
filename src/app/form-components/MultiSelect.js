"use client";
import { useState, useEffect } from 'react';
import styles from './EndPlacement.module.css';

export default function MultiSelect({ options, subHeaderName, className }) {
    // Build initial state from options
    const buildInitialState = () => {
        const state = {};
        options?.forEach(opt => {
            state[opt.name] = false;
        });
        return state;
    };

    const [checked, setChecked] = useState(buildInitialState);

    // Listen for form reset events
    useEffect(() => {
        const handleReset = () => {
            setChecked(buildInitialState());
        };

        window.addEventListener('reset_form_components', handleReset);
        window.addEventListener('reset_numeric_inputs', handleReset);

        return () => {
            window.removeEventListener('reset_form_components', handleReset);
            window.removeEventListener('reset_numeric_inputs', handleReset);
        };
    }, [options]);

    if (!options || options.length === 0) return null;

    const handleOptionClick = (name) => {
        setChecked(prev => ({ ...prev, [name]: !prev[name] }));
    };

    return (
        <div
            className={`${styles.endPossibilities} ${className || ""}`}
            style={{ backgroundColor: '#bd9748' }}
        >
            {options.map((opt) => (
                <div
                    key={opt.name}
                    className={styles.option}
                    onClick={() => handleOptionClick(opt.name)}
                >
                    <input
                        type="checkbox"
                        id={opt.name}
                        name={opt.name}
                        checked={checked[opt.name] || false}
                        onChange={(e) => {
                            setChecked(prev => ({ ...prev, [opt.name]: e.target.checked }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <label
                        htmlFor={opt.name}
                        style={{ pointerEvents: 'none', width: '100%', cursor: 'pointer' }}
                    >
                        {opt.label}
                    </label>
                </div>
            ))}
        </div>
    );
}
