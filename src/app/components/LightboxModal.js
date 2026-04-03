"use client";
import { useEffect } from "react";
import styles from "./LightboxModal.module.css";

/**
 * LightboxModal — Reusable full-screen image overlay with optional carousel navigation.
 *
 * Props:
 *   src     - image data URL or URL string
 *   alt     - alt text for the image
 *   onClose - callback when the lightbox is dismissed
 *   onPrev  - (optional) callback to go to previous image
 *   onNext  - (optional) callback to go to next image
 */
export default function LightboxModal({ src, alt, onClose, onPrev, onNext }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  if (!src) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      {onPrev && (
        <button
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous photo"
        >
          &#x2039;
        </button>
      )}
      <img
        src={src}
        alt={alt || 'Photo'}
        className={styles.img}
        onClick={e => e.stopPropagation()}
      />
      {onNext && (
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next photo"
        >
          &#x203A;
        </button>
      )}
      <button className={styles.closeBtn} onClick={onClose}>&#x2715;</button>
    </div>
  );
}
