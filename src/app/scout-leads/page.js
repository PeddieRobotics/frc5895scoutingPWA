"use client";

import { useEffect, useMemo, useState } from "react";
import useGameConfig from "../../lib/useGameConfig";
import { extractTimerFieldsFromConfig, extractConfidenceRatingField } from "../../lib/schema-generator";
import styles from "./page.module.css";

function getAuthHeaders() {
  if (typeof window === "undefined") return {};
  const credentials = sessionStorage.getItem("auth_credentials") || localStorage.getItem("auth_credentials");
  if (!credentials) return {};
  return { Authorization: `Basic ${credentials}` };
}

/**
 * Build an ordered list of display items from timerSummary.
 * Items without a group render individually; items with the same group are
 * collapsed into a single grouped entry. Order follows first appearance.
 */
function buildDisplayItems(timerSummary) {
  const groupMap = {};
  const seen = new Set();
  const result = [];

  timerSummary.forEach((timer) => {
    if (timer.group) {
      if (!groupMap[timer.group]) {
        groupMap[timer.group] = {
          type: "group",
          groupKey: timer.group,
          groupLabel: timer.groupLabel || timer.group,
          fields: [],
        };
      }
      groupMap[timer.group].fields.push(timer);
      if (!seen.has(timer.group)) {
        seen.add(timer.group);
        result.push(groupMap[timer.group]);
      }
    } else {
      result.push({ type: "individual", timer });
    }
  });

  return result;
}

/**
 * Compute a soft hsl background color from a confidence average.
 * value=1 → red (hue 0), value=6 → green (hue 120).
 */
function getConfidenceColor(value) {
  if (!value || value <= 1) return "#ffffff";
  const ratio = Math.min(1, Math.max(0, (value - 1) / 5)); // 1–6 scale → 0–1
  const hue = Math.round(ratio * 120);
  return `hsl(${hue}, 65%, 93%)`;
}

/**
 * Render a single config field value — read-only or editable.
 * For multiSelect, fieldDef.options is an array of { name, label }.
 */
