import _ from 'lodash';

export function collectFieldNames(cfg) {
  const numberFields = new Set();
  const checkboxFields = new Set();
  const commentFields = new Set();
  const qualitativeFields = new Set();

  // From teamFields
  (cfg?.teamFields || []).forEach(f => {
    switch (f.type) {
      case 'number': numberFields.add(f.name); break;
      case 'checkbox': checkboxFields.add(f.name); break;
      case 'comment': commentFields.add(f.name); break;
      case 'qualitative': qualitativeFields.add(f.name); break;
      default: break;
    }
  });

  // From counters definitions (success/fail fields)
  const pushCounterFields = (arr) => {
    (arr || []).forEach(group => {
      (group.rows || []).forEach(r => {
        if (r.success) numberFields.add(r.success);
        if (r.fail) numberFields.add(r.fail);
      });
    });
  };
  pushCounterFields(cfg?.counters?.auto);
  pushCounterFields(cfg?.counters?.tele);

  // matchInfo removed; baked fields are handled separately in forms

  // Intake option names are checkboxes
  (cfg?.postMatchIntake?.options || []).forEach(opt => {
    if (opt?.name) checkboxFields.add(opt.name);
  });

  return {
    numberFields: Array.from(numberFields),
    checkboxFields: Array.from(checkboxFields),
    commentFields: Array.from(commentFields),
    qualitativeFields: Array.from(qualitativeFields),
    endgameName: cfg?.endgame?.name || 'stageplacement',
    endgameOptions: cfg?.endgame?.options || [],
  };
}

export function normalizeRows(rows) {
  return (rows || []).map(r => ({ ...r, ...(r.extra || {}) }));
}

export function aggregateRows(rows, cfg) {
  const { numberFields, checkboxFields, commentFields, qualitativeFields, endgameOptions } = collectFieldNames(cfg);
  const normalized = normalizeRows(rows);
  const result = {
    counts: {},
    averages: {},
    booleans: {},
    comments: {},
    qualitatives: {},
    endgame: { byValue: {}, byLabel: [] }
  };

  const n = normalized.length || 1;

  // Numbers: avg per field
  numberFields.forEach(name => {
    const vals = normalized.map(r => toNum(r[name])).filter(v => Number.isFinite(v));
    const sum = vals.reduce((a,b)=>a+b,0);
    result.averages[name] = vals.length ? sum / vals.length : 0;
    result.counts[name] = sum;
  });

  // Qualitative: avg per field
  qualitativeFields.forEach(name => {
    const vals = normalized.map(r => toNum(r[name])).filter(v => Number.isFinite(v));
    const sum = vals.reduce((a,b)=>a+b,0);
    result.qualitatives[name] = vals.length ? sum / vals.length : 0;
  });

  // Booleans: percent true
  checkboxFields.forEach(name => {
    const trues = normalized.filter(r => !!r[name]).length;
    result.booleans[name] = n ? (trues / n) : 0;
  });

  // Comments: concat
  commentFields.forEach(name => {
    const vals = normalized.map(r => r[name]).filter(Boolean);
    result.comments[name] = vals;
  });

  // Endgame distribution using endlocation (mapped value stored)
  const counts = {};
  normalized.forEach(r => {
    const v = toNum(r[(cfg?.endgame?.name) || 'stageplacement'] ?? r.endlocation);
    if (!Number.isFinite(v)) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  result.endgame.byValue = counts;
  const total = Object.values(counts).reduce((a,b)=>a+b,0) || 0;
  // Map to labels if the config values align
  result.endgame.byLabel = (endgameOptions || []).map(opt => ({
    value: opt.value,
    label: opt.label,
    count: counts[opt.value] || 0,
    percent: total ? ((counts[opt.value] || 0) / total) : 0
  }));

  return result;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
}
