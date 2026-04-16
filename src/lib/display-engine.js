/**
 * Display Engine - Config-driven data aggregation for display pages
 * Replaces all hardcoded field references in API routes
 */

import { tidy, mutate, mean, select, summarizeAll, groupBy, summarize, first, arrange, asc, desc, max } from '@tidyjs/tidy';
import { getAllFields } from './form-renderer.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeAverage(arr, key) {
  const vals = arr.map(r => r[key]).filter(v => typeof v === 'number' && !isNaN(v));
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function computePercentage(arr, key, value) {
  if (!arr.length) return 0;
  return arr.filter(r => r[key] === value).length / arr.length;
}

function computeSuccessRate(rows, successFields, failFields) {
  let totalSuccess = 0, totalAttempts = 0;
  rows.forEach(row => {
    const s = successFields.reduce((sum, f) => sum + (Number(row[f]) || 0), 0);
    const fail = failFields.reduce((sum, f) => sum + (Number(row[f]) || 0), 0);
    totalSuccess += s;
    totalAttempts += s + fail;
  });
  return totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;
}

function sumFields(row, fields) {
  return fields.reduce((sum, f) => sum + (Number(row[f]) || 0), 0);
}

function groupCommentsByMatch(rows, field) {
  const byMatch = {};
  rows.forEach(row => {
    const val = row[field];
    if (val && typeof val === 'string' && val.trim()) {
      if (!byMatch[row.match]) byMatch[row.match] = [];
      byMatch[row.match].push(val);
    }
  });
  return Object.entries(byMatch).map(([match, comments]) =>
    ` *Match ${match}: ${comments.join(' -- ')}*`
  );
}

function bucketSingleSelectField(rows, fieldConfig) {
  if (!fieldConfig) return {};
  const { field, valueMapping } = fieldConfig;
  const buckets = {};
  Object.values(valueMapping).forEach(k => { buckets[k] = 0; });

  // Group by match, take mode of field per match
  const matchGroups = {};
  rows.forEach(row => {
    const m = row.match;
    if (m == null) return;
    if (!matchGroups[m]) matchGroups[m] = [];
    matchGroups[m].push(row);
  });

  Object.values(matchGroups).forEach(matchRows => {
    const freq = {};
    matchRows.forEach(row => {
      const val = Number(row[field]);
      if (!isNaN(val)) freq[val] = (freq[val] || 0) + 1;
    });
    let mode = null, maxCount = 0;
    Object.entries(freq).forEach(([v, c]) => {
      if (c > maxCount) { maxCount = c; mode = v; }
    });
    const key = valueMapping[String(mode)];
    if (key && buckets[key] !== undefined) buckets[key]++;
  });

  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  if (total === 0) return buckets;

  const result = {};
  Object.entries(buckets).forEach(([k, v]) => {
    result[k] = Math.round((v / total) * 100);
  });
  return result;
}

