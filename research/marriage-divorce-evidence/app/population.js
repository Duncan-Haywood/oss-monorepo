// Population comparison: where a scored couple sits among the lens's own surveyed marriages,
// overall and within the subgroups the couple belongs to, and a "just me" estimate averaged
// over a realistic partner distribution. Reads two optional, aggregate bundle blocks
// (app/tools/population_reference.py writes them for the NSFG 2002 lenses):
//
//   population_reference: { horizons: [5, 10, 20], overall: { n, quantiles: { p1..p99 } },
//     subgroups: { <var>: { <level>: { n, quantiles } } }, subgroup_defs?: { <var>: { label,
//     column, bins?: [{ level, min, max }] } } }
//   Quantiles are of predicted cumulative dissolution (1 - chance of no divorce) within each
//   horizon of the wedding. A pK value may be a list aligned to `horizons`, a number (one
//   horizon), or `quantiles` may be keyed by horizon ({ "10": { p1..p99 } }).
//
//   partner_distribution: see population_reference.py; given_wife / given_husband cells.
//
// Lenses are never pooled: every function takes one bundle. Pure functions; no DOM.
// tests/population.test.mjs covers it.
import { adapterFor, refusals, project, scoringModels, RACE_ETH } from './couple.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
// Only the shape above is read. Bundles that publish a reference in another shape (the NLSY79
// lenses' `cells` lists, or annual rates rather than from-the-wedding horizons) count as having
// none until they are converted, so a percentile is never read off the wrong quantity.
export const referenceFor = (bundle) => {
  const ref = bundle?.population_reference;
  return ref && ref.overall && Array.isArray(ref.horizons) ? ref : null;
};

