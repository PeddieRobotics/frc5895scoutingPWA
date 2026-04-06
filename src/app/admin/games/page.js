'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './games.module.css';
import { compressImage } from '../../../lib/compressImage';

// Icon components
const GameIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export default function GamesPage() {
  // Auth state
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');

  // Data state
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New game form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGame, setNewGame] = useState({
    gameName: '',
    displayName: '',
    configJson: '',
  });
  const [validationResult, setValidationResult] = useState(null);
  const [isValidating, setIsValidating] = useState(false);

  // Custom confirm modal state
  const [modal, setModal] = useState(null);

  // Field image upload state: { [gameId_tag]: 'uploaded' | 'missing' | 'uploading' | 'error' }
  const [imageUploadStatus, setImageUploadStatus] = useState({});

  const fileInputRef = useRef(null);
  const createFormRef = useRef(null);
  const router = useRouter();

  // Check admin auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Scroll to create form when shown
  useEffect(() => {
    if (showCreateForm && createFormRef.current) {
      setTimeout(() => {
        createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [showCreateForm]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/validate', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Auth-Check': 'true',
        },
        credentials: 'include',
      });
      if (response.ok) {
        setAuthenticated(true);
        fetchGames();
      } else {
        setAuthenticated(false);
      }
    } catch (err) {
      setAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sudoPassword: adminPassword }),
      });
      if (response.ok) {
        setAuthenticated(true);
        setAdminPassword('');
        fetchGames();
      } else {
        const data = await response.json();
        setError(data.message || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setAdminPassword('');
    }
  };

  // --- Custom modal helpers ---
  const hideModal = () => setModal(null);

  const showConfirm = (message) =>
    new Promise((resolve) => {
      setModal({
        message,
        actions: [
          { label: 'Cancel', className: styles.modalCancelButton, callback: () => { hideModal(); resolve(false); } },
          { label: 'Confirm', className: styles.modalConfirmButton, callback: () => { hideModal(); resolve(true); } },
        ],
      });
    });

  const showDeleteConfirm = (gameName, hasData) =>
    new Promise((resolve) => {
      const message = hasData
        ? `Delete "${gameName}"? This game has scouting data. You can delete just the config, or the config and all scouting data.`
        : `Delete "${gameName}"?`;
      const actions = hasData
        ? [
            { label: 'Cancel', className: styles.modalCancelButton, callback: () => { hideModal(); resolve(null); } },
            { label: 'Delete Config Only', className: styles.modalConfirmButton, callback: () => { hideModal(); resolve(false); } },
            { label: 'Delete With All Data', className: styles.modalDangerButton, callback: () => { hideModal(); resolve(true); } },
          ]
        : [
            { label: 'Cancel', className: styles.modalCancelButton, callback: () => { hideModal(); resolve(null); } },
            { label: 'Delete', className: styles.modalDangerButton, callback: () => { hideModal(); resolve(false); } },
          ];
      setModal({ message, actions });
    });
  // ----------------------------

  const fetchGames = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/games', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setGames(data.games || []);
      } else if (response.status === 401) {
        setAuthenticated(false);
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to fetch games');
      }
    } catch (err) {
      setError('Network error loading games');
      console.error('Fetch games error:', err);
    } finally {
      setLoading(false);
    }
  };

  // --- Field image helpers ---
  function extractImageTags(configJson) {
    const tags = [];
    const seen = new Set();
    function walk(field) {
      if (!field) return;
      if (field.type === 'imageSelect' && field.imageTag && !seen.has(field.imageTag)) {
        seen.add(field.imageTag);
        tags.push({ tag: field.imageTag, fieldLabel: field.label || field.name || field.imageTag });
      }
      if (field.type === 'collapsible') {
        if (field.trigger) walk(field.trigger);
        if (Array.isArray(field.content)) field.content.forEach(walk);
      }
      if (field.type === 'table' && Array.isArray(field.rows)) {
        field.rows.forEach(r => { if (Array.isArray(r.fields)) r.fields.forEach(walk); });
      }
    }
    if (configJson?.basics?.fields) configJson.basics.fields.forEach(walk);
    if (configJson?.sections) configJson.sections.forEach(s => { if (s?.fields) s.fields.forEach(walk); });
    return tags;
  }

  async function fetchImageStatuses(gameId) {
    try {
      const res = await fetch(`/api/admin/field-images?gameId=${gameId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const uploaded = new Set((data.images || []).map(i => i.image_tag));
        return uploaded;
      }
    } catch { /* ignore */ }
    return new Set();
  }

  async function refreshImageStatuses(gamesList) {
    const statusUpdates = {};
    for (const game of gamesList) {
      const cfg = game.config_json || {};
      const tags = extractImageTags(cfg);
      if (tags.length === 0) continue;
      const uploaded = await fetchImageStatuses(game.id);
      tags.forEach(({ tag }) => {
        statusUpdates[`${game.id}_${tag}`] = uploaded.has(tag) ? 'uploaded' : 'missing';
      });
    }
    setImageUploadStatus(prev => ({ ...prev, ...statusUpdates }));
  }

  // Refresh image statuses whenever games list updates
  useEffect(() => {
    if (games.length > 0) {
      refreshImageStatuses(games);
    }
  }, [games]);

  async function handleFieldImageUpload(gameId, imageTag, event) {
    let file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return;
    }

    const key = `${gameId}_${imageTag}`;
    setImageUploadStatus(prev => ({ ...prev, [key]: 'uploading' }));

    try {
      file = await compressImage(file, 5 * 1024 * 1024);
      if (file.size > 5 * 1024 * 1024) {
        setError('Image still exceeds 5 MB after compression');
        setImageUploadStatus(prev => ({ ...prev, [key]: 'error' }));
        return;
      }
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/admin/field-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ gameId, imageTag, imageData: base64, mimeType: file.type }),
      });

      if (res.ok) {
        setImageUploadStatus(prev => ({ ...prev, [key]: 'uploaded' }));
        setSuccess(`Image "${imageTag}" uploaded successfully`);
        // Clear sessionStorage cache so form/display components fetch the new image
        sessionStorage.removeItem(`fieldimage_${gameId}_${imageTag}`);
      } else {
        const data = await res.json();
        setImageUploadStatus(prev => ({ ...prev, [key]: 'error' }));
        setError(data.message || 'Failed to upload image');
      }
    } catch (err) {
      setImageUploadStatus(prev => ({ ...prev, [key]: 'error' }));
      setError('Network error uploading image');
    }

    // Reset file input
    event.target.value = '';
  }
  // ----------------------------

  const validateConfig = async () => {
    if (!newGame.configJson.trim()) {
      setError('Please enter a JSON configuration');
      return;
    }

    setIsValidating(true);
    setError('');
    setValidationResult(null);

    try {
      let config;
      try {
        config = JSON.parse(newGame.configJson);
      } catch (e) {
        setError(`Invalid JSON: ${e.message}`);
        setIsValidating(false);
        return;
      }

      const response = await fetch('/api/admin/games', {
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: config }),
        credentials: 'include',
      });

      const data = await response.json();
      setValidationResult(data);

      if (data.valid) {
        setSuccess('Configuration is valid!');
        if (!newGame.gameName && config.gameName) {
          setNewGame(prev => ({ ...prev, gameName: config.gameName }));
        }
        if (!newGame.displayName && config.displayName) {
          setNewGame(prev => ({ ...prev, displayName: config.displayName }));
        }
      } else {
        setError('Configuration has errors. Please fix them before creating.');
      }
    } catch (err) {
      setError('Failed to validate configuration');
      console.error('Validation error:', err);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateGame = async (e) => {
    e.preventDefault();

    if (!newGame.gameName || !newGame.displayName || !newGame.configJson) {
      setError('All fields are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let config;
      try {
        config = JSON.parse(newGame.configJson);
      } catch (e) {
        setError(`Invalid JSON: ${e.message}`);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: newGame.gameName,
          displayName: newGame.displayName,
          configJson: config,
        }),
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Game "${data.game.displayName}" created successfully!`);
        setNewGame({ gameName: '', displayName: '', configJson: '' });
        setValidationResult(null);
        setShowCreateForm(false);
        fetchGames();
      } else {
        const detailedMessage = data?.error
          ? `${data.message || 'Failed to create game'}: ${data.error}`
          : (data?.message || 'Failed to create game');
        setError(detailedMessage);
        if (data.errors) {
          setValidationResult({ valid: false, errors: data.errors, warnings: data.warnings || [] });
        }
      }
    } catch (err) {
      setError('Network error creating game');
      console.error('Create game error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateGame = async (gameId, gameName) => {
    const confirmed = await showConfirm(
      `Activate "${gameName}" as the current game? This will deactivate any other active game.`
    );
    if (!confirmed) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/games/${gameId}/activate`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`"${data.activeGame.displayName}" is now the active game!`);
        fetchGames();
      } else {
        setError(data.message || 'Failed to activate game');
      }
    } catch (err) {
      setError('Network error activating game');
      console.error('Activate game error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGame = async (gameId, gameName, hasData) => {
    const dropTable = await showDeleteConfirm(gameName, hasData);
    if (dropTable === null) return; // cancelled

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/games/${gameId}?dropTable=${dropTable}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Game "${gameName}" deleted${dropTable ? ' along with its data' : ''}.`);
        fetchGames();
      } else {
        setError(data.message || 'Failed to delete game');
      }
    } catch (err) {
      setError('Network error deleting game');
      console.error('Delete game error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        JSON.parse(event.target.result);
        setNewGame(prev => ({ ...prev, configJson: event.target.result }));
        setError('');
        setSuccess('JSON file loaded successfully!');
      } catch (err) {
        setError(`Invalid JSON file: ${err.message}`);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeGame = games.find(g => g.is_active);

  // --- Auth loading screen ---
  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Verifying authentication...</div>
      </div>
    );
  }

  // --- Admin login form ---
  if (!authenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button onClick={() => router.push('/admin')} className={styles.backButton}>
            <BackIcon /> Back to Admin
          </button>
          <h1 className={styles.title}>
            <GameIcon /> Game Management
          </h1>
          <div />
        </div>

        <div className={styles.card} style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className={styles.cardHeader}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, color: '#bd9748' }}>
              <LockIcon /> Admin Authentication Required
            </h2>
          </div>
          {error && <div className={styles.errorBanner}>{error}</div>}
          <form onSubmit={handleAdminAuth} className={styles.createForm}>
            <div className={styles.formGroup}>
              <label htmlFor="adminPassword">Admin Password</label>
              <input
                type="password"
                id="adminPassword"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className={styles.input}
                placeholder="Enter administrator password"
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || !adminPassword}
              >
                {loading ? 'Verifying...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --- Main page ---
  return (
    <div className={styles.container}>
      {/* Custom confirmation modal */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <p className={styles.modalMessage}>{modal.message}</p>
            <div className={styles.modalActions}>
              {modal.actions.map((action, i) => (
                <button key={i} className={action.className} onClick={action.callback}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <button onClick={() => router.push('/admin')} className={styles.backButton}>
          <BackIcon /> Back to Admin
        </button>
        <h1 className={styles.title}>
          <GameIcon /> Game Management
        </h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => router.push('/admin/prescout')} className={styles.refreshButton} title="Manage prescout data">
            Prescout
          </button>
          <button onClick={fetchGames} className={styles.refreshButton} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {success && <div className={styles.successBanner}>{success}</div>}

      {/* Active Game Display */}
      <div className={styles.activeGameCard}>
        <h2>Current Active Game</h2>
        {activeGame ? (
          <div className={styles.activeGameInfo}>
            <span className={styles.activeGameName}>{activeGame.display_name}</span>
            <span className={styles.activeGameMeta}>
              Table: {activeGame.table_name} | Records: {activeGame.dataCount || 0}
            </span>
          </div>
        ) : (
          <p className={styles.noActiveGame}>No game is currently active. Activate a game below.</p>
        )}
      </div>

      {/* Games List */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>Available Games</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={styles.createButton}
          >
            <PlusIcon /> {showCreateForm ? 'Cancel' : 'Create New Game'}
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading games...</div>
        ) : games.length === 0 ? (
          <div className={styles.emptyState}>
            No games configured yet. Create your first game to get started!
          </div>
        ) : (
          <div className={styles.gamesList}>
            {games.map((game) => (
              <div
                key={game.id}
                className={`${styles.gameItem} ${game.is_active ? styles.activeItem : ''}`}
              >
                <div className={styles.gameInfo}>
                  <div className={styles.gameName}>
                    {game.is_active && <CheckIcon />}
                    {game.display_name}
                    {game.is_active && <span className={styles.activeBadge}>Active</span>}
                  </div>
                  <div className={styles.gameMeta}>
                    <span>Table: {game.table_name}</span>
                    <span>Records: {game.dataCount || 0}</span>
                    {game.tba_event_code && <span>TBA: {game.tba_event_code}</span>}
                    <span>Created: {formatDate(game.created_at)}</span>
                    {game.created_by && <span>By: {game.created_by}</span>}
                  </div>
                </div>
                <div className={styles.gameActions}>
                  {!game.is_active && (
                    <button
                      onClick={() => handleActivateGame(game.id, game.display_name)}
                      className={styles.activateButton}
                      disabled={loading}
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/admin/games/${game.id}`)}
                    className={styles.editButton}
                    disabled={loading}
                  >
                    <EditIcon /> View
                  </button>
                  {!game.is_active && (
                    <button
                      onClick={() => handleDeleteGame(game.id, game.display_name, game.dataCount > 0)}
                      className={styles.deleteButton}
                      disabled={loading}
                    >
                      <TrashIcon /> Delete
                    </button>
                  )}
                </div>
                {/* Field image upload section */}
                {extractImageTags(game.config_json || {}).length > 0 && (
                  <div className={styles.imageAssetsSection}>
                    <div className={styles.imageAssetsTitle}>Image Assets</div>
                    {extractImageTags(game.config_json || {}).map(({ tag, fieldLabel }) => {
                      const key = `${game.id}_${tag}`;
                      const status = imageUploadStatus[key] || 'missing';
                      return (
                        <div key={tag} className={styles.imageUploadRow}>
                          <div className={styles.imageUploadInfo}>
                            <span className={styles.imageTagName}>{tag}</span>
                            <span className={styles.imageFieldLabel}>for {fieldLabel}</span>
                          </div>
                          <div className={styles.imageUploadControls}>
                            <label className={styles.imageUploadButton}>
                              <UploadIcon /> {status === 'uploaded' ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFieldImageUpload(game.id, tag, e)}
                              />
                            </label>
                            <span className={`${styles.imageStatus} ${styles[`imageStatus_${status}`]}`}>
                              {status === 'uploaded' ? 'Uploaded' : status === 'uploading' ? 'Uploading...' : status === 'error' ? 'Error' : 'Missing'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Game Form */}
      {showCreateForm && (
        <div className={styles.card} ref={createFormRef}>
          <div className={styles.cardHeader}>
            <h2>Create New Game</h2>
            <button onClick={() => setShowCreateForm(false)} className={styles.closeButton}>
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateGame} className={styles.createForm}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="gameName">Game Name (ID)</label>
                <input
                  type="text"
                  id="gameName"
                  value={newGame.gameName}
                  onChange={(e) => setNewGame({ ...newGame, gameName: e.target.value })}
                  placeholder="e.g., reefscape_2025"
                  className={styles.input}
                />
                <small>Used for table naming. Letters, numbers, underscores only.</small>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="displayName">Display Name</label>
                <input
                  type="text"
                  id="displayName"
                  value={newGame.displayName}
                  onChange={(e) => setNewGame({ ...newGame, displayName: e.target.value })}
                  placeholder="e.g., REEFSCAPE 2025"
                  className={styles.input}
                />
                <small>Shown in the UI.</small>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="configJson">JSON Configuration</label>
              <div className={styles.uploadRow}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.uploadButton}
                >
                  <UploadIcon /> Upload JSON File
                </button>
                <span className={styles.orText}>or paste below</span>
              </div>
              <textarea
                id="configJson"
                value={newGame.configJson}
                onChange={(e) => setNewGame({ ...newGame, configJson: e.target.value })}
                placeholder='{"gameName": "...", "displayName": "...", "sections": [...]}'
                className={styles.textarea}
                rows={15}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={validateConfig}
                className={styles.validateButton}
                disabled={isValidating || !newGame.configJson}
              >
                {isValidating ? 'Validating...' : 'Validate Config'}
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || !newGame.gameName || !newGame.displayName || !newGame.configJson}
              >
                {loading ? 'Creating...' : 'Create Game & Table'}
              </button>
            </div>
          </form>

          {/* Validation Results */}
          {validationResult && (
            <div className={styles.validationResult}>
              <h3>Validation {validationResult.valid ? 'Passed' : 'Failed'}</h3>

              {validationResult.errors?.length > 0 && (
                <div className={styles.validationErrors}>
                  <h4>Errors</h4>
                  <ul>
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>
                        {err.path && <code>{err.path}:</code>} {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.warnings?.length > 0 && (
                <div className={styles.validationWarnings}>
                  <h4>Warnings</h4>
                  <ul>
                    {validationResult.warnings.map((warn, i) => (
                      <li key={i}>
                        {warn.path && <code>{warn.path}:</code>} {warn.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.fieldsToCreate?.length > 0 && (
                <div className={styles.fieldsPreview}>
                  <h4>Columns to be Created ({validationResult.fieldsToCreate.length})</h4>
                  <div className={styles.fieldsGrid}>
                    {validationResult.fieldsToCreate.map((field, i) => (
                      <div key={i} className={styles.fieldItem}>
                        <span className={styles.fieldName}>{field.name}</span>
                        <span className={styles.fieldType}>{field.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationResult.scoutLeadsFieldsToCreate?.length > 0 && (
                <div className={styles.fieldsPreview}>
                  <h4>
                    Scout Leads Rate Columns ({validationResult.scoutLeadsFieldsToCreate.length})
                    {validationResult.scoutLeadsTableName && (
                      <> in <code>{validationResult.scoutLeadsTableName}</code></>
                    )}
                  </h4>
                  <div className={styles.fieldsGrid}>
                    {validationResult.scoutLeadsFieldsToCreate.map((field, i) => (
                      <div key={i} className={styles.fieldItem}>
                        <span className={styles.fieldName}>{field.name}</span>
                        <span className={styles.fieldType}>{field.type}</span>
                        <span className={styles.fieldType}>{field.rateLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
