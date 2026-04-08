"use client";

import { useState } from "react";
import styles from "./UnscoredMatchesDropdown.module.css";

export default function UnscoredMatchesDropdown({ matches, label = "Unscored matches were skipped.", formatMatch, className }) {
  const [open, setOpen] = useState(false);

  if (!matches || matches.length === 0) return null;

  return (
    <div className={`${styles.dropdown}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen(prev => !prev)}
      >
        <span>{label} ({matches.length})</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}>&#9660;</span>
      </button>
      {open && (
        <div className={styles.body}>
          <ul>
            {matches.map((issue, index) => (
              <li key={`${issue.team}-${issue.match}-${issue.matchType}-${index}`}>
                {formatMatch(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
