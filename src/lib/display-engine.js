/**
 * Display Engine - Config-driven data aggregation for display pages
 * Replaces all hardcoded field references in API routes
 */

import { tidy, mutate, mean, select, summarizeAll, groupBy, summarize, first, arrange, asc, desc, max } from '@tidyjs/tidy';

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

function bucketEndgame(rows, config) {
  if (!config?.endgameConfig) return {};
  const { field, valueMapping } = config.endgameConfig;
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

  const epaOverTime = computeMatchAverages(teamTable, 'epa').map(d => ({
    ...d, epa: Math.round(d.epa * 100) / 100
  }));
  const autoOverTime = computeMatchAverages(teamTable, 'auto').map(d => ({
    ...d, auto: Math.round(d.auto * 100) / 100
  }));
  const teleOverTime = computeMatchAverages(teamTable, 'tele').map(d => ({
    ...d, tele: Math.round(d.tele * 100) / 100
  }));

  // Consistency
  const uniqueMatches = new Set(teamTable.map(r => r.match));
  const uniqueBreakdownCount = Array.from(uniqueMatches).filter(match =>
    teamTable.some(r => r.match === match && r.breakdowncomments !== null)
  ).length;
  const breakdownRate = (uniqueBreakdownCount / uniqueMatches.size) * 100;
  const epaStdDev = standardDeviation(teamTable, 'epa');
  const consistency = 100 - (breakdownRate + epaStdDev);

  // Defense %
  const defenseMatchCount = Array.from(uniqueMatches).filter(match =>
    teamTable.some(r => r.match === match && r.defensecomments !== null)
  ).length;
  const defense = (defenseMatchCount / uniqueMatches.size) * 100;

  const breakdown = breakdownRate;
  const lastBreakdown = teamTable.filter(e => e.breakdowncomments !== null).reduce((a, b) => b.match, "N/A");
  const noShow = computePercentage(teamTable, 'noshow', true);

  const leave = (() => {
    const uniqueLeaveMatches = new Set(teamTable.filter(e => e.leave === true).map(e => e.match));
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

  function buildAlgaeStats(phase, algaeConfig) {
    if (!algaeConfig) return {};
    const fields = phase === 'auto' ? algaeConfig.autoFields : algaeConfig.teleFields;
    const failFields = phase === 'auto' ? (algaeConfig.autoFailFields || []) : (algaeConfig.teleFailFields || []);

    const result = {};
    // removed field (if it contains "removed")
    const removedField = fields.find(f => f.includes('removed'));
    if (removedField) {
      result.removed = rows.length ? rows.reduce((sum, row) => sum + (Number(row[removedField]) || 0), 0) / rows.length : 0;
    }

    // processor field
    const procField = fields.find(f => f.includes('processor'));
    if (procField) {
      result.avgProcessor = rows.length ? rows.reduce((sum, row) => sum + (Number(row[procField]) || 0), 0) / rows.length : 0;
      const procFail = failFields.find(f => f.includes('processor'));
      if (procFail) {
        const s = rows.reduce((sum, row) => sum + (Number(row[procField]) || 0), 0);
        const f = rows.reduce((sum, row) => sum + (Number(row[procFail]) || 0), 0);
        result.successProcessor = (s + f) > 0 ? (s / (s + f)) * 100 : 0;
      }
    }

    // net field
    const netField = fields.find(f => f.includes('net') && !f.includes('removed'));
    if (netField) {
      result.avgNet = rows.length ? rows.reduce((sum, row) => sum + (Number(row[netField]) || 0), 0) / rows.length : 0;
      const netFail = failFields.find(f => f.includes('net'));
      if (netFail) {
        const s = rows.reduce((sum, row) => sum + (Number(row[netField]) || 0), 0);
        const f = rows.reduce((sum, row) => sum + (Number(row[netFail]) || 0), 0);
        result.successNet = (s + f) > 0 ? (s / (s + f)) * 100 : 0;
      }
    }

    return result;
  }

  const pp = teamViewConfig.piecePlacement || {};
  const coralConfig = pp.coral;
  const algaeConfig = pp.algae;

  const autoStats = {
    coral: buildPhaseStats('auto', coralConfig, algaeConfig),
    algae: buildAlgaeStats('auto', algaeConfig),
  };
  const teleStats = {
    coral: buildPhaseStats('tele', coralConfig, algaeConfig),
    algae: buildAlgaeStats('tele', algaeConfig),
  };

  // HP stats (tele only, look for "hp" fields)
  const hpSuccessField = 'hpsuccess';
  const hpFailField = 'hpfail';
  const avgHp = (() => {
    const valid = rows.filter(r => r[hpSuccessField] !== null && r[hpSuccessField] !== undefined);
    return valid.length ? valid.reduce((s, r) => s + (Number(r[hpSuccessField]) || 0), 0) / valid.length : 0;
  })();
  const successHp = (() => {
    const s = rows.reduce((sum, r) => sum + (Number(r[hpSuccessField]) || 0), 0);
    const f = rows.reduce((sum, r) => sum + (Number(r[hpFailField]) || 0), 0);
    return (s + f) > 0 ? (s / (s + f)) * 100 : 0;
  })();
  teleStats.avgHp = avgHp;
  teleStats.successHp = successHp;

  // Endgame placement
  const endPlacement = bucketEndgame(rows, apiConfig);

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

  // Qualitative
  const qualitative = (teamViewConfig.qualitativeDisplay || []).map(q => {
    const vals = rows.filter(r => r[q.name] != null && r[q.name] != -1).map(r => Number(r[q.name]));
    let rating = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    if (q.inverted) rating = (q.max || 5) - rating;
    return { name: q.label, rating };
  });

  // Boolean intake fields
  const intakeData = {};
  booleanIntakeFields.forEach(field => {
    intakeData[field] = rows.some(r => r[field] === true);
  });

  return {
    team,
    avgEpa, avgAuto, avgTele, avgEnd,
    last3Epa, last3Auto, last3Tele, last3End,
    epaOverTime, autoOverTime, teleOverTime,
    consistency, defense, breakdown, lastBreakdown,
    noShow, leave, matchesScouted, scouts,
    generalComments: buildComments('generalcomments'),
    breakdownComments: buildComments('breakdowncomments'),
    defenseComments: buildComments('defensecomments'),
    auto: autoStats,
    tele: teleStats,
    endPlacement,
    attemptCage, successCage,
    qualitative,
    ...intakeData,
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
  const removedAlgaeFields = apiConfig.removedAlgaeFields || [];
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

      const removedAlgae = removedAlgaeFields.reduce((s, f) => s + (Number(row[f]) || 0), 0);

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
        leave: row.leave,
        removedAlgae,
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

      td.removedAlgae += removedAlgaeFields.reduce((s, f) => s + (Number(row[f]) || 0), 0);

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

    td.removedAlgae = average(td.removedAlgae, count);

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
  teamTable = teamTable.filter(dr => !dr.noshow);

  let teamMatchData = teamTable;
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
    }
  });

  // Consistency
  mutators.consistency = d => {
    const teamMatches = teamMatchData.filter(m => m.team === d.team);
    const autoSuccess = computedMetrics.find(m => m.key === 'coral')?.successFields || [];
    const autoFail = computedMetrics.find(m => m.key === 'coral')?.failFields || [];
    const allSuccess = autoSuccess.reduce((s, f) => s + (d[f] || 0), 0);
    const allFail = autoFail.reduce((s, f) => s + (d[f] || 0), 0);
    const totalAttempts = allSuccess + allFail;
    const successRate = totalAttempts > 0 ? (allSuccess / totalAttempts) * 100 : 0;

    const endgameConfig = apiConfig.endgameConfig || {};
    const endVal = Math.round(d[endgameConfig.field] ?? 0);
    const successEndValues = display.teamView?.endgameStats?.cageSuccessValues || [3, 4];
    const endgameSuccess = successEndValues.includes(endVal) ? 1 : 0;

    const noShowPenalty = d.noshow ? 0 : 1;
    const breakdownPenalty = d.breakdowncomments && String(d.breakdowncomments).trim() !== "" ? 0.8 : 1;

    const metrics = [successRate, endgameSuccess * 100, noShowPenalty * 100];
    const baseConsistency = metrics.reduce((s, v) => s + v, 0) / metrics.length;
    return baseConsistency * breakdownPenalty;
  };

  // Defense
  mutators.defense = d => {
    const teamMatches = teamMatchData.filter(m => m.team === d.team);
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
    const teamMatches = teamMatchData.filter(m => m.team === d.team);
    const total = teamMatches.length;
    const breakdowns = teamMatches.filter(m =>
      m.breakdown === true || (m.breakdowncomments && String(m.breakdowncomments).trim() !== "")
    ).length;
    return total > 0 ? breakdowns / total : 0;
  };

  // EPA last 3
  mutators.epa3 = d => {
    const teamMatches = teamMatchData.filter(m => m.team === d.team);
    const latest3 = teamMatches.sort((a, b) => b.match - a.match).slice(0, 3);
    if (latest3.length === 0) return 0;
    return latest3.map(m => calcFns.calcEPA(m)).reduce((s, v) => s + v, 0) / latest3.length;
  };

  teamTable = tidy(teamTable, mutate(mutators));

  // Select fields for output
  const selectFields = ['team', 'auto', 'tele', 'end', 'epa', 'epa3', 'consistency', 'defense', 'breakdown',
    ...computedMetrics.map(m => m.key)];
  teamTable = tidy(teamTable, select(selectFields));

  // Normalize and score
  const maxes = tidy(teamTable, summarizeAll(max))[0];

  teamTable = tidy(teamTable, mutate({
    auto: d => maxes.auto ? d.auto / maxes.auto : 0,
    tele: d => maxes.tele ? d.tele / maxes.tele : 0,
    end: d => maxes.end ? d.end / maxes.end : 0,
    realEpa: d => d.epa,
    epa: d => maxes.epa ? d.epa / maxes.epa : 0,
    realEpa3: d => d.epa3,
    epa3: d => maxes.epa3 ? d.epa3 / maxes.epa3 : 0,
    consistency: d => maxes.consistency ? d.consistency / maxes.consistency : 0,
    realDefense: d => d.defense,
    defense: d => maxes.defense ? d.defense / maxes.defense : 0,
    breakdown: d => d.breakdown,
    ...Object.fromEntries(computedMetrics
      .filter(m => !['consistency', 'defense', 'breakdown'].includes(m.key))
      .map(m => {
        const realKey = `real${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`;
        return [
          [realKey, d => d[m.key]],
          [m.key, d => maxes[m.key] ? d[m.key] / maxes[m.key] : 0],
        ];
      }).flat()),
    score: d => weightEntries.reduce((sum, [key, weight]) => {
      const value = d[key] ?? 0;
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
