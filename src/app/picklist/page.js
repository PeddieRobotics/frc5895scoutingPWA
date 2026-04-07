'use client';

import styles from "./page.module.css";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import useGameConfig from "../../lib/useGameConfig";
import TeamScatterPlot from "../components/TeamScatterPlot";
import * as XLSX from 'xlsx';

export default function Picklist() {
  const { config, gameId, loading: configLoading } = useGameConfig();

  // ── Data state ──
  const [teamData, setTeamData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [unscoredMatches, setUnscoredMatches] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isClient, setIsClient] = useState(false);

  // ── Scatter state ──
  const [scatterX, setScatterX] = useState('');
  const [scatterY, setScatterY] = useState('');

  // ── Rank table state ──
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [hiddenColumns, setHiddenColumns] = useState(() => new Set());
  const [columnDropdownOpen, setColumnDropdownOpen] = useState(false);

  // ── Keep/Swap state ──
  const [ksList, setKsList] = useState([]);
  const [ksActive, setKsActive] = useState(false);
  const [ksPairIdx, setKsPairIdx] = useState(0);
  const [ksHistory, setKsHistory] = useState([]);
  const [ksRedoStack, setKsRedoStack] = useState([]);
  const [ksFocusMode, setKsFocusMode] = useState(false);
  const [ksSequentialFrontier, setKsSequentialFrontier] = useState(1);
  const [ksComplete, setKsComplete] = useState(false);
  const [manualTeamA, setManualTeamA] = useState('');
  const [manualTeamB, setManualTeamB] = useState('');
  const [manualPair, setManualPair] = useState(null); // [teamA, teamB] or null for manual compare

  const columnToggleRef = useRef(null);
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const syncingScroll = useRef(false);

  // ── Config-derived values ──
  const picklistConfig = config?.display?.picklist || {};
  const weightsConfig = picklistConfig.weights || [];
  const tableColumnsConfig = picklistConfig.tableColumns || [];
  const scatterFieldsConfig = picklistConfig.scatterFields || [];
  const defaultSortConfig = picklistConfig.defaultSort || { key: 'realEpa', direction: 'desc' };
  const usePPR = config?.usePPR;

  const effectiveSortKey = sortKey || defaultSortConfig.key;
  const effectiveSortDir = sortKey ? sortDir : defaultSortConfig.direction;

  const axisOptions = scatterFieldsConfig.length > 0 ? scatterFieldsConfig : weightsConfig;

  // ── Color scale helpers ──
  const greenToRedColors = ["#9ADC83", "#BECC72", "#E1BB61", "#F0A56C", "#FF8E76"];

  const valueToColor = useCallback((value) => {
    if (value > 0.8) return greenToRedColors[0];
    if (value > 0.6) return greenToRedColors[1];
    if (value > 0.4) return greenToRedColors[2];
    if (value > 0.2) return greenToRedColors[3];
    return greenToRedColors[4];
  }, []);

  const inverseValueToColor = useCallback((value) => {
    if (value < 0.2) return greenToRedColors[0];
    if (value < 0.4) return greenToRedColors[1];
    if (value < 0.6) return greenToRedColors[2];
    if (value < 0.8) return greenToRedColors[3];
    return greenToRedColors[4];
  }, []);

  const getColor = useCallback((col, teamRow) => {
    if (col.colorScale === "normal") return valueToColor(teamRow[col.key] ?? 0);
    if (col.colorScale === "inverse") return inverseValueToColor(teamRow[col.key] ?? 0);
    return valueToColor(teamRow[col.colorScale] ?? 0);
  }, [valueToColor, inverseValueToColor]);

  const formatValue = useCallback((col, teamRow) => {
    const value = teamRow[col.key];
    if (col.format === "three") return value != null ? (Math.round(value * 1000) / 1000) : '0';
    if (col.format === "one") return value != null ? (Math.round(value * 10) / 10) : '0';
    if (col.format === "percent") return value != null ? `${Math.round(value * 1000) / 10}%` : '0%';
    if (col.format === "breakdownPercent") return value != null ? `${Math.round(value * 1000) / 10}%` : '0%';
    return value ?? 0;
  }, []);

  // ── Init ──
  useEffect(() => { setIsClient(true); }, []);

  // Init scatter defaults
  useEffect(() => {
    if (!axisOptions.length) return;
    setScatterX(prev => prev || axisOptions[0]?.key || '');
    setScatterY(prev => prev || axisOptions[1]?.key || axisOptions[0]?.key || '');
  }, [axisOptions.length > 0 ? axisOptions[0]?.key : null]);

  // ── Auth check ──
  useEffect(() => {
    if (!isClient) return;
    async function checkAuth() {
      try {
        const params = new URLSearchParams();
        if (gameId) params.set('gameId', String(gameId));
        const res = await fetch(`/api/get-data${params.toString() ? `?${params}` : ''}`, {
          credentials: 'include',
          headers: { 'Cache-Control': 'no-store', 'X-Source-Page': 'picklist', 'X-Token-Check': 'true' }
        });
        if (res.ok) {
          setIsAuthenticated(true);
          return;
        }
        const tokenRes = await fetch('/api/auth/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ validateOnly: true })
        });
        if (tokenRes.ok) {
          const result = await tokenRes.json();
          setIsAuthenticated(result.valid === true);
        }
      } catch {
        setIsAuthenticated(false);
      }
    }
    checkAuth();
  }, [isClient, gameId]);

  // ── Fetch team data ──
  const fetchData = useCallback(async () => {
    if (!isAuthenticated || !weightsConfig.length) return;
    setLoading(true);
    try {
      const equalWeights = weightsConfig.map(w => [w.key, '1']);
      const headers = { 'Content-Type': 'application/json', 'X-Source-Page': 'picklist' };
      if (gameId) headers['X-Game-Id'] = String(gameId);
      const res = await fetch('/api/compute-picklist', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(equalWeights),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const payload = await res.json();
      const table = Array.isArray(payload) ? payload : (payload.teamTable || []);
      setTeamData(table);
      setUnscoredMatches(Array.isArray(payload.unscoredMatches) ? payload.unscoredMatches : []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching picklist data:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, gameId, weightsConfig.length]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset on game change
  useEffect(() => {
    setTeamData([]);
    setUnscoredMatches([]);
    setKsList([]);
    setKsActive(false);
    setKsHistory([]);
    setKsRedoStack([]);
  }, [gameId]);

  // ── Restore keep/swap from localStorage ──
  useEffect(() => {
    if (!isClient || !gameId) return;
    try {
      const saved = localStorage.getItem(`picklist_ks_${gameId}`);
      if (saved) {
        const state = JSON.parse(saved);
        setKsList(state.list || []);
        setKsActive(state.active || false);
        setKsPairIdx(state.pairIdx || 0);
        setKsHistory(state.history || []);
        setKsRedoStack(state.redoStack || []);
        setKsSequentialFrontier(state.frontier || 1);
        setKsComplete(state.complete || false);
      }
    } catch { /* ignore corrupt data */ }
  }, [isClient, gameId]);

  // ── Persist keep/swap to localStorage ──
  useEffect(() => {
    if (!isClient || !gameId || !ksList.length) return;
    localStorage.setItem(`picklist_ks_${gameId}`, JSON.stringify({
      list: ksList,
      active: ksActive,
      pairIdx: ksPairIdx,
      history: ksHistory,
      redoStack: ksRedoStack,
      frontier: ksSequentialFrontier,
      complete: ksComplete,
    }));
  }, [ksList, ksActive, ksPairIdx, ksHistory, ksRedoStack, ksSequentialFrontier, ksComplete, gameId, isClient]);

  // ── Sync horizontal scroll between frozen header and body ──
  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;

    function onHeaderScroll() {
      if (syncingScroll.current) return;
      syncingScroll.current = true;
      body.scrollLeft = header.scrollLeft;
      syncingScroll.current = false;
    }
    function onBodyScroll() {
      if (syncingScroll.current) return;
      syncingScroll.current = true;
      header.scrollLeft = body.scrollLeft;
      syncingScroll.current = false;
    }
    header.addEventListener('scroll', onHeaderScroll);
    body.addEventListener('scroll', onBodyScroll);
    return () => {
      header.removeEventListener('scroll', onHeaderScroll);
      body.removeEventListener('scroll', onBodyScroll);
    };
  });

  // ── Close column dropdown on outside click ──
  useEffect(() => {
    if (!columnDropdownOpen) return;
    function handleClick(e) {
      if (columnToggleRef.current && !columnToggleRef.current.contains(e.target)) {
        setColumnDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [columnDropdownOpen]);

  // ── Sorted team data for rank table ──
  const sortedTeamData = useMemo(() => {
    if (!teamData.length) return [];
    const sorted = [...teamData];
    const key = effectiveSortKey;
    const dir = effectiveSortDir;

    // Special case: sort by K/S rank
    if (key === '__ksRank') {
      const ksMap = new Map(ksList.map((t, i) => [t, i]));
      sorted.sort((a, b) => {
        const aR = ksMap.has(a.team) ? ksMap.get(a.team) : Infinity;
        const bR = ksMap.has(b.team) ? ksMap.get(b.team) : Infinity;
        return dir === 'asc' ? aR - bR : bR - aR;
      });
    } else {
      sorted.sort((a, b) => {
        const aV = a[key] ?? 0;
        const bV = b[key] ?? 0;
        return dir === 'asc' ? aV - bV : bV - aV;
      });
    }
    return sorted;
  }, [teamData, effectiveSortKey, effectiveSortDir, ksList]);

  // ── Scatter data ──
  const resolveAxisValue = (t, key) => key === 'team' ? Number(t.team) : (t[key] ?? 0);
  const resolveAxisLabel = (key) => key === 'team' ? 'Team Number' : (axisOptions.find(w => w.key === key)?.label ?? key);

  const scatterData = useMemo(() =>
    teamData.map(t => ({
      team: t.team,
      x: resolveAxisValue(t, scatterX),
      y: resolveAxisValue(t, scatterY),
      z: 1,
    })),
    [teamData, scatterX, scatterY]
  );

  // ── Keep/Swap actions ──
  const ksSequentialPair = ksActive && ksList.length >= 2 && ksPairIdx < ksList.length - 1
    ? [ksList[ksPairIdx], ksList[ksPairIdx + 1]]
    : null;
  const ksCurrentPair = manualPair || ksSequentialPair;

  function ksBegin() {
    const order = sortedTeamData.map(t => t.team);
    setKsList(order);
    setKsPairIdx(0);
    setKsActive(true);
    setKsHistory([]);
    setKsRedoStack([]);
    setKsSequentialFrontier(1);
    setKsComplete(false);
  }

  function ksReset() {
    setKsList([]);
    setKsActive(false);
    setKsPairIdx(0);
    setKsHistory([]);
    setKsRedoStack([]);
    setKsSequentialFrontier(1);
    setKsComplete(false);
    if (gameId) localStorage.removeItem(`picklist_ks_${gameId}`);
  }

  function ksSyncToRankOrder() {
    const order = sortedTeamData.map(t => t.team);
    setKsList(order);
    setKsPairIdx(0);
    setKsHistory([]);
    setKsRedoStack([]);
    setKsSequentialFrontier(1);
    setKsComplete(false);
  }

  function ksPushSnapshot() {
    setKsHistory(prev => [...prev, { list: [...ksList], pairIdx: ksPairIdx, frontier: ksSequentialFrontier }]);
    setKsRedoStack([]);
  }

  function ksAdvanceToNext(currentFrontier) {
    if (currentFrontier >= ksList.length - 1) {
      setKsComplete(true);
    } else {
      setKsPairIdx(currentFrontier);
      setKsSequentialFrontier(currentFrontier + 1);
    }
  }

  function ksKeep() {
    if (!ksCurrentPair || ksComplete) return;
    ksPushSnapshot();
    // If in bubble-up (pair is above the frontier), resume sequential
    if (ksPairIdx < ksSequentialFrontier - 1) {
      ksAdvanceToNext(ksSequentialFrontier);
    } else {
      // Normal: advance to next sequential pair
      const nextFrontier = ksSequentialFrontier + 1;
      if (nextFrontier >= ksList.length) {
        setKsComplete(true);
        setKsSequentialFrontier(nextFrontier);
      } else {
        setKsPairIdx(ksSequentialFrontier);
        setKsSequentialFrontier(nextFrontier);
      }
    }
  }

  function ksSwap() {
    if (!ksCurrentPair || ksComplete) return;
    ksPushSnapshot();
    const newList = [...ksList];
    const tmp = newList[ksPairIdx];
    newList[ksPairIdx] = newList[ksPairIdx + 1];
    newList[ksPairIdx + 1] = tmp;
    setKsList(newList);

    if (ksPairIdx > 0) {
      // Bubble up: compare swapped team with the one above
      setKsPairIdx(ksPairIdx - 1);
    } else {
      // Already at top, resume sequential
      ksAdvanceToNext(ksSequentialFrontier);
    }
  }

  function ksUndo() {
    if (!ksHistory.length) return;
    const prev = ksHistory[ksHistory.length - 1];
    setKsRedoStack(r => [...r, { list: [...ksList], pairIdx: ksPairIdx, frontier: ksSequentialFrontier }]);
    setKsHistory(h => h.slice(0, -1));
    setKsList(prev.list);
    setKsPairIdx(prev.pairIdx);
    setKsSequentialFrontier(prev.frontier);
    setKsComplete(false);
  }

  function ksRedo() {
    if (!ksRedoStack.length) return;
    const next = ksRedoStack[ksRedoStack.length - 1];
    setKsHistory(h => [...h, { list: [...ksList], pairIdx: ksPairIdx, frontier: ksSequentialFrontier }]);
    setKsRedoStack(r => r.slice(0, -1));
    setKsList(next.list);
    setKsPairIdx(next.pairIdx);
    setKsSequentialFrontier(next.frontier);
  }

  function ksManualCompare() {
    const a = parseInt(manualTeamA);
    const b = parseInt(manualTeamB);
    if (!a || !b || a === b) return;
    if (!ksList.includes(a) || !ksList.includes(b)) return;
    ksPushSnapshot();
    setManualPair([a, b]);
  }

  function ksManualKeep() {
    if (!manualPair) return;
    // Keep = do nothing to the list, just exit manual compare
    setManualPair(null);
  }

  function ksManualSwap() {
    if (!manualPair) return;
    const [a, b] = manualPair;
    const idxA = ksList.indexOf(a);
    const idxB = ksList.indexOf(b);
    if (idxA === -1 || idxB === -1) return;
    // Swap their positions in the list
    const newList = [...ksList];
    newList[idxA] = b;
    newList[idxB] = a;
    setKsList(newList);
    setManualPair(null);
  }

  // ── K/S rank lookup ──
  const ksRankMap = useMemo(() => {
    const map = new Map();
    ksList.forEach((team, i) => map.set(team, i + 1));
    return map;
  }, [ksList]);

  // ── Team data lookup ──
  const teamDataMap = useMemo(() => {
    const map = new Map();
    teamData.forEach(t => map.set(t.team, t));
    return map;
  }, [teamData]);

  // ── Sort handler ──
  function handleSort(key) {
    if (effectiveSortKey === key) {
      setSortDir(effectiveSortDir === 'desc' ? 'asc' : 'desc');
      setSortKey(key);
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // ── Column toggle ──
  function toggleColumn(key) {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Visible columns ──
  const visibleColumns = useMemo(() =>
    tableColumnsConfig.filter(col => !hiddenColumns.has(col.key)),
    [tableColumnsConfig, hiddenColumns]
  );

  // ── Column groups for toggle dropdown ──
  const columnGroups = useMemo(() => {
    const groups = new Map();
    tableColumnsConfig.forEach(col => {
      const g = col.group || 'other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(col);
    });
    return groups;
  }, [tableColumnsConfig]);

  // ── Export XLSX ──
  function exportXLSX() {
    const headers = ['Rank', 'K/S Rank', 'Team', ...visibleColumns.map(c => c.label)];
    const data = sortedTeamData.map((team, i) => {
      const ksR = ksRankMap.get(team.team);
      return [
        i + 1,
        ksR ?? '',
        team.team,
        ...visibleColumns.map(col => {
          const val = team[col.key];
          if (col.format === 'percent' || col.format === 'breakdownPercent') return val != null ? Math.round(val * 1000) / 10 : 0;
          if (col.format === 'one') return val != null ? Math.round(val * 10) / 10 : 0;
          if (col.format === 'three') return val != null ? Math.round(val * 1000) / 1000 : 0;
          return val ?? 0;
        })
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Picklist');
    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picklist_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Format unscored match ──
  const formatUnscoredMatch = (issue) => {
    const matchTypeLabel = ["Practice", "Test", "Qualification", "Playoff"][issue?.matchType] || `Type ${issue?.matchType}`;
    const matchLabel = issue?.displayMatch ?? issue?.match ?? "Unknown";
    return `Team ${issue?.team} - ${matchTypeLabel} Match ${matchLabel}: ${issue?.reason || "Missing scout-leads rate."}`;
  };

  // ── Detect group boundaries for separators ──
  const groupStartKeys = useMemo(() => {
    const starts = new Set();
    let lastGroup = null;
    for (const col of visibleColumns) {
      if (col.group && col.group !== lastGroup) {
        starts.add(col.key);
        lastGroup = col.group;
      } else if (!col.group) {
        lastGroup = null;
      }
    }
    // Remove the very first one since it doesn't need a left border
    const first = visibleColumns[0]?.key;
    starts.delete(first);
    return starts;
  }, [visibleColumns]);

  // ── Guard ──
  if (!isClient) return <div className={styles.loading}>Loading...</div>;

  if (!configLoading && !picklistConfig.weights) {
    return (
      <div className={styles.loading}>
        <h2>Picklist Not Configured</h2>
        <p>Add a &quot;picklist&quot; section to your game config&apos;s display settings.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Unscored matches banner ── */}
      {unscoredMatches.length > 0 && (
        <div className={styles.unscoredBanner}>
          <strong>Unscored matches were skipped.</strong>
          <ul>
            {unscoredMatches.map((issue, index) => (
              <li key={`${issue.team}-${issue.match}-${issue.matchType}-${index}`}>
                {formatUnscoredMatch(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Scatter Plot ── */}
      {axisOptions.length > 0 && (
        <div className={styles.scatterCard}>
          <div className={styles.scatterAxisRow}>
            <label className={styles.scatterAxisLabel}>
              X Axis
              <select className={styles.scatterAxisSelect} value={scatterX} onChange={e => setScatterX(e.target.value)}>
                <option value="team">Team Number</option>
                {axisOptions.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </label>
            <label className={styles.scatterAxisLabel}>
              Y Axis
              <select className={styles.scatterAxisSelect} value={scatterY} onChange={e => setScatterY(e.target.value)}>
                <option value="team">Team Number</option>
                {axisOptions.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </label>
          </div>
          <TeamScatterPlot
            teamData={scatterData}
            isAuthenticated={isAuthenticated}
            xLabel={resolveAxisLabel(scatterX)}
            yLabel={resolveAxisLabel(scatterY)}
          />
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh Data'}
        </button>

        {/* Column toggle */}
        <div className={styles.columnToggleWrapper} ref={columnToggleRef}>
          <button
            className={`${styles.toolbarBtn} ${columnDropdownOpen ? styles.toolbarBtnActive : ''}`}
            onClick={() => setColumnDropdownOpen(p => !p)}
          >
            Columns
          </button>
          {columnDropdownOpen && (
            <div className={styles.columnDropdown}>
              {[...columnGroups.entries()].map(([group, cols]) => (
                <div key={group}>
                  <div className={styles.columnGroupLabel}>{group}</div>
                  {cols.map(col => (
                    <label key={col.key} className={styles.columnCheckRow}>
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className={styles.toolbarBtn} onClick={exportXLSX} disabled={!teamData.length}>
          Export XLSX
        </button>

        {lastUpdated && (
          <span className={styles.lastUpdated}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Main content: K/S panel + rank table ── */}
      <div className={styles.mainContent}>
        {/* ── Keep/Swap Panel ── */}
        <div className={styles.ksPanel}>
          <div className={styles.ksHeader}>
            <h2>Keep / Swap</h2>
            {ksActive && <button className={styles.ksResetBtn} onClick={ksReset}>Reset</button>}
          </div>

          {!ksActive ? (
            <div style={{ padding: '12px 16px' }}>
              <button className={styles.ksBeginBtn} onClick={ksBegin} disabled={!teamData.length}>
                Begin Keep/Swap
              </button>
              {ksList.length > 0 && (
                <button className={styles.ksResumeBtn} onClick={() => setKsActive(true)}>
                  Resume Previous
                </button>
              )}
            </div>
          ) : (
            <>
              <div className={styles.ksControls}>
                {ksComplete && !manualPair ? (
                  <div className={styles.ksCompleteLabel}>Keep/Swap Complete</div>
                ) : ksCurrentPair ? (
                  <div className={styles.ksPairLabel}>
                    {manualPair ? 'Manual: ' : 'Comparing: '}
                    <span className={styles.ksPairTeams}>{ksCurrentPair[0]}</span> vs <span className={styles.ksPairTeams}>{ksCurrentPair[1]}</span>
                  </div>
                ) : null}
                <div className={styles.ksButtonRow}>
                  <button className={`${styles.ksBtn} ${styles.ksBtnKeep}`} onClick={manualPair ? ksManualKeep : ksKeep} disabled={!ksCurrentPair || ksComplete}>Keep</button>
                  <button className={`${styles.ksBtn} ${styles.ksBtnSwap}`} onClick={manualPair ? ksManualSwap : ksSwap} disabled={!ksCurrentPair || ksComplete}>Swap</button>
                  {manualPair && (
                    <button className={`${styles.ksBtn} ${styles.ksBtnUndo}`} onClick={() => { ksUndo(); setManualPair(null); }}>Cancel</button>
                  )}
                  {!manualPair && <button className={`${styles.ksBtn} ${styles.ksBtnUndo}`} onClick={ksUndo} disabled={!ksHistory.length}>Undo</button>}
                  {!manualPair && <button className={`${styles.ksBtn} ${styles.ksBtnRedo}`} onClick={ksRedo} disabled={!ksRedoStack.length}>Redo</button>}
                  <button
                    className={`${styles.ksBtn} ${styles.ksBtnFocus} ${ksFocusMode ? styles.ksBtnFocusActive : ''}`}
                    onClick={() => setKsFocusMode(p => !p)}
                    title="Focus mode: dim other teams"
                  >
                    {ksFocusMode ? '\u25C9' : '\u25CE'}
                  </button>
                </div>
                <div className={styles.ksButtonRow} style={{ marginTop: '6px' }}>
                  <button className={`${styles.ksBtn} ${styles.ksBtnUndo}`} onClick={ksSyncToRankOrder} title="Reset list to current rank table order">
                    Sync to Rank
                  </button>
                </div>
              </div>

              {/* K/S list */}
              <div className={styles.ksList}>
                {ksList.map((team, i) => {
                  const isInPair = ksCurrentPair && (team === ksCurrentPair[0] || team === ksCurrentPair[1]);
                  const isDimmed = ksFocusMode && ksCurrentPair && !isInPair;
                  const td = teamDataMap.get(team);
                  const pprLabel = usePPR ? 'PPR' : 'EPA';
                  const pprVal = td?.realEpa != null ? (Math.round(td.realEpa * 10) / 10) : '?';
                  return (
                    <div
                      key={team}
                      className={`${styles.ksItem} ${isInPair ? styles.ksItemActive : ''} ${isDimmed ? styles.ksItemDimmed : ''}`}
                    >
                      <span className={styles.ksItemRank}>{i + 1}</span>
                      <span className={styles.ksItemTeam}>{team}</span>
                      <span className={styles.ksItemStat}>{pprLabel}: {pprVal}</span>
                    </div>
                  );
                })}
              </div>

              {/* Manual compare */}
              <div className={styles.ksManualRow}>
                <label>Compare:</label>
                <input className={styles.ksManualInput} type="number" placeholder="Team" value={manualTeamA} onChange={e => setManualTeamA(e.target.value)} />
                <span className={styles.ksVsLabel}>vs</span>
                <input className={styles.ksManualInput} type="number" placeholder="Team" value={manualTeamB} onChange={e => setManualTeamB(e.target.value)} />
                <button className={styles.ksManualBtn} onClick={ksManualCompare}>Go</button>
              </div>
            </>
          )}
        </div>

        {/* ── Rank Table ── */}
        <div className={styles.rankTableOuter}>
          {loading && !teamData.length ? (
            <div className={styles.loading}>Loading picklist data...</div>
          ) : !teamData.length ? (
            <div className={styles.loading}>No data available. Check authentication and game config.</div>
          ) : (
            <>
              {/* Frozen header */}
              <div className={styles.rankHeaderSticky} ref={headerScrollRef}>
                <table className={styles.rankTable} style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '44px' }} />
                    <col style={{ width: '44px' }} />
                    <col style={{ width: '60px' }} />
                    {visibleColumns.map(col => (
                      <col key={col.key} style={{ width: '100px' }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={`${styles.thFixed} ${styles.frozenCol1}`} style={{ cursor: 'default' }}>#</th>
                      <th
                        className={`${styles.thFixed} ${styles.frozenCol2} ${effectiveSortKey === '__ksRank' ? styles.thActive : ''}`}
                        onClick={() => handleSort('__ksRank')}
                        title="Sort by Keep/Swap rank"
                      >
                        K/S
                        {effectiveSortKey === '__ksRank' && (
                          <span className={styles.thSortArrow}>{effectiveSortDir === 'desc' ? '\u25BC' : '\u25B2'}</span>
                        )}
                      </th>
                      <th className={`${styles.thFixed} ${styles.frozenCol3}`} style={{ cursor: 'default' }}>Team</th>
                      {visibleColumns.map(col => (
                        <th
                          key={col.key}
                          className={`${effectiveSortKey === col.key ? styles.thActive : ''} ${groupStartKeys.has(col.key) ? styles.groupSep : ''}`}
                          onClick={() => handleSort(col.key)}
                        >
                          {col.label}
                          {effectiveSortKey === col.key && (
                            <span className={styles.thSortArrow}>{effectiveSortDir === 'desc' ? '\u25BC' : '\u25B2'}</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
              {/* Scrollable body */}
              <div className={styles.rankBodyScroll} ref={bodyScrollRef}>
                <table className={styles.rankTable} style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '44px' }} />
                    <col style={{ width: '44px' }} />
                    <col style={{ width: '60px' }} />
                    {visibleColumns.map(col => (
                      <col key={col.key} style={{ width: '100px' }} />
                    ))}
                  </colgroup>
                  <tbody>
                    {sortedTeamData.map((teamRow, idx) => {
                      const isInPair = ksActive && ksCurrentPair && (teamRow.team === ksCurrentPair[0] || teamRow.team === ksCurrentPair[1]);
                      const isDimmed = ksActive && ksFocusMode && ksCurrentPair && !isInPair;
                      return (
                        <tr
                          key={teamRow.team}
                          className={`${isInPair ? styles.rankRowHighlight : ''} ${isDimmed ? styles.rankRowDimmed : ''}`}
                        >
                          <td className={`${styles.rankCol} ${styles.frozenCol1}`}>{idx + 1}</td>
                          <td className={`${styles.rankCol} ${styles.rankColKs} ${styles.frozenCol2}`}>
                            {ksRankMap.get(teamRow.team) ?? '\u2014'}
                          </td>
                          <td className={`${styles.teamCol} ${styles.frozenCol3}`}>
                            <a href={`/team-view?team=${teamRow.team}`} target="_blank" rel="noopener noreferrer">{teamRow.team}</a>
                          </td>
                          {visibleColumns.map(col => (
                            <td
                              key={col.key}
                              className={`${styles.metricCell} ${groupStartKeys.has(col.key) ? styles.groupSep : ''}`}
                              style={{ backgroundColor: getColor(col, teamRow) }}
                            >
                              {formatValue(col, teamRow)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