// The 99 quantile values (p1..p99) of one cell at one horizon, or null.
export function quantilesAt(cell, horizon, horizons = []) {
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

// Percentile of `value` among quantiles q (q[0] = p1 ... q[98] = p99), linearly interpolated
// between neighbouring quantiles. Below p1 or above p99 is reported as such, not extrapolated.
// Where several quantiles equal the value (a flat stretch), the middle of the stretch is used.
export function percentileOf(value, q) {
  if (!Number.isFinite(value) || !q || q.length !== 99) return null;
  if (value < q[0]) return { percentile: 1, below: true, label: 'below p1' };
  if (value > q[98]) return { percentile: 99, above: true, label: 'above p99' };
  const eq = [];
  for (let i = 0; i < 99; i++) if (q[i] === value) eq.push(i + 1);
  let p;
  if (eq.length) p = (eq[0] + eq[eq.length - 1]) / 2;
  else {
    let i = 0;
    while (i < 98 && q[i + 1] < value) i++;
    p = i + 1 + (value - q[i]) / (q[i + 1] - q[i]);
  }
  return { percentile: p, label: `p${p < 10 ? p.toFixed(1) : Math.round(p)}` };
}

// The median (p50) of a cell at a horizon.
export const medianAt = (cell, horizon, horizons) => quantilesAt(cell, horizon, horizons)?.[49] ?? null;

// Which subgroup level an attribute set falls in for one variable: by the bundle's bins on a
// numeric column, by a categorical column, or by an attribute named like the variable.
export function levelFor(ref, variable, attrs) {
  const def = ref.subgroup_defs?.[variable];
  const col = def?.column || variable;
  const v = attrs[col];
  if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return null;
  if (def?.bins) {
    const x = Number(v);
    const b = def.bins.find((z) => (z.min === null || z.min === undefined || x >= z.min) && (z.max === null || z.max === undefined || x < z.max));
    return b ? b.level : null;
  }
  return String(v);
}

// Every subgroup the couple belongs to: [{ variable, label, level, cell }]; cell is null when
// the survey had too few marriages in it (or the couple's level is outside every cell).
export function memberships(ref, attrs) {
  const out = [];
  for (const [variable, cells] of Object.entries(ref.subgroups || {})) {
    const level = levelFor(ref, variable, attrs);
    const label = ref.subgroup_defs?.[variable]?.label || variable.replace(/_/g, ' ');
    if (level === null || level === 'Unknown') {
      out.push({ variable, label, level: null, cell: null, reason: 'not known for this couple, or outside the survey’s range' });
      continue;
    }
    const cell = cells[level] || null;
    out.push({ variable, label, level, cell, reason: cell ? null : `fewer than ${ref.min_cell || 100} surveyed marriages in this group` });
  }
  return out;
}

// Attributes a couple is matched to subgroups on: the adapter's own (wedding-day) inputs.
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

// Compare predicted cumulative risks { [horizon]: risk } with the reference, overall and per
// subgroup. Returns null when the lens has no reference.
export function compareRisks(ref, risks, attrs) {
  if (!ref) return null;
  const subs = memberships(ref, attrs);
  const rows = [];
  for (const h of ref.horizons) {
    if (!Number.isFinite(risks[h])) continue;
    const overallQ = quantilesAt(ref.overall, h, ref.horizons);
    rows.push({
      horizon: h,
      risk: risks[h],
      overall: { n: ref.overall.n, median: overallQ?.[49] ?? null, ...(percentileOf(risks[h], overallQ) || {}) },
      subgroups: subs.map((s) => {
        if (!s.cell) return { ...s };
        const q = quantilesAt(s.cell, h, ref.horizons);
        // percentileOf's own `label` (e.g. 'p62') is kept as pLabel; `label` names the group.
        const pc = percentileOf(risks[h], q) || {};
        return { ...pc, pLabel: pc.label, variable: s.variable, label: s.label, level: s.level, n: s.cell.n, median: q?.[49] ?? null };
      }),
    });
  }
  return { horizons: rows, skipped: subs.filter((s) => !s.cell) };
}

// A scored couple's population comparison for one lens: rewinds to the wedding, projects to
// the largest reference horizon, and compares the lens's mean risk. Null when the lens has no
// reference; { refused } when the lens gives this couple no number.
export function populationComparison(bundle, a, b, couple) {
  const ref = referenceFor(bundle);
  if (!ref) return null;
  const w = atWedding(a, b, couple);
  const why = refusals(bundle, w.a, w.b, w.couple);
  if (why.length) return { refused: why };
  const H = Math.max(...ref.horizons);
  const p = project(bundle, w.a, w.b, w.couple, H);
  const risks = Object.fromEntries(ref.horizons.map((h) => [h, 1 - p[h - 1].meanSurvival]));
  return compareRisks(ref, risks, referenceAttrs(bundle, w.a, w.b, w.couple));
}

// Same, from risks already computed for this couple (e.g. 1 - meanSurvival at each horizon of
// a projection from the wedding). Used by the batch scorer to avoid re-projecting.
export function percentileFromSurvival(bundle, attrs, survivalByHorizon) {
  const ref = referenceFor(bundle);
  if (!ref) return null;
  const risks = {};
  for (const [h, s] of Object.entries(survivalByHorizon)) risks[h] = 1 - s;
  return compareRisks(ref, risks, attrs);
}

// ---- "Just me": one person, averaged over a realistic partner distribution --------------
// Uses the bundle's partner_distribution (weighted partner-trait frequencies given the
// person's own coarse traits). A lens without one has no documented partner distribution, so
// this returns { available: false, reason } rather than inventing one.

const bandOf = (bands, x) => (bands || []).find((z) => (z.min === null || z.min === undefined || x >= z.min) && (z.max === null || z.max === undefined || x < z.max))?.level ?? null;

// Turn one partner profile into a partner person and couple fields for the adapter.
export function partnerFromProfile(me, traits, pd, couple = {}) {
  const gap = pd.gap_values?.[traits.gap_bin];
  const woman = me.sex === 'Woman';
  const partner = { sex: woman ? 'Man' : 'Woman', priorMarriage: false, priorChildren: 'No', intactFamily: 'Yes', raceEth: '' };
  if (Number.isFinite(gap)) partner.age = num(me.age) + (woman ? gap : -gap);
  if (woman) {
    partner.priorMarriage = traits.husband_married_before === 'Yes';
    partner.priorChildren = traits.husband_prior_children === 'Unknown' ? '' : traits.husband_prior_children || 'No';
    const same = traits.same_race_ethnicity;
    partner.raceEth = same === 'Same' ? me.raceEth : same === 'Different' ? RACE_ETH.find((r) => r !== me.raceEth) : '';
  } else {
    partner.raceEth = traits.wife_race_ethnicity || '';
    partner.intactFamily = traits.wife_intact_family || '';
  }
  const c = { ...couple, cohabitedFirst: traits.cohabited_first || couple.cohabitedFirst || 'Unknown' };
  return { partner, couple: c };
}

// The person's conditioning cell in the partner distribution, or a reason there is none.
export function partnerCell(pd, me, couple = {}) {
  const age = num(me.age) - (num(couple.yearsMarried) || 0);
  if (me.sex !== 'Woman' && me.sex !== 'Man') return { reason: 'Choose your sex: the partner distribution is by sex.' };
  if (!RACE_ETH.includes(me.raceEth)) return { reason: 'The partner distribution is conditional on race-ethnicity; choose yours to use it.' };
  const woman = me.sex === 'Woman';
  const given = woman
    ? { wife_age_band: bandOf(pd.age_bands?.wife, age), wife_race_ethnicity: me.raceEth }
    : { husband_age_band: bandOf(pd.age_bands?.husband, age), husband_race_ethnicity: me.raceEth };
  const list = woman ? pd.given_wife : pd.given_husband;
  const cell = (list || []).find((c) => Object.entries(given).every(([k, v]) => c.given[k] === v));
  if (!cell) return { reason: `Fewer than ${pd.min_conditioning_cell || 30} surveyed marriages match your age band and race-ethnicity, so there is no partner distribution for you.`, given };
  return { cell, given };
}

export const MIN_COVERAGE = 0.5;

export function justMe(bundle, me, couple = {}, { horizons = [5, 10, 20] } = {}) {
  const pd = bundle.partner_distribution;
  if (!pd) return { available: false, reason: 'This lens has no partner distribution: its person-level data are not in the repository, so the app cannot average over realistic partners. Enter a partner instead.' };
  const c0 = { ...couple, yearsMarried: 0 };
  const { cell, reason } = partnerCell(pd, me, c0);
  if (!cell) return { available: false, reason };
  // Profiles shared by fewer than 10 marriages are suppressed for privacy; when what is left
  // covers under half of the marriages like you, the mix is too partial to call realistic.
  if (cell.coverage < MIN_COVERAGE) return { available: false, reason: `The partner profiles that can be published cover only ${Math.round(100 * cell.coverage)}% of the ${cell.n} surveyed marriages like you (rarer combinations are suppressed), so the average would not be realistic.`, n: cell.n, coverage: cell.coverage };
  const models = scoringModels(bundle);
  const H = Math.max(...horizons);
  const acc = Object.fromEntries(models.map((m) => [m.key, Object.fromEntries(horizons.map((h) => [h, 0]))]));
  let used = 0;
  let refused = 0;
  const reasons = new Set();
  for (const prof of cell.profiles) {
    const { partner, couple: c } = partnerFromProfile(me, prof.traits, pd, c0);
    const why = refusals(bundle, me, partner, c);
    if (why.length) { refused += prof.share; reasons.add(why[0]); continue; }
    const p = project(bundle, me, partner, c, H);
    for (const m of models) for (const h of horizons) acc[m.key][h] += prof.share * p[h - 1].survival[m.key];
    used += prof.share;
  }
  if (!used) return { available: false, reason: 'The lens abstains for every partner profile in your cell: ' + [...reasons][0] };
  const out = horizons.map((h) => {
    const v = models.map((m) => acc[m.key][h] / used);
    return { horizon: h, meanSurvival: v.reduce((x, y) => x + y, 0) / v.length, minSurvival: Math.min(...v), maxSurvival: Math.max(...v) };
  });
  const ref = referenceFor(bundle);
  const age = num(me.age);
  const attrs = me.sex === 'Woman'
    ? { wife_age_at_marriage: age, wife_race_ethnicity: me.raceEth, wife_intact_family: me.intactFamily, wedding_year: Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear() }
    : { husband_married_before: me.priorMarriage ? 'Yes' : 'No', husband_prior_children: me.priorChildren, wedding_year: Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear() };
  const comparison = ref ? compareRisks(ref, Object.fromEntries(out.filter((o) => ref.horizons.includes(o.horizon)).map((o) => [o.horizon, 1 - o.meanSurvival])), attrs) : null;
  return {
    available: true,
    given: cell.given,
    n: cell.n,
    coverage: cell.coverage,
    profiles: cell.profiles.length,
    usedShare: used,
    refusedShare: refused,
    horizons: out,
    comparison,
    models: models.length,
  };
}
