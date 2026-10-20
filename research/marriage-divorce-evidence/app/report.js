// Profile report: a decision aid built on one lens at a time (lenses are never pooled).
// For one person ("me") it answers:
//   (a) date everyone   - risk averaged over every partner type observed among people of the
//                         same sex in the survey, weighted by how common each type is, not
//                         narrowed to people like me;
//   (b) likely partners - risk averaged over the partners people like me actually married
//                         (the lens's assortative partner_distribution), with the top types;
//   (c) above or below average - percentiles against the lens's population_reference;
//   (d) lowest-risk partner profiles (couple.js rankPartners via dashboard.js) and where the
//       models disagree;
//   (e) factor impact - how far the risk moves when one partner trait or one of my own
//       changeable traits is varied across its levels, holding everything else fixed;
//   (f) the biggest changes I could make (dashboard.js whatIfs), with the evidence grade.
// Pure functions, no DOM. Reuses couple.js, population.js and dashboard.js; adds no model.
// tests/report.test.mjs covers it.
import { adapterFor, refusals, project, scoringModels, stepAt, primaryHorizon, lensHorizons, RACE_ETH } from './couple.js';
import { referenceFor, compareRisks, referenceAttrs, partnerFromProfile, partnerCell, justMe, populationComparison, atWedding, MIN_COVERAGE } from './population.js';
import { partnerDashboard, whatIfs, emptyConstraints } from './dashboard.js';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// ---- Evidence grades ----------------------------------------------------------------------
// Which decision_evidence.json factor grade speaks to a form field. Fields not listed have no
// graded evidence record; the report says so instead of guessing.
export const FIELD_FACTOR = {
  age: 'age_at_marriage', gap: 'age_at_marriage', firstMarriageAge: 'age_at_marriage',
  degree: 'education_completion', school: 'education_completion', enrolled: 'education_completion',
  cohabitedFirst: 'cohabitation_before_marriage', cohabMonths: 'cohabitation_before_marriage', status: 'cohabitation_before_marriage',
  priorChildren: 'premarital_birth_timing', kidsBefore: 'premarital_birth_timing', expecting: 'premarital_birth_timing',
  religion: 'religious_attendance', attendDetail: 'religious_attendance',
  wages: 'income_employment', work: 'income_employment', familyIncome: 'income_employment',
  netWorth: 'debt_finances', debt: 'debt_finances', unsecuredDebt: 'debt_finances', homeOwner: 'debt_finances',
  obsNeg: 'conflict_behaviour', obsPos: 'conflict_behaviour', obsEff: 'conflict_behaviour',
};
export const DESIGN_LABEL = {
  experimental: 'randomised trials',
  quasi_experimental: 'natural experiments',
  prospective_observational_adjusted: 'adjusted observational studies',
  retrospective_observational: 'retrospective surveys',
  cross_sectional: 'cross-sectional surveys',
  expert_consensus: 'expert consensus',
};
// Grades that support reading a change as a cause (anything else is an association).
export const CAUSAL_DESIGNS = new Set(['experimental', 'quasi_experimental']);

export function gradeFor(field, evidence) {
  const f = FIELD_FACTOR[field];
  const g = f && (evidence?.factor_grades || []).find((x) => x.factor === f);
  if (!g) return null;
  return { factor: g.factor, label: g.label, design: g.strongest_design, designLabel: DESIGN_LABEL[g.strongest_design] || g.strongest_design.replace(/_/g, ' '), causal: CAUSAL_DESIGNS.has(g.strongest_design), reading: g.causal_reading || '', direction: g.direction || '' };
}

