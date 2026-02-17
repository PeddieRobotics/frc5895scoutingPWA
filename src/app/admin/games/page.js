'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './games.module.css';

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

export default function GamesPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const fileInputRef = useRef(null);
  const router = useRouter();

  // Fetch games on mount
  useEffect(() => {
    fetchGames();
  }, []);

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
        router.push('/admin');
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

      // Use POST with a validate action
      const response = await fetch('/api/admin/games', {
        method: 'OPTIONS',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configJson: config }),
        credentials: 'include',
      });

      const data = await response.json();
      setValidationResult(data);

      if (data.valid) {
        setSuccess('Configuration is valid!');
        // Auto-fill game name and display name from config if empty
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
        headers: {
          'Content-Type': 'application/json',
        },
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
    if (!confirm(`Activate "${gameName}" as the current game? This will deactivate any other active game.`)) {
      return;
    }

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
    const confirmMsg = hasData
      ? `Delete "${gameName}"? This game has scouting data. Do you also want to delete all the data?`
      : `Delete "${gameName}"?`;

    if (!confirm(confirmMsg)) {
      return;
    }

    let dropTable = false;
    if (hasData) {
      dropTable = confirm('Click OK to also delete all scouting data, or Cancel to keep the data table.');
    }

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
        // Validate it's valid JSON
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

    // Reset file input
    e.target.value = '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeGame = games.find(g => g.is_active);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.push('/admin')} className={styles.backButton}>
          <BackIcon /> Back to Admin
        </button>
        <h1 className={styles.title}>
          <GameIcon /> Game Management
        </h1>
        <button onClick={fetchGames} className={styles.refreshButton} disabled={loading}>
          <RefreshIcon /> Refresh
        </button>
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
            <PlusIcon /> Create New Game
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Game Form */}
      {showCreateForm && (
        <div className={styles.card}>
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
