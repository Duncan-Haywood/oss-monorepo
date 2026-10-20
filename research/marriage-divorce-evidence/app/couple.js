// Couple layer: turns two people's profiles into the NLSY79 model inputs, projects
// year-by-year divorce hazards, flags out-of-support inputs, and ranks what-if changes.
// Pure functions; no DOM. tests/couple.test.mjs covers it.
import { predict, contributions, explainTree } from './engine.js';

export const SCHOOL = ['<12 years', '12 years', '13–15 years', '16–17 years', '18+ years'];
export const DEGREE = ['Less than high school', 'High school', 'Some college', 'Associate', 'Bachelor', 'Master', 'PhD', 'Professional'];
export const WORK = ['No work hours', '1–1,999 hours', '2,000+ hours'];
export const RELIGION = ['Never', 'Less than weekly', 'Weekly or more'];
export const WAVE = '2020'; // latest training wave; wages are prior-calendar-year dollars

function band(x, cuts, zeroBand) {
  if (x === null || x === undefined || !Number.isFinite(x) || x < 0) return 'Unknown';
  if (zeroBand && x === 0) return 'Zero';
  return 'Q' + (1 + cuts.filter((c) => x > c).length);
}

export function earningsPair(hw, ww) {
  if (!Number.isFinite(hw) || !Number.isFinite(ww)) return 'Unknown';
  const total = hw + ww;
  if (total === 0) return 'Both zero wages';
  if (ww === 0) return 'Husband only';
  if (hw === 0) return 'Wife only';
  const share = ww / total;
  if (share >= 0.4 && share <= 0.6) return 'Balanced 40–60% wife';
  return share < 0.4 ? 'Husband majority, both positive' : 'Wife majority, both positive';
}

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

// One model row from the perspective of `resp` (the survey respondent) married to `spouse`.
// `years` = completed years of this marriage; ages advance with it.
export function modelRow(bundle, resp, spouse, couple, years) {
  const man = resp.sex === 'Man' ? resp : spouse;
  const woman = resp.sex === 'Man' ? spouse : resp;
  const cuts = bundle.cutpoints[WAVE];
  const hw = num(man.wages);
  const ww = num(woman.wages);
  const total = Number.isFinite(hw) && Number.isFinite(ww) ? hw + ww : NaN;
  const family = Number.isFinite(num(couple.familyIncome)) ? num(couple.familyIncome) : total;
  const wifeShare = total > 0 ? ww / total : null;
  const r = {
    age: num(resp.age) + years,
    current_marriage_years: num(couple.yearsMarried) + years,
    first_marriage_age: Number.isFinite(num(resp.firstMarriageAge)) ? num(resp.firstMarriageAge) : null,
    wife_wage_share: wifeShare,
    husband_school: man.school || 'Unknown',
    wife_school: woman.school || 'Unknown',
    total_wage_band: band(total, cuts.total, true),
    earnings_pair: earningsPair(hw, ww),
    sex: resp.sex === 'Man' ? 'Men' : 'Women',
    marriage_order_group: resp.priorMarriage ? 'Subsequent' : 'First',
    wave_cat: WAVE,
    education: resp.degree || 'Unknown',
    work: resp.work || 'Unknown',
    religion_refresh: resp.religion || 'Unknown',
    family_income_band: band(family, cuts.family, false),
    husband_wage_band_train: band(hw, cuts.individual, true),
    wife_wage_band_train: band(ww, cuts.individual, true),
  };
  for (const c of ['age', 'current_marriage_years', 'first_marriage_age', 'wife_wage_share']) {
    r[c + '_missing'] = r[c] === null || Number.isNaN(r[c]) ? 'Missing' : 'Observed';
  }
  r.school_pair = r.husband_school + ' | ' + r.wife_school;
  r.role_total_pair = r.earnings_pair + ' | ' + r.total_wage_band;
  return r;
}

// Reasons the models cannot speak to this couple at all (refuse rather than guess).
export function unsupported(a, b) {
  const out = [];
  if (!a.sex || !b.sex) out.push('Choose both partners’ sex: the models were trained on opposite-sex married couples only.');
  else if (a.sex === b.sex) out.push('These models were trained only on opposite-sex married couples in the NLSY79, so they cannot estimate risk for a same-sex couple. Rather than guess, the app shows no number.');
  for (const p of [a, b]) {
    if (!Number.isFinite(num(p.age)) || num(p.age) < 16 || num(p.age) > 100) out.push('Enter an age between 16 and 100 for both partners.');
  }
  return [...new Set(out)];
}

