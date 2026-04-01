"use client";
import { useState } from "react";
import styles from "./Comments.module.css"

function parseComments(value) {
    if (!value) return null;
    // API returns an array of " *Match N: text*" strings
    if (Array.isArray(value)) {
        const entries = value.map(s => String(s).replace(/^\s*\*|\*\s*$/g, '').trim()).filter(Boolean);
        return entries.length ? entries : null;
    }
    if (typeof value !== 'string' || value === 'No comments') return null;
    // Fallback: single string with asterisk separators
    const parts = value.split('*').map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : null;
}

export default function Comments({title, value, color1, color2}) {
    const [open, setOpen] = useState(false);
    const entries = parseComments(value);

    return (
        <div className={styles.commentsBox}>
            <button
                className={styles.commentsToggle}
                style={{ backgroundColor: color1 }}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span>{title}{entries ? ` (${entries.length})` : ''}</span>
                <span className={styles.chevron} aria-hidden="true">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className={styles.commentsList} style={{ borderColor: color1 }}>
                    {entries ? (
                        entries.map((entry, i) => (
                            <div
                                key={i}
                                className={styles.commentEntry}
                                style={{ backgroundColor: i % 2 === 0 ? color2 : 'rgba(255,255,255,0.6)' }}
                            >
                                {entry}
                            </div>
                        ))
                    ) : (
                        <div className={styles.commentEntryEmpty} style={{ backgroundColor: color2 }}>
                            No comments
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
