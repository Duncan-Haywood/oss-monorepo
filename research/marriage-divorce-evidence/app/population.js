// Population comparison: where a scored couple sits among the lens's own surveyed marriages,
// overall and within the subgroups the couple belongs to, and a "just me" estimate averaged
// over a realistic partner distribution. Lenses are never pooled: every function takes one bundle.
// Pure functions; no DOM. tests/population.test.mjs and tests/reference.test.mjs cover it.
//
// Bundles publish `population_reference` in several shapes. referenceFor() converts each
// documented shape into one normalised form, and returns null for anything else, so a
// percentile is never read off the wrong quantity:
//
//   standard   { horizons, overall: { n, quantiles: { p1..p99 } }, subgroups, subgroup_defs }
//              (pK a list aligned to horizons, a number, or quantiles keyed by horizon) —
//              NSFG 2002, NSFG 1995–2023, NLSY97, Los Angeles newlyweds, SIPP, ACS;
//   cells      { quantiles: [0.01..0.99], cells: [{ variable, value, n, p5: [...], p10: [...] }] }
//              (keys pH are HORIZONS, not percentiles) — NLSY79 first marriages, Canada GSS;
//   horizon_N  { horizon_2: { quantiles: [1..99], overall: { values }, subgroups } } — GSS panels;
//   per-model  { quantiles: ['p1'..], horizons: { label: years }, models: { key: [cells] } } — HCMST
//              (values may be null where a cell is too small for that percentile);
//   annual     { quantiles: [...], cells: [{ ..., annual_rate: [...] }] } — NLSY79 couples: an
//              ANNUAL RATE over couple-years, compared with the couple's annual rate now (never
//              with a cumulative risk).
//
// Normalised: { shape, quantity: 'cumulative' | 'annual_rate', horizons, levels (percentiles),
//   model (the model the reference was built from; null = the lens's mean over its scoring
//   models), at: 'wedding' | 'now', overall: { n, values: { [h]: [...] } },
//   subgroups: { var: { level: { n, values, small } } }, subgroup_defs, min_cell, note }.
import { adapterFor, refusals, project, scoringModels, stepAt, lensHorizons, coupleRate, RACE_ETH } from './couple.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const LEVELS99 = Array.from({ length: 99 }, (_, i) => i + 1);

// ---- Raw standard-shape access (kept for the converter and older callers) -----------------
// The 99 quantile values (p1..p99) of one cell at one horizon, or null.
export function quantilesAt(cell, horizon, horizons = []) {
  if (cell?.values) return cell.values[horizon] || null;
  if (!cell || !cell.quantiles) return null;
  const q = cell.quantiles;
  if (q[String(horizon)] && typeof q[String(horizon)] === 'object' && !Array.isArray(q[String(horizon)])) {
    return quantilesAt({ quantiles: q[String(horizon)] }, horizon, [horizon]);
  }
  const j = horizons.indexOf(horizon);
  const out = [];
  for (let k = 1; k <= 99; k++) {
    const v = q['p' + k];
    const x = Array.isArray(v) ? v[j] : horizons.length <= 1 || j === 0 ? v : undefined;
    if (!Number.isFinite(x)) return null;
    out.push(x);
  }
  return out;
}

// Percentile of `value` among quantile values q at percentile `levels` (default p1..p99),
// linearly interpolated between neighbouring levels. Below the lowest level or above the
// highest is reported as such, not extrapolated. Where several levels equal the value (a flat
// stretch), the middle of the stretch is used. Null levels (suppressed cells) are skipped.
export function percentileOf(value, q, levels = null) {
  if (!Number.isFinite(value) || !q) return null;
  if (!levels && q.length !== 99) return null;
  const L = levels || LEVELS99;
  if (L.length !== q.length) return null;
  const pts = [];
  q.forEach((v, i) => { if (Number.isFinite(v)) pts.push([L[i], v]); });
  if (pts.length < 2) return null;
  const lo = pts[0];
  const hi = pts[pts.length - 1];
  if (value < lo[1]) return { percentile: lo[0], below: true, label: `below p${lo[0]}` };
  if (value > hi[1]) return { percentile: hi[0], above: true, label: `above p${hi[0]}` };
  const eq = pts.filter(([, v]) => v === value).map(([l]) => l);
  let p;
  if (eq.length) p = (eq[0] + eq[eq.length - 1]) / 2;
  else {
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1][1] < value) i++;
    const [l0, v0] = pts[i];
    const [l1, v1] = pts[i + 1];
    p = l0 + ((value - v0) / (v1 - v0)) * (l1 - l0);
  }
  return { percentile: p, label: `p${p < 10 ? p.toFixed(1) : Math.round(p)}` };
}