// Which raw inputs fall outside the training data range at a given year (per perspective).
export function supportIssues(bundle, row) {
  const s = bundle.support;
  const out = [];
  const age = row.age;
  if (age < s.age[0] || age > s.age[1]) out.push(`age ${age.toFixed(0)} (trained on ${s.age[0]}–${s.age[1]})`);
  const d = row.current_marriage_years;
  if (d < s.current_marriage_years[0] || d > s.current_marriage_years[1]) out.push(`marriage year ${d.toFixed(0)} (trained up to ${s.current_marriage_years[1].toFixed(0)})`);
  const f = row.first_marriage_age;
  if (f !== null && (f < s.first_marriage_age[0] || f > s.first_marriage_age[1])) out.push(`age at first marriage ${f}`);
  return out;
}

// Annual rate for a couple: the average over both partners' respondent perspectives,
// because the survey respondent's sex and own traits are model inputs.
export function coupleRate(bundle, model, a, b, couple, years) {
  return (predict(model, modelRow(bundle, a, b, couple, years)) + predict(model, modelRow(bundle, b, a, couple, years))) / 2;
}

// Year-by-year projection. P(divorce in year k | married at its start) = 1 - exp(-rate_k).
// Mortality is not modelled: "still married" means "no divorce, if both partners live".
export function project(bundle, a, b, couple, horizon = 40, models = bundle.models) {
  const years = [];
  let surv = Object.fromEntries(models.map((m) => [m.key, 1]));
  for (let k = 0; k < horizon; k++) {
    const rates = {};
    const yearProb = {};
    const survivalEnd = {};
    for (const m of models) {
      rates[m.key] = coupleRate(bundle, m, a, b, couple, k);
      yearProb[m.key] = 1 - Math.exp(-rates[m.key]);
      surv[m.key] *= Math.exp(-rates[m.key]);
      survivalEnd[m.key] = surv[m.key];
    }
    const issues = [
      ...supportIssues(bundle, modelRow(bundle, a, b, couple, k)),
      ...supportIssues(bundle, modelRow(bundle, b, a, couple, k)),
    ];
    const vals = Object.values(yearProb);
    const svals = Object.values(survivalEnd);
    years.push({
      year: num(couple.yearsMarried) + k + 1,
      rates,
      yearProb,
      survival: survivalEnd,
      meanYearProb: vals.reduce((x, y) => x + y, 0) / vals.length,
      meanSurvival: svals.reduce((x, y) => x + y, 0) / svals.length,
      minSurvival: Math.min(...svals),
      maxSurvival: Math.max(...svals),
      inSupport: issues.length === 0,
      issues: [...new Set(issues)],
    });
  }
  return years;
}

// Survival under the training-average (constant) rate, for comparison with the models.
export function constantSurvival(bundle, n) {
  return Math.exp(-bundle.constant_rate * n);
}

// Per-input explanation for one model, averaged over both perspectives (GLMs only).
export function explain(bundle, model, a, b, couple, years = 0) {
  const ra = modelRow(bundle, a, b, couple, years);
  const rb = modelRow(bundle, b, a, couple, years);
  if (model.kind === 'tree') return { tree: [explainTree(model, ra), explainTree(model, rb)] };
  const ca = contributions(model, ra);
  const cb = contributions(model, rb);
  const terms = {};
  for (const k of new Set([...Object.keys(ca.terms), ...Object.keys(cb.terms)])) {
    terms[k] = ((ca.terms[k] || 0) + (cb.terms[k] || 0)) / 2;
  }
  return { intercept: ca.intercept, terms };
}

// Group raw model columns into what a person would recognise.
export const TERM_LABELS = {
  age: 'Age',
  age_missing: 'Age',
  current_marriage_years: 'Years married',
  current_marriage_years_missing: 'Years married',
  first_marriage_age: 'Age at first marriage',
  first_marriage_age_missing: 'Age at first marriage',
  wife_wage_share: 'Wife’s share of wages',
  wife_wage_share_missing: 'Wife’s share of wages',
  husband_school: 'Husband’s schooling',
  wife_school: 'Wife’s schooling',
  school_pair: 'Schooling combination',
  total_wage_band: 'Combined wages',
  earnings_pair: 'Who earns',
  role_total_pair: 'Who earns × combined wages',
  sex: 'Respondent sex (survey design)',
  marriage_order_group: 'First or later marriage',
  wave_cat: 'Survey year',
  education: 'Own highest degree',
  work: 'Own work hours',
  religion_refresh: 'Own religious attendance',
  family_income_band: 'Family income',
  husband_wage_band_train: 'Husband’s wages',
  wife_wage_band_train: 'Wife’s wages',
};