function standardDeviation(arr, key) {
  const values = arr.map(r => r[key]).filter(v => typeof v === 'number' && !isNaN(v));
  if (values.length === 0) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Team Data Aggregation (for get-team-data) ───────────────────────────────

/**
 * Aggregate raw rows for a single team into the response shape
 * that get-team-data currently returns.
 */
export function aggregateTeamData(rows, config, calcFns) {
  const display = config?.display || {};
  const apiConfig = display.apiAggregation || {};
  const teamViewConfig = display.teamView || {};

  const booleanFields = apiConfig.booleanFields || [];
  const textFields = apiConfig.textFields || [];
  const qualitativeFields = apiConfig.qualitativeFields || [];
  const booleanIntakeFields = apiConfig.booleanIntakeFields || [];
  const commentFields = teamViewConfig.comments || textFields.filter(f => f.includes('comment'));

  // Compute EPA per row
  let teamTable = rows.map(row => ({
    ...row,
    auto: calcFns.calcAuto(row),
    tele: calcFns.calcTele(row),
    end: calcFns.calcEnd(row),
    epa: calcFns.calcEPA(row),
  }));

  // Group by match, average
  function byAveragingNumbers(index) {
    if (booleanFields.includes(index)) {
      return arr => arr.some(row => row[index] === true);
    }
    if (textFields.includes(index)) {
      return arr => arr.map(row => row[index]).filter(a => a != null).join(" - ") || null;
    }
    if (qualitativeFields.includes(index)) {
      return arr => {
        let filtered = arr.filter(row => row[index] != -1 && row[index] != null).map(row => row[index]);
        return filtered.length === 0 ? -1 : filtered.reduce((s, v) => s + v, 0) / filtered.length;
      };
    }
    return arr => {
      const valid = arr.map(r => r[index]).filter(v => typeof v === 'number' && !isNaN(v));
      return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
    };
  }

  // EPA over time per match
  function computeMatchAverages(data, field) {
    const groups = {};
    data.forEach(row => {
      if (!groups[row.match]) groups[row.match] = { sum: 0, count: 0 };
      groups[row.match].sum += row[field];
      groups[row.match].count += 1;
    });
    return Object.entries(groups).map(([match, d]) => ({
      match: parseInt(match),
      [field]: d.sum / d.count,
    })).sort((a, b) => a.match - b.match);
  }

  function computeAvgByMatch(data, field) {
    const avgs = computeMatchAverages(data, field);
    if (avgs.length === 0) return 0;
    return avgs.reduce((s, m) => s + m[field], 0) / avgs.length;
  }

  function computeLast3ByMatch(data, field) {
    const avgs = computeMatchAverages(data, field);
    const last3 = avgs.sort((a, b) => b.match - a.match).slice(0, 3);
    if (last3.length === 0) return 0;
    return last3.reduce((s, m) => s + m[field], 0) / last3.length;
  }

  const matchesScouted = new Set(teamTable.map(r => r.match)).size;

  // Build the core summary
  const team = rows[0]?.team;

  const avgEpa = computeAvgByMatch(teamTable, 'epa');
  const avgAuto = computeAvgByMatch(teamTable, 'auto');
  const avgTele = computeAvgByMatch(teamTable, 'tele');
  const avgEnd = computeAvgByMatch(teamTable, 'end');
  const last3Epa = computeLast3ByMatch(teamTable, 'epa');
  const last3Auto = computeLast3ByMatch(teamTable, 'auto');
  const last3Tele = computeLast3ByMatch(teamTable, 'tele');
  const last3End = computeLast3ByMatch(teamTable, 'end');

  // Build match → scout names map for tooltip display
  const scoutsByMatch = {};
  teamTable.forEach(row => {
    if (row.scoutname && row.scoutname.trim()) {
      if (!scoutsByMatch[row.match]) scoutsByMatch[row.match] = [];
      if (!scoutsByMatch[row.match].includes(row.scoutname)) scoutsByMatch[row.match].push(row.scoutname);
    }
  });

  const epaOverTime = computeMatchAverages(teamTable, 'epa').map(d => ({
    ...d, epa: Math.round(d.epa * 100) / 100,
    scout: (scoutsByMatch[d.match] || []).join(', ') || null,
  }));
  const autoOverTime = computeMatchAverages(teamTable, 'auto').map(d => ({
    ...d, auto: Math.round(d.auto * 100) / 100,
    scout: (scoutsByMatch[d.match] || []).join(', ') || null,
  }));
  const teleOverTime = computeMatchAverages(teamTable, 'tele').map(d => ({
    ...d, tele: Math.round(d.tele * 100) / 100,
    scout: (scoutsByMatch[d.match] || []).join(', ') || null,
  }));
  const endOverTime = computeMatchAverages(teamTable, 'end').map(d => ({
    ...d, end: Math.round(d.end * 100) / 100,
  }));

  // Overlay over time — per-match averages for each epaChartOverlayOptions field
  const overlayOverTime = {};
  (teamViewConfig.epaChartOverlayOptions || []).forEach(opt => {
    if (['auto', 'tele', 'end'].includes(opt.field)) return; // already have dedicated arrays
    const validRows = teamTable.filter(r => r[opt.field] != null && r[opt.field] != -1 && (opt.allowZero || Number(r[opt.field]) > 0));
    if (validRows.length > 0) {
      overlayOverTime[opt.field] = computeMatchAverages(validRows, opt.field).map(d => ({
        match: d.match,
        value: Math.round(d[opt.field] * 100) / 100,
      }));
    }
  });

  // Pass-line data — config-driven from passLine chart entries in teamView sections
  const passLineData = {};
  Object.values(teamViewConfig.sections || {}).forEach(section => {
    (section.charts || []).forEach(chart => {
      if (chart.type === 'passLine' && chart.dataKey && chart.valueKey) {
        passLineData[chart.dataKey] = computeMatchAverages(teamTable, chart.valueKey).map(d => ({
          ...d,
          [chart.valueKey]: Math.round(d[chart.valueKey] * 100) / 100,
        }));
      }
    });
  });

  // Consistency — use config-driven breakdown field
  const uniqueMatches = new Set(teamTable.map(r => r.match));
  const breakdownFieldName = apiConfig.breakdownField || 'breakdown';
  const uniqueBreakdownCount = Array.from(uniqueMatches).filter(match =>
    teamTable.some(r => r.match === match && r[breakdownFieldName] === true)
  ).length;
  const breakdownRate = (uniqueBreakdownCount / uniqueMatches.size) * 100;
  const epaStdDev = standardDeviation(teamTable, 'epa');
  const consistency = 100 - (breakdownRate + epaStdDev);

  // Defense % — use config-driven defense field
  const defenseFieldName = apiConfig.defenseField || 'defense';
  const defenseMatchCount = Array.from(uniqueMatches).filter(match =>
    teamTable.some(r => r.match === match && r[defenseFieldName] === true)
  ).length;
  const defense = (defenseMatchCount / uniqueMatches.size) * 100;

  const breakdown = breakdownRate;
  const lastBreakdown = teamTable.filter(e => e[breakdownFieldName] === true).reduce((a, b) => b.match, "N/A");
  const noShow = computePercentage(teamTable, 'noshow', true);

  const leaveFieldName = apiConfig.leaveField || 'leave';
  const leave = (() => {
    const uniqueLeaveMatches = new Set(teamTable.filter(e => e[leaveFieldName] === true).map(e => e.match));
    return uniqueLeaveMatches.size / uniqueMatches.size || 0;
  })();

  // Comments
  const buildComments = (field) => groupCommentsByMatch(rows, field);

  // Scouts by match
  const scouts = (() => {
    const byMatch = {};
    rows.forEach(row => {
      if (row.scoutname && row.scoutname.trim()) {
        if (!byMatch[row.match]) byMatch[row.match] = [];
        if (!byMatch[row.match].includes(row.scoutname)) byMatch[row.match].push(row.scoutname);
      }
    });
    return Object.entries(byMatch).map(([match, scouts]) =>
      ` *Match ${match}: ${scouts.join(', ')}*`
    );
  })();

  // Piece placement stats (auto/tele coral, algae)
  function buildPhaseStats(phase, coralConfig, algaeConfig) {
    if (!coralConfig) return {};
    const levels = coralConfig.levels || [];
    const autoFields = coralConfig.autoFields || [];
    const teleFields = coralConfig.teleFields || [];
    const autoFailFields = coralConfig.autoFailFields || [];
    const teleFailFields = coralConfig.teleFailFields || [];

    const fields = phase === 'auto' ? autoFields : teleFields;
    const failFieldsArr = phase === 'auto' ? autoFailFields : teleFailFields;

    // Total coral
    const totalSuccess = rows.reduce((sum, row) =>
      sum + fields.reduce((s, f) => s + (Number(row[f]) || 0), 0), 0);
    const total = rows.length ? totalSuccess / rows.length : 0;

    // Overall success rate
    const totalFail = rows.reduce((sum, row) =>
      sum + failFieldsArr.reduce((s, f) => s + (Number(row[f]) || 0), 0), 0);
    const totalAttempts = totalSuccess + totalFail;
    const success = totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0;

    // Per-level stats
    const levelStats = {};
    levels.forEach((level, i) => {
      const field = fields[i];
      const failField = failFieldsArr[i];
      const lKey = level;

      const successes = rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
      const fails = failField ? rows.reduce((sum, row) => sum + (Number(row[failField]) || 0), 0) : 0;
      const attempts = successes + fails;

      levelStats[`avg${lKey}`] = rows.length ? successes / rows.length : 0;
      levelStats[`success${lKey}`] = attempts > 0 ? (successes / attempts) * 100 : 0;
    });

    return { total, success, ...levelStats };
  }

  // Generic metric group stats builder — uses explicit metrics array from config
  function buildMetricGroupStats(phase, groupConfig) {
    if (!groupConfig) return {};
    const fields = phase === 'auto' ? groupConfig.autoFields : groupConfig.teleFields;
    const failFields = phase === 'auto' ? (groupConfig.autoFailFields || []) : (groupConfig.teleFailFields || []);
    const metrics = groupConfig.metrics || [];

    if (!fields || !metrics.length) return {};

    const result = {};
    metrics.forEach(metric => {
      const field = fields[metric.fieldIndex];
      if (!field) return;

      if (metric.type === 'count') {
        // Simple average count
        result[metric.key] = rows.length
          ? rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0) / rows.length
          : 0;
      } else if (metric.type === 'successFail') {
        // Average + success rate
        result[`avg${metric.key}`] = rows.length
          ? rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0) / rows.length
          : 0;
        const failField = failFields[metric.failIndex];
        if (failField) {
          const s = rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
          const f = rows.reduce((sum, row) => sum + (Number(row[failField]) || 0), 0);
          result[`success${metric.key}`] = (s + f) > 0 ? (s / (s + f)) * 100 : 0;
        }
      }
    });

    return result;
  }

  const pp = teamViewConfig.piecePlacement || {};

  // Dynamically build auto/tele stats for all configured groups (e.g. coral, algae, fuel, etc.)
  const autoStats = {};
  const teleStats = {};
  Object.entries(pp).forEach(([groupName, groupConfig]) => {
    if (groupName === 'bars' || typeof groupConfig !== 'object') return;
    // If group has levels (like coral), use buildPhaseStats
    if (groupConfig.levels) {
      autoStats[groupName] = buildPhaseStats('auto', groupConfig, groupConfig);
      teleStats[groupName] = buildPhaseStats('tele', groupConfig, groupConfig);
    }
    // If group has metrics (like algae), use buildMetricGroupStats
    if (groupConfig.metrics) {
      autoStats[groupName] = { ...(autoStats[groupName] || {}), ...buildMetricGroupStats('auto', groupConfig) };
      teleStats[groupName] = { ...(teleStats[groupName] || {}), ...buildMetricGroupStats('tele', groupConfig) };
    }
  });

  // Success/fail pairs from config (e.g. HP, or any custom pair)
  const successFailPairs = apiConfig.successFailPairs || [];
  successFailPairs.forEach(pair => {
    const targetStats = pair.phase === 'auto' ? autoStats : teleStats;
    const avgVal = (() => {
      const valid = rows.filter(r => r[pair.successField] !== null && r[pair.successField] !== undefined);
      return valid.length ? valid.reduce((s, r) => s + (Number(r[pair.successField]) || 0), 0) / valid.length : 0;
    })();
    const successRate = (() => {
      const s = rows.reduce((sum, r) => sum + (Number(r[pair.successField]) || 0), 0);
      const f = rows.reduce((sum, r) => sum + (Number(r[pair.failField]) || 0), 0);
      return (s + f) > 0 ? (s / (s + f)) * 100 : 0;
    })();
    targetStats[`avg${pair.key}`] = avgVal;
    targetStats[`success${pair.key}`] = successRate;
  });

  // Endgame placement (and any other singleSelect distributions)
  const endPlacement = bucketSingleSelectField(rows, apiConfig.endgameConfig);
  const autoClimbPlacement = bucketSingleSelectField(rows, apiConfig.autoclimbConfig);

  // Cage attempt/success
  const endgameStats = teamViewConfig.endgameStats || {};
  const attemptValues = endgameStats.cageAttemptValues || [];
  const successValues = endgameStats.cageSuccessValues || [];
  const endField = apiConfig.endgameConfig?.field || 'endlocation';

  function computeCageStat(rows, field, targetValues) {
    const matchGroups = {};
    rows.forEach(r => {
      if (r.match == null) return;
      if (!matchGroups[r.match]) matchGroups[r.match] = [];
      matchGroups[r.match].push(r);
    });

    return Object.values(matchGroups).map(matchRows => {
      const freq = {};
      matchRows.forEach(r => {
        const v = Number(r[field]);
        if (!isNaN(v)) freq[v] = (freq[v] || 0) + 1;
      });
      let mode = null, maxC = 0;
      Object.entries(freq).forEach(([v, c]) => {
        if (c > maxC) { maxC = c; mode = parseInt(v); }
      });
      return mode;
    });
  }

  const modes = computeCageStat(rows, endField, attemptValues);
  const attemptedMatches = modes.filter(m => attemptValues.includes(m)).length;
  const successfulMatches = modes.filter(m => successValues.includes(m)).length;
  const totalMatchCount = modes.length;
  const attemptCage = totalMatchCount > 0 ? (attemptedMatches / totalMatchCount) * 100 : 0;
  const successCage = attemptedMatches > 0 ? (successfulMatches / attemptedMatches) * 100 : 0;

  // Scouter confidence over time
  const scouterConfidenceField = teamViewConfig.scouterConfidenceField;
  let scouterConfidenceOverTime = [];
  let avgScouterConfidence = null;
  if (scouterConfidenceField) {
    const confRows = rows.filter(r => r[scouterConfidenceField] != null && r[scouterConfidenceField] !== -1);
    scouterConfidenceOverTime = computeMatchAverages(
      confRows.map(r => ({ ...r, [scouterConfidenceField]: Number(r[scouterConfidenceField]) })),
      scouterConfidenceField
    ).map(d => ({ match: d.match, confidence: Math.round(d[scouterConfidenceField] * 100) / 100 }));
    const vals = confRows.map(r => Number(r[scouterConfidenceField]));
    avgScouterConfidence = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
  }

  // Qualitative
  const formFieldByName = Object.fromEntries(getAllFields(config).map(f => [f.name, f]));
  const qualitative = (teamViewConfig.qualitativeDisplay || []).map(q => {
    const validRows = rows.filter(r => r[q.name] != null && r[q.name] != -1);
    const vals = validRows.map(r => Number(r[q.name]));
    let rating = 0;
    if (vals.length) {
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const fieldMax = formFieldByName[q.name]?.max || 6;
      rating = q.inverted ? fieldMax - median : median;
    }
    const entries = validRows.map(r => ({
      scout: r.scoutname || 'Unknown',
      match: r.match,
      rating: Number(r[q.name]),
    }));
    return { name: q.label, rating, section: q.section || null, entries };
  });

  // Boolean intake fields
  const intakeData = {};
  booleanIntakeFields.forEach(field => {
    intakeData[field] = rows.some(r => r[field] === true);
  });

  // Build comments dynamically from config
  const cfgCommentFields = teamViewConfig.commentFields || [];
  const commentData = {};
  cfgCommentFields.forEach(cf => {
    commentData[cf.dataKey] = buildComments(cf.field);
  });
  // Fallback: if no commentFields config, try the comments array
  if (!cfgCommentFields.length && teamViewConfig.comments) {
    teamViewConfig.comments.forEach(field => {
      // Convert field name to camelCase dataKey
      const dataKey = field.replace(/([a-z])([a-z]*)/gi, (_, first, rest, idx) =>
        idx === 0 ? first.toLowerCase() + rest : first.toUpperCase() + rest
      );
      commentData[dataKey] = buildComments(field);
    });
  }

  // imageSelect distributions (config-driven singleSelect-like bucketing)
  const imageSelectResults = {};
  Object.entries(teamViewConfig.sections || {}).forEach(([sectionKey, sectionConfig]) => {
    (sectionConfig.imageSelectDisplay || []).forEach(isd => {
      imageSelectResults[isd.field] = bucketSingleSelectField(rows, isd);
    });
  });

  // Config-driven boolean percent stats per section (e.g. "Beached %")
  const booleanPercents = {};
  Object.values(teamViewConfig.sections || {}).forEach(sectionConfig => {
    (sectionConfig.booleanPercentStats || []).forEach(stat => {
      if (stat && stat.field) {
        booleanPercents[stat.field] = computePercentage(rows, stat.field, true) * 100;
      }
    });
  });

  return {
    team,
    avgEpa, avgAuto, avgTele, avgEnd,
    last3Epa, last3Auto, last3Tele, last3End,
    epaOverTime, autoOverTime, teleOverTime, endOverTime, overlayOverTime,
    ...passLineData,
    consistency, defense, breakdown, lastBreakdown,
    noShow, leave, matchesScouted, scouts,
    ...commentData,
    scouterConfidenceOverTime,
    avgScouterConfidence,
    auto: autoStats,
    tele: teleStats,
    endPlacement,
    autoClimbPlacement,
    attemptCage, successCage,
    qualitative,
    ...intakeData,
    imageSelectResults,
    booleanPercents,
  };
}

