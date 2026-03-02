"use client";

import { useEffect, useMemo, useState } from "react";
import useGameConfig from "../../lib/useGameConfig";
import { extractTimerFieldsFromConfig } from "../../lib/schema-generator";
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

export default function ScoutLeadsPage() {
  const { config, loading: configLoading } = useGameConfig();
  const configuredTimerFields = useMemo(
    () => extractTimerFieldsFromConfig(config || {}),
    [config]
  );

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
      setLoadedRecordMeta({
        scoutingRows: data.scoutingRows?.length || 0,
        scoutLeadRows: data.scoutLeadsRows?.length || 0,
      });

      if ((data.timerSummary || []).length === 0) {
        setSuccess("No holdTimer fields are configured for the active game.");
      } else if ((data.scoutingRows || []).length === 0) {
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
            No <code>holdTimer</code> fields found in the active game config. Add at least one timer field to use this page.
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

        <button
          type="button"
          className={styles.primaryButton}
          disabled={savingData || timerSummary.length === 0}
          onClick={saveScoutLeadRates}
        >
          {savingData ? "Saving..." : "Save Scout Lead Entry"}
        </button>
      </div>
    </div>
  );
}