export function groupedTerms(terms) {
  const out = {};
  for (const [k, v] of Object.entries(terms)) {
    const label = TERM_LABELS[k] || k;
    out[label] = (out[label] || 0) + v;
  }
  return Object.entries(out).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
}

const survivalAt = (bundle, a, b, couple, n) => {
  const p = project(bundle, a, b, couple, n);
  return p[p.length - 1];
};

// What-if changes for one partner, scored by the change in mean n-year survival across
// models, with the count of models that agree on the direction.
export function selfChanges(bundle, who, a, b, couple, n = 10) {
  const base = survivalAt(bundle, a, b, couple, n);
  const person = who === 'a' ? a : b;
  const options = [];
  const tryChange = (label, patch) => {
    const p2 = { ...person, ...patch };
    const r = who === 'a' ? survivalAt(bundle, p2, b, couple, n) : survivalAt(bundle, a, p2, couple, n);
    const deltas = bundle.models.map((m) => r.survival[m.key] - base.survival[m.key]);
    const delta = r.meanSurvival - base.meanSurvival;
    options.push({
      label,
      delta,
      lo: Math.min(...deltas),
      hi: Math.max(...deltas),
      // Models that move the same way as the average (ties count as not agreeing).
      agree: deltas.filter((d) => (delta >= 0 ? d > 0 : d < 0)).length,
      models: deltas.length,
    });
  };
  for (const w of WORK) if (w !== person.work) tryChange(`Work hours: ${w}`, { work: w });
  for (const r of RELIGION) if (r !== person.religion) tryChange(`Religious attendance: ${r}`, { religion: r });
  const di = DEGREE.indexOf(person.degree);
  for (const d of DEGREE.slice(Math.max(di + 1, 0))) {
    const si = Math.min(SCHOOL.length - 1, Math.max(SCHOOL.indexOf(person.school), defaultSchool(d)));
    tryChange(`Complete a ${d.toLowerCase()} degree`, { degree: d, school: SCHOOL[si] });
  }
  const w = num(person.wages);
  if (Number.isFinite(w)) {
    tryChange('Wages +25%', { wages: Math.round(w * 1.25) });
    if (w > 0) tryChange('Wages −25%', { wages: Math.round(w * 0.75) });
  }
  return options.sort((x, y) => y.delta - x.delta);
}

function defaultSchool(degree) {
  return { 'Less than high school': 0, 'High school': 1, 'Some college': 2, Associate: 2, Bachelor: 3, Master: 4, PhD: 4, Professional: 4 }[degree];
}

// Partner profiles that the models associate with the highest n-year survival, varying
// only the partner's schooling, degree, wages and age within +/-maxAgeGap of `me`.
// There is deliberately no single answer: `tied` counts the profiles whose model range
// overlaps the top profile's, and `beats` how many models score a profile above the
// partner as entered.
export function idealPartners(bundle, me, partnerTemplate, couple, { n = 10, maxAgeGap = 6, top = 5 } = {}) {
  const wageGrid = [0, 15000, 30000, 50000, 80000, 120000];
  const degrees = [['High school', '12 years'], ['Some college', '13–15 years'], ['Bachelor', '16–17 years'], ['Master', '18+ years'], ['Professional', '18+ years']];
  const current = survivalAt(bundle, me, partnerTemplate, couple, n);
  const results = [];
  for (let gap = -maxAgeGap; gap <= maxAgeGap; gap += 3) {
    for (const [degree, school] of degrees) {
      for (const wages of wageGrid) {
        const p = { ...partnerTemplate, age: num(me.age) + gap, degree, school, wages };
        const proj = project(bundle, me, p, couple, n);
        const r = proj[proj.length - 1];
        results.push({
          partner: p,
          meanSurvival: r.meanSurvival,
          minSurvival: r.minSurvival,
          maxSurvival: r.maxSurvival,
          survival: r.survival,
          beats: bundle.models.filter((m) => r.survival[m.key] > current.survival[m.key]).length,
          inSupport: proj.every((y) => y.inSupport),
        });
      }
    }
  }
  results.sort((x, y) => y.meanSurvival - x.meanSurvival);
  const best = results.slice(0, top);
  const worst = results[results.length - 1];
  const tied = results.filter((r) => r.maxSurvival >= best[0].minSurvival).length;
  // Each model's own favourite profile; how many distinct ones there are shows (dis)agreement.
  const perModelTop = bundle.models.map((m) => {
    const r = results.reduce((x, y) => (y.survival[m.key] > x.survival[m.key] ? y : x));
    return { model: m.label, partner: r.partner, survival: r.survival[m.key] };
  });
  const key = (p) => `${p.age}|${p.degree}|${p.wages}`;
  return {
    perModelTop,
    distinctTops: new Set(perModelTop.map((t) => key(t.partner))).size,
    best,
    worst,
    considered: results.length,
    tied,
    current: { meanSurvival: current.meanSurvival, minSurvival: current.minSurvival, maxSurvival: current.maxSurvival },
    models: bundle.models.length,
  };
}

