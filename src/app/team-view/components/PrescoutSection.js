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

/**
 * Build a label → order index map from the prescout config sections.
 * Used to sort display entries to match the config-defined field order.
 */
function buildFieldOrder(prescoutConfig) {
  if (!prescoutConfig?.sections) return null;
  const order = new Map();
  let idx = 0;
  for (const section of prescoutConfig.sections) {
    for (const field of section.fields || []) {
      if (field.label) order.set(field.label, idx++);
    }
  }
  return order.size > 0 ? order : null;
}

export default function PrescoutSection({ prescoutData, prescoutConfig, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  let entries = normalizeEntries(prescoutData);

  // Sort entries by config field order when available
  const fieldOrder = buildFieldOrder(prescoutConfig);
  if (fieldOrder) {
    entries = [...entries].sort((a, b) => {
      const aIdx = fieldOrder.has(a[0]) ? fieldOrder.get(a[0]) : Infinity;
      const bIdx = fieldOrder.has(b[0]) ? fieldOrder.get(b[0]) : Infinity;
      return aIdx - bIdx;
    });
  }

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
