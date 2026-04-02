"use client";
import { useState } from "react";
import styles from "./PrescoutSection.module.css";

/**
 * Normalizes prescout data into an ordered [field, value] array.
 * Accepts two formats:
 *   - Array of {field, value} (new format — order preserved by JSONB)
 *   - Plain object {field: value} (legacy — key order not guaranteed)
 */
function normalizeEntries(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .filter(item => item.value != null && String(item.value).trim() !== '')
      .map(item => [item.field, item.value]);
  }
  return Object.entries(data).filter(([, v]) => v != null && String(v).trim() !== '');
}

export default function PrescoutSection({ prescoutData }) {
  const [open, setOpen] = useState(true);

  const entries = normalizeEntries(prescoutData);

  return (
    <div className={styles.section}>
      <button
        className={styles.toggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span>Prescout{entries.length > 0 ? ` (${entries.length} fields)` : ''}</span>
        <span className={styles.chevron} aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {entries.length === 0 ? (
            <p className={styles.empty}>No prescout data for this team.</p>
          ) : (
            <table className={styles.table}>
              <tbody>
                {entries.map(([field, value]) => (
                  <tr key={field} className={styles.row}>
                    <td className={styles.fieldCell}>{field}</td>
                    <td className={styles.valueCell}>{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