// ---- Partner mixes ------------------------------------------------------------------------
// A mix is { profiles: [{ weight, partner, couple, traits, label }], n, coverage, note }:
// weights sum to 1 over the published profiles. Two mixes per person:
//   likely   - partnerCell(): the partners married by people of my sex, age band and race;
//   everyone - every conditioning cell of my sex pooled, each profile weighted by the cell's
//              marriages times its share (cells are population-weighted shares already).
const NSFG_GAP = { 'wife older': 'wife older', '0-2 years': 'husband 0–2 years older', '3-5 years': 'husband 3–5 years older', '6-9 years': 'husband 6–9 years older', '10+ years': 'husband 10+ years older' };
export function describeNsfgTraits(t, me) {
  const out = [NSFG_GAP[t.gap_bin] || t.gap_bin];
  if (me.sex === 'Woman') {
    if (t.husband_married_before) out.push(t.husband_married_before === 'Yes' ? 'married before' : 'not married before');
    if (t.husband_prior_children && t.husband_prior_children !== 'Unknown') out.push(t.husband_prior_children === 'Yes' ? 'has children from before' : 'no children from before');
    if (t.race) out.push(t.race === me.raceEth ? `${t.race} (same as you)` : t.race);
    else if (t.same_race_ethnicity && t.same_race_ethnicity !== 'Unknown') out.push(t.same_race_ethnicity === 'Same' ? 'same race-ethnicity' : 'different race-ethnicity');
  } else {
    if (t.wife_race_ethnicity) out.push(t.wife_race_ethnicity);
    if (t.wife_intact_family) out.push(t.wife_intact_family === 'Yes' ? 'grew up with both parents' : 'did not grow up with both parents');
  }
  if (t.cohabited_first && t.cohabited_first !== 'Unknown') out.push(t.cohabited_first === 'Yes' ? 'lived together first' : 'did not live together first');
  return out.join(', ');
}

const NLSY_BAND_MID = { '<20': 19, '20-24': 22, '25-29': 27, '30-34': 32, '35+': 38 };
const NLSY_SCHOOL = { '<12 years': '<12 years', '12 years': '12 years', '13-15 years': '13–15 years', '16+ years': '16–17 years' };
const nlsyBand = (age) => (age < 20 ? '<20' : age < 25 ? '20-24' : age < 30 ? '25-29' : age < 35 ? '30-34' : '35+');

function mergeProfiles(list) {
  const by = new Map();
  for (const p of list) {
    const k = JSON.stringify(p.traits);
    const cur = by.get(k);
    if (cur) cur.weight += p.weight;
    else by.set(k, { ...p });
  }
  const tot = [...by.values()].reduce((s, p) => s + p.weight, 0);
  return [...by.values()].map((p) => ({ ...p, weight: p.weight / tot })).sort((x, y) => y.weight - x.weight);
}

// The marginal race-ethnicity of the opposite-sex partners in an NSFG-shaped distribution: the
// conditioning cells of the other sex carry each person's own race and their number of marriages.
function partnerRaceMarginal(pd, me) {
  const cells = me.sex === 'Woman' ? pd.given_husband : pd.given_wife;
  const key = me.sex === 'Woman' ? 'husband_race_ethnicity' : 'wife_race_ethnicity';
  const by = {};
  for (const c of cells || []) by[c.given[key]] = (by[c.given[key]] || 0) + c.n;
  const tot = Object.values(by).reduce((s, x) => s + x, 0);
  return Object.entries(by).map(([race, n]) => ({ race, share: n / tot }));
}

