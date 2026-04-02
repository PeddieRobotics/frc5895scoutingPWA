'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import styles from './game-detail.module.css';

const SYSTEM_COLUMNS = new Set([
  'id', 'scoutname', 'scoutteam', 'team', 'match', 'matchtype', 'noshow', 'timestamp',
]);

// Compute diff using the authoritative fieldsToCreate list from the OPTIONS endpoint
function computeSchemaDiff(fieldsToCreate, dbColumns) {
  const configFieldNames = new Set(
    fieldsToCreate
      .map(f => f.name.toLowerCase())
      .filter(n => !SYSTEM_COLUMNS.has(n))
  );

  const dbUserCols = dbColumns.filter(c => !SYSTEM_COLUMNS.has(c.column_name));

  const added = [...configFieldNames].filter(n => !dbUserCols.some(c => c.column_name === n));
  const deprecated = dbUserCols.filter(c => !configFieldNames.has(c.column_name));
  const unchanged = dbUserCols.filter(c => configFieldNames.has(c.column_name));

  return { added, deprecated, unchanged };
}

async function callValidate(configJson) {
  const res = await fetch('/api/admin/games', {
    method: 'OPTIONS',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ configJson }),
  });
  return res.json();
}

export default function GameDetailPage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.id;

  const [game, setGame] = useState(null);
  const [dbColumns, setDbColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const [displayName, setDisplayName] = useState('');
  const [tbaEventCode, setTbaEventCode] = useState('');
  const [originalTbaEventCode, setOriginalTbaEventCode] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [originalJson, setOriginalJson] = useState('');
  const [originalDisplayName, setOriginalDisplayName] = useState('');

  const [jsonParseError, setJsonParseError] = useState(null);
  const [parsedConfig, setParsedConfig] = useState(null);
  const [schemaDiff, setSchemaDiff] = useState(null);

  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const validationTimer = useRef(null);
  const fileInputRef = useRef(null);
  const dbColumnsRef = useRef([]);

  // Fetch game + immediately validate to get initial schema diff
  useEffect(() => {
    async function fetchGame() {
      try {
        const res = await fetch(`/api/admin/games/${gameId}`);
        if (res.status === 401) { router.push('/admin'); return; }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setPageError(data.message || 'Failed to load game');
          setLoading(false);
          return;
        }
        const data = await res.json();
        const g = data.game;
        setGame(g);
        setDbColumns(g.columns);
        dbColumnsRef.current = g.columns;

        const formatted = JSON.stringify(g.config, null, 2);
        setJsonText(formatted);
        setOriginalJson(formatted);
        setDisplayName(g.displayName);
        setOriginalDisplayName(g.displayName);
        setTbaEventCode(g.tbaEventCode || '');
        setOriginalTbaEventCode(g.tbaEventCode || '');
        setParsedConfig(g.config);

        // Validate immediately so schema diff is populated on first render
        setValidating(true);
        const result = await callValidate(g.config);
        setValidation(result);
        if (result.fieldsToCreate) {
          setSchemaDiff(computeSchemaDiff(result.fieldsToCreate, g.columns));
        }
        setValidating(false);
      } catch (err) {
        setPageError('Failed to load game: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchGame();
  }, [gameId, router]);

  const handleJsonChange = useCallback((e) => {
    const text = e.target.value;
    setJsonText(text);
    setSaveMessage(null);

    try {
      const parsed = JSON.parse(text);
      setJsonParseError(null);
      setParsedConfig(parsed);

      if (validationTimer.current) clearTimeout(validationTimer.current);
      setValidating(true);
      validationTimer.current = setTimeout(async () => {
        try {
          const result = await callValidate(parsed);
          setValidation(result);
          if (result.fieldsToCreate) {
            setSchemaDiff(computeSchemaDiff(result.fieldsToCreate, dbColumnsRef.current));
          }
        } catch {
          setValidation(null);
          setSchemaDiff(null);
        } finally {
          setValidating(false);
        }
      }, 500);
    } catch (err) {
      setJsonParseError(err.message);
      setParsedConfig(null);
      setSchemaDiff(null);
      setValidation(null);
      setValidating(false);
      if (validationTimer.current) clearTimeout(validationTimer.current);
    }
  }, []);

  const handleDisplayNameChange = useCallback((e) => {
    setDisplayName(e.target.value);
    setSaveMessage(null);
  }, []);

  const handleFormat = useCallback(() => {
    if (!parsedConfig) return;
    setJsonText(JSON.stringify(parsedConfig, null, 2));
  }, [parsedConfig]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleJsonChange({ target: { value: ev.target.result } });
    reader.readAsText(file);
    e.target.value = '';
  }, [handleJsonChange]);

  const tbaEventCodeError = tbaEventCode && !/^\d{4}[a-z0-9]+$/i.test(tbaEventCode)
    ? 'Must be a valid TBA event code (e.g. 2026rebu)'
    : null;

  const hasChanges = jsonText !== originalJson || displayName !== originalDisplayName || tbaEventCode !== originalTbaEventCode;

  const canSave =
    hasChanges &&
    !jsonParseError &&
    !tbaEventCodeError &&
    parsedConfig !== null &&
    validation?.valid !== false &&
    !validating &&
    !saving;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/admin/games/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName !== originalDisplayName ? displayName : undefined,
          configJson: jsonText !== originalJson ? parsedConfig : undefined,
          tbaEventCode: tbaEventCode !== originalTbaEventCode ? tbaEventCode : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveMessage({ type: 'error', text: data.message || 'Save failed', errors: data.errors });
        return;
      }

      // Refresh columns and recompute diff
      const refreshRes = await fetch(`/api/admin/games/${gameId}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const g = refreshData.game;
        setGame(g);
        setDbColumns(g.columns);
        dbColumnsRef.current = g.columns;
        const formatted = JSON.stringify(g.config, null, 2);
        setOriginalJson(formatted);
        setOriginalDisplayName(g.displayName);
        setOriginalTbaEventCode(g.tbaEventCode || '');
        if (validation?.fieldsToCreate) {
          setSchemaDiff(computeSchemaDiff(validation.fieldsToCreate, g.columns));
        }
      }

      setSaveMessage({
        type: 'success',
        text: 'Saved successfully.',
        columnsAdded: data.columnsAdded,
      });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Save failed: ' + err.message });
    } finally {
      setSaving(false);
    }
  }, [canSave, gameId, displayName, originalDisplayName, tbaEventCode, originalTbaEventCode, jsonText, originalJson, parsedConfig, validation]);

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>Loading...</div></div>;
  }

  if (pageError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBanner}>{pageError}</div>
        <button className={styles.backButton} onClick={() => router.push('/admin/games')}>← Back to Games</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backButton} onClick={() => router.push('/admin/games')}>← Games</button>
          <h1 className={styles.title}>
            {game.displayName}
            {game.isActive && <span className={styles.activeBadge}>ACTIVE</span>}
          </h1>
        </div>
      </div>

      <div className={styles.metaRow}>
        <span>Game: <code>{game.gameName}</code></span>
        <span>Table: <code>{game.tableName}</code></span>
        <span>{game.dataCount} row{game.dataCount !== 1 ? 's' : ''}</span>
      </div>

      {saveMessage?.type === 'success' && (
        <div className={styles.successBanner}>
          {saveMessage.text}
          {saveMessage.columnsAdded?.length > 0 && (
            <> Added columns: <strong>{saveMessage.columnsAdded.join(', ')}</strong></>
          )}
        </div>
      )}
      {saveMessage?.type === 'error' && (
        <div className={styles.errorBanner}>
          {saveMessage.text}
          {saveMessage.errors?.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
              {saveMessage.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className={styles.displayNameRow}>
        <label htmlFor="displayName">Display Name:</label>
        <input
          id="displayName"
          className={styles.input}
          value={displayName}
          onChange={handleDisplayNameChange}
        />
      </div>

      <div className={styles.displayNameRow}>
        <label htmlFor="tbaEventCode">TBA Event Code:</label>
        <input
          id="tbaEventCode"
          className={styles.input}
          value={tbaEventCode}
          onChange={(e) => { setTbaEventCode(e.target.value); setSaveMessage(null); }}
          placeholder="e.g. 2026rebu"
          style={tbaEventCodeError ? { borderColor: '#e05252' } : undefined}
        />
        {tbaEventCodeError && <span style={{ color: '#e05252', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{tbaEventCodeError}</span>}
      </div>

      <div className={styles.editorLayout}>
        <div className={styles.editorPanel}>
          <div className={styles.editorToolbar}>
            <span className={styles.editorLabel}>Config JSON</span>
            <input type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className={styles.uploadButton} onClick={() => fileInputRef.current?.click()}>Upload JSON</button>
            <button className={styles.formatButton} onClick={handleFormat} disabled={!parsedConfig}>Format</button>
          </div>

          <textarea
            className={`${styles.textarea} ${jsonParseError ? styles.hasError : ''}`}
            value={jsonText}
            onChange={handleJsonChange}
            spellCheck={false}
          />

          {jsonParseError && (
            <div className={styles.jsonParseError}>JSON error: {jsonParseError}</div>
          )}

          <div className={styles.actionsBar}>
            <button className={styles.saveButton} onClick={handleSave} disabled={!canSave}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {!hasChanges && <span className={styles.saveHint}>No changes</span>}
            {hasChanges && jsonParseError && <span className={styles.saveHint}>Fix JSON errors to save</span>}
            {hasChanges && !jsonParseError && validation?.valid === false && <span className={styles.saveHint}>Fix validation errors to save</span>}
            {hasChanges && !jsonParseError && validating && <span className={styles.saveHint}>Validating...</span>}
          </div>
        </div>

        <div className={styles.rightPanel}>
          <SchemaDiffPanel diff={schemaDiff} validating={validating} />
          <ValidationPanel validation={validation} validating={validating} jsonParseError={jsonParseError} />
        </div>
      </div>
    </div>
  );
}

function SchemaDiffPanel({ diff, validating }) {
  return (
    <div className={styles.schemaDiff}>
      <h3>Table Schema</h3>
      {validating && !diff && <p className={styles.noDiff}>Loading...</p>}
      {!validating && !diff && <p className={styles.noDiff}>Fix JSON errors to see schema</p>}
      {diff && (
        <>
          {diff.added.length > 0 && (
            <div className={styles.diffSection}>
              <div className={`${styles.diffSectionTitle} ${styles.added}`}>
                + New ({diff.added.length}) — will be added to table
              </div>
              <div className={styles.diffItems}>
                {diff.added.map(name => (
                  <div key={name} className={`${styles.diffItem} ${styles.added}`}>{name}</div>
                ))}
              </div>
            </div>
          )}

          {diff.deprecated.length > 0 && (
            <div className={styles.diffSection}>
              <div className={`${styles.diffSectionTitle} ${styles.deprecated}`}>
                ⚠ Removed from form ({diff.deprecated.length})
              </div>
              <div className={styles.diffItems}>
                {diff.deprecated.map(col => (
                  <div key={col.column_name} className={`${styles.diffItem} ${styles.deprecated}`}>
                    <span>{col.column_name}</span>
                    <span className={styles.diffItemType}>{col.data_type}</span>
                  </div>
                ))}
              </div>
              <div className={styles.deprecatedNote}>
                Column data preserved in DB. Not collected on the form and cannot be referenced in display config.
                Re-add to JSON to collect again.
              </div>
            </div>
          )}

          {diff.unchanged.length > 0 && (
            <div className={styles.diffSection}>
              <div className={`${styles.diffSectionTitle} ${styles.unchanged}`}>
                Remain ({diff.unchanged.length})
              </div>
              <div className={styles.diffItems}>
                {diff.unchanged.map(col => (
                  <div key={col.column_name} className={`${styles.diffItem} ${styles.unchanged}`}>
                    <span>{col.column_name}</span>
                    <span className={styles.diffItemType}>{col.data_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.added.length === 0 && diff.deprecated.length === 0 && diff.unchanged.length === 0 && (
            <p className={styles.noDiff}>No user-defined fields found</p>
          )}
        </>
      )}
    </div>
  );
}

function ValidationPanel({ validation, validating, jsonParseError }) {
  return (
    <div className={styles.validationPanel}>
      <h3>
        Validation
        {!jsonParseError && !validating && validation?.valid === true && (
          <span className={styles.validBadge}>Valid</span>
        )}
        {!jsonParseError && !validating && validation?.valid === false && (
          <span className={styles.invalidBadge}>Invalid</span>
        )}
      </h3>

      {jsonParseError && <div className={styles.validating}>Fix JSON syntax errors first</div>}
      {!jsonParseError && validating && <div className={styles.validating}>Validating...</div>}
      {!jsonParseError && !validating && !validation && <div className={styles.validating}>Start editing to validate</div>}

      {!jsonParseError && !validating && validation && (
        <>
          {validation.errors?.length > 0 && (
            <ul className={styles.errorList}>
              {validation.errors.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message}</li>)}
            </ul>
          )}
          {validation.warnings?.length > 0 && (
            <>
              <div className={styles.warningsLabel}>Warnings</div>
              <ul className={styles.warningList}>
                {validation.warnings.map((w, i) => <li key={i}>{typeof w === 'string' ? w : w.message}</li>)}
              </ul>
            </>
          )}
          {validation.valid && !validation.errors?.length && !validation.warnings?.length && (
            <div className={styles.validating}>No issues found</div>
          )}
        </>
      )}
    </div>
  );
}