// ─── Alliance Data Aggregation (for get-alliance-data) ───────────────────────

/**
 * Aggregate all rows into per-team alliance summaries.
 * Returns { [teamNumber]: teamSummary }
 */
export function aggregateAllianceData(rows, config, calcFns) {
  const display = config?.display || {};
  const apiConfig = display.apiAggregation || {};
  const qualFields = apiConfig.qualitativeFields || [];
  const piecePlacement = apiConfig.alliancePiecePlacement || [];
  const customSumFields = apiConfig.customSumFields || [];
  const leaveField = apiConfig.leaveField || 'leave';
  const endgameConfig = apiConfig.endgameConfig || {};

  const responseObject = {};

  rows.forEach(row => {
    if (row.noshow) return;

    const auto = calcFns.calcAuto(row);
    const tele = calcFns.calcTele(row);
    const end = calcFns.calcEnd(row);

    if (!responseObject[row.team]) {
      // Initialize
      const avgPieces = {};
      piecePlacement.forEach(pp => {
        avgPieces[pp.key] = pp.fields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
      });

      const qualitative = {};
      qualFields.forEach(f => { qualitative[f] = Number(row[f]) || 0; });

      const customSums = {};
      customSumFields.forEach(csf => {
        customSums[csf.key] = csf.fields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
      });

      // Endgame buckets
      const endgame = {};
      if (endgameConfig.valueMapping) {
        Object.values(endgameConfig.valueMapping).forEach(k => { endgame[k] = 0; });
        const val = Number(row[endgameConfig.field]);
        const key = endgameConfig.valueMapping[String(val)];
        if (key) endgame[key] = 1;
      }

      responseObject[row.team] = {
        team: row.team,
        teamName: "",
        auto, tele, end,
        avgPieces,
        leave: row[leaveField],
        customSums,
        endgame,
        qualitative,
      };
    } else {
      const td = responseObject[row.team];
      td.auto += auto;
      td.tele += tele;
      td.end += end;

      piecePlacement.forEach(pp => {
        td.avgPieces[pp.key] += pp.fields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
      });

      customSumFields.forEach(csf => {
        td.customSums[csf.key] += csf.fields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
      });

      if (endgameConfig.valueMapping) {
        const val = Number(row[endgameConfig.field]);
        const key = endgameConfig.valueMapping[String(val)];
        if (key && td.endgame[key] !== undefined) td.endgame[key]++;
      }

      qualFields.forEach(f => { td.qualitative[f] += Number(row[f]) || 0; });
    }
  });

  // Calculate averages
  const average = (value, count) => (count > 0 ? Math.round((value / count) * 10) / 10 : 0);

  for (const team in responseObject) {
    const td = responseObject[team];
    const count = rows.filter(r => r.team === parseInt(team)).length;

    td.auto = average(td.auto, count);
    td.tele = average(td.tele, count);
    td.end = average(td.end, count);

    Object.keys(td.avgPieces).forEach(k => {
      td.avgPieces[k] = average(td.avgPieces[k], count);
    });

    Object.keys(td.customSums).forEach(k => {
      td.customSums[k] = average(td.customSums[k], count);
    });

    // Convert endgame counts to percentages
    const locationSum = Object.values(td.endgame).reduce((s, v) => s + v, 0);
    if (locationSum > 0) {
      Object.keys(td.endgame).forEach(k => {
        td.endgame[k] = Math.round((100 * td.endgame[k]) / locationSum);
      });
    } else {
      const keys = Object.keys(td.endgame);
      if (keys.length > 0) {
        keys.forEach(k => { td.endgame[k] = k === 'none' ? 100 : 0; });
      }
    }

    qualFields.forEach(f => {
      td.qualitative[f] = average(td.qualitative[f], count);
    });
  }

  // Last 3 EPA
  Object.keys(responseObject).forEach(team => {
    const teamRows = rows
      .filter(r => String(r.team) === String(team) && !r.noshow)
      .map(r => ({
        ...r,
        auto: calcFns.calcAuto(r),
        tele: calcFns.calcTele(r),
        end: calcFns.calcEnd(r),
        epa: calcFns.calcEPA(r),
      }))
      .sort((a, b) => a.match - b.match);

    const last3 = teamRows.slice(-3);
    const avg = (arr, field) => {
      if (arr.length === 0) return 0;
      return Math.round((arr.reduce((s, r) => s + (r[field] || 0), 0) / arr.length) * 10) / 10;
    };

    responseObject[team].last3Auto = avg(last3, "auto");
    responseObject[team].last3Tele = avg(last3, "tele");
    responseObject[team].last3End = avg(last3, "end");
    responseObject[team].last3EPA = avg(last3, "epa");

    responseObject[team].epaOverTime = teamRows.map(r => ({
      match: r.match,
      epa: Math.round(r.epa * 10) / 10,
    }));

    const computeOverTimeForField = (arr, field) => {
      const groups = {};
      arr.forEach(r => {
        if (!groups[r.match]) groups[r.match] = { sum: 0, count: 0 };
        groups[r.match].sum += r[field] || 0;
        groups[r.match].count += 1;
      });
      return Object.entries(groups).map(([match, d]) => ({
        match: parseInt(match),
        [field]: Math.round((d.sum / d.count) * 100) / 100,
      })).sort((a, b) => a.match - b.match);
    };

    responseObject[team].autoOverTime = computeOverTimeForField(teamRows, 'auto');
    responseObject[team].teleOverTime = computeOverTimeForField(teamRows, 'tele');
    responseObject[team].endOverTime = computeOverTimeForField(teamRows, 'end');

    const overlayOverTime = {};
    const overlayOptions = config?.display?.teamView?.epaChartOverlayOptions || [];
    overlayOptions.forEach(opt => {
      if (['auto', 'tele', 'end'].includes(opt.field)) return;
      const validRows = teamRows.filter(r => r[opt.field] != null && r[opt.field] != -1 && (opt.allowZero || Number(r[opt.field]) > 0));
      if (validRows.length > 0) {
        const groups = {};
        validRows.forEach(r => {
          if (!groups[r.match]) groups[r.match] = { sum: 0, count: 0 };
          groups[r.match].sum += Number(r[opt.field]) || 0;
          groups[r.match].count += 1;
        });
        overlayOverTime[opt.field] = Object.entries(groups).map(([match, d]) => ({
          match: parseInt(match),
          value: Math.round((d.sum / d.count) * 100) / 100,
        })).sort((a, b) => a.match - b.match);
      }
    });
    responseObject[team].overlayOverTime = overlayOverTime;
  });

  return responseObject;
}

