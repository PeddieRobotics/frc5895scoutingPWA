"use client";
import { useState, useEffect } from 'react';
import styles from './EndPlacement.module.css';

export default function SingleSelect({ options, internalName, className }) {
    const defaultOption = options?.find(o => o.default) || options?.[0];
    const [selected, setSelected] = useState(defaultOption?.value ?? 0);

    // Listen for form reset events
    useEffect(() => {
        const handleReset = () => {
            const resetValue = defaultOption?.value ?? 0;
            setSelected(resetValue);
        };

        window.addEventListener('reset_form_components', handleReset);
        window.addEventListener('reset_numeric_inputs', handleReset);

        return () => {
            window.removeEventListener('reset_form_components', handleReset);
            window.removeEventListener('reset_numeric_inputs', handleReset);
        };
    }, [defaultOption]);

    if (!options || options.length === 0) return null;

    return (
        <div className={`${styles.endPossibilities} ${className || ""}`}>
            {options.map((opt) => (
                <div
                    key={opt.value}
                    className={styles.option}
                    onClick={(e) => {
                        e.target.querySelector("input")?.click();
                    }}
                >
                    <input
                        name={internalName}
                        type="radio"
                        id={`${internalName}-${opt.value}`}
                        value={opt.value}
                        checked={selected === opt.value}
                        onChange={() => setSelected(opt.value)}
                    />
                    <label htmlFor={`${internalName}-${opt.value}`}>{opt.label}</label>
                </div>
            ))}
        </div>
    );
}