// The median of a normalised cell at a horizon (interpolated when p50 is not a level).
export function medianAt(cell, horizon, horizons, levels = LEVELS99) {
  const q = cell?.values ? cell.values[horizon] : quantilesAt(cell, horizon, horizons);
  if (!q) return null;
  const i = levels.indexOf(50);
  return i >= 0 && Number.isFinite(q[i]) ? q[i] : null;
}

// ---- Converters ---------------------------------------------------------------------------
const bins = (column, edges, labels, right = false) => ({
  column,
  bins: labels.map((level, i) => ({ level, min: edges[i], max: edges[i + 1], right })),
});
// Subgroup definitions for references that publish none: which adapter-row column each variable
// reads, with the bins (and right-closed flag) the training code used.
const NLSY_AGE = bins('age_at_marriage', [null, 20, 25, 30, 35, null], ['<20', '20-24', '25-29', '30-34', '35+']);
const DEFS = {
  nlsy79_first_marriage: {
    age_at_marriage_band: { label: 'Age at the wedding', ...NLSY_AGE },
    education: { label: 'Own schooling before the wedding', column: 'own_education' },
    race_ethnicity: { label: 'Race-ethnicity', column: 'race' },
    afqt_tercile: { label: 'AFQT test-score third', column: 'afqt_tercile' },
    family_at_14: { label: 'Family at 14', column: 'family_at_14' },
    religion_raised: { label: 'Religion raised in', column: 'religion_raised' },
    attendance: { label: 'Religious attendance', column: 'attendance' },
    sex: { label: 'Sex', column: 'sex' },
  },
  canada_gss_first_marriage: {
    age_band: { label: 'Age at the wedding', ...NLSY_AGE },
    wedding_period: { label: 'Wedding years', ...bins('wedding_year', [1950, 1970, 1980, 1990, 2000, 2010, 2018], ['1950-69', '1970-79', '1980-89', '1990-99', '2000-09', '2010-17']) },
    respondent_sex: { label: 'Respondent sex', column: 'respondent_sex' },
    cohabited_first: { label: 'Lived together before marrying', column: 'cohabited_first' },
    prior_union: { label: 'Earlier common-law partner', column: 'prior_union' },
    premarital_birth: { label: 'Child before the wedding', column: 'premarital_birth' },
    intact_family_15: { label: 'Both parents to 15', column: 'intact_family_15' },
    born_outside_canada: { label: 'Born outside Canada', column: 'born_outside_canada' },
    first_language: { label: 'First language', column: 'first_language' },
    region: { label: 'Region', column: 'region' },
    survey_cycle: { label: 'Survey cycle (the app scores 2017)', column: 'survey_cycle' },
  },
  gss_panel_marriages: {
    sex: { label: 'Sex', column: 'sex' },
    age_band: { label: 'Age', ...bins('age', [0, 30, 40, 50, 60, 70, 200], ['18-29', '30-39', '40-49', '50-59', '60-69', '70+']) },
    degree: { label: 'Degree', column: 'degree' },
    spouse_degree: { label: 'Spouse’s degree', column: 'spouse_degree' },
    race: { label: 'Race', column: 'race' },
    hapmar: { label: 'Marriage happiness', column: 'hapmar' },
    attendance_band: { label: 'Religious attendance', ...bins('attend', [-1, 1, 4, 6, 9], ['Never or under once a year', 'Yearly to monthly', '2-3 times a month to nearly weekly', 'Weekly or more'], true) },
    children: { label: 'Children', ...bins('childs', [-1, 0, 1, 2, 99], ['0', '1', '2', '3+'], true) },
    divorced_before: { label: 'Divorced before', column: 'divorced_before' },
    panel: { label: 'GSS panel', column: 'panel' },
  },
  hcmst_couples: {
    married: { label: 'Married', column: 'married', map: { Yes: 'Married', No: 'Unmarried' } },
    couple_type: { label: 'Couple type', column: 'couple_type', map: { 'Man-woman': 'Different-sex', 'Two men': 'Same-sex', 'Two women': 'Same-sex' } },
    relationship_quality: { label: 'Relationship quality', column: 'relationship_quality' },
    mean_age_band: { label: 'Mean age', ...bins('mean_age', [0, 30, 45, 60, 200], ['under 30', '30-44', '45-59', '60+']) },
    edu_years_mean_band: { label: 'Mean schooling', ...bins('edu_years_mean', [0, 12, 14, 16, 99], ['under 12 years', '12-13.5 years', '14-15.5 years', '16+ years']) },
    how_met: { label: 'How you met', column: 'how_met' },
    interracial: { label: 'Race-ethnicity', column: 'couple_race', map: { Interracial: 'Interracial', 'Both White': 'Same race-ethnicity', 'Both Black': 'Same race-ethnicity', 'Both Hispanic': 'Same race-ethnicity', 'Both Other': 'Same race-ethnicity' } },
    relationship_years_band: { label: 'Years together', ...bins('relationship_years', [0, 2, 5, 10, 20, 200], ['under 2 years', '2-4 years', '5-9 years', '10-19 years', '20+ years']) },
  },
  nlsy79_couples: {
    sex: { label: 'Respondent sex', column: 'sex' },
    age_band: { label: 'Age', ...bins('age', [0, 45, 55, 200], ['35-44', '45-54', '55+']) },
    marriage_length_band: { label: 'Years married', ...bins('current_marriage_years', [-1, 10, 20, 30, 200], ['<10 years', '10-19 years', '20-29 years', '30+ years']) },
    marriage_order_group: { label: 'First or later marriage', column: 'marriage_order_group' },
    husband_school: { label: 'Husband’s schooling', column: 'husband_school' },
    wife_school: { label: 'Wife’s schooling', column: 'wife_school' },
    earnings_pair: { label: 'Who earns', column: 'earnings_pair' },
    total_wage_band: { label: 'Combined wages', column: 'total_wage_band' },
    education: { label: 'Own degree', column: 'education' },
    religion_refresh: { label: 'Own religious attendance', column: 'religion_refresh' },
  },
  sipp_first_marriage: {
    sex: { label: 'Sex', column: 'sex' },
    age_band: { label: 'Age at the wedding', ...bins('age_at_marriage', [null, 20, 25, 30, 35, null], ['under 20', '20-24', '25-29', '30-34', '35+']) },
    cohort: { label: 'Wedding decade', ...bins('wedding_year', [1960, 1970, 1980, 1990, 2000, 2010, null], ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s+']) },
    race_ethnicity: { label: 'Race-ethnicity', column: 'race_ethnicity' },
    nativity: { label: 'Born in the U.S.', column: 'nativity' },
    source: { label: 'Survey panel', column: 'source' },
    education_at_wedding: { label: 'Education at the wedding', column: 'education_at_wedding' },
  },
  acs_one_year_divorce: {
    sex: { label: 'Sex', column: 'sex' },
    age_band: { label: 'Age', ...bins('age', [null, 25, 30, 35, 40, 45, 50, 55, 65, null], ['15-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-64', '65+']) },
    education: { label: 'Education', column: 'education' },
    duration_band: { label: 'Years since the wedding', ...bins('marriage_years', [null, 3, 6, 11, 21, 31, null], ['0-2 years', '3-5 years', '6-10 years', '11-20 years', '21-30 years', '31+ years']) },
    times_married: { label: 'Times married', column: 'times_married' },
    race_ethnicity: { label: 'Race-ethnicity', column: 'race_ethnicity' },
    nativity: { label: 'Born in the U.S.', column: 'nativity' },
  },
};

const modelFrom = (text) => (String(text || '').match(/from the (\w+) model/) || [])[1] || null;

function fromStandard(ref, bundle) {
  const H = ref.horizons;
  const levels = LEVELS99;
  const cell = (c) => {
    const values = {};
    for (const h of H) {
      const q = quantilesAt(c, h, H);
      if (q) values[h] = q;
    }
    return { n: c.n, values, small: !!c.small_cell };
  };
  const overall = cell(ref.overall);
  if (!Object.keys(overall.values).length) return null;
  const subgroups = {};
  for (const [v, cells] of Object.entries(ref.subgroups || {})) {
    subgroups[v] = {};
    for (const [lv, c] of Object.entries(cells)) subgroups[v][lv] = cell(c);
  }
  const model = typeof ref.model === 'string' ? ref.model : ref.models?.default || null;
  return {
    shape: 'standard', quantity: 'cumulative', horizons: H, levels, overall, subgroups,
    subgroup_defs: { ...(DEFS[bundle?.id] || {}), ...(ref.subgroup_defs || {}) }, model,
    min_cell: ref.min_cell || 100, note: ref.small_sample_warning || null,
  };
}

function fromCells(ref, bundle) {
  const levels = ref.quantiles.map((q) => Math.round(q * 100));
  const annual = ref.cells.some((c) => Array.isArray(c.annual_rate));
  const H = annual ? [0] : ref.horizons_years || [5, 10, 20, 30].filter((h) => ref.cells.some((c) => Array.isArray(c['p' + h])));
  const cell = (c) => ({ n: c.n, values: Object.fromEntries(H.map((h) => [h, annual ? c.annual_rate : c['p' + h]]).filter(([, v]) => Array.isArray(v))) });
  const all = ref.cells.find((c) => c.variable === 'All');
  if (!all || !H.length || levels.length !== (annual ? all.annual_rate : all['p' + H[0]])?.length) return null;
  const subgroups = {};
  for (const c of ref.cells) {
    if (c.variable === 'All') continue;
    (subgroups[c.variable] ||= {})[c.value] = cell(c);
  }
  return {
    shape: annual ? 'annual' : 'cells', quantity: annual ? 'annual_rate' : 'cumulative', horizons: H, levels,
    overall: cell(all), subgroups, subgroup_defs: DEFS[bundle?.id] || {}, model: ref.model || modelFrom(ref.method), min_cell: 100,
    note: annual ? 'Rows are couple-years at ages 35–64 in 2000–2022, not weddings; the quantity is the annual divorce rate now.' : null,
  };
}

function fromHorizonKeys(ref, bundle) {
  const keys = Object.keys(ref).filter((k) => /^horizon_\d+$/.test(k));
  // Only horizons this lens's exported models predict are usable (GSS: the 4-year model is not exported).
  const can = new Set(lensHorizons(bundle));
  const blocks = keys.map((k) => ref[k]).filter((b) => can.has(b.horizon_years));
  if (!blocks.length) return null;
  const levels = blocks[0].quantiles;
  const H = blocks.map((b) => b.horizon_years);
  const overall = { n: blocks[0].overall.respondents, values: Object.fromEntries(blocks.map((b) => [b.horizon_years, b.overall.values])) };
  const subgroups = {};
  for (const b of blocks) {
    for (const [v, cells] of Object.entries(b.subgroups || {})) {
      for (const [lv, c] of Object.entries(cells)) {
        const s = ((subgroups[v] ||= {})[lv] ||= { n: c.respondents, values: {} });
        s.values[b.horizon_years] = c.values;
      }
    }
  }
  return { shape: 'horizon_N', quantity: 'cumulative', horizons: H, levels, overall, subgroups, subgroup_defs: DEFS[bundle?.id] || {}, model: blocks[0].model || null, min_cell: 100, note: ref.note || null };
}

function fromPerModel(ref, bundle) {
  const keys = Object.keys(ref.models || {});
  const scoring = new Set(scoringModels(bundle).map((m) => m.key));
  const model = ['additive_full', 'additive_core', ...keys].find((k) => keys.includes(k) && scoring.has(k)) || null;
  if (!model) return null;
  const levels = ref.quantiles.map((q) => Number(String(q).replace('p', '')));
  const hk = Object.entries(ref.horizons);
  const H = hk.map(([, y]) => y);
  const cell = (c) => ({ n: c.n, small: !!c.small_cell, values: Object.fromEntries(hk.map(([k, y]) => [y, ref.quantiles.map((q) => c[k]?.[q] ?? null)])) });
  const cells = ref.models[model];
  const all = cells.find((c) => c.dimension === 'all');
  const subgroups = {};
  for (const c of cells) if (c.dimension !== 'all') (subgroups[c.dimension] ||= {})[c.group] = cell(c);
  return { shape: 'per-model', quantity: 'cumulative', horizons: H, levels, overall: cell(all), subgroups, subgroup_defs: DEFS[bundle?.id] || {}, model, min_cell: 100, note: 'Groups of 50–99 couples are marked small; the outer percentiles are left out where a group is too small for them.' };
}

const CACHE = new WeakMap();
// The lens's reference in the normalised form, or null when it has none (or an unknown shape).
export function referenceFor(bundle) {
  const ref = bundle?.population_reference;
  if (!ref || typeof ref !== 'object') return null;
  if (CACHE.has(ref)) return CACHE.get(ref);
  let out = null;
  try {
    if (ref.levels && ref.overall?.values) out = ref; // already normalised
    else if (ref.overall && Array.isArray(ref.horizons)) out = fromStandard(ref, bundle);
    else if (Array.isArray(ref.cells) && Array.isArray(ref.quantiles)) out = fromCells(ref, bundle);
    else if (Object.keys(ref).some((k) => /^horizon_\d+$/.test(k))) out = fromHorizonKeys(ref, bundle);
    else if (ref.models && ref.horizons && !Array.isArray(ref.horizons) && Array.isArray(ref.quantiles)) out = fromPerModel(ref, bundle);
  } catch {
    out = null;
  }
  if (out && bundle) out = { ...out, at: adapterFor(bundle).referenceAt || 'wedding' };
  CACHE.set(ref, out);
  return out;
}

// Normalise a reference passed in directly (tests, or a raw standard block).
const norm = (ref) => (ref?.levels ? ref : fromStandard(ref, null));

// ---- Subgroups ----------------------------------------------------------------------------
// Which subgroup level an attribute set falls in for one variable: by the definition's bins on a
// numeric column (left-closed unless `right`), a value map, a categorical column, or an
// attribute named like the variable.
export function levelFor(ref, variable, attrs) {
  const def = ref.subgroup_defs?.[variable];
  const col = def?.column || variable;
  const v = attrs[col];
  if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return null;
  if (def?.bins) {
    const x = Number(v);
    const b = def.bins.find((z) => (z.right
      ? (z.min === null || z.min === undefined || x > z.min) && (z.max === null || z.max === undefined || x <= z.max)
      : (z.min === null || z.min === undefined || x >= z.min) && (z.max === null || z.max === undefined || x < z.max)));
    return b ? b.level : null;
  }
  if (def?.map) return def.map[v] ?? null;
  return String(v);
}

export function memberships(refIn, attrs) {
  const ref = norm(refIn);
  const out = [];
  for (const [variable, cells] of Object.entries(ref.subgroups || {})) {
    const level = levelFor(ref, variable, attrs);
    const label = ref.subgroup_defs?.[variable]?.label || variable.replace(/_/g, ' ');
    if (level === null || level === 'Unknown') {
      out.push({ variable, label, level: null, cell: null, reason: 'not known for this couple, or outside the survey’s range' });
      continue;
    }
    const cell = cells[level] || null;
    out.push({ variable, label, level, cell, reason: cell ? null : `fewer than ${ref.min_cell || 100} surveyed people in this group` });
  }
  return out;
}

// Attributes a couple is matched to subgroups on: the adapter's own inputs.
export function referenceAttrs(bundle, a, b, couple) {
  const ad = adapterFor(bundle);
  if (ad.referenceAttrs) return ad.referenceAttrs(bundle, a, b, couple);
  return ad.rows(bundle, a, b, couple, 0)[0] || {};
}

// The couple as on its wedding day: ages and calendar year rewound by the years married, so a
// married couple is compared with the surveyed marriages on the same footing (risk from the
// wedding). For a couple marrying now this changes nothing.
export function atWedding(a, b, couple) {
  const ym = num(couple.yearsMarried) || 0;
  if (!ym) return { a, b, couple };
  const cy = Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear();
  const back = (p) => ({ ...p, age: num(p.age) - ym });
  return { a: back(a), b: back(b), couple: { ...couple, yearsMarried: 0, currentYear: cy - ym } };
}

// Compare the couple's quantity { [horizon]: value } with the reference, overall and per subgroup.
export function compareRisks(refIn, risks, attrs) {
  if (!refIn) return null;
  const ref = norm(refIn);
  if (!ref) return null;
  const subs = memberships(ref, attrs);
  const rows = [];
  for (const h of ref.horizons) {
    if (!Number.isFinite(risks[h])) continue;
    const overallQ = ref.overall.values[h];
    if (!overallQ) continue;
    rows.push({
      horizon: h,
      risk: risks[h],
      overall: { n: ref.overall.n, median: medianAt(ref.overall, h, ref.horizons, ref.levels), ...(percentileOf(risks[h], overallQ, ref.levels) || {}) },
      subgroups: subs.map((s) => {
        if (!s.cell) return { ...s };
        const q = s.cell.values[h];
        // percentileOf's own `label` (e.g. 'p62') is kept as pLabel; `label` names the group.
        const pc = percentileOf(risks[h], q, ref.levels) || {};
        return { ...pc, pLabel: pc.label, variable: s.variable, label: s.label, level: s.level, n: s.cell.n, small: s.cell.small, median: q ? medianAt(s.cell, h, ref.horizons, ref.levels) : null };
      }),
    });
  }
  return { horizons: rows, skipped: subs.filter((s) => !s.cell), quantity: ref.quantity, model: ref.model, at: ref.at, note: ref.note };
}

// The couple's value of the reference's own quantity, from the reference's own model (or the
// lens's mean when the reference is of the lens number): cumulative risk at each horizon, from
// the wedding or from today as the reference counts it; or the annual rate now.
export function referenceRisks(bundle, a, b, couple) {
  const ref = referenceFor(bundle);
  if (!ref) return null;
  const own = ref.model && bundle.models.find((m) => m.key === ref.model);
  const models = own ? [own] : scoringModels(bundle);
  const w = ref.at === 'wedding' ? atWedding(a, b, couple) : { a, b, couple };
  if (refusals(bundle, w.a, w.b, w.couple).length) return { refused: refusals(bundle, w.a, w.b, w.couple), w };
  if (ref.quantity === 'annual_rate') {
    const r = models.reduce((t, m) => t + coupleRate(bundle, m, w.a, w.b, w.couple, 0), 0) / models.length;
    return { risks: { 0: r }, w };
  }
  const p = project(bundle, w.a, w.b, w.couple, Math.max(...ref.horizons), models);
  const risks = {};
  for (const h of ref.horizons) {
    const y = stepAt(p, h);
    if (y) risks[h] = 1 - y.meanSurvival;
  }
  return { risks, w };
}

// A scored couple's population comparison for one lens. Null when the lens has no reference;
// { refused } when the lens gives this couple no number.
export function populationComparison(bundle, a, b, couple) {
  const ref = referenceFor(bundle);
  if (!ref) return null;
  const r = referenceRisks(bundle, a, b, couple);
  if (r.refused) return { refused: r.refused };
  return compareRisks(ref, r.risks, referenceAttrs(bundle, r.w.a, r.w.b, r.w.couple));
}

// Overall percentiles only, keyed by horizon (batch, candidates, dashboard).
export function couplePercentile(bundle, a, b, couple) {
  const cmp = populationComparison(bundle, a, b, couple);
  if (!cmp || cmp.refused) return null;
  return Object.fromEntries(cmp.horizons.map((r) => [r.horizon, r.overall]));
}

// From cumulative survival already computed for this couple with the LENS MEAN. Only valid when
// the reference is of the lens mean and counts the same way; returns null otherwise.
export function percentileFromSurvival(bundle, attrs, survivalByHorizon) {
  const ref = referenceFor(bundle);
  if (!ref || ref.model || ref.quantity !== 'cumulative') return null;
  const risks = {};
  for (const [h, s] of Object.entries(survivalByHorizon)) risks[h] = 1 - s;
  return compareRisks(ref, risks, attrs);
}

// ---- "Just me": one person, averaged over a realistic partner distribution --------------
// A lens whose models take only the respondent's own traits (Canada, SIPP, NSFG both sexes, ACS)
// scores you directly. A lens with a partner distribution averages over it. Others say why not.

const bandOf = (bands, x) => (bands || []).find((z) => (z.min === null || z.min === undefined || x >= z.min) && (z.max === null || z.max === undefined || x < z.max))?.level ?? null;

// Turn one NSFG partner profile into a partner person and couple fields for the adapter.
export function partnerFromProfile(me, traits, pd, couple = {}) {
  const gap = pd.gap_values?.[traits.gap_bin];
  const woman = me.sex === 'Woman';
  const partner = { sex: woman ? 'Man' : 'Woman', priorMarriage: false, priorChildren: 'No', intactFamily: 'Yes', raceEth: '' };
  if (Number.isFinite(gap)) partner.age = num(me.age) + (woman ? gap : -gap);
  if (woman) {
    partner.priorMarriage = traits.husband_married_before === 'Yes';
    partner.priorChildren = traits.husband_prior_children === 'Unknown' ? '' : traits.husband_prior_children || 'No';
    const same = traits.same_race_ethnicity;
    partner.raceEth = same === 'Same' ? me.raceEth : same === 'Different' ? RACE_ETH.find((r) => r !== me.raceEth && r !== 'Asian' && me.raceEth !== 'Asian') || 'White' : '';
  } else {
    partner.raceEth = traits.wife_race_ethnicity || '';
    partner.intactFamily = traits.wife_intact_family || '';
  }
  const c = { ...couple, cohabitedFirst: traits.cohabited_first || couple.cohabitedFirst || 'Unknown' };
  return { partner, couple: c };
}

// The person's conditioning cell in an NSFG-shaped partner distribution, or a reason there is none.
export function partnerCell(pd, me, couple = {}) {
  const age = num(me.age) - (num(couple.yearsMarried) || 0);
  if (me.sex !== 'Woman' && me.sex !== 'Man') return { reason: 'Choose your sex: the partner distribution is by sex.' };
  const race = me.raceEth === 'Asian' ? 'Other' : me.raceEth;
  if (!['Hispanic', 'White', 'Black', 'Other'].includes(race)) return { reason: 'The partner distribution is conditional on race-ethnicity; choose yours to use it.' };
  const woman = me.sex === 'Woman';
  const given = woman
    ? { wife_age_band: bandOf(pd.age_bands?.wife, age), wife_race_ethnicity: race }
    : { husband_age_band: bandOf(pd.age_bands?.husband, age), husband_race_ethnicity: race };
  const list = woman ? pd.given_wife : pd.given_husband;
  const cell = (list || []).find((c) => Object.entries(given).every(([k, v]) => c.given[k] === v));
  if (!cell) return { reason: `Fewer than ${pd.min_conditioning_cell || 30} surveyed marriages match your age band and race-ethnicity, so there is no partner distribution for you.`, given };
  return { cell, given };
}

// NLSY79 first marriages: spouse age band x schooling given (sex, age band at the wedding).
// Spouse ages are scored at the middle of their band (the bundle gives no within-band median).
const NLSY_BAND_MID = { '<20': 19, '20-24': 22, '25-29': 27, '30-34': 32, '35+': 38 };
const NLSY_SCHOOL = { '<12 years': '<12 years', '12 years': '12 years', '13-15 years': '13–15 years', '16+ years': '16–17 years' };
function nlsyProfiles(pd, me, couple) {
  const age = num(me.age) - (num(couple.yearsMarried) || 0);
  const band = age < 20 ? '<20' : age < 25 ? '20-24' : age < 30 ? '25-29' : age < 35 ? '30-34' : '35+';
  const cell = (pd.spouse_traits_given_respondent || []).find((c) => c.given.sex === me.sex && c.given.age_band === band);
  if (!cell) return { reason: `Fewer than ${pd.min_cell_n || 30} surveyed marriages match your sex and age band, so there is no partner distribution for you.` };
  const coverage = 1 - (cell.suppressed_share || 0);
  const profiles = cell.cells.map((c) => ({
    share: c.share / coverage,
    partner: { sex: me.sex === 'Woman' ? 'Man' : 'Woman', age: NLSY_BAND_MID[c.spouse_age_band] + (num(me.age) - age), school: NLSY_SCHOOL[c.spouse_education] || '', degree: '', priorMarriage: false, raceEth: me.raceEth },
  }));
  return { profiles, n: cell.n, coverage, given: cell.given, note: 'Spouse ages are scored at the middle of their band.' };
}

export const MIN_COVERAGE = 0.5;

export function justMe(bundle, me, couple = {}, { horizons = lensHorizons(bundle) } = {}) {
  const ad = adapterFor(bundle);
  const pd = bundle.partner_distribution;
  const c0 = { ...couple, yearsMarried: 0 };
  const models = scoringModels(bundle);
  const H = Math.max(...horizons);
  const ref = referenceFor(bundle);
  // Respondent-level lenses: your own traits are the whole input.
  if (ad.selfOnly) {
    const partner = { ...me, sex: me.sex === 'Man' ? 'Woman' : 'Man', priorMarriage: false };
    const cs = { ...(ad.referenceAt === 'now' ? couple : c0), perspectives: ['a'] };
    const why = refusals(bundle, me, partner, cs);
    if (why.length) return { available: false, reason: why[0] };
    const p = project(bundle, me, partner, cs, H);
    const out = horizons.map((h) => stepAt(p, h)).filter(Boolean).map((y) => ({ horizon: y.elapsed, meanSurvival: y.meanSurvival, minSurvival: y.minSurvival, maxSurvival: y.maxSurvival }));
    const cmp = ref ? populationComparison(bundle, me, partner, cs) : null;
    return { available: true, selfOnly: true, horizons: out, comparison: cmp && !cmp.refused ? cmp : null, models: models.length, note: 'This lens scores each person from their own traits, so no partner averaging is needed.' };
  }
  let mix;
  if (pd && (pd.given_wife || pd.given_husband)) {
    const { cell, reason } = partnerCell(pd, me, c0);
    if (!cell) return { available: false, reason };
    // Profiles shared by fewer than 10 marriages are suppressed for privacy; when what is left
    // covers under half of the marriages like you, the mix is too partial to call realistic.
    if (cell.coverage < MIN_COVERAGE) return { available: false, reason: `The partner profiles that can be published cover only ${Math.round(100 * cell.coverage)}% of the ${cell.n} surveyed marriages like you (rarer combinations are suppressed), so the average would not be realistic.`, n: cell.n, coverage: cell.coverage };
    mix = { n: cell.n, coverage: cell.coverage, given: cell.given, profiles: cell.profiles.map((prof) => ({ share: prof.share, ...partnerFromProfile(me, prof.traits, pd, c0) })) };
  } else if (pd && pd.spouse_traits_given_respondent) {
    const r = nlsyProfiles(pd, me, c0);
    if (!r.profiles) return { available: false, reason: r.reason };
    if (r.coverage < MIN_COVERAGE) return { available: false, reason: `The published partner profiles cover only ${Math.round(100 * r.coverage)}% of the surveyed marriages like you.` };
    // You as the respondent: the spouse enters through their age and schooling only.
    mix = { ...r, profiles: r.profiles.map((x) => ({ share: x.share, partner: x.partner, couple: { ...c0, perspectives: ['a'] } })) };
  } else {
    return { available: false, reason: ad.justMeReason || 'This lens has no partner distribution: its person-level data are not in the repository, so the app cannot average over realistic partners. Enter a partner instead.' };
  }
  const acc = Object.fromEntries(models.map((m) => [m.key, Object.fromEntries(horizons.map((h) => [h, 0]))]));
  let used = 0;
  let refused = 0;
  const reasons = new Set();
  for (const prof of mix.profiles) {
    const why = refusals(bundle, me, prof.partner, prof.couple);
    if (why.length) { refused += prof.share; reasons.add(why[0]); continue; }
    const p = project(bundle, me, prof.partner, prof.couple, H);
    for (const m of models) for (const h of horizons) acc[m.key][h] += prof.share * stepAt(p, h).survival[m.key];
    used += prof.share;
  }
  if (!used) return { available: false, reason: 'The lens abstains for every partner profile in your cell: ' + [...reasons][0] };
  const out = horizons.map((h) => {
    const v = models.map((m) => acc[m.key][h] / used);
    return { horizon: h, meanSurvival: v.reduce((x, y) => x + y, 0) / v.length, minSurvival: Math.min(...v), maxSurvival: Math.max(...v) };
  });
  let comparison = null;
  if (ref && !ref.model && ref.quantity === 'cumulative') {
    const cy = Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear();
    const age = num(me.age);
    const attrs = ad.id === 'nsfg2002_first_marriage'
      ? (me.sex === 'Woman'
        ? { wife_age_at_marriage: age, wife_race_ethnicity: me.raceEth, wife_intact_family: me.intactFamily, wedding_year: cy }
        : { husband_married_before: me.priorMarriage ? 'Yes' : 'No', husband_prior_children: me.priorChildren, wedding_year: cy })
      : referenceAttrs(bundle, me, mix.profiles[0].partner, c0);
    comparison = compareRisks(ref, Object.fromEntries(out.filter((o) => ref.horizons.includes(o.horizon)).map((o) => [o.horizon, 1 - o.meanSurvival])), attrs);
  }
  return {
    available: true,
    given: mix.given,
    n: mix.n,
    coverage: mix.coverage,
    profiles: mix.profiles.length,
    usedShare: used,
    refusedShare: refused,
    horizons: out,
    comparison,
    models: models.length,
    note: mix.note || null,
  };
}

