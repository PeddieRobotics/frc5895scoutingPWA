"use client";
import { useEffect } from "react";
import styles from "./LightboxModal.module.css";

/**
 * LightboxModal — Reusable full-screen image overlay.
 *
 * Props:
 *   src     - image data URL or URL string
 *   alt     - alt text for the image
 *   onClose - callback when the lightbox is dismissed
 */
export default function LightboxModal({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!src) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <img
        src={src}
        alt={alt || 'Photo'}
        className={styles.img}
        onClick={e => e.stopPropagation()}
      />
      <button className={styles.closeBtn} onClick={onClose}>&#x2715;</button>
    </div>
  );
}