function nsfgMix(pd, me, c0, kind) {
  const woman = me.sex === 'Woman';
  if (kind === 'likely') {
    const { cell, reason } = partnerCell(pd, me, c0);
    if (!cell) return { reason };
    if (cell.coverage < MIN_COVERAGE) return { reason: `The partner profiles that can be published cover only ${Math.round(100 * cell.coverage)}% of the ${cell.n} surveyed marriages like you, so the average would not be realistic.` };
    return {
      n: cell.n, coverage: cell.coverage, given: cell.given,
      profiles: cell.profiles.map((p) => ({ weight: p.share, traits: p.traits, label: describeNsfgTraits(p.traits, me), ...partnerFromProfile(me, p.traits, pd, c0) })),
    };
  }
  const cells = woman ? pd.given_wife : pd.given_husband;
  if (!cells?.length) return { reason: 'This lens publishes no partner distribution for your sex.' };
  const raw = [];
  let n = 0;
  let covered = 0;
  for (const c of cells) {
    n += c.n;
    covered += c.n * c.coverage;
    for (const p of c.profiles) {
      // Race is relative to the respondent in the wife's cells ("same"/"different"); it is
      // replaced below by the partners' own race-ethnicity mix.
      const t = { ...p.traits };
      if (woman) delete t.same_race_ethnicity;
      raw.push({ weight: c.n * c.coverage * p.share, traits: t });
    }
  }
  let merged = mergeProfiles(raw);
  if (woman) {
    const races = partnerRaceMarginal(pd, me);
    merged = merged.flatMap((p) => races.map((r) => ({ weight: p.weight * r.share, traits: { ...p.traits, race: r.race } })));
  }
  const profiles = merged.map((p) => {
    const built = partnerFromProfile(me, p.traits, pd, c0);
    if (p.traits.race) built.partner.raceEth = p.traits.race;
    return { weight: p.weight, traits: p.traits, label: describeNsfgTraits(p.traits, me), ...built };
  });
  return {
    n, coverage: covered / n, profiles,
    note: woman
      ? 'Husbands’ age gaps, earlier marriages and children, and whether the couple lived together first, pooled over the marriages of women of every age band and race-ethnicity; the husband’s race-ethnicity follows all husbands in the survey, assumed independent of the rest.'
      : 'Wives’ age gaps, race-ethnicity, family of origin and whether the couple lived together first, pooled over the marriages of men of every age band and race-ethnicity.',
  };
}

function nlsyMix(pd, me, c0, kind) {
  const age = num(me.age);
  const band = nlsyBand(age);
  const cells = (pd.spouse_traits_given_respondent || []).filter((c) => c.given.sex === me.sex && c.given.age_band !== undefined && (kind === 'everyone' || c.given.age_band === band));
  if (!cells.length) return { reason: `Fewer than ${pd.min_cell_n || 30} surveyed marriages match your sex and age band, so there is no partner distribution for you.` };
  const raw = [];
  let n = 0;
  let covered = 0;
  for (const c of cells) {
    const cov = 1 - (c.suppressed_share || 0);
    n += c.n;
    covered += c.n * cov;
    for (const s of c.cells) {
      // Age as the gap between the band middles, applied to your age.
      const gap = NLSY_BAND_MID[s.spouse_age_band] - NLSY_BAND_MID[c.given.age_band];
      raw.push({ weight: c.n * s.share, traits: { gap, school: s.spouse_education } });
    }
  }
  const coverage = covered / n;
  if (kind === 'likely' && coverage < MIN_COVERAGE) return { reason: `The published partner profiles cover only ${Math.round(100 * coverage)}% of the surveyed marriages like you.` };
  const profiles = mergeProfiles(raw).map((p) => ({
    weight: p.weight, traits: p.traits,
    label: `${p.traits.gap === 0 ? 'same age band' : p.traits.gap > 0 ? `about ${p.traits.gap} years older` : `about ${-p.traits.gap} years younger`}, ${String(p.traits.school).replace(/-/g, '–')} of schooling`,
    partner: { sex: me.sex === 'Woman' ? 'Man' : 'Woman', age: age + p.traits.gap, school: NLSY_SCHOOL[p.traits.school] || '', degree: '', priorMarriage: false, raceEth: me.raceEth },
    couple: { ...c0, perspectives: ['a'] },
  }));
  return { n, coverage, profiles, note: 'Spouse ages are scored at the middle of their band, as a gap from yours; the spouse enters through age and schooling only.' };
}

