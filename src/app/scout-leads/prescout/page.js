'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useGameConfig from '../../../lib/useGameConfig';
import LightboxModal from '../../components/LightboxModal';
import { compressImage } from '../../../lib/compressImage';
import styles from './prescout-form.module.css';

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const STORAGE_KEY = 'prescout_form_draft';

function saveDraft(activeTeam, formData) {
  try {
    if (activeTeam && Object.keys(formData).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ activeTeam, formData }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function clearDraft() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function PrescoutFormPage() {
  const { config, gameId, gameName, loading: configLoading } = useGameConfig();

  const [teamNumber, setTeamNumber] = useState('');
  const [activeTeam, setActiveTeam] = useState(null);
  const [formData, setFormData] = useState({});
  const [loadedFormData, setLoadedFormData] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [unsavedWarning, setUnsavedWarning] = useState(false);
  const draftRestored = useRef(false);

  // Photo state
  const [photos, setPhotos] = useState([]);
  const [loadedPhotos, setLoadedPhotos] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedTag, setSelectedTag] = useState(null);
  const [stagedPhotos, setStagedPhotos] = useState([]); // [{file, preview}]
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Unscouted tracker state
  const [trackerData, setTrackerData] = useState(null); // { eventTeams, scouted, unscouted }
  const [trackerLoading, setTrackerLoading] = useState(false);

  const prescoutConfig = config?.prescout;
  const photoTags = config?.photoTags || [];

  // Restore draft from sessionStorage on mount
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;
    const draft = loadDraft();
    if (draft?.activeTeam && draft?.formData) {
      setActiveTeam(draft.activeTeam);
      setTeamNumber(String(draft.activeTeam));
      setFormData(draft.formData);
      setIsEditMode(true);
    }
  }, []);

  // Auto-save draft to sessionStorage when formData or activeTeam changes
  useEffect(() => {
    if (!draftRestored.current) return;
    saveDraft(activeTeam, formData);
  }, [activeTeam, formData]);

  // Fetch unscouted teams tracker
  const fetchTracker = useCallback(async () => {
    if (!gameId) return;
    setTrackerLoading(true);
    try {
      const res = await fetch(`/api/prescout/unscouted?gameId=${gameId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTrackerData(data);
      }
    } catch {}
    finally { setTrackerLoading(false); }
  }, [gameId]);

  useEffect(() => {
    if (gameId) fetchTracker();
  }, [gameId, fetchTracker]);

  const fetchPhotos = useCallback(async (team) => {
    if (!team || !gameId) return;
    try {
      const res = await fetch(`/api/prescout/photos?team=${team}&gameId=${gameId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.photos || []);
        setLoadedPhotos({});
      }
    } catch {}
  }, [gameId]);

  // Load photo data for thumbnails
  useEffect(() => {
    photos.forEach(p => {
      if (loadedPhotos[p.id]) return;
      setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: true } }));
      fetch(`/api/prescout/photos/${p.id}${gameId ? `?gameId=${gameId}` : ''}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.photo_data) {
            const src = `data:${data.mime_type};base64,${data.photo_data}`;
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src, loading: false } }));
          } else {
            setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false } }));
          }
        })
        .catch(() => {
          setLoadedPhotos(prev => ({ ...prev, [p.id]: { src: null, loading: false } }));
        });
    });
  }, [photos, gameId]);

  // Check for unsaved data when team number input changes
  const hasUnsavedData = activeTeam && JSON.stringify(formData) !== JSON.stringify(loadedFormData);

  const handleTeamNumberChange = useCallback((val) => {
    setTeamNumber(val);
    if (hasUnsavedData && val !== String(activeTeam)) {
      setUnsavedWarning(true);
    } else {
      setUnsavedWarning(false);
    }
  }, [hasUnsavedData, activeTeam]);

  const handleLoadTeam = useCallback(async () => {
    const num = parseInt(teamNumber);
    if (!num || !gameId) return;

    // Clear previous draft when loading a new team
    clearDraft();
    setUnsavedWarning(false);
    setLoadingTeam(true);
    setError('');
    setSuccess('');
    setIsEditMode(false);

    try {
      const res = await fetch(`/api/prescout/form?team=${num}&gameId=${gameId}`, { credentials: 'include' });
      if (res.ok) {
        const result = await res.json();
        if (result.data && Array.isArray(result.data)) {
          // Convert [{field, value}] array to {fieldName: value} map for form state
          const map = {};
          result.data.forEach(({ field, value }) => {
            // Find the field config to determine the internal name
            const fieldConfig = findFieldByLabel(field);
            if (fieldConfig) {
              // For multiSelect: split comma-separated string back to array
              if (fieldConfig.type === 'multiSelect' && value) {
                map[fieldConfig.name] = String(value).split(',').map(s => s.trim()).filter(Boolean);
              // For singleSelect: reverse-map label back to value
              } else if (fieldConfig.type === 'singleSelect' && value) {
                const matchingOpt = fieldConfig.options?.find(o => o.label === value);
                if (matchingOpt) {
                  map[fieldConfig.name] = matchingOpt.value;
                } else if (fieldConfig.hasOther) {
                  // Value doesn't match any option — it's an "Other" entry
                  map[fieldConfig.name] = '_other';
                  map[`${fieldConfig.name}_other`] = value;
                } else {
                  map[fieldConfig.name] = value;
                }
              } else {
                map[fieldConfig.name] = value;
              }
            } else {
              // Fallback: try to match by name directly
              map[field] = value;
            }
          });
          setFormData(map);
          setLoadedFormData(map);
          setIsEditMode(true);
        } else {
          setFormData({});
          setLoadedFormData({});
        }
      } else {
        setFormData({});
        setLoadedFormData({});
      }
      setActiveTeam(num);
      fetchPhotos(num);
    } catch (err) {
      setError('Failed to load team data: ' + err.message);
    } finally {
      setLoadingTeam(false);
    }
  }, [teamNumber, gameId, fetchPhotos, prescoutConfig]);

  // Find field config by label (used when loading existing data)
  const findFieldByLabel = useCallback((label) => {
    if (!prescoutConfig?.sections) return null;
    for (const section of prescoutConfig.sections) {
      for (const field of section.fields || []) {
        if (field.label === label) return field;
      }
    }
    return null;
  }, [prescoutConfig]);

  // Check if a field should be visible based on showWhen condition
  const isFieldVisible = useCallback((field, data) => {
    if (!field.showWhen) return true;
    const { field: depField, equals, notEquals } = field.showWhen;
    const depValue = data?.[depField];
    if (equals !== undefined) return depValue !== undefined && depValue !== null && parseInt(depValue) === equals;
    if (notEquals !== undefined) return depValue !== undefined && depValue !== null && parseInt(depValue) !== notEquals;
    return true;
  }, []);

  const handleFieldChange = useCallback((fieldName, value) => {
    setFormData(prev => {
      const next = { ...prev, [fieldName]: value };
      // When a controlling field changes, clear hidden dependent fields
      if (prescoutConfig?.sections) {
        for (const section of prescoutConfig.sections) {
          for (const field of section.fields || []) {
            if (field.showWhen && field.showWhen.field === fieldName) {
              if (!isFieldVisible(field, next)) {
                delete next[field.name];
                // Also clear the _other companion if it exists
                delete next[`${field.name}_other`];
              }
            }
          }
        }
      }
      return next;
    });
  }, [prescoutConfig]);

  const handleSubmit = useCallback(async () => {
    if (!activeTeam || !prescoutConfig) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // Convert formData to [{field, value}] array using labels for display compatibility
      // Hidden fields (showWhen not met) are explicitly excluded
      const data = [];
      for (const section of prescoutConfig.sections) {
        for (const field of section.fields || []) {
          // Skip fields hidden by showWhen — they must not be submitted
          if (!isFieldVisible(field, formData)) continue;

          const rawValue = formData[field.name];

          // Determine if the field is empty/cleared
          // For singleSelect, 0 is a valid option value (not empty)
          // For starRating/checkbox, 0 means unset/unchecked (empty)
          const zeroIsEmpty = field.type !== 'singleSelect';
          const isEmpty = rawValue === undefined || rawValue === null || rawValue === ''
            || (zeroIsEmpty && rawValue === 0)
            || (Array.isArray(rawValue) && rawValue.length === 0);

          let displayValue = '';
          if (!isEmpty) {
            // Handle singleSelect with hasOther: if "Other" is selected, use the _other text
            if (field.type === 'singleSelect' && field.hasOther && rawValue === '_other') {
              displayValue = formData[`${field.name}_other`] || '';
            } else if (field.type === 'singleSelect') {
              // Convert singleSelect numeric values to their label
              const numVal = parseInt(rawValue);
              const option = field.options?.find(o => o.value === numVal);
              displayValue = option ? option.label : String(rawValue);
            } else if (field.type === 'multiSelect' && Array.isArray(rawValue)) {
              displayValue = rawValue.join(', ');
            } else {
              displayValue = String(rawValue);
            }
          }

          // Send all visible fields — empty string signals removal during merge
          data.push({ field: field.label, value: displayValue });
        }
      }

      // Don't create a row if no fields were actually filled in
      const hasAnyData = data.some(d => d.value !== '');
      if (!hasAnyData && !isEditMode) {
        setError('Please fill in at least one field before submitting.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/prescout/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ teamNumber: activeTeam, gameId, data }),
      });

      if (res.ok) {
        clearDraft();
        setSuccess(isEditMode ? `Updated prescout data for team ${activeTeam}.` : `Submitted prescout data for team ${activeTeam}.`);
        setIsEditMode(true);
        fetchTracker();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const d = await res.json();
        setError(d.message || 'Failed to submit.');
      }
    } catch (err) {
      setError('Submit failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }, [activeTeam, prescoutConfig, formData, gameId, isEditMode, fetchTracker]);

  const handlePhotoDelete = useCallback(async (id) => {
    if (!gameId) return;
    try {
      await fetch(`/api/prescout/photos/${id}?gameId=${gameId}`, { method: 'DELETE', credentials: 'include' });
      setDeleteConfirm(null);
      setLoadedPhotos(prev => { const next = { ...prev }; delete next[id]; return next; });
      if (lightbox?.id === id) setLightbox(null);
      fetchPhotos(activeTeam);
    } catch {}
  }, [gameId, activeTeam, fetchPhotos, lightbox]);

  const handlePhotoUpload = useCallback(async (e) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;
    e.target.value = '';
    setUploadError('');
    if (!rawFile.type.startsWith('image/')) {
      setUploadError('Only image files are allowed.');
      return;
    }
    setUploading(true);
    try {
      const file = await compressImage(rawFile);
      if (file.size > 3 * 1024 * 1024) {
        setUploadError('Photo still exceeds 3 MB after compression.');
        setUploading(false);
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('team', String(activeTeam));
      fd.append('gameName', gameName);
      if (selectedTag) fd.append('tag', selectedTag);
      await fetch('/api/prescout/photos', { method: 'POST', body: fd, credentials: 'include' });
      fetchPhotos(activeTeam);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [activeTeam, gameName, fetchPhotos, selectedTag]);

  // Camera capture: stage photos for batch upload
  const handleCameraCapture = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const newStaged = files
      .filter(f => f.type.startsWith('image/'))
      .map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setStagedPhotos(prev => [...prev, ...newStaged]);
  }, []);

  const removeStagedPhoto = useCallback((index) => {
    setStagedPhotos(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  }, []);

  const handleBatchUpload = useCallback(async () => {
    if (stagedPhotos.length === 0 || !activeTeam || !gameName) return;
    setBatchUploading(true);
    setBatchProgress(0);
    setUploadError('');

    let uploaded = 0;
    for (const staged of stagedPhotos) {
      try {
        const file = await compressImage(staged.file);
        if (file.size > 3 * 1024 * 1024) continue; // skip oversized
        const fd = new FormData();
        fd.append('file', file);
        fd.append('team', String(activeTeam));
        fd.append('gameName', gameName);
        if (selectedTag) fd.append('tag', selectedTag);
        await fetch('/api/prescout/photos', { method: 'POST', body: fd, credentials: 'include' });
        uploaded++;
        setBatchProgress(uploaded);
      } catch {}
    }

    // Clean up previews
    stagedPhotos.forEach(s => URL.revokeObjectURL(s.preview));
    setStagedPhotos([]);
    setBatchUploading(false);
    setBatchProgress(0);
    fetchPhotos(activeTeam);
  }, [stagedPhotos, activeTeam, gameName, fetchPhotos, selectedTag]);

  const handleTagPhoto = useCallback(async (photoId, tagName) => {
    if (!gameId) return;
    // Find current tag — toggle off if same tag
    const photo = photos.find(p => p.id === photoId);
    const newTag = photo?.tag === tagName ? null : tagName;
    try {
      if (newTag) {
        await fetch(`/api/prescout/photos/${photoId}?gameId=${gameId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tag: newTag }),
        });
      } else {
        // PATCH API requires non-empty tag, so we can't remove — just skip
        // (The API enforces tag is required+non-empty on PATCH)
        return;
      }
      fetchPhotos(activeTeam);
    } catch {}
  }, [gameId, activeTeam, photos, fetchPhotos]);

  const handleTrackerTeamClick = useCallback((num) => {
    setTeamNumber(String(num));
    // Auto-trigger load if no unsaved data
    if (!hasUnsavedData) {
      // Defer to next tick so teamNumber state is set
      setTimeout(() => {
        const el = document.getElementById('prescout-load-btn');
        if (el) el.click();
      }, 0);
    } else {
      setUnsavedWarning(true);
    }
  }, [hasUnsavedData]);

  if (configLoading) {
    return <div className={styles.page}><p className={styles.loadingText}>Loading...</p></div>;
  }

  if (!prescoutConfig) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <a href="/scout-leads" className={styles.backBtn}><BackIcon /> Scout Leads</a>
            <h1 className={styles.title}>Prescout</h1>
          </div>
          <p className={styles.emptyText}>No prescout form configured for the active game.</p>
          <a href="/scout-leads/prescout/upload" className={styles.emergencyUploadBtn}>
            <UploadIcon /> Upload Spreadsheet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header — full width above layout */}
      <div className={styles.pageHeader}>
        <div className={styles.header}>
          <a href="/scout-leads" className={styles.backBtn}><BackIcon /> Scout Leads</a>
          <div>
            <h1 className={styles.title}>Prescout Form</h1>
            <p className={styles.subtitle}>
              {config?.displayName || gameName}
            </p>
          </div>
        </div>
        <a href="/scout-leads/prescout/upload" className={styles.emergencyUploadBtn}>
          <UploadIcon /> Upload Spreadsheet (Emergency)
        </a>
      </div>

      <div className={styles.pageLayout}>
        {/* Unscouted teams tracker — sidebar on desktop, above form on mobile */}
        <aside className={styles.trackerPanel}>
          <h2 className={styles.trackerTitle}>Prescout Tracker</h2>
          {trackerLoading ? (
            <p className={styles.trackerLoading}>Loading teams...</p>
          ) : !trackerData || trackerData.eventTeams.length === 0 ? (
            <p className={styles.trackerEmpty}>No TBA event data available.</p>
          ) : (
            <>
              <div className={styles.trackerStats}>
                <span className={styles.trackerStatDone}>{trackerData.scoutedWithPhotos.length + trackerData.scoutedNoPhotos.length}</span>
                <span className={styles.trackerStatSep}>/</span>
                <span className={styles.trackerStatTotal}>{trackerData.eventTeams.length}</span>
                <span className={styles.trackerStatLabel}>scouted</span>
              </div>
              <div className={styles.trackerProgress}>
                <div
                  className={styles.trackerProgressBar}
                  style={{ width: `${((trackerData.scoutedWithPhotos.length + trackerData.scoutedNoPhotos.length) / trackerData.eventTeams.length) * 100}%` }}
                />
              </div>
              {trackerData.unscouted.length > 0 && (
                <div className={styles.trackerSection}>
                  <p className={styles.trackerSectionLabel}>Unscouted ({trackerData.unscouted.length})</p>
                  <div className={styles.trackerTeams}>
                    {trackerData.unscouted.map(t => (
                      <button
                        key={t}
                        className={styles.trackerTeamBtn}
                        onClick={() => handleTrackerTeamClick(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trackerData.photosOnly?.length > 0 && (
                <div className={styles.trackerSection}>
                  <p className={styles.trackerSectionLabel}>Photos Only ({trackerData.photosOnly.length})</p>
                  <div className={styles.trackerTeams}>
                    {trackerData.photosOnly.map(t => (
                      <button
                        key={t}
                        className={styles.trackerTeamPhotosOnly}
                        onClick={() => handleTrackerTeamClick(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trackerData.scoutedNoPhotos.length > 0 && (
                <div className={styles.trackerSection}>
                  <p className={styles.trackerSectionLabel}>No Photos ({trackerData.scoutedNoPhotos.length})</p>
                  <div className={styles.trackerTeams}>
                    {trackerData.scoutedNoPhotos.map(t => (
                      <button
                        key={t}
                        className={styles.trackerTeamNoPhotos}
                        onClick={() => handleTrackerTeamClick(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trackerData.scoutedWithPhotos.length > 0 && (
                <div className={styles.trackerSection}>
                  <p className={styles.trackerSectionLabel}>Complete ({trackerData.scoutedWithPhotos.length})</p>
                  <div className={styles.trackerTeams}>
                    {trackerData.scoutedWithPhotos.map(t => (
                      <button
                        key={t}
                        className={styles.trackerTeamDone}
                        onClick={() => handleTrackerTeamClick(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>

      <div className={styles.container}>

        {/* Alerts */}
        {error && <div className={styles.errorBanner}>{error}</div>}
        {success && <div className={styles.successBanner}>{success}</div>}

        {/* Team number input */}
        <div className={styles.teamInputCard}>
          <p className={styles.teamInputLabel}>Team Number</p>
          <div className={styles.teamInputRow}>
            <input
              type="number"
              className={styles.teamInput}
              placeholder="Enter team number"
              value={teamNumber}
              onChange={(e) => handleTeamNumberChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoadTeam(); }}
            />
            <button
              id="prescout-load-btn"
              className={styles.teamLoadBtn}
              onClick={handleLoadTeam}
              disabled={!teamNumber || loadingTeam}
            >
              {loadingTeam ? 'Loading...' : 'Load'}
            </button>
          </div>
          {unsavedWarning && (
            <div className={styles.unsavedWarning}>
              Unsaved data for team {activeTeam} will be lost if you load a different team.
            </div>
          )}
          {isEditMode && activeTeam && !unsavedWarning && (
            <div className={styles.editIndicator}>
              Editing existing prescout for team {activeTeam}
            </div>
          )}
        </div>

        {/* Form sections — only show when a team is loaded */}
        {activeTeam && (
          <>
            {prescoutConfig.sections.map((section) => (
              <div key={section.id} className={styles.sectionCard}>
                <h2 className={styles.sectionHeader}>{section.header}</h2>
                {section.description && (
                  <p className={styles.sectionDesc}>{section.description}</p>
                )}
                {section.fields?.map((field) => {
                  if (!isFieldVisible(field, formData)) return null;
                  return (
                    <PrescoutField
                      key={field.name}
                      field={field}
                      value={formData[field.name]}
                      otherValue={formData[`${field.name}_other`]}
                      onChange={(val) => handleFieldChange(field.name, val)}
                      onOtherChange={(val) => handleFieldChange(`${field.name}_other`, val)}
                    />
                  );
                })}
              </div>
            ))}

            {/* Inline Photo Gallery */}
            <div className={styles.photoSection}>
              <h2 className={styles.photoSectionTitle}>Robot Photos</h2>

              {/* Tag selector — required before upload */}
              {photoTags.length > 0 && (
                <div className={styles.fieldGroup}>
                  <p className={styles.fieldLabel}>Select tag before uploading</p>
                  <div className={styles.selectTiles}>
                    {photoTags.map(tag => (
                      <button
                        key={tag.name}
                        type="button"
                        className={selectedTag === tag.name ? styles.selectTileSelected : styles.selectTile}
                        onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                      >
                        {tag.emoji} {tag.name}
                      </button>
                    ))}
                  </div>
                  {!selectedTag && <p className={styles.tagRequiredHint}>A tag is required to upload photos.</p>}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhotoUpload}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                style={{ display: 'none' }}
                onChange={handleCameraCapture}
              />
              <div className={styles.photoBtnRow}>
                <button
                  className={styles.photoUploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || batchUploading || (photoTags.length > 0 && !selectedTag)}
                >
                  <UploadIcon /> {uploading ? 'Uploading...' : 'Upload Photo'}
                </button>
                <button
                  className={styles.photoCaptureBtn}
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={uploading || batchUploading || (photoTags.length > 0 && !selectedTag)}
                >
                  <CameraIcon /> Take Photos
                </button>
              </div>
              {uploadError && <p className={styles.photoError}>{uploadError}</p>}

              {/* Staged photos from camera capture */}
              {stagedPhotos.length > 0 && (
                <div className={styles.stagedSection}>
                  <div className={styles.stagedHeader}>
                    <span className={styles.stagedTitle}>
                      {stagedPhotos.length} photo{stagedPhotos.length !== 1 ? 's' : ''} ready
                    </span>
                    <button
                      className={styles.stagedUploadBtn}
                      onClick={handleBatchUpload}
                      disabled={batchUploading}
                    >
                      {batchUploading
                        ? `Uploading ${batchProgress}/${stagedPhotos.length}...`
                        : `Upload All`}
                    </button>
                  </div>
                  <div className={styles.stagedGrid}>
                    {stagedPhotos.map((staged, i) => (
                      <div key={i} className={styles.stagedCard}>
                        <img src={staged.preview} alt={`Staged ${i + 1}`} className={styles.stagedThumb} />
                        {!batchUploading && (
                          <button
                            className={styles.stagedRemoveBtn}
                            onClick={() => removeStagedPhoto(i)}
                            aria-label="Remove"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {!batchUploading && (
                    <button
                      className={styles.photoCaptureBtnInline}
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <CameraIcon /> Take More
                    </button>
                  )}
                </div>
              )}

              {photos.length === 0 ? (
                <p className={styles.photoEmptyText}>No photos yet -- upload one above.</p>
              ) : (
                <div className={styles.photoGrid}>
                  {photos.map(p => {
                    const loaded = loadedPhotos[p.id];
                    return (
                      <div key={p.id} className={styles.photoCard}>
                        {loaded?.src ? (
                          <img
                            src={loaded.src}
                            alt={p.filename}
                            className={styles.photoThumb}
                            onClick={() => setLightbox({ id: p.id, src: loaded.src, filename: p.filename })}
                          />
                        ) : (
                          <div className={styles.photoThumbPlaceholder}>
                            {loaded?.loading !== false ? 'Loading...' : 'Error'}
                          </div>
                        )}
                        <div className={styles.photoMeta}>
                          <p className={styles.photoUploader}>{p.uploaded_by || 'Unknown'}</p>
                          {photoTags.length > 0 && (
                            <div className={styles.tagRow}>
                              {photoTags.map(tag => (
                                <button
                                  key={tag.name}
                                  type="button"
                                  className={p.tag === tag.name ? styles.tagPillActive : styles.tagPill}
                                  onClick={() => handleTagPhoto(p.id, tag.name)}
                                  title={tag.name}
                                >
                                  {tag.emoji} {tag.name}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className={styles.photoActions}>
                            {deleteConfirm === p.id ? (
                              <>
                                <button
                                  className={styles.photoDeleteConfirm}
                                  onClick={() => handlePhotoDelete(p.id)}
                                >
                                  Confirm
                                </button>
                              </>
                            ) : (
                              <button
                                className={styles.photoDeleteBtn}
                                onClick={() => {
                                  setDeleteConfirm(p.id);
                                  setTimeout(() => setDeleteConfirm(prev => prev === p.id ? null : prev), 3000);
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
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

            {/* Submit */}
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Saving...' : isEditMode ? 'Update Prescout' : 'Submit Prescout'}
            </button>
          </>
        )}
      </div>
      </div>{/* end pageLayout */}
    </div>
  );
}

/** Renders a single prescout form field based on its type */
function PrescoutField({ field, value, otherValue, onChange, onOtherChange }) {
  switch (field.type) {
    case 'singleSelect': {
      const isOtherSelected = value === '_other';
      return (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>{field.label}</p>
          {field.description && <p className={styles.fieldDesc}>{field.description}</p>}
          <div className={styles.selectTiles}>
            {field.options?.map((opt) => {
              const isSelected = !isOtherSelected && value !== undefined && value !== null && parseInt(value) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={isSelected ? styles.selectTileSelected : styles.selectTile}
                  onClick={() => onChange(isSelected ? null : opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
            {field.hasOther && (
              <button
                type="button"
                className={isOtherSelected ? styles.selectTileSelected : styles.selectTile}
                onClick={() => onChange(isOtherSelected ? null : '_other')}
              >
                Other
              </button>
            )}
          </div>
          {field.hasOther && isOtherSelected && (
            <input
              type="text"
              className={styles.otherInput}
              value={otherValue || ''}
              onChange={(e) => onOtherChange(e.target.value)}
              placeholder="Specify..."
              autoFocus
            />
          )}
        </div>
      );
    }

    case 'multiSelect': {
      // value is a comma-separated string of selected labels, or an array
      const selected = Array.isArray(value) ? value : (value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []);
      const toggle = (label) => {
        const next = selected.includes(label)
          ? selected.filter(s => s !== label)
          : [...selected, label];
        onChange(next.length > 0 ? next : null);
      };
      return (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>{field.label}</p>
          {field.description && <p className={styles.fieldDesc}>{field.description}</p>}
          <div className={styles.selectTiles}>
            {field.options?.map((opt) => {
              const isSelected = selected.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  className={isSelected ? styles.selectTileSelected : styles.selectTile}
                  onClick={() => toggle(opt.label)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case 'comment': {
      const maxLen = field.maxLength || 500;
      const warnAt = Math.floor(maxLen * 0.8);
      return (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>{field.label}</p>
          {field.description && <p className={styles.fieldDesc}>{field.description}</p>}
          <textarea
            className={styles.commentTextarea}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLen}
            placeholder="Type here..."
          />
          {(value?.length || 0) > warnAt && (
            <p className={styles.charCount}>{value?.length || 0}/{maxLen}</p>
          )}
        </div>
      );
    }

    case 'starRating':
      return (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldLabel}>{field.label}</p>
          {field.description && <p className={styles.fieldDesc}>{field.description}</p>}
          <div className={styles.starRow}>
            {Array.from({ length: field.max || 6 }, (_, i) => {
              const rating = i + 1;
              const isFilled = value && parseInt(value) >= rating;
              return (
                <button
                  key={rating}
                  type="button"
                  className={isFilled ? styles.starFilled : styles.star}
                  onClick={() => onChange(parseInt(value) === rating ? null : rating)}
                  aria-label={`${rating} star${rating !== 1 ? 's' : ''}`}
                >
                  &#9733;
                </button>
              );
            })}
            {value && (
              <span className={styles.starLabel}>{value}/{field.max || 6}</span>
            )}
          </div>
        </div>
      );

    default:
      return null;
  }
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
