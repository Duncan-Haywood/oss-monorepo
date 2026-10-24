// Individual lens: the NLSY79 individual-level models (reproducibility/ml_individuals) score
// each partner from their own traits only; the spouse's traits are not model inputs. Same
// profile fields as couple.js, so the app can show this lens next to the couple models.
// Pure functions; no DOM. tests/individuals.test.mjs covers it.
import { predict, contributions, explainTree } from './engine.js';

export const WAVE = '2020'; // latest training wave; projections hold the period effect here
const GRADUATE = new Set(['Master', 'PhD', 'Professional']);
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function population(bundle, key = 'currently_married_only') {
  const p = bundle.populations.find((x) => x.key === key);
  if (!p) throw new Error(`unknown population ${key}`);
  return p;
}

export function incomeQuartile(bundle, income, wave = WAVE) {
  if (!Number.isFinite(income) || income < 0) return 'Unknown';
  return 'Q' + (1 + bundle.income_cutpoints[wave].filter((c) => income > c).length);
}

// Combined family income: the couple's figure if given, else the two partners' wages.
export function familyIncome(a, b, couple = {}) {
  const f = num(couple.familyIncome);
  if (Number.isFinite(f)) return f;
  const s = num(a.wages) + num(b.wages);
  return Number.isFinite(s) ? s : NaN;
}

// One model row for `person`, `years` after now (age advances; nothing else is projected).
export function personRow(bundle, person, income, years = 0) {
  const fma = num(person.firstMarriageAge);
  return {
    age: num(person.age) + years,
    first_marriage_age: Number.isFinite(fma) ? fma : null,
    sex: person.sex === 'Man' ? 'Men' : person.sex === 'Woman' ? 'Women' : 'Unknown',
    education_model: GRADUATE.has(person.degree) ? 'Graduate' : person.degree || 'Unknown',
    work: person.work || 'Unknown',
    income_quartile: incomeQuartile(bundle, income),
    religion_2000: person.religion || 'Unknown',
    baseline_status: person.separated ? 'Separated' : 'Married',
    start_wave: WAVE,
  };
}

// Reasons this lens cannot give a number at all (refuse rather than guess).
export function unsupported(pop, a, b) {
  const out = [];
  if (!a.sex || !b.sex) out.push('Choose both partners’ sex: the NLSY79 married respondents modelled here were in opposite-sex marriages.');
  else if (a.sex === b.sex) out.push('The NLSY79 individual models were trained on people in opposite-sex marriages, so they cannot estimate risk for a same-sex couple. Rather than guess, no number is shown.');
  if ((a.separated || b.separated) && !pop.categories.baseline_status.includes('Separated')) {
    out.push('This population excludes people who are already separated; use the “including separated” population.');
  }
  return out;
}

// Inputs outside the training range for one row.
export function supportIssues(pop, row) {
  const s = pop.support;
  const out = [];
  if (row.age < s.age[0] || row.age > s.age[1]) out.push(`age ${row.age.toFixed(0)} (trained on ${s.age[0]}–${s.age[1]})`);
  const f = row.first_marriage_age;
  if (f !== null && (f < s.first_marriage_age[0] || f > s.first_marriage_age[1])) out.push(`age at first marriage ${f}`);
  return out;
}

