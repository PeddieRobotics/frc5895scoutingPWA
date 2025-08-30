"use client";
import styles from './EndPlacement.module.css';

export default function MultiCheckboxGroup({ visibleName, options = [], className }) {
  const handleContainerClick = (e) => {
    // Only toggle when clicking the container background, not the input/label
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
    const input = e.currentTarget.querySelector('input');
    if (input) input.click();
  };

  return (
    <div className={`${styles.endPossibilities} ${className || ""}`}>
      {options.map((opt, idx) => (
        <div key={idx} className={styles.option} onClick={handleContainerClick}>
          <input
            type="checkbox"
            id={opt.name}
            name={opt.name}
            defaultChecked={Boolean(opt.defaultChecked)}
            onClick={(e) => e.stopPropagation()}
          />
          <label htmlFor={opt.name} onClick={(e) => e.stopPropagation()}>{opt.label}</label>
        </div>
      ))}
    </div>
  );
}