function renderEntryField(fieldDef, entry, editing, editValues, onChange) {
  const { type, name, options = [] } = fieldDef;
  const value = editing ? (editValues[name] !== undefined ? editValues[name] : entry[name]) : entry[name];

  if (type === "checkbox") {
    if (!editing) return <span>{value ? "✓" : "✗"}</span>;
    return (
      <input
        type="checkbox"
        checked={!!editValues[name]}
        onChange={(e) => onChange(name, e.target.checked)}
      />
    );
  }

  if (type === "counter" || type === "number") {
    if (!editing) return <span>{value ?? "—"}</span>;
    return (
      <input
        type="number"
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? null : Number(e.target.value))}
        className={styles.entryInput}
      />
    );
  }

  if (type === "holdTimer") {
    if (!editing) return <span>{value != null ? `${Number(value).toFixed(3)}s` : "—"}</span>;
    return (
      <input
        type="number"
        step="0.001"
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? null : Number(e.target.value))}
        className={styles.entryInput}
      />
    );
  }

  if (type === "text") {
    if (!editing) return <span>{value ?? "—"}</span>;
    return (
      <input
        type="text"
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className={styles.entryInput}
      />
    );
  }

  if (type === "comment") {
    if (!editing) {
      return (
        <span style={{ whiteSpace: "pre-wrap" }}>
          {value ?? "—"}
        </span>
      );
    }
    return (
      <textarea
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        className={styles.entryInput}
        rows={3}
      />
    );
  }

  if (type === "singleSelect") {
    if (!editing) {
      const match = options.find((o) => String(o.value) === String(value));
      return <span>{match ? match.label : (value ?? "—")}</span>;
    }
    return (
      <select
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? null : Number(e.target.value))}
        className={styles.entryInput}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (type === "multiSelect") {
    // Each option is stored as its own boolean column
    if (!editing) {
      const selected = options.filter((o) => entry[o.name]);
      return <span>{selected.length > 0 ? selected.map((o) => o.label).join(", ") : "—"}</span>;
    }
    return (
      <div className={styles.multiSelectEdit}>
        {options.map((o) => (
          <label key={o.name} className={styles.multiSelectOption}>
            <input
              type="checkbox"
              checked={!!(editValues[o.name] !== undefined ? editValues[o.name] : entry[o.name])}
              onChange={(e) => onChange(o.name, e.target.checked)}
            />
            {o.label || o.name}
          </label>
        ))}
      </div>
    );
  }

  if (type === "starRating" || type === "qualitative") {
    if (!editing) {
      if (value == null) return <span>—</span>;
      return <span>{value} / 6 ★</span>;
    }
    return (
      <input
        type="number"
        min={0}
        max={6}
        value={editValues[name] ?? ""}
        onChange={(e) => onChange(name, e.target.value === "" ? null : Number(e.target.value))}
        className={styles.entryInput}
      />
    );
  }

  // table / collapsible: render nested fields recursively
  if (type === "table") {
    const rows = fieldDef.rows || [];
    return (
      <div className={styles.nestedFieldGrid}>
        {rows.map((row, ri) =>
          (row.fields || []).map((subField) => (
            <div key={`${ri}-${subField.name}`} className={styles.entryFieldRow}>
              <span className={styles.entryFieldLabel}>{subField.label || subField.name}</span>
              <span className={styles.entryFieldValue}>
                {renderEntryField(subField, entry, editing, editValues, onChange)}
              </span>
            </div>
          ))
        )}
      </div>
    );
  }

  if (type === "collapsible") {
    const trigger = fieldDef.trigger;
    const content = fieldDef.content || [];
    return (
      <div className={styles.nestedFieldGrid}>
        {trigger && (
          <div key={trigger.name} className={styles.entryFieldRow}>
            <span className={styles.entryFieldLabel}>{trigger.label || trigger.name}</span>
            <span className={styles.entryFieldValue}>
              {renderEntryField(trigger, entry, editing, editValues, onChange)}
            </span>
          </div>
        )}
        {content.map((subField) => (
          <div key={subField.name} className={styles.entryFieldRow}>
            <span className={styles.entryFieldLabel}>{subField.label || subField.name}</span>
            <span className={styles.entryFieldValue}>
              {renderEntryField(subField, entry, editing, editValues, onChange)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <span>{value ?? "—"}</span>;
}

/**
 * Flatten all leaf config fields (for the entry display grid).
 * Returns [ { type, name, label, ...rest } ] in form order.
 */
function flattenConfigFields(config) {
  const fields = [];
  const seen = new Set();

  function processField(field) {
    if (!field) return;
    // Named containers: push the whole thing so renderEntryField can show them grouped.
    // Unnamed containers (e.g. collapsibles with only "id"): recurse into content so their
    // leaf fields still appear — otherwise any star ratings / counters inside are silently lost.
    if (field.type === "table" || field.type === "collapsible") {
      if (field.name && !seen.has(field.name)) {
        seen.add(field.name);
        fields.push(field);
        return; // grouped rendering handled by renderEntryField
      }
      // unnamed container — flatten content directly
      if (field.type === "table" && Array.isArray(field.rows)) {
        field.rows.forEach((row) => {
          if (Array.isArray(row.fields)) row.fields.forEach(processField);
        });
      } else if (field.type === "collapsible") {
        if (field.trigger) processField(field.trigger);
        if (Array.isArray(field.content)) field.content.forEach(processField);
      }
      return;
    }
    if (field.type === "multiSelect") {
      // Include the whole multiSelect field so we can render option checkboxes
      if (field.name && !seen.has(field.name)) {
        seen.add(field.name);
        fields.push(field);
      }
      return;
    }
    if (field.name && !seen.has(field.name)) {
      seen.add(field.name);
      fields.push(field);
    }
  }

  // basics (skip identity fields handled in header)
  const SKIP = new Set(["scoutname", "scoutteam", "team", "match", "matchtype"]);
  if (config?.basics?.fields) {
    config.basics.fields.forEach((f) => {
      if (!SKIP.has(f.name)) processField(f);
    });
  }

  if (config?.sections) {
    config.sections.forEach((section) => {
      if (section?.fields) section.fields.forEach(processField);
    });
  }

  return fields;
}

export default function ScoutLeadsPage() {
  const { config, loading: configLoading } = useGameConfig();
  const configuredTimerFields = useMemo(
    () => extractTimerFieldsFromConfig(config || {}),
    [config]
  );
  const confidenceRatingField = useMemo(
    () => extractConfidenceRatingField(config || {}),
    [config]
  );
  const allConfigFields = useMemo(() => flattenConfigFields(config || {}), [config]);

  const [team, setTeam] = useState("");
  const [match, setMatch] = useState("");
  const [matchType, setMatchType] = useState("2");
  const [scoutName, setScoutName] = useState("");

  const [timerSummary, setTimerSummary] = useState([]);
  const [rates, setRates] = useState({});
  const displayItems = useMemo(() => buildDisplayItems(timerSummary), [timerSummary]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingData, setSavingData] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadedRecordMeta, setLoadedRecordMeta] = useState(null);

  // Entry display state
  const [allScoutingRows, setAllScoutingRows] = useState([]);
  const [currentUserTeam, setCurrentUserTeam] = useState(null);

  // Admin unlock state
  const [adminPassword, setAdminPassword] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminUnlockError, setAdminUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Edit state
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryError, setEntryError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const profile = localStorage.getItem("ScoutProfile");
    if (!profile) return;

    try {
      const parsed = JSON.parse(profile);
      if (parsed?.scoutname) {
        setScoutName(parsed.scoutname);
      }
      if (parsed?.match) {
        setMatch(String(parsed.match));
      }
    } catch (_error) {
      // Ignore malformed localStorage profile.
    }
  }, []);

  const fetchTimerData = async ({ showLoadedMessage = true } = {}) => {
    setError("");
    if (showLoadedMessage) {
      setSuccess("");
    }

    if (!team || !match) {
      setError("Team and match are required.");
      return;
    }

    setLoadingData(true);
    try {
      const params = new URLSearchParams({
        team: String(team),
        match: String(match),
        matchType: String(matchType),
      });

      const response = await fetch(`/api/scout-leads?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to load data (${response.status})`);
      }

      const normalizedRates = {};
      (data.timerSummary || []).forEach((item) => {
        const existingRate = data.averageRates?.[item.name];
        normalizedRates[item.name] = existingRate !== undefined && existingRate !== null
          ? String(existingRate)
          : "";
      });

      setTimerSummary(data.timerSummary || []);
      setRates(normalizedRates);
      setAllScoutingRows(data.allScoutingRows || []);
      setCurrentUserTeam(data.currentUserTeam ?? null);
      setLoadedRecordMeta({
        scoutingRows: (data.allScoutingRows || []).length,
        scoutLeadRows: data.scoutLeadsRows?.length || 0,
      });

      if ((data.timerSummary || []).length === 0 && (data.allScoutingRows || []).length === 0) {
        setSuccess("No holdTimer fields or scouting entries found for this team/match yet.");
      } else if ((data.timerSummary || []).length === 0) {
        setSuccess("No holdTimer fields configured. Scouting entries are shown below.");
      } else if ((data.allScoutingRows || []).length === 0) {
        setSuccess("No scouting entries found for this team/match yet.");
      } else if (showLoadedMessage) {
        setSuccess("Timer data loaded.");
      }
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load timer data.");
    } finally {
      setLoadingData(false);
    }
  };

  const loadTimerData = async (event) => {
    event.preventDefault();
    await fetchTimerData({ showLoadedMessage: true });
  };

  const saveScoutLeadRates = async () => {
    setError("");
    setSuccess("");

    if (!team || !match) {
      setError("Team and match are required before saving.");
      return;
    }

    if (timerSummary.length === 0) {
      setError("Load timer data first.");
      return;
    }

    setSavingData(true);
    try {
      const response = await fetch("/api/scout-leads", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          scoutname: scoutName || null,
          team: Number(team),
          match: Number(match),
          matchType: Number(matchType),
          rates,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to save scout lead data (${response.status})`);
      }

      await fetchTimerData({ showLoadedMessage: false });
      setSuccess("Scout lead rates saved. Match averages refreshed.");
    } catch (saveError) {
      setError(saveError.message || "Failed to save scout lead rates.");
    } finally {
      setSavingData(false);
    }
  };

  const unlockAdmin = async () => {
    setAdminUnlockError("");
    setUnlocking(true);
    try {
      const response = await fetch("/api/verify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await response.json();
      if (response.ok && data.authenticated) {
        setAdminUnlocked(true);
        setAdminUnlockError("");
      } else {
        setAdminUnlockError("Incorrect admin password.");
      }
    } catch (_e) {
      setAdminUnlockError("Failed to verify admin password.");
    } finally {
      setUnlocking(false);
    }
  };

  const startEdit = (entry) => {
    setEditingEntryId(entry.id);
    setEditValues({ ...entry });
    setEntryError("");
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    setEditValues({});
    setEntryError("");
  };

  const handleFieldChange = (fieldName, value) => {
    setEditValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const saveEntry = async (entryId) => {
    setEntryError("");
    setSavingEntry(true);
    try {
      const response = await fetch("/api/edit-match-entry", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          id: entryId,
          updates: editValues,
          adminPassword: adminUnlocked ? adminPassword : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to save entry (${response.status})`);
      }

      // Refresh all scouting rows
      await fetchTimerData({ showLoadedMessage: false });
      setEditingEntryId(null);
      setEditValues({});
    } catch (saveError) {
      setEntryError(saveError.message || "Failed to save entry.");
    } finally {
      setSavingEntry(false);
    }
  };

  // Section background color driven by confidence rating average
  const sectionBackground = useMemo(() => {
    if (!confidenceRatingField || !allScoutingRows.length) return "#ffffff";
    const values = allScoutingRows
      .map((r) => Number(r[confidenceRatingField.name]))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) return "#ffffff";
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return getConfidenceColor(avg);
  }, [confidenceRatingField, allScoutingRows]);

  const formatTimestamp = (ts) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString();
    } catch (_e) {
      return String(ts);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Scout Leads</h1>
        <p className={styles.subtitle}>
          Load a team + match and enter a configurable per-second rate for each timer metric.
        </p>

        {configLoading && <div className={styles.info}>Loading active game config...</div>}

        {!configLoading && configuredTimerFields.length === 0 && (
          <div className={styles.warning}>
            No <code>holdTimer</code> fields found in the active game config. Timer rate entry is unavailable, but scouting entries are shown below.
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <form onSubmit={loadTimerData} className={styles.lookupForm}>
          <div className={styles.grid}>
            <label className={styles.field}>
              Scout Lead Name
              <input
                type="text"
                value={scoutName}
                onChange={(event) => setScoutName(event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className={styles.field}>
              Team
              <input
                type="number"
                min="1"
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              Match
              <input
                type="number"
                min="1"
                value={match}
                onChange={(event) => setMatch(event.target.value)}
                required
              />
            </label>

            <label className={styles.field}>
              Match Type
              <select value={matchType} onChange={(event) => setMatchType(event.target.value)}>
                <option value="0">Practice</option>
                <option value="1">Test</option>
                <option value="2">Qualification</option>
                <option value="3">Playoff</option>
              </select>
            </label>
          </div>

          <button type="submit" className={styles.primaryButton} disabled={loadingData}>
            {loadingData ? "Loading..." : "Load Match Data"}
          </button>
        </form>

        {loadedRecordMeta && (
          <div className={styles.meta}>
            <span>Scouting rows found: {loadedRecordMeta.scoutingRows}</span>
            <span>
              Scout-leads rate entries: {loadedRecordMeta.scoutLeadRows}
            </span>
          </div>
        )}

        {timerSummary.length > 0 && (
          <div className={styles.timerList}>
            {displayItems.map((item) => {
              if (item.type === "group") {
                const { groupKey, groupLabel, fields } = item;
                const firstField = fields[0];
                const rateValue = Number(rates[firstField.name]);
                const totalAverageSeconds = fields.reduce(
                  (sum, f) => sum + (Number(f.averageSeconds) || 0),
                  0
                );
                const estimatedOutput = Number.isFinite(rateValue)
                  ? rateValue * totalAverageSeconds
                  : null;
                const allRateSamples = fields.flatMap((f) => f.rateSamples || []);
                const combinedAverageRate = allRateSamples.length
                  ? allRateSamples.reduce((a, b) => a + b, 0) / allRateSamples.length
                  : 0;

                return (
                  <div key={groupKey} className={`${styles.timerCard} ${styles.timerCardGroup}`}>
                    <h2>{groupLabel}</h2>
                    <div className={styles.groupFieldList}>
                      {fields.map((f) => (
                        <div key={f.name} className={styles.groupFieldItem}>
                          <span>{f.label}</span>
                          <span>{Number(f.averageSeconds || 0).toFixed(2)}s avg</span>
                        </div>
                      ))}
                    </div>
                    <p>
                      Combined avg seconds: {totalAverageSeconds.toFixed(2)}s
                    </p>
                    <p>
                      Average saved rate for this match: {Number(combinedAverageRate).toFixed(3)}
                      {" "}({allRateSamples.length} entry{allRateSamples.length === 1 ? "" : "ies"})
                    </p>

                    <label className={styles.field}>
                      {firstField.rateLabel}
                      <input
                        type="number"
                        step="0.001"
                        value={rates[firstField.name] ?? ""}
                        placeholder={firstField.ratePlaceholder || "Per-second value"}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setRates((previous) => {
                            const updates = {};
                            fields.forEach((f) => {
                              updates[f.name] = nextValue;
                            });
                            return { ...previous, ...updates };
                          });
                        }}
                      />
                    </label>

                    <p>
                      Estimated combined output: {estimatedOutput === null ? "N/A" : estimatedOutput.toFixed(2)}
                    </p>
                  </div>
                );
              }

              // Individual (ungrouped) card
              const { timer } = item;
              const rateValue = Number(rates[timer.name]);
              const estimatedOutput = Number.isFinite(rateValue)
                ? rateValue * (Number(timer.averageSeconds) || 0)
                : null;

              return (
                <div key={timer.name} className={styles.timerCard}>
                  <h2>{timer.label}</h2>
                  <p>
                    Average saved balls/sec for this match: {Number(timer.averageRate || 0).toFixed(3)}
                    {" "}({timer.rateSamples?.length || 0} entry{(timer.rateSamples?.length || 0) === 1 ? "" : "ies"})
                  </p>

                  <label className={styles.field}>
                    {timer.rateLabel}
                    <input
                      type="number"
                      step="0.001"
                      value={rates[timer.name] ?? ""}
                      placeholder={timer.ratePlaceholder || "Per-second value"}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setRates((previous) => ({
                          ...previous,
                          [timer.name]: nextValue,
                        }));
                      }}
                    />
                  </label>

                  <p>
                    Estimated output: {estimatedOutput === null ? "N/A" : estimatedOutput.toFixed(2)}
                  </p>
                  <p>
                    Balls by scouting entry using average balls/sec:{" "}
                    {(timer.estimatedBallsByEntry || []).length > 0
                      ? timer.estimatedBallsByEntry
                        .map((entry) => Number(entry.estimatedBalls || 0).toFixed(2))
                        .join(", ")
                      : "None"}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {timerSummary.length > 0 && (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={savingData || timerSummary.length === 0}
            onClick={saveScoutLeadRates}
          >
            {savingData ? "Saving..." : "Save Scout Lead Entry"}
          </button>
        )}

        {/* Admin unlock section */}
        {allScoutingRows.length > 0 && !adminUnlocked && (
          <div className={styles.adminUnlock}>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              className={styles.adminPasswordInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") unlockAdmin();
              }}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={unlockAdmin}
              disabled={unlocking || !adminPassword}
            >
              {unlocking ? "Verifying..." : "Unlock Editing"}
            </button>
            {adminUnlockError && (
              <span className={styles.adminUnlockError}>{adminUnlockError}</span>
            )}
          </div>
        )}

        {adminUnlocked && (
          <div className={styles.adminUnlockedBadge}>
            Admin editing unlocked
          </div>
        )}

        {/* Scouting entries section */}
        {allScoutingRows.length > 0 && (
          <section
            className={styles.entriesSection}
            style={{ background: sectionBackground, transition: "background 0.4s" }}
          >
            <div className={styles.entriesHeader}>
              <h2 className={styles.entriesTitle}>
                Scouting Entries ({allScoutingRows.length})
              </h2>
              {confidenceRatingField && (
                <span className={styles.confidenceLabel}>
                  Confidence: {confidenceRatingField.label}
                </span>
              )}
            </div>

            {entryError && <div className={styles.error}>{entryError}</div>}

            {allScoutingRows.map((entry) => {
              const isEditing = editingEntryId === entry.id;
              const canEdit =
                String(entry.scoutteam) === String(currentUserTeam) || adminUnlocked;

              return (
                <div key={entry.id} className={styles.entryCard}>
                  <div className={styles.entryCardHeader}>
                    <span className={styles.entryMeta}>
                      <strong>{entry.scoutname || "Unknown Scout"}</strong>
                      {entry.scoutteam && (
                        <span className={styles.entryTeamTag}>Team {entry.scoutteam}</span>
                      )}
                    </span>
                    <span className={styles.entryTimestamp}>
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    {entry.noshow && (
                      <span className={styles.noshowBadge}>No Show</span>
                    )}
                  </div>

                  {isEditing && (
                    <div className={styles.editNoshowRow}>
                      <label className={styles.editNoshowLabel}>
                        <input
                          type="checkbox"
                          checked={!!editValues.noshow}
                          onChange={(e) => handleFieldChange("noshow", e.target.checked)}
                        />
                        No Show
                      </label>
                      <input
                        type="text"
                        value={editValues.scoutname ?? ""}
                        onChange={(e) => handleFieldChange("scoutname", e.target.value)}
                        placeholder="Scout name"
                        className={styles.entryInput}
                      />
                    </div>
                  )}

                  <div className={styles.entryFieldGrid}>
                    {allConfigFields.map((fieldDef) => (
                      <div key={fieldDef.name} className={styles.entryFieldRow}>
                        <span className={styles.entryFieldLabel}>
                          {fieldDef.label || fieldDef.name}
                        </span>
                        <span className={styles.entryFieldValue}>
                          {renderEntryField(
                            fieldDef,
                            entry,
                            isEditing,
                            editValues,
                            handleFieldChange
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.entryActions}>
                    {!isEditing && canEdit && (
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() => startEdit(entry)}
                      >
                        Edit
                      </button>
                    )}
                    {isEditing && (
                      <>
                        <button
                          type="button"
                          className={styles.saveEntryButton}
                          onClick={() => saveEntry(entry.id)}
                          disabled={savingEntry}
                        >
                          {savingEntry ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={cancelEdit}
                          disabled={savingEntry}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {timerSummary.length === 0 && allScoutingRows.length === 0 && !loadingData && loadedRecordMeta && (
          <div className={styles.info}>No scouting entries found for this team/match.</div>
        )}
      </div>
    </div>
  );
}
