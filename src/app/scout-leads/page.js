"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 * Compute background color from the proportion of true values for a boolean field.
 * ratio=1 → green (hue 120), ratio=0 → red (hue 0).
 * If invertColor: ratio=1 → red (hue 0), ratio=0 → green (hue 120).
 */
function getBooleanColor(ratio, invertColor) {
  const r = invertColor ? (1 - ratio) : ratio;
  const hue = Math.round(r * 120);
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
        onWheel={(e) => e.target.blur()}
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
        onWheel={(e) => e.target.blur()}
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
        onWheel={(e) => e.target.blur()}
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
  const [fInputs, setFInputs] = useState({});
  const [sInputs, setSInputs] = useState({});
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

  // Scout lead comment state
  const [commentText, setCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSuccess, setCommentSuccess] = useState("");
  const [scoutLeadsRows, setScoutLeadsRows] = useState([]);

  // Sidebar rankings state
  const [sidebarWeights, setSidebarWeights] = useState({});
  const [sidebarTeams, setSidebarTeams] = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarError, setSidebarError] = useState("");
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [allComments, setAllComments] = useState([]);
  const sidebarWeightsRef = useRef();

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

  // Load all scout lead comments on mount
  useEffect(() => {
    async function loadAllComments() {
      try {
        const response = await fetch("/api/scout-lead-comments", {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!response.ok) return;
        const data = await response.json();
        setAllComments(data.comments || []);
      } catch (_e) {
        // Non-fatal
      }
    }
    loadAllComments();
  }, []);

  // Initialize sidebar weights (all zero) when config loads
  useEffect(() => {
    const weightsConfig = config?.display?.picklist?.weights || [];
    if (weightsConfig.length === 0) return;
    setSidebarWeights((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const initial = {};
      weightsConfig.forEach((w) => { initial[w.key] = "0"; });
      return initial;
    });
  }, [config]);

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

      setTimerSummary(data.timerSummary || []);
      // Clear f/s scratch inputs and computed rates on every load
      setRates({});
      setFInputs({});
      setSInputs({});
      setAllScoutingRows(data.allScoutingRows || []);
      setCurrentUserTeam(data.currentUserTeam ?? null);

      const fetchedLeadsRows = data.scoutLeadsRows || [];
      setScoutLeadsRows(fetchedLeadsRows);
      const myRow = fetchedLeadsRows.find(
        (r) => r.scoutname && scoutName &&
          r.scoutname.trim().toLowerCase() === scoutName.trim().toLowerCase()
      );
      setCommentText(myRow?.comment || "");
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
      setRates({});
      setFInputs({});
      setSInputs({});
      setSuccess("Scout lead rates saved. Match averages refreshed.");
    } catch (saveError) {
      setError(saveError.message || "Failed to save scout lead rates.");
    } finally {
      setSavingData(false);
    }
  };

  const generateRankings = async () => {
    setSidebarError("");
    setSidebarLoading(true);
    try {
      const formData = new FormData(sidebarWeightsRef.current);
      const weightEntries = [...formData.entries()];
      const response = await fetch("/api/compute-picklist", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(weightEntries),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Server error (${response.status})`);
      }

      const data = await response.json();
      setSidebarTeams(data.teamTable || []);

      // Refresh all comments after generating rankings
      const commentRes = await fetch("/api/scout-lead-comments", {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (commentRes.ok) {
        const commentData = await commentRes.json();
        setAllComments(commentData.comments || []);
      }
    } catch (err) {
      setSidebarError(err.message || "Failed to generate rankings.");
    } finally {
      setSidebarLoading(false);
    }
  };

  const saveComment = async () => {
    setCommentError("");
    setCommentSuccess("");

    if (!team || !match) {
      setCommentError("Load a team and match first.");
      return;
    }

    if (!scoutName.trim()) {
      setCommentError("Enter your Scout Lead Name above before saving a comment.");
      return;
    }

    setSavingComment(true);
    try {
      const response = await fetch("/api/scout-leads", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          scoutname: scoutName.trim(),
          team: Number(team),
          match: Number(match),
          matchType: Number(matchType),
          comment: commentText,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to save comment (${response.status})`);
      }

      setCommentSuccess("Comment saved.");
      await fetchTimerData({ showLoadedMessage: false });
    } catch (err) {
      setCommentError(err.message || "Failed to save comment.");
    } finally {
      setSavingComment(false);
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

  // Section background color driven by the color-controlling field
  const sectionBackground = useMemo(() => {
    if (!confidenceRatingField || !allScoutingRows.length) return "#ffffff";

    if (confidenceRatingField.fieldType === "checkbox") {
      const trueCount = allScoutingRows.filter((r) => r[confidenceRatingField.name] === true).length;
      const ratio = trueCount / allScoutingRows.length;
      return getBooleanColor(ratio, confidenceRatingField.invertColor);
    }

    // qualitative / starRating
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

  const picklistWeightsConfig = config?.display?.picklist?.weights || [];
  const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"];

  // Group all comments by team for the sidebar
  const commentsByTeam = useMemo(() => {
    const map = {};
    allComments.forEach((c) => {
      if (!map[c.team]) map[c.team] = [];
      map[c.team].push(c);
    });
    return map;
  }, [allComments]);

  return (
    <div className={styles.page}>
      <div className={styles.pageLayout}>

      {/* ── Rankings Sidebar ──────────────────────────────── */}
      <aside className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Team Rankings</h2>

        {picklistWeightsConfig.length === 0 && !configLoading && (
          <p className={styles.sidebarNote}>
            No picklist weights configured. Add a <code>display.picklist.weights</code> section to your game config.
          </p>
        )}

        {picklistWeightsConfig.length > 0 && (
          <form ref={sidebarWeightsRef} onSubmit={(e) => { e.preventDefault(); generateRankings(); }}>
            {/* Hidden inputs so FormData still sends all weight values */}
            {picklistWeightsConfig.map((w) => (
              <input key={w.key} type="hidden" name={w.key} value={sidebarWeights[w.key] ?? "0"} />
            ))}
            <label className={styles.field}>
              Sort by
              <select
                className={styles.weightSelect}
                value={picklistWeightsConfig.find((w) => sidebarWeights[w.key] === "1")?.key ?? ""}
                onChange={(e) => {
                  const selected = e.target.value;
                  const next = {};
                  picklistWeightsConfig.forEach((w) => {
                    next[w.key] = w.key === selected ? "1" : "0";
                  });
                  setSidebarWeights(next);
                }}
              >
                <option value="" disabled>Select a metric…</option>
                {picklistWeightsConfig.map((w) => (
                  <option key={w.key} value={w.key}>{w.label}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={sidebarLoading}
            >
              {sidebarLoading ? "Calculating..." : "Generate Rankings"}
            </button>
          </form>
        )}

        {sidebarError && <div className={styles.error}>{sidebarError}</div>}

        {sidebarTeams.length > 0 && (
          <ol className={styles.teamRankList}>
            {sidebarTeams.map((t, idx) => {
              const teamComments = commentsByTeam[t.team] || [];
              const isExpanded = expandedTeam === t.team;
              return (
                <li
                  key={t.team}
                  className={`${styles.teamRankItem} ${isExpanded ? styles.teamRankItemExpanded : ""} ${teamComments.length > 0 ? styles.teamRankItemHasComments : ""}`}
                  onClick={() => setExpandedTeam(isExpanded ? null : t.team)}
                >
                  <div className={styles.teamRankRow}>
                    <span className={styles.teamRankNum}>{idx + 1}</span>
                    <span className={styles.teamRankTeam}>
                      {t.team}
                      {teamComments.length > 0 && (
                        <span className={styles.teamCommentBadge}>{teamComments.length}</span>
                      )}
                    </span>
                    <span className={styles.teamRankScore}>{Number(t.score ?? 0).toFixed(1)}</span>
                    {teamComments.length > 0 && (
                      <span className={styles.teamExpandIcon}>{isExpanded ? "▲" : "▼"}</span>
                    )}
                  </div>
                  {isExpanded && teamComments.length > 0 && (
                    <div className={styles.teamCommentExpanded}>
                      {teamComments.map((c) => (
                        <div key={c.id} className={styles.teamCommentEntry}>
                          <div className={styles.teamCommentMeta}>
                            <strong>{c.scoutname || "Unknown"}</strong>
                            <span>
                              {matchTypeLabel[c.matchtype] ?? `Type ${c.matchtype}`} {c.match}
                            </span>
                          </div>
                          <p className={styles.teamCommentText}>{c.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {isExpanded && teamComments.length === 0 && (
                    <p className={styles.teamCommentEmpty}>No scout lead comments for this team.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {sidebarTeams.length === 0 && !sidebarLoading && picklistWeightsConfig.length > 0 && (
          <p className={styles.sidebarNote}>Set weights and click Generate Rankings.</p>
        )}
      </aside>

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
                onWheel={(e) => e.target.blur()}
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
                onWheel={(e) => e.target.blur()}
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
                const totalAverageSeconds = fields.reduce(
                  (sum, f) => sum + (Number(f.averageSeconds) || 0),
                  0
                );
                // Grouped fields share the same rate — use the first field's samples to avoid double-counting
                const allRateSamples = firstField.rateSamples || [];
                const combinedAverageRate = allRateSamples.length
                  ? allRateSamples.reduce((a, b) => a + b, 0) / allRateSamples.length
                  : 0;

                const fVal = fInputs[firstField.name] ?? "";
                const sVal = sInputs[firstField.name] ?? "";
                const fNum = Number(fVal);
                const sNum = Number(sVal);
                const computedRate = fVal !== "" && sVal !== "" && Number.isFinite(fNum) && Number.isFinite(sNum) && sNum > 0
                  ? fNum / sNum
                  : null;
                const estimatedOutput = computedRate !== null ? computedRate * totalAverageSeconds : null;

                const myScoutRow = scoutLeadsRows.find(
                  (r) => r.scoutname && scoutName &&
                    r.scoutname.trim().toLowerCase() === scoutName.trim().toLowerCase()
                );
                const myGroupRate = myScoutRow != null ? myScoutRow[firstField.name] : null;

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
                    <p>Combined avg seconds: {totalAverageSeconds.toFixed(2)}s</p>
                    <p>
                      Average saved rate: {Number(combinedAverageRate).toFixed(4)}
                      {" "}({allRateSamples.length} {allRateSamples.length === 1 ? "entry" : "entries"})
                    </p>
                    {myGroupRate != null && Number.isFinite(Number(myGroupRate)) && (
                      <p className={styles.myRate}>
                        Your saved rate: {Number(myGroupRate).toFixed(4)}
                      </p>
                    )}

                    <div className={styles.fsRow}>
                      <label className={styles.fsPart}>
                        f
                        <input
                          type="number"
                          min="0"
                          value={fVal}
                          placeholder="0"
                          onChange={(e) => {
                            const f = e.target.value;
                            setFInputs((prev) => ({ ...prev, [firstField.name]: f }));
                            const s = sInputs[firstField.name] ?? "";
                            const fn = Number(f); const sn = Number(s);
                            const r = f !== "" && s !== "" && Number.isFinite(fn) && Number.isFinite(sn) && sn > 0 ? String(fn / sn) : "";
                            setRates((prev) => {
                              const updates = {};
                              fields.forEach((field) => { updates[field.name] = r; });
                              return { ...prev, ...updates };
                            });
                          }}
                          onWheel={(e) => e.target.blur()}
                        />
                      </label>
                      <span className={styles.fsDivider}>/</span>
                      <label className={styles.fsPart}>
                        s
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={sVal}
                          placeholder="0"
                          onChange={(e) => {
                            const s = e.target.value;
                            setSInputs((prev) => ({ ...prev, [firstField.name]: s }));
                            const f = fInputs[firstField.name] ?? "";
                            const fn = Number(f); const sn = Number(s);
                            const r = f !== "" && s !== "" && Number.isFinite(fn) && Number.isFinite(sn) && sn > 0 ? String(fn / sn) : "";
                            setRates((prev) => {
                              const updates = {};
                              fields.forEach((field) => { updates[field.name] = r; });
                              return { ...prev, ...updates };
                            });
                          }}
                          onWheel={(e) => e.target.blur()}
                        />
                      </label>
                      <span className={styles.fsComputed}>
                        = {computedRate !== null ? computedRate.toFixed(4) : "—"}
                      </span>
                    </div>

                    {estimatedOutput !== null && (
                      <p>Estimated combined output: {estimatedOutput.toFixed(2)}</p>
                    )}
                  </div>
                );
              }

              // Individual (ungrouped) card
              const { timer } = item;
              const fVal = fInputs[timer.name] ?? "";
              const sVal = sInputs[timer.name] ?? "";
              const fNum = Number(fVal);
              const sNum = Number(sVal);
              const computedRate = fVal !== "" && sVal !== "" && Number.isFinite(fNum) && Number.isFinite(sNum) && sNum > 0
                ? fNum / sNum
                : null;
              const estimatedOutput = computedRate !== null
                ? computedRate * (Number(timer.averageSeconds) || 0)
                : null;

              const myScoutRow = scoutLeadsRows.find(
                (r) => r.scoutname && scoutName &&
                  r.scoutname.trim().toLowerCase() === scoutName.trim().toLowerCase()
              );
              const myRate = myScoutRow != null ? myScoutRow[timer.name] : null;

              return (
                <div key={timer.name} className={styles.timerCard}>
                  <h2>{timer.label}</h2>
                  <p>
                    Average saved rate: {Number(timer.averageRate || 0).toFixed(4)}
                    {" "}({timer.rateSamples?.length || 0} {(timer.rateSamples?.length || 0) === 1 ? "entry" : "entries"})
                  </p>
                  {myRate != null && Number.isFinite(Number(myRate)) && (
                    <p className={styles.myRate}>
                      Your saved rate: {Number(myRate).toFixed(4)}
                    </p>
                  )}

                  <div className={styles.fsRow}>
                    <label className={styles.fsPart}>
                      f
                      <input
                        type="number"
                        min="0"
                        value={fVal}
                        placeholder="0"
                        onChange={(e) => {
                          const f = e.target.value;
                          setFInputs((prev) => ({ ...prev, [timer.name]: f }));
                          const s = sInputs[timer.name] ?? "";
                          const fn = Number(f); const sn = Number(s);
                          const r = f !== "" && s !== "" && Number.isFinite(fn) && Number.isFinite(sn) && sn > 0 ? String(fn / sn) : "";
                          setRates((prev) => ({ ...prev, [timer.name]: r }));
                        }}
                        onWheel={(e) => e.target.blur()}
                      />
                    </label>
                    <span className={styles.fsDivider}>/</span>
                    <label className={styles.fsPart}>
                      s
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={sVal}
                        placeholder="0"
                        onChange={(e) => {
                          const s = e.target.value;
                          setSInputs((prev) => ({ ...prev, [timer.name]: s }));
                          const f = fInputs[timer.name] ?? "";
                          const fn = Number(f); const sn = Number(s);
                          const r = f !== "" && s !== "" && Number.isFinite(fn) && Number.isFinite(sn) && sn > 0 ? String(fn / sn) : "";
                          setRates((prev) => ({ ...prev, [timer.name]: r }));
                        }}
                        onWheel={(e) => e.target.blur()}
                      />
                    </label>
                    <span className={styles.fsComputed}>
                      = {computedRate !== null ? computedRate.toFixed(4) : "—"}
                    </span>
                  </div>

                  {estimatedOutput !== null && (
                    <p>Estimated output: {estimatedOutput.toFixed(2)}</p>
                  )}
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

        {/* Scout Lead Comments section */}
        {loadedRecordMeta && (
          <section className={styles.commentsSection}>
            <h2 className={styles.commentsSectionTitle}>Scout Lead Comments</h2>

            {/* Other scout leads' comments (read-only) */}
            {scoutLeadsRows.filter((r) => r.comment && r.comment.trim()).length > 0 && (
              <div className={styles.commentsList}>
                {scoutLeadsRows
                  .filter((r) => r.comment && r.comment.trim())
                  .reduce((acc, r) => {
                    // dedupe by scoutname, keep first occurrence
                    const key = (r.scoutname || "").trim().toLowerCase();
                    if (!acc.seen.has(key)) {
                      acc.seen.add(key);
                      acc.rows.push(r);
                    }
                    return acc;
                  }, { seen: new Set(), rows: [] })
                  .rows
                  .filter((r) => {
                    const key = (r.scoutname || "").trim().toLowerCase();
                    const myKey = scoutName.trim().toLowerCase();
                    return key !== myKey;
                  })
                  .map((r) => (
                    <div key={r.id} className={styles.commentCard}>
                      <span className={styles.commentAuthor}>{r.scoutname || "Unknown"}</span>
                      <p className={styles.commentText}>{r.comment}</p>
                    </div>
                  ))}
              </div>
            )}

            {/* Current scout lead's editable comment */}
            {commentError && <div className={styles.error}>{commentError}</div>}
            {commentSuccess && <div className={styles.success}>{commentSuccess}</div>}
            <div className={styles.commentEntry}>
              {scoutName.trim() && (
                <span className={styles.commentEntryLabel}>
                  {scoutName.trim()} (you)
                </span>
              )}
              <textarea
                className={styles.commentTextarea}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={scoutName.trim() ? "Add your scout lead comment…" : "Enter your name above to add a comment"}
                disabled={!scoutName.trim() || !loadedRecordMeta}
                rows={3}
              />
              <button
                type="button"
                className={styles.primaryButton}
                onClick={saveComment}
                disabled={savingComment || !scoutName.trim() || !loadedRecordMeta}
              >
                {savingComment ? "Saving..." : "Save Comment"}
              </button>
            </div>
          </section>
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
                  {confidenceRatingField.fieldType === "checkbox" ? "Color: " : "Confidence: "}
                  {confidenceRatingField.label}
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
    </div>
  );
}