// ─── Picklist Metrics (for compute-picklist) ─────────────────────────────────

/**
 * Compute picklist metrics from raw rows using config-driven definitions.
 * Returns the same shape as the current compute-picklist route.
 */
export function computePicklistMetrics(rows, config, calcFns, weightEntries) {
  const display = config?.display || {};
  const picklistConfig = display.picklist || {};
  const apiConfig = display.apiAggregation || {};
  const computedMetrics = picklistConfig.computedMetrics || [];
  const defenseField = picklistConfig.defenseField || 'defenseplayed';

  // Average numerical fields, handle exceptions
  const booleanFields = apiConfig.booleanFields || [];
  const textFields = apiConfig.textFields || [];

  function averageField(index) {
    if (booleanFields.includes(index)) return arr => arr.some(row => row[index] === true);
    if (textFields.includes(index)) return arr => arr.map(row => row[index]).join(', ');
    const validValues = arr => arr.map(row => row[index]).filter(val => val != null && !isNaN(val));
    return arr => validValues(arr).length > 0
      ? validValues(arr).reduce((sum, v) => sum + v, 0) / validValues(arr).length
      : 0;
  }

  let teamTable = tidy(rows, groupBy(['team', 'match'], [summarizeAll(averageField)]));

  // Build a map INCLUDING noshow rows (needed for booleanRateAll metrics like noshowRate)
  const allTeamMatchesByTeam = new Map();
  for (const row of teamTable) {
    const list = allTeamMatchesByTeam.get(row.team);
    if (list) list.push(row);
    else allTeamMatchesByTeam.set(row.team, [row]);
  }

  teamTable = teamTable.filter(dr => !dr.noshow);

  let teamMatchData = teamTable;
  // Pre-compute per-team match lists once to avoid O(N×M) filtering in each mutator
  const teamMatchesByTeam = new Map();
  for (const row of teamMatchData) {
    const list = teamMatchesByTeam.get(row.team);
    if (list) list.push(row);
    else teamMatchesByTeam.set(row.team, [row]);
  }
  teamTable = tidy(teamTable, groupBy(['team'], [summarizeAll(averageField)]));

  // Compute calc-based metrics
  teamTable = tidy(teamTable, mutate({
    auto: d => calcFns.calcAuto(d),
    tele: d => calcFns.calcTele(d),
    end: d => calcFns.calcEnd(d),
    epa: d => calcFns.calcEPA(d),
  }));

  // Compute dynamic metrics from config
  const mutators = {};
  computedMetrics.forEach(metric => {
    if (metric.type === 'endgameMapping') {
      mutators[metric.key] = d => {
        const val = Math.round(d[metric.field] ?? 0);
        return metric.mapping[String(val)] ?? metric.default ?? 0;
      };
    } else if (metric.type === 'sumFields') {
      mutators[metric.key] = d => metric.fields.reduce((s, f) => s + (d[f] || 0), 0);
    } else if (metric.type === 'successRate') {
      mutators[metric.key] = d => {
        const success = metric.successFields.reduce((s, f) => s + (d[f] || 0), 0);
        const fail = metric.failFields.reduce((s, f) => s + (d[f] || 0), 0);
        return (success + fail) > 0 ? (success / (success + fail)) * 100 : 0;
      };
    } else if (metric.type === 'averageFields') {
      mutators[metric.key] = d => {
        const vals = (metric.fields || []).map(f => d[f]).filter(v => v != null);
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      };
    } else if (metric.type === 'booleanRate') {
      mutators[metric.key] = d => {
        const teamMatches = teamMatchesByTeam.get(d.team) || [];
        const trueCount = teamMatches.filter(m => m[metric.field] === true).length;
        return teamMatches.length > 0 ? trueCount / teamMatches.length : 0;
      };
    } else if (metric.type === 'booleanRateAll') {
      // Like booleanRate but includes noshow matches (for computing noshow % itself)
      mutators[metric.key] = d => {
        const allMatches = allTeamMatchesByTeam.get(d.team) || [];
        const trueCount = allMatches.filter(m => m[metric.field] === true).length;
        return allMatches.length > 0 ? trueCount / allMatches.length : 0;
      };
    } else if (metric.type === 'maxField') {
      mutators[metric.key] = d => {
        const teamMatches = teamMatchesByTeam.get(d.team) || [];
        if (!teamMatches.length) return 0;
        const fn = calcFns[metric.calcFn];
        return Math.max(...teamMatches.map(m => fn(m)));
      };
    } else if (metric.type === 'minField') {
      mutators[metric.key] = d => {
        const teamMatches = teamMatchesByTeam.get(d.team) || [];
        if (!teamMatches.length) return 0;
        const fn = calcFns[metric.calcFn];
        return Math.min(...teamMatches.map(m => fn(m)));
      };
    } else if (metric.type === 'fieldValueRate') {
      // Percentage of matches where a field equals a specific value
      mutators[metric.key] = d => {
        const teamMatches = teamMatchesByTeam.get(d.team) || [];
        if (!teamMatches.length) return 0;
        const count = teamMatches.filter(m => Math.round(m[metric.field] ?? -1) === metric.value).length;
        return count / teamMatches.length;
      };
    }
  });

  // Consistency
  mutators.consistency = d => {
    const teamMatches = teamMatchesByTeam.get(d.team) || [];
    // Use configurable metric key for consistency, default to first successRate metric
    const consistencyKey = display.picklist?.consistencyMetricKey
      || (computedMetrics.find(m => m.type === 'successRate')?.key);
    const consistencyMetric = consistencyKey ? computedMetrics.find(m => m.key === consistencyKey) : null;
    const autoSuccess = consistencyMetric?.successFields || [];
    const autoFail = consistencyMetric?.failFields || [];
    const allSuccess = autoSuccess.reduce((s, f) => s + (d[f] || 0), 0);
    const allFail = autoFail.reduce((s, f) => s + (d[f] || 0), 0);
    const totalAttempts = allSuccess + allFail;
    const successRate = totalAttempts > 0 ? (allSuccess / totalAttempts) * 100 : 0;

    const endgameConfig = apiConfig.endgameConfig || {};
    const endVal = Math.round(d[endgameConfig.field] ?? 0);
    const successEndValues = display.teamView?.endgameStats?.cageSuccessValues || [];
    const endgameSuccess = successEndValues.includes(endVal) ? 1 : 0;

    const noShowPenalty = d.noshow ? 0 : 1;
    // Use config breakdownField instead of hardcoded breakdowncomments
    const breakdownFieldName = apiConfig.breakdownField || 'breakdown';
    const breakdownPenalty = d[breakdownFieldName] === true ? 0.8 : 1;

    const metrics = [successRate, endgameSuccess * 100, noShowPenalty * 100];
    const baseConsistency = metrics.reduce((s, v) => s + v, 0) / metrics.length;
    return baseConsistency * breakdownPenalty;
  };

  // Defense
  mutators.defense = d => {
    const teamMatches = teamMatchesByTeam.get(d.team) || [];
    const validRatings = teamMatches.filter(r => {
      const val = r[defenseField];
      return val !== undefined && val !== null && val > 0;
    });
    if (validRatings.length > 0) {
      return validRatings.reduce((s, r) => s + r[defenseField], 0) / validRatings.length;
    }
    return d[defenseField] || 0;
  };

  // Breakdown
  mutators.breakdown = d => {
    const teamMatches = teamMatchesByTeam.get(d.team) || [];
    const total = teamMatches.length;
    const breakdownFieldName = apiConfig.breakdownField || 'breakdown';
    const breakdowns = teamMatches.filter(m =>
      m[breakdownFieldName] === true
    ).length;
    return total > 0 ? breakdowns / total : 0;
  };

  // EPA last 3
  mutators.epa3 = d => {
    const teamMatches = teamMatchesByTeam.get(d.team) || [];
    const latest3 = teamMatches.sort((a, b) => b.match - a.match).slice(0, 3);
    if (latest3.length === 0) return 0;
    return latest3.map(m => calcFns.calcEPA(m)).reduce((s, v) => s + v, 0) / latest3.length;
  };

  teamTable = tidy(teamTable, mutate(mutators));

  // Select fields for output.
  // NOTE: real* variants (realEpa, realTrenchRate, etc.) are created by the normalization
  // mutate AFTER this select, so we must include only the base keys here.
  // Map any real{Key} scatter field back to its base key so normalization can create it.
  const scatterFieldDefs = picklistConfig.scatterFields || [];
  const scatterBaseKeys = scatterFieldDefs
    .map(sf => sf.key)
    .filter(k => k !== 'team')
    .map(k => (k.startsWith('real') && k.length > 4)
      ? k.charAt(4).toLowerCase() + k.slice(5)
      : k);
  const selectFields = [...new Set([
    'team', 'match', 'auto', 'tele', 'end', 'epa', 'epa3', 'consistency', 'defense', 'breakdown',
    ...computedMetrics.map(m => m.key),
    ...scatterBaseKeys,
  ])];
  teamTable = tidy(teamTable, select(selectFields));

  // Metrics that have custom normalization (or none) and must be excluded from the generic real* pass
  const unnormalizedMetricKeys = ['consistency', 'defense', 'breakdown',
    ...computedMetrics.filter(m => m.normalize === false).map(m => m.key)
  ];

  // Normalize and score
  const maxes = tidy(teamTable, summarizeAll(max))[0];

  teamTable = tidy(teamTable, mutate({
    realAuto: d => d.auto,
    auto: d => maxes.auto ? d.auto / maxes.auto : 0,
    realTele: d => d.tele,
    tele: d => maxes.tele ? d.tele / maxes.tele : 0,
    realEnd: d => d.end,
    end: d => maxes.end ? d.end / maxes.end : 0,
    realEpa: d => d.epa,
    epa: d => maxes.epa ? d.epa / maxes.epa : 0,
    realEpa3: d => d.epa3,
    epa3: d => maxes.epa3 ? d.epa3 / maxes.epa3 : 0,
    realConsistency: d => d.consistency,
    consistency: d => maxes.consistency ? d.consistency / maxes.consistency : 0,
    realDefense: d => d.defense,
    defense: d => maxes.defense ? d.defense / maxes.defense : 0,
    breakdown: d => d.breakdown,
    ...Object.fromEntries(computedMetrics
      .filter(m => !unnormalizedMetricKeys.includes(m.key))
      .map(m => {
        const realKey = `real${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`;
        return [
          [realKey, d => d[m.key]],
          [m.key, d => maxes[m.key] ? d[m.key] / maxes[m.key] : 0],
        ];
      }).flat()),
    // Unnormalized computed metrics: create real* aliases so tableColumns can reference them
    ...Object.fromEntries(computedMetrics
      .filter(m => m.normalize === false)
      .map(m => {
        const realKey = `real${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`;
        return [realKey, d => d[m.key]];
      })),
    score: d => weightEntries.reduce((sum, [key, weight]) => {
      const value = d[key] ?? 0;
      if (key === 'breakdown') return sum + ((1 - value) * parseFloat(weight));
      return sum + (value * parseFloat(weight));
    }, 0),
  }));

  // Compute absolute score using real (un-normalized) values
  const realKeyMap = {
    auto: 'realAuto', tele: 'realTele', end: 'realEnd',
    epa: 'realEpa', epa3: 'realEpa3',
    consistency: 'realConsistency', defense: 'realDefense',
    breakdown: 'breakdown',
    ...Object.fromEntries(computedMetrics
      .filter(m => !unnormalizedMetricKeys.includes(m.key))
      .map(m => [m.key, `real${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`])),
    ...Object.fromEntries(computedMetrics
      .filter(m => m.normalize === false)
      .map(m => [m.key, `real${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`])),
  };
  teamTable = tidy(teamTable, mutate({
    absoluteScore: d => weightEntries.reduce((sum, [key, weight]) => {
      const realKey = realKeyMap[key] ?? key;
      const value = d[realKey] ?? d[key] ?? 0;
      if (key === 'breakdown') return sum + ((1 - value) * parseFloat(weight));
      return sum + (value * parseFloat(weight));
    }, 0),
  }), arrange(desc('score')));

  return teamTable;
}

// ─── Scatter Plot Data ───────────────────────────────────────────────────────

/**
 * Compute scatter plot data from raw rows using config-driven axis definitions
 */
export function computeScatterData(rows, config) {
  const display = config?.display || {};
  const scatter = display.picklist?.scatterPlot;
  if (!scatter) return [];

  const xFields = scatter.xAxis?.fields || [];
  const yFields = scatter.yAxis?.fields || [];

  const teamMap = {};
  rows.forEach(row => {
    if (!row || !row.team) return;
    if (!teamMap[row.team]) {
      teamMap[row.team] = { team: row.team, totalX: 0, totalY: 0, matches: 0 };
    }
    teamMap[row.team].totalX += xFields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
    teamMap[row.team].totalY += yFields.reduce((s, f) => s + (Number(row[f]) || 0), 0);
    teamMap[row.team].matches += 1;
  });

  return Object.values(teamMap)
    .filter(t => t.matches > 0)
    .map(t => ({ team: t.team, x: t.totalX, y: t.totalY, z: t.matches }));
}