// The two mixes for a person, or the reason a lens has none.
// Partner traits a distribution does not describe (e.g. a wife's mother's schooling in NSFG
// 1995-2023) are held at `template`, the other person as entered, so the lens can score them.
export function partnerMix(bundle, me, couple = {}, kind = 'likely', template = null) {
  const raw = rawMix(bundle, me, couple, kind);
  if (!raw.profiles) return raw;
  // Published shares are rounded; renormalise so the weights sum to exactly 1.
  const tot = raw.profiles.reduce((s, p) => s + p.weight, 0);
  const mix = { ...raw, profiles: raw.profiles.map((p) => ({ ...p, weight: p.weight / tot })) };
  if (!template) return mix;
  const keep = { ...template };
  for (const k of ['sex', 'age', 'firstMarriageAge']) delete keep[k];
  return { ...mix, profiles: mix.profiles.map((p) => ({ ...p, partner: { ...keep, ...p.partner } })) };
}
function rawMix(bundle, me, couple, kind) {
  const pd = bundle.partner_distribution;
  const ad = adapterFor(bundle);
  const c0 = { ...couple, yearsMarried: 0 };
  if (ad.selfOnly) return { selfOnly: true, reason: 'This lens scores each person from their own traits; the partner does not enter, so there is no partner mix to average over.' };
  if (pd && (pd.given_wife || pd.given_husband)) {
    if (me.sex !== 'Woman' && me.sex !== 'Man') return { reason: 'Choose a sex: the partner distribution is by sex.' };
    if (kind === 'likely' || ['Hispanic', 'White', 'Black', 'Other', 'Asian'].includes(me.raceEth)) return nsfgMix(pd, me, c0, kind);
    return { reason: 'This lens needs your race-ethnicity to score any partner.' };
  }
  if (pd && pd.spouse_traits_given_respondent) return nlsyMix(pd, me, c0, kind);
  return { reason: ad.justMeReason || 'This lens publishes no partner distribution (who married whom), so it cannot average over partners. Lenses with one: NSFG 2002, NSFG 1995–2023 and NLSY79 first marriages.' };
}