// Year-by-year projection. Each partner's own model rate estimates the hazard of the same
// event (this marriage ending in divorce); the couple rate averages the two, as couple.js
// does. P(divorce in year k | married at its start) = 1 - exp(-rate_k). Mortality is not
// modelled.
export function project(bundle, a, b, couple = {}, { horizon = 40, populationKey } = {}) {
  const pop = population(bundle, populationKey);
  const income = familyIncome(a, b, couple);
  const surv = Object.fromEntries(pop.models.map((m) => [m.key, 1]));
  const years = [];
  for (let k = 0; k < horizon; k++) {
    const ra = personRow(bundle, a, income, k);
    const rb = personRow(bundle, b, income, k);
    const rates = {};
    const perPerson = {};
    const yearProb = {};
    const survival = {};
    for (const m of pop.models) {
      const pa = predict(m, ra);
      const pb = predict(m, rb);
      perPerson[m.key] = [pa, pb];
      rates[m.key] = (pa + pb) / 2;
      yearProb[m.key] = 1 - Math.exp(-rates[m.key]);
      surv[m.key] *= Math.exp(-rates[m.key]);
      survival[m.key] = surv[m.key];
    }
    const issues = [...new Set([...supportIssues(pop, ra), ...supportIssues(pop, rb)])];
    const sv = Object.values(survival);
    years.push({
      year: num(couple.yearsMarried || 0) + k + 1,
      rates,
      perPerson,
      yearProb,
      survival,
      meanSurvival: sv.reduce((x, y) => x + y, 0) / sv.length,
      minSurvival: Math.min(...sv),
      maxSurvival: Math.max(...sv),
      inSupport: issues.length === 0,
      issues,
    });
  }
  return years;
}

export const TERM_LABELS = {
  age: 'Age',
  first_marriage_age: 'Age at first marriage',
  sex: 'Sex',
  education_model: 'Highest degree',
  work: 'Work hours',
  income_quartile: 'Family income',
  religion_2000: 'Religious attendance (as reported in 2000)',
  baseline_status: 'Already separated',
  start_wave: 'Survey year',
};

// Exact explanation for one partner and one model: per-input log-rate contributions for the
// additive models (they sum with the intercept to log(rate)), the decision path in input
// units plus the leaf's training support for trees.
export function explain(bundle, model, person, income, years = 0) {
  const row = personRow(bundle, person, income, years);
  if (model.kind === 'tree') {
    const t = explainTree(model, row);
    return { tree: { ...t, support: model.leaf_support ? model.leaf_support[String(t.leaf)] : null } };
  }
  const c = contributions(model, row);
  const grouped = {};
  for (const [k, v] of Object.entries(c.terms)) grouped[TERM_LABELS[k] || k] = (grouped[TERM_LABELS[k] || k] || 0) + v;
  return { intercept: c.intercept, terms: Object.entries(grouped).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])) };
}

// What-if changes for one partner, scored by the change in mean n-year no-divorce chance
// across this lens's models, with how many models agree. Associations, not causes.
export function selfChanges(bundle, who, a, b, couple = {}, { n = 10, populationKey } = {}) {
  const at = (pa, pb, c) => project(bundle, pa, pb, c, { horizon: n, populationKey })[n - 1];
  const base = at(a, b, couple);
  const person = who === 'a' ? a : b;
  const options = [];
  const tryChange = (label, patch, couplePatch = {}) => {
    const p2 = { ...person, ...patch };
    const c2 = { ...couple, ...couplePatch };
    const r = who === 'a' ? at(p2, b, c2) : at(a, p2, c2);
    const deltas = Object.keys(base.survival).map((k) => r.survival[k] - base.survival[k]);
    options.push({ label, delta: r.meanSurvival - base.meanSurvival, agree: deltas.filter((d) => d > 0).length, models: deltas.length });
  };
  for (const w of ['No work hours', '1–1,999 hours', '2,000+ hours']) if (w !== person.work) tryChange(`Work hours: ${w}`, { work: w });
  const order = ['Less than high school', 'High school', 'Some college', 'Associate', 'Bachelor', 'Graduate'];
  const cur = order.indexOf(GRADUATE.has(person.degree) ? 'Graduate' : person.degree);
  for (const d of order.slice(Math.max(cur + 1, 0))) tryChange(`Complete ${d === 'Graduate' ? 'a graduate' : `a ${d.toLowerCase()}`} degree`, { degree: d === 'Graduate' ? 'Master' : d });
  const inc = familyIncome(a, b, couple);
  if (Number.isFinite(inc) && inc > 0) {
    tryChange('Family income +25%', {}, { familyIncome: Math.round(inc * 1.25) });
    tryChange('Family income −25%', {}, { familyIncome: Math.round(inc * 0.75) });
  }
  return options.sort((x, y) => y.delta - x.delta);
}
