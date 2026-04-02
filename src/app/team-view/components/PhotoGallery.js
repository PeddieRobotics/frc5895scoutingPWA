"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./PhotoGallery.module.css";
import LightboxModal from "../../components/LightboxModal";

/**
 * PhotoGallery
 *
 * Props:
 *   photos     - array of metadata objects: {id, filename, mime_type, uploaded_by, uploaded_at}
 *   onDelete   - async (id) => void — called after a photo is deleted; triggers refetch in parent
 *   teamNumber - the team number (used for display only)
 *   readOnly   - if true, hide delete button (default false)
 *   gameName   - (optional) passed from scout-leads for upload support; if provided + !readOnly, show upload UI
 *   gameId     - (optional) game config DB id; passed to photos/[id] API calls for per-game table resolution
 *   onUpload   - async (file) => void — called after a photo is uploaded; triggers refetch in parent
 *   uploadRef  - (optional) ref forwarded so parent can trigger file picker
 */
export default function PhotoGallery({
  photos = [],
  onDelete,
  teamNumber,
  readOnly = false,
  gameName,
  gameId,
  onUpload,
  uploadRef,
}) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null); // {id, src, filename}
  const [loadedPhotos, setLoadedPhotos] = useState({}); // id -> {src, loading, error}
  const [deleteConfirm, setDeleteConfirm] = useState(null); // photo id awaiting confirm
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const internalFileRef = useRef(null);

  // When gallery opens, start loading any not-yet-loaded photos
  useEffect(() => {
    if (!open) return;
    photos.forEach(p => {
      if (loadedPhotos[p.id]) return;
      setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: true, error: false } }));
      fetch(`/api/prescout/photos/${p.id}${gameId ? `?gameId=${gameId}` : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data.photo_data) {
            const src = `data:${data.mime_type};base64,${data.photo_data}`;
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src, loading: false, error: false } }));
          } else {
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false, error: true } }));
          }
        })
        .catch(() => {
          setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false, error: true } }));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photos.length]);

  // Close modal on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') { setLightbox(null); if (!lightbox) setOpen(false); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, lightbox]);

  const handleDelete = useCallback(async (id) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/prescout/photos/${id}${gameId ? `?gameId=${gameId}` : ''}`, { method: 'DELETE' });
      if (res.ok) {
        setLoadedPhotos(prev => { const next = { ...prev }; delete next[id]; return next; });
        if (lightbox?.id === id) setLightbox(null);
        setDeleteConfirm(null);
        onDelete && onDelete(id);
      }
    } finally {
      setDeleting(false);
    }
  }, [lightbox, onDelete, gameId]);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are allowed.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('Photo must be under 3 MB.');
      return;
    }
    setUploading(true);
    try {
      await onUpload?.(file);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  // Expose file input trigger to parent via uploadRef
  useEffect(() => {
    if (uploadRef) {
      uploadRef.current = () => internalFileRef.current?.click();
    }
  }, [uploadRef]);

  const count = photos.length;
  const canUpload = !readOnly && !!gameName && !!onUpload;

  return (
    <>
      {/* Trigger button */}
      <button
        className={styles.triggerBtn}
        onClick={() => setOpen(true)}
        title={`View photos for team ${teamNumber}`}
      >
        <CameraIcon />
        {count > 0 && <span className={styles.badge}>{count}</span>}
      </button>

      {/* Hidden file input for upload */}
      {canUpload && (
        <input
          ref={internalFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      )}

      {/* Modal */}
      {open && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) { setLightbox(null); setOpen(false); } }}>
          <div className={styles.modal}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                Team {teamNumber} — Photos{count > 0 ? ` (${count})` : ''}
              </span>
              <div className={styles.headerActions}>
                {canUpload && (
                  <button
                    className={styles.uploadBtn}
                    onClick={() => internalFileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : '+ Upload Photo'}
                  </button>
                )}
                <button className={styles.closeBtn} onClick={() => { setLightbox(null); setOpen(false); }} aria-label="Close">✕</button>
              </div>
            </div>

            {uploadError && <p className={styles.uploadError}>{uploadError}</p>}

            {/* Photo grid */}
            {count === 0 ? (
              <div className={styles.emptyState}>
                <p>No photos yet{canUpload ? ' — upload one above!' : '.'}</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {photos.map(p => {
                  const loaded = loadedPhotos[p.id];
                  return (
                    <div key={p.id} className={styles.thumbWrapper}>
                      {/* Thumbnail */}
                      <button
                        className={styles.thumbBtn}
                        onClick={() => loaded?.src && setLightbox({ id: p.id, src: loaded.src, filename: p.filename })}
                        disabled={!loaded?.src}
                        title={p.filename}
                      >
                        {loaded?.src ? (
                          <img src={loaded.src} alt={p.filename} className={styles.thumb} />
                        ) : loaded?.error ? (
                          <span className={styles.thumbError}>!</span>
                        ) : (
                          <span className={styles.thumbLoader} />
                        )}
                      </button>

                      {/* Delete / confirm */}
                      {!readOnly && (
                        <div className={styles.thumbActions}>
                          {deleteConfirm === p.id ? (
                            <>
                              <button
                                className={styles.confirmDeleteBtn}
                                onClick={() => handleDelete(p.id)}
                                disabled={deleting}
                              >
                                {deleting ? '…' : 'Delete'}
                              </button>
                              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            </>
                          ) : (
                            <button
                              className={styles.deleteBtn}
                              onClick={() => setDeleteConfirm(p.id)}
                              title="Delete photo"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      )}

                      <p className={styles.thumbLabel}>{p.uploaded_by || 'Unknown'}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lightbox */}
          {lightbox && (
            <LightboxModal
              src={lightbox.src}
              alt={lightbox.filename}
              onClose={() => setLightbox(null)}
            />
          )}
        </div>
      )}
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle' }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