// Deterministic PRNG for the resampling interval.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Gamma(k, 1) for integer-ish k via Marsaglia–Tsang; used for Dirichlet draws of the mix.
function gamma(k, rnd) {
  if (k < 1) return gamma(k + 1, rnd) * Math.pow(rnd(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      const u1 = rnd() || 1e-12;
      const u2 = rnd();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rnd();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
const quantile = (xs, q) => {
  const v = xs.slice().sort((x, y) => x - y);
  const i = (v.length - 1) * q;
  const lo = Math.floor(i);
  return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (i - lo);
};

// Average the lens's risk at horizon h over a mix. Each scoring model is averaged separately,
// so the model range is the spread of model averages. The 95% interval resamples the mix
// shares (Dirichlet with the cell's marriages as the concentration) holding each profile's
// risk fixed: it is the uncertainty from who married whom in the survey, not the models'.
export function scoreMix(bundle, me, mix, h, { draws = 400, seed = 20261020, top = 5 } = {}) {
  const models = scoringModels(bundle);
  const scored = [];
  let refusedWeight = 0;
  const reasons = new Set();
  for (const p of mix.profiles) {
    const why = refusals(bundle, me, p.partner, p.couple);
    if (why.length) { refusedWeight += p.weight; reasons.add(why[0]); continue; }
    const y = stepAt(project(bundle, me, p.partner, p.couple, h), h);
    if (!y) continue;
    const perModel = Object.fromEntries(models.map((m) => [m.key, 1 - y.survival[m.key]]));
    scored.push({ ...p, risk: 1 - y.meanSurvival, riskMin: 1 - y.maxSurvival, riskMax: 1 - y.minSurvival, perModel, inSupport: y.inSupport });
  }
  const used = scored.reduce((s, p) => s + p.weight, 0);
  if (!used) return { available: false, reason: 'The lens abstains for every partner profile in this mix' + (reasons.size ? ': ' + [...reasons][0] : '.') };
  const perModel = Object.fromEntries(models.map((m) => [m.key, scored.reduce((s, p) => s + p.weight * p.perModel[m.key], 0) / used]));
  const pm = Object.values(perModel);
  const risk = scored.reduce((s, p) => s + p.weight * p.risk, 0) / used;
  // Dirichlet resampling of the shares.
  const rnd = mulberry32(seed);
  const conc = Math.max(1, mix.n || 100);
  const sims = [];
  for (let d = 0; d < draws; d++) {
    let tot = 0;
    let acc = 0;
    for (const p of scored) {
      const g = gamma(Math.max(1e-3, (conc * p.weight) / used), rnd);
      tot += g;
      acc += g * p.risk;
    }
    sims.push(acc / tot);
  }
  const typesTop = scored.slice().sort((x, y) => y.weight - x.weight).slice(0, top).map((p) => ({ share: p.weight / used, label: p.label, risk: p.risk, riskMin: p.riskMin, riskMax: p.riskMax, inSupport: p.inSupport }));
  return {
    available: true, horizon: h, risk, riskMin: Math.min(...pm), riskMax: Math.max(...pm), perModel,
    ci: [quantile(sims, 0.025), quantile(sims, 0.975)],
    usedShare: used, refusedShare: refusedWeight, refusedReason: reasons.size ? [...reasons][0] : null,
    profiles: scored.length, n: mix.n, coverage: mix.coverage, note: mix.note || null, top: typesTop,
    lowest: scored.slice().sort((x, y) => x.risk - y.risk)[0] ? (({ label, risk, riskMin, riskMax, weight }) => ({ label, risk, riskMin, riskMax, share: weight / used }))(scored.slice().sort((x, y) => x.risk - y.risk)[0]) : null,
    allInSupport: scored.every((p) => p.inSupport),
  };
}

// Overall percentile of a cumulative risk at h in the lens's population reference, plus the
// population median ("the average couple"), or null when the reference cannot say. A
// reference built from one model is compared with that model's own risk (perModel).
export function overallStanding(bundle, me, partner, couple, risk, h, perModel = null) {
  const ref = referenceFor(bundle);
  if (!ref || ref.quantity !== 'cumulative') return null;
  let r = risk;
  if (ref.model) {
    if (!perModel || !Number.isFinite(perModel[ref.model])) return null;
    r = perModel[ref.model];
  }
  const hh = ref.horizons.find((x) => Math.abs(x - h) < 0.02);
  if (hh === undefined) return null;
  const attrs = partner ? referenceAttrs(bundle, me, partner, { ...couple, yearsMarried: 0 }) : {};
  const cmp = compareRisks(ref, { [hh]: r }, attrs);
  const row = cmp?.horizons[0];
  return row ? { ...row.overall, model: ref.model || null } : null;
}

// ---- Factor impact ------------------------------------------------------------------------
// For each partner trait the lens searches, and each of my own (and the couple's) changeable
// traits, the risk at h across the trait's levels holding everything else as entered: the
// spread (highest minus lowest mean risk), the best and worst levels, and how many models put
// the same level best. Sorted by spread.
const OWN_FIELD_LABEL = { degree: 'Highest degree', school: 'Years of schooling', work: 'Work hours', wages: 'Wages', religion: 'Religious attendance', attendDetail: 'Religious attendance (detail)', familyIncome: 'Family income', cohabitedFirst: 'Living together before the wedding', age: 'Timing of the wedding', status: 'Living arrangement', homeOwner: 'Home ownership', quality: 'Relationship quality', hapmar: 'Marriage happiness', obsNeg: 'Hostile conflict (self-rated)', obsPos: 'Warmth in conflict (self-rated)', obsEff: 'Calm problem-solving (self-rated)', netWorth: 'Net worth', debt: 'Debt', cohabMonths: 'Months living together first', enrolled: 'In school at the wedding' };

function partnerFactors(dash, evidence) {
  return dash.perTrait.map((t) => {
    const rows = t.rows.filter((r) => Number.isFinite(r.meanSurvival));
    if (rows.length < 2) return null;
    const risks = rows.map((r) => 1 - r.meanSurvival);
    const hi = Math.max(...risks);
    const lo = Math.min(...risks);
    const best = rows[risks.indexOf(lo)];
    const worst = rows[risks.indexOf(hi)];
    const field = t.key === 'age' ? 'gap' : t.key;
    return {
      side: 'partner', key: t.key, label: t.label, changeable: 'who you choose (fixed for any one person)', kind: 'partner',
      spread: hi - lo, best: best.label, bestRisk: lo, worst: worst.label, worstRisk: hi, levels: rows.length,
      grade: gradeFor(field, evidence),
    };
  }).filter(Boolean);
}

function ownFactors(w, evidence) {
  // Group the what-ifs by the field they change; the "as entered" level has change 0.
  const groups = new Map();
  for (const it of w.items) {
    const keys = it.keys.map((k) => k.split('.')[1]);
    const field = keys.find((k) => OWN_FIELD_LABEL[k]) || keys[0];
    const group = keys.includes('age') && it.keys.some((k) => k.startsWith('b.')) ? 'age' : field;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(it);
  }
  const h = w.rankAt;
  const out = [];
  for (const [field, items] of groups) {
    const deltas = items.map((it) => -it.at[h].delta); // change in risk
    const all = [0, ...deltas];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const bestIdx = deltas.indexOf(Math.min(...deltas));
    const worstIdx = deltas.indexOf(Math.max(...deltas));
    out.push({
      side: 'you', key: field, label: OWN_FIELD_LABEL[field] || field, changeable: items[0].changeability, kind: 'own',
      spread: hi - lo,
      best: deltas[bestIdx] < 0 ? items[bestIdx].label : 'as you are now', bestDelta: Math.min(0, deltas[bestIdx]),
      worst: deltas[worstIdx] > 0 ? items[worstIdx].label : 'as you are now', worstDelta: Math.max(0, deltas[worstIdx]),
      levels: items.length + 1, grade: gradeFor(field, evidence),
    });
  }
  return out;
}

// ---- The report for one person -------------------------------------------------------------
export function personReport(bundle, me, other, couple = {}, { evidence = null, top = 5, draws = 400, cap = 300 } = {}) {
  const h = primaryHorizon(bundle);
  const c0 = { ...couple, yearsMarried: 0 };
  const out = { horizon: h, models: scoringModels(bundle).length };
  // (a), (b)
  for (const kind of ['everyone', 'likely']) {
    const mix = partnerMix(bundle, me, couple, kind, other);
    out[kind] = mix.profiles ? scoreMix(bundle, me, mix, h, { draws, top, seed: kind === 'likely' ? 7 : 11 }) : { available: false, selfOnly: !!mix.selfOnly, reason: mix.reason };
    if (out[kind].available) out[kind].standing = overallStanding(bundle, me, mix.profiles[0].partner, c0, out[kind].risk, h, out[kind].perModel);
  }
  // Subgroup percentiles for the likely-partner average come from justMe (one implementation).
  const jm = justMe(bundle, me, c0, { horizons: lensHorizons(bundle) });
  if (jm.available) {
    const cmp = jm.comparison?.horizons.find((x) => Math.abs(x.horizon - h) < 0.02) || null;
    out.likelySubgroups = cmp ? cmp.subgroups.filter((s) => Number.isFinite(s.percentile)) : [];
    if (jm.selfOnly) {
      const y = jm.horizons.find((x) => Math.abs(x.horizon - h) < 0.02);
      if (y) out.self = { risk: 1 - y.meanSurvival, riskMin: 1 - y.maxSurvival, riskMax: 1 - y.minSurvival, standing: cmp?.overall || null, subgroups: out.likelySubgroups };
    }
  }
  // With the person entered as partner, from the wedding day.
  const w = atWedding(me, other, couple);
  const why = refusals(bundle, w.a, w.b, w.couple);
  if (!why.length && other) {
    const y = stepAt(project(bundle, w.a, w.b, w.couple, h), h);
    const cmp = populationComparison(bundle, me, other, couple);
    const row = cmp && !cmp.refused ? cmp.horizons.find((x) => Math.abs(x.horizon - h) < 0.02) : null;
    out.withPartner = y ? { risk: 1 - y.meanSurvival, riskMin: 1 - y.maxSurvival, riskMax: 1 - y.minSurvival, inSupport: y.inSupport, standing: row?.overall || null, subgroups: row ? row.subgroups.filter((s) => Number.isFinite(s.percentile)) : [] } : null;
  } else out.withPartner = { refused: why[0] || 'No partner entered.' };
  // (d) and (e): the dashboard's search and per-trait view, with this person as "me".
  const ad = adapterFor(bundle);
  const canSearch = ad.partnerTraits && ad.partnerTraits(me).length && other && !why.length;
  let partnerFx = [];
  if (canSearch) {
    const dash = partnerDashboard(bundle, me, other, c0, emptyConstraints(), { cap, horizons: [h], rankAt: h, show: 0 });
    const r = dash.ranking;
    out.lowest = {
      list: r.ranked.slice(0, top).map((x) => ({ label: x.description, risk: 1 - x.meanSurvival, riskMin: 1 - x.maxSurvival, riskMax: 1 - x.minSurvival, beats: x.beats, inSupport: x.inSupport, tied: x.indistinguishable })),
      considered: r.ranked.length, tied: r.tied, distinctTops: r.distinctTops, models: r.models,
      perModelTop: r.perModelTop.map((t) => ({ model: t.model, risk: 1 - t.survival })),
      held: dash.space.heldForSpeed,
    };
    partnerFx = partnerFactors(dash, evidence);
  } else out.lowest = { reason: !ad.partnerTraits || !ad.partnerTraits(me).length ? 'This lens takes no partner traits it can search, so it cannot rank partner profiles.' : why[0] || 'Enter the other person to search partner profiles around them.' };
  // (e), (f): own and couple changes, scored at the wedding day for a couple marrying now.
  let own = [];
  if (other && !why.length) {
    const wi = whatIfs(bundle, me, other, c0, emptyConstraints(), { horizons: [h], rankAt: h });
    own = ownFactors(wi, evidence);
    out.changes = wi.items.filter((it) => it.at[h].delta > 0).slice(0, top).map((it) => {
      const keys = it.keys.map((k) => k.split('.')[1]);
      const grade = keys.map((k) => gradeFor(k, evidence)).find(Boolean) || null;
      return { label: it.label, riskDrop: it.at[h].delta, lo: it.at[h].lo, hi: it.at[h].hi, agree: it.at[h].agree, models: it.models, unchanged: it.unchanged, changeability: it.changeability, inSupport: it.inSupport, grade };
    });
    out.combined = wi.combined ? { labels: wi.combined.labels, riskDrop: wi.combined.at[h].delta, lo: wi.combined.at[h].lo, hi: wi.combined.at[h].hi, agree: wi.combined.at[h].agree, models: wi.combined.models } : null;
  } else out.changes = [];
  out.factors = [...partnerFx, ...own].sort((x, y) => y.spread - x.spread);
  return out;
}

// Both people: "you" with the other as reference partner, and the other the same way round.
export function profileReport(bundle, a, b, couple = {}, opts = {}) {
  return { you: personReport(bundle, a, b, couple, opts), them: personReport(bundle, b, a, couple, opts), horizon: primaryHorizon(bundle) };
}

// The lens-by-lens table of (a) and (b) for one person: every scorable lens with a partner mix.
export function mixAcrossLenses(lenses, me, couple = {}, { draws = 200, template = null } = {}) {
  return lenses.filter((l) => l.summary.scorable).map((l) => {
    const h = primaryHorizon(l.bundle);
    const res = { id: l.summary.id, label: l.summary.label, horizon: h };
    for (const kind of ['everyone', 'likely']) {
      const mix = partnerMix(l.bundle, me, couple, kind, template);
      res[kind] = mix.profiles ? scoreMix(l.bundle, me, mix, h, { draws, top: 3 }) : { available: false, selfOnly: !!mix.selfOnly, reason: mix.reason };
    }
    return res;
  }).filter((r) => r.everyone.available || r.likely.available);
}

// Plain-language helpers shared by the UI and tests.
export const inHundred = (risk) => Math.round(100 * risk);
export function aboveBelow(standing) {
  if (!standing || !Number.isFinite(standing.percentile)) return null;
  const p = standing.percentile;
  if (p >= 60) return 'above';
  if (p <= 40) return 'below';
  return 'about average';
}
export { RACE_ETH };
