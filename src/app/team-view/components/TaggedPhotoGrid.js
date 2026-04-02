"use client";
import { useState, useEffect } from "react";
import styles from "./TaggedPhotoGrid.module.css";
import LightboxModal from "../../components/LightboxModal";

/**
 * TaggedPhotoGrid — Displays photos for a specific tag as a horizontal scrollable row.
 *
 * Props:
 *   tag            - tag name string (e.g., "Featured")
 *   photos         - array of photo metadata objects pre-filtered by parent (with this tag)
 *   gameId         - game config DB id for API calls
 *   tagConfig      - { name, emoji, color } from config.photoTags
 *   titleClassName - optional CSS class for the title (e.g., parent's graphTitle style)
 */
export default function TaggedPhotoGrid({ tag, photos, gameId, tagConfig, titleClassName }) {
  const [loadedPhotos, setLoadedPhotos] = useState({});
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    photos.forEach(p => {
      if (loadedPhotos[p.id]) return;
      setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: true } }));
      fetch(`/api/prescout/photos/${p.id}${gameId ? `?gameId=${gameId}` : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data.photo_data) {
            const src = `data:${data.mime_type};base64,${data.photo_data}`;
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src, loading: false } }));
          } else {
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false, error: true } }));
          }
        })
        .catch(() => {
          setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false, error: true } }));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, gameId]);

  if (!photos || photos.length === 0) return null;

  return (
    <div className={styles.container}>
      <h4 className={titleClassName || styles.title}>
        {tagConfig?.emoji && <span className={styles.titleEmoji}>{tagConfig.emoji}</span>}
        {tag}
      </h4>
      <div className={styles.scrollRow}>
        {photos.map(p => {
          const loaded = loadedPhotos[p.id];
          return (
            <button
              key={p.id}
              type="button"
              className={styles.thumb}
              onClick={() => loaded?.src && setLightbox({ id: p.id, src: loaded.src, filename: p.filename })}
              disabled={!loaded?.src}
              title={p.filename}
            >
              {loaded?.src ? (
                <img src={loaded.src} alt={p.filename} className={styles.thumbImg} />
              ) : loaded?.error ? (
                <span className={styles.thumbError}>!</span>
              ) : (
                <span className={styles.thumbLoader} />
              )}
            </button>
          );
        })}
      </div>

      {lightbox && (
        <LightboxModal
          src={lightbox.src}
          alt={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