// ---- Evidence lenses -------------------------------------------------------------------
// Every model bundle in models/ is a lens with its own population and target. The form
// below maps to NLSY79 couple inputs; a lens whose inputs the form cannot fill is still
// listed, with its population, target and skill, but gives no number.
export const FORM_ADAPTERS = ['nlsy79_couples'];

export function lensSummary(bundle, entry = {}) {
  const metrics = (bundle.models || []).map((m) => ({ key: m.key, label: m.label, ...(m.heldout || {}) }));
  const dev = metrics.filter((m) => Number.isFinite(m.deviance_improvement_percent));
  const best = dev.length ? dev.reduce((x, y) => (y.deviance_improvement_percent > x.deviance_improvement_percent ? y : x)) : null;
  const adapter = entry.adapter || bundle.adapter || bundle.id;
  return {
    id: bundle.id || entry.file,
    label: entry.label || bundle.label || bundle.id,
    population: bundle.source || bundle.population || 'not stated',
    target: bundle.target || 'not stated',
    training: bundle.training || {},
    models: metrics.length,
    best: best ? { label: best.label, improvement: best.deviance_improvement_percent } : null,
    metrics,
    scorable: FORM_ADAPTERS.includes(adapter) && Array.isArray(bundle.models) && bundle.models.length > 0,
  };
}

// ---- Shareable scenarios ---------------------------------------------------------------
// A scenario lives in the URL fragment (never sent to a server). Decoding accepts only
// known fields and allowed values, so a crafted link cannot inject anything.
const PERSON_SPEC = {
  sex: ['Woman', 'Man'],
  age: [16, 100],
  school: SCHOOL,
  degree: DEGREE,
  wages: [0, 10000000],
  work: WORK,
  religion: RELIGION,
  priorMarriage: 'bool',
  firstMarriageAge: [13, 80],
};
const COUPLE_SPEC = { yearsMarried: [0, 60], familyIncome: [0, 100000000], horizon: ['20', '30', '40', '50'] };

function specFor(name) {
  const [who, k] = name.includes('.') ? name.split('.') : [null, name];
  if (who === 'a' || who === 'b') return PERSON_SPEC[k];
  if (who === null) return COUPLE_SPEC[k] || (k === 'lens' ? 'id' : undefined);
  return undefined;
}

function cleanValue(spec, v) {
  if (spec === undefined || v === null || v === undefined) return undefined;
  if (spec === 'bool') return v === '1' || v === 'on' || v === true ? '1' : '0';
  if (spec === 'id') return /^[a-z0-9_]{1,64}$/.test(v) ? v : undefined;
  if (Array.isArray(spec) && typeof spec[0] === 'number') {
    if (v === '') return '';
    const x = Number(v);
    return Number.isFinite(x) && x >= spec[0] && x <= spec[1] ? String(x) : undefined;
  }
  return spec.includes(v) ? v : undefined;
}

// fields: { 'a.age': '36', 'a.priorMarriage': true, yearsMarried: '0', lens: 'nlsy79_couples', ... }
export function encodeScenario(fields) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    const c = cleanValue(specFor(k), v);
    if (c !== undefined && c !== '') q.set(k, c);
  }
  return '#' + q.toString();
}

export function decodeScenario(hash) {
  const out = {};
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  for (const [k, v] of q) {
    const c = cleanValue(specFor(k), v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}
