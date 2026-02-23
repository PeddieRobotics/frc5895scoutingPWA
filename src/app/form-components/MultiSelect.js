"use client";
import { useState, useEffect } from 'react';
import styles from './EndPlacement.module.css';

export default function MultiSelect({ options, subHeaderName, className }) {
    const lsKey = subHeaderName ? `form_multiselect_${subHeaderName}` : null;

    // Build initial state from options
    const buildInitialState = () => {
        const state = {};
        options?.forEach(opt => {
            state[opt.name] = false;
        });
        return state;
    };

    const [checked, setChecked] = useState(() => {
        if (lsKey && typeof window !== 'undefined') {
            try {
                const stored = localStorage.getItem(lsKey);
                if (stored) return JSON.parse(stored);
            } catch {
                // fall through
            }
        }
        return buildInitialState();
    });

    // Listen for form reset events
    useEffect(() => {
        const handleReset = () => {
            if (lsKey) localStorage.removeItem(lsKey);
            setChecked(buildInitialState());
        };

        window.addEventListener('reset_form_components', handleReset);
        window.addEventListener('reset_numeric_inputs', handleReset);

        return () => {
            window.removeEventListener('reset_form_components', handleReset);
            window.removeEventListener('reset_numeric_inputs', handleReset);
        };
    }, [options, lsKey]);

    if (!options || options.length === 0) return null;

    const handleOptionClick = (name) => {
        setChecked(prev => {
            const next = { ...prev, [name]: !prev[name] };
            if (lsKey && typeof window !== 'undefined') {
                localStorage.setItem(lsKey, JSON.stringify(next));
            }
            return next;
        });
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
                            setChecked(prev => {
                                const next = { ...prev, [opt.name]: e.target.checked };
                                if (lsKey && typeof window !== 'undefined') {
                                    localStorage.setItem(lsKey, JSON.stringify(next));
                                }
                                return next;
                            });
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
