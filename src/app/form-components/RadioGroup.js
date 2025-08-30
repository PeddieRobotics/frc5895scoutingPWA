"use client";
import styles from './EndPlacement.module.css';

export default function RadioGroup({ visibleName, internalName, options = [], defaultValue = undefined, className }) {
  return (
    <div className={`${styles.endPossibilities} ${className || ""}`}>
      {options.map((opt, idx) => (
        <div key={idx} className={styles.option} onClick={(e) => { e.currentTarget.querySelector('input')?.click(); }}>
          <input
            name={internalName}
            type="radio"
            id={`${internalName}-${String(opt.value)}`}
            value={opt.value}
            defaultChecked={defaultValue === undefined ? idx === 0 : opt.value === defaultValue}
            onChange={() => {}}
          />
          <label htmlFor={`${internalName}-${String(opt.value)}`}>{opt.label}</label>
        </div>
      ))}
    </div>
  );
}

