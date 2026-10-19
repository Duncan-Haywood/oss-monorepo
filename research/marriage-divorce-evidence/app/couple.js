// Couple layer: turns two people's profiles into each evidence lens's model inputs (one
// adapter per lens), projects year-by-year divorce hazards, flags out-of-support inputs and
// refuses unsupported couples, and ranks what-if changes.
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

// ---- Lens adapters ---------------------------------------------------------------------
// An adapter maps the form (two people + the marriage) onto one bundle's model rows. A
// couple's annual rate is the mean prediction over the adapter's rows (perspectives).
// Everything below (projection, explanations, what-ifs, partner search) is lens-agnostic.

const NLSY79 = {
  id: 'nlsy79_couples',
  rowLabels: ['Scored with “You” as the survey respondent', 'Scored with “Your partner” as the survey respondent'],
  outcome: 'Divorce here means legal divorce.',
  ageNote: 'Partner age enters the models as that person’s own age, and older people divorced less in these data; it is not evidence of an ideal age gap.',
  searchText: 'Searches partner age (±6 years), degree and wages, holding everything else fixed. The gap between best and worst is small next to everything the data leaves out.',
  uses: 'both partners’ age, schooling, degree, wages and work hours; own religious attendance; marriage order; years married; household income',
  rows: (bundle, a, b, couple, k) => [modelRow(bundle, a, b, couple, k), modelRow(bundle, b, a, couple, k)],
  issues: (bundle, a, b, couple, k) => [
    ...supportIssues(bundle, modelRow(bundle, a, b, couple, k)),
    ...supportIssues(bundle, modelRow(bundle, b, a, couple, k)),
  ],
  refuse: (bundle, a, b) => unsupported(a, b),
  notes: () => [],
  changes(who, person) {
    const out = [];
    for (const w of WORK) if (w !== person.work) out.push({ label: `Work hours: ${w}`, [who]: { work: w } });
    for (const r of RELIGION) if (r !== person.religion) out.push({ label: `Religious attendance: ${r}`, [who]: { religion: r } });
    const di = DEGREE.indexOf(person.degree);
    for (const d of DEGREE.slice(Math.max(di + 1, 0))) {
      const si = Math.min(SCHOOL.length - 1, Math.max(SCHOOL.indexOf(person.school), defaultSchool(d)));
      out.push({ label: `Complete a ${d.toLowerCase()} degree`, [who]: { degree: d, school: SCHOOL[si] } });
    }
    const w = num(person.wages);
    if (Number.isFinite(w)) {
      out.push({ label: 'Wages +25%', [who]: { wages: Math.round(w * 1.25) } });
      if (w > 0) out.push({ label: 'Wages −25%', [who]: { wages: Math.round(w * 0.75) } });
    }
    return out;
  },
  coupleChanges: () => [],
  // Partner variants: age within +/-6 of `me` in steps of 3, degree, wages.
  partnerGrid(me, template) {
    const wageGrid = [0, 15000, 30000, 50000, 80000, 120000];
    const degrees = [['High school', '12 years'], ['Some college', '13–15 years'], ['Bachelor', '16–17 years'], ['Master', '18+ years'], ['Professional', '18+ years']];
    const out = [];
    for (let gap = -6; gap <= 6; gap += 3) {
      for (const [degree, school] of degrees) for (const wages of wageGrid) out.push({ ...template, age: num(me.age) + gap, degree, school, wages });
    }
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${p.degree.toLowerCase()}, wages $${Number(p.wages).toLocaleString('en-US')}`,
  partnerKey: (p) => `${p.age}|${p.degree}|${p.wages}`,
};

// NSFG 2002: the wife's own report on her first marriage, scored from the wedding day.
export const RACE_ETH = ['Hispanic', 'White', 'Black', 'Other'];
const yn = (v) => (v === true || v === 'Yes' ? 'Yes' : v === false || v === 'No' ? 'No' : 'Unknown');

export function nsfgRow(bundle, a, b, couple, k) {
  const wife = a.sex === 'Woman' ? a : b;
  const husband = a.sex === 'Woman' ? b : a;
  const ym = num(couple.yearsMarried) || 0;
  const s = bundle.support;
  const wy = (Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear()) - ym;
  const wr = RACE_ETH.includes(wife.raceEth) ? wife.raceEth : null;
  const hr = RACE_ETH.includes(husband.raceEth) ? husband.raceEth : null;
  return {
    marriage_years: ym + k,
    wife_age_at_marriage: num(wife.age) - ym,
    husband_age_at_marriage: num(husband.age) - ym,
    // Held at the latest wedding year in the data (the bundle's instruction); the app says so.
    wedding_year: Math.min(wy, s.wedding_year[1]),
    cohabited_first: yn(couple.cohabitedFirst),
    husband_married_before: husband.priorMarriage ? 'Yes' : 'No',
    husband_prior_children: yn(husband.priorChildren),
    wife_race_ethnicity: wr,
    same_race_ethnicity: wr && hr ? (wr === hr ? 'Same' : 'Different') : 'Unknown',
    wife_intact_family: yn(wife.intactFamily) === 'Unknown' ? null : yn(wife.intactFamily),
  };
}

const NSFG2002 = {
  id: 'nsfg2002_first_marriage',
  rowLabels: ['Scored from the wife’s survey answers'],
  ageNote: 'Partner age here is the age on the wedding day; marrying older was linked to fewer break-ups, which is not evidence of an ideal age gap.',
  outcome: 'In this lens, divorce means the end of a first marriage by divorce, annulment or separation, counted from the wedding day.',
  searchText: 'Searches the partner’s age (±6 years, in steps of 2), whether they were married before and whether they have children from an earlier relationship. None of these is something a partner can change.',
  uses: 'ages on the wedding day, years since the wedding, whether you lived together first, the husband’s earlier marriage and children, both partners’ race-ethnicity, and whether the wife grew up with both parents',
  rows: (bundle, a, b, couple, k) => [nsfgRow(bundle, a, b, couple, k)],
  issues(bundle, a, b, couple, k) {
    const r = nsfgRow(bundle, a, b, couple, k);
    const s = bundle.support.marriage_years;
    return r.marriage_years > s[1] ? [`marriage year ${r.marriage_years + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = unsupported(a, b).map((x) => x.replace('in the NLSY79', 'in this lens'));
    if (out.length) return out;
    const wife = a.sex === 'Woman' ? a : b;
    const r = nsfgRow(bundle, a, b, couple, 0);
    const s = bundle.support;
    if (wife.priorMarriage) out.push('This lens covers only women’s first marriages, so it gives no number when the wife was married before.');
    if (r.wife_age_at_marriage < s.wife_age_at_marriage[0] || r.wife_age_at_marriage > s.wife_age_at_marriage[1]) out.push(`The wife’s age on the wedding day (${r.wife_age_at_marriage.toFixed(0)}) is outside the ${Math.ceil(s.wife_age_at_marriage[0])}–${Math.floor(s.wife_age_at_marriage[1])} the survey covers (women were 15–44 when interviewed).`);
    if (r.husband_age_at_marriage < s.husband_age_at_marriage[0] || r.husband_age_at_marriage > s.husband_age_at_marriage[1]) out.push(`The husband’s age on the wedding day (${r.husband_age_at_marriage.toFixed(0)}) is outside the ${s.husband_age_at_marriage[0]}–${s.husband_age_at_marriage[1]} in the data.`);
    if (!r.wife_race_ethnicity) out.push('This lens needs the wife’s race-ethnicity: the model has no “unknown” group for it, and guessing would change the number.');
    if (!r.wife_intact_family) out.push('This lens needs to know whether the wife lived with both parents until 18: the model has no “unknown” group for it.');
    return out;
  },
  notes(bundle, a, b, couple) {
    const cy = Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear();
    const wy = cy - (num(couple.yearsMarried) || 0);
    return wy > bundle.support.wedding_year[1]
      ? [`Wedding year ${wy} is after the latest in the data, so the models score it as a ${bundle.support.wedding_year[1]} wedding; newer marriages may differ.`]
      : [];
  },
  changes(who, person, other) {
    // Only the husband's history and the wife's family of origin enter this model, and
    // none of them is a change a person can make. Nothing to suggest per person.
    return [];
  },
  coupleChanges(couple, a, b) {
    const out = [];
    const c = yn(couple.cohabitedFirst);
    if (c !== 'Yes') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c !== 'No') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No' } });
    if ((num(couple.yearsMarried) || 0) === 0) {
      for (const d of [2, 5]) out.push({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } });
    }
    return out;
  },
  // Partner variants: age on the wedding day within +/-6 of `me`, married before, prior children.
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 2) {
      for (const priorMarriage of [false, true]) for (const priorChildren of ['No', 'Yes']) out.push({ ...template, age: num(me.age) + gap, priorMarriage, priorChildren });
    }
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${p.priorMarriage ? 'married before' : 'not married before'}, ${p.priorChildren === 'Yes' ? 'has children from before' : 'no children from before'}`,
  partnerKey: (p) => `${p.age}|${p.priorMarriage}|${p.priorChildren}`,
};

export const ADAPTERS = { nlsy79_couples: NLSY79, nsfg2002_first_marriage: NSFG2002 };

// A baseline model ignores the couple (e.g. a duration-only curve). It is shown as a
// reference, like the constant rate, and kept out of averages, ranges and agreement counts.
export const isBaseline = (m) => m.baseline === true || m.key === 'duration_only';
export const scoringModels = (bundle) => bundle.models.filter((m) => !isBaseline(m));
export const adapterFor = (bundle) => ADAPTERS[bundle.adapter || bundle.id] || NLSY79;

// Reasons this lens cannot score this couple at all (refuse rather than guess).
export const refusals = (bundle, a, b, couple = {}) => adapterFor(bundle).refuse(bundle, a, b, couple);
export const lensNotes = (bundle, a, b, couple = {}) => adapterFor(bundle).notes(bundle, a, b, couple);

// Annual rate for a couple: the average over the adapter's perspectives. For NLSY79 that is
// both partners as survey respondent, because the respondent's sex and own traits are inputs.
export function coupleRate(bundle, model, a, b, couple, years) {
  const rows = adapterFor(bundle).rows(bundle, a, b, couple, years);
  return rows.reduce((s, r) => s + predict(model, r), 0) / rows.length;
}

// Year-by-year projection. P(divorce in year k | married at its start) = 1 - exp(-rate_k).
// Mortality is not modelled: "still married" means "no divorce, if both partners live".
export function project(bundle, a, b, couple, horizon = 40, models = scoringModels(bundle)) {
  const ad = adapterFor(bundle);
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
    const issues = ad.issues(bundle, a, b, couple, k);
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

// Per-input explanation for one model, averaged over the adapter's perspectives (GLMs);
// trees return one path per perspective.
export function explain(bundle, model, a, b, couple, years = 0) {
  const rows = adapterFor(bundle).rows(bundle, a, b, couple, years);
  if (model.kind === 'tree') return { tree: rows.map((r) => explainTree(model, r)) };
  const cs = rows.map((r) => contributions(model, r));
  const terms = {};
  for (const k of new Set(cs.flatMap((c) => Object.keys(c.terms)))) {
    terms[k] = cs.reduce((s, c) => s + (c.terms[k] || 0), 0) / cs.length;
  }
  return { intercept: cs[0].intercept, terms };
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
  marriage_years: 'Years married',
  wife_age_at_marriage: 'Wife’s age on the wedding day',
  husband_age_at_marriage: 'Husband’s age on the wedding day',
  wedding_year: 'Wedding year',
  cohabited_first: 'Lived together before marrying',
  husband_married_before: 'Husband married before',
  husband_prior_children: 'Husband’s children from before',
  wife_race_ethnicity: 'Wife’s race-ethnicity',
  same_race_ethnicity: 'Same race-ethnicity',
  wife_intact_family: 'Wife grew up with both parents',
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

// Score a list of what-if changes ({ label, a?, b?, couple? } patches) by the change in mean
// n-year survival across models, with the model range and how many agree on the direction.
// A change that makes the couple unscorable for this lens is dropped, not scored.
function scoreChanges(bundle, list, a, b, couple, n) {
  const base = survivalAt(bundle, a, b, couple, n);
  const options = [];
  for (const ch of list) {
    const a2 = { ...a, ...(ch.a || {}) };
    const b2 = { ...b, ...(ch.b || {}) };
    const c2 = { ...couple, ...(ch.couple || {}) };
    if (refusals(bundle, a2, b2, c2).length) continue;
    const r = survivalAt(bundle, a2, b2, c2, n);
    const deltas = scoringModels(bundle).map((m) => r.survival[m.key] - base.survival[m.key]);
    const delta = r.meanSurvival - base.meanSurvival;
    options.push({
      label: ch.label,
      delta,
      lo: Math.min(...deltas),
      hi: Math.max(...deltas),
      // Models that move the same way as the average (ties count as not agreeing).
      agree: deltas.filter((d) => (delta >= 0 ? d > 0 : d < 0)).length,
      models: deltas.length,
    });
  }
  return options.sort((x, y) => y.delta - x.delta);
}

// What-if changes for one partner.
export function selfChanges(bundle, who, a, b, couple, n = 10) {
  return scoreChanges(bundle, adapterFor(bundle).changes(who, who === 'a' ? a : b), a, b, couple, n);
}

// What-if changes the couple makes together (e.g. timing of the wedding), where the lens has any.
export function coupleChanges(bundle, a, b, couple, n = 10) {
  return scoreChanges(bundle, adapterFor(bundle).coupleChanges(couple, a, b), a, b, couple, n);
}

function defaultSchool(degree) {
  return { 'Less than high school': 0, 'High school': 1, 'Some college': 2, Associate: 2, Bachelor: 3, Master: 4, PhD: 4, Professional: 4 }[degree];
}

// Partner profiles that the models associate with the highest n-year survival, varying only
// what the lens's partner grid varies. There is deliberately no single answer: `tied` counts
// the profiles whose model range overlaps the top profile's, `beats` how many models score a
// profile above the partner as entered, and `distinctTops` how many different profiles the
// models put first on their own. Profiles the lens cannot score are skipped.
export function idealPartners(bundle, me, partnerTemplate, couple, { n = 10, top = 5 } = {}) {
  const ad = adapterFor(bundle);
  const current = survivalAt(bundle, me, partnerTemplate, couple, n);
  const results = [];
  for (const p of ad.partnerGrid(me, partnerTemplate)) {
    if (refusals(bundle, me, p, couple).length) continue;
    const proj = project(bundle, me, p, couple, n);
    const r = proj[proj.length - 1];
    results.push({
      partner: p,
      description: ad.describePartner(p),
      meanSurvival: r.meanSurvival,
      minSurvival: r.minSurvival,
      maxSurvival: r.maxSurvival,
      survival: r.survival,
      beats: scoringModels(bundle).filter((m) => r.survival[m.key] > current.survival[m.key]).length,
      inSupport: proj.every((y) => y.inSupport),
    });
  }
  results.sort((x, y) => y.meanSurvival - x.meanSurvival);
  const best = results.slice(0, top);
  const worst = results[results.length - 1];
  const tied = results.filter((r) => r.maxSurvival >= best[0].minSurvival).length;
  const perModelTop = scoringModels(bundle).map((m) => {
    const r = results.reduce((x, y) => (y.survival[m.key] > x.survival[m.key] ? y : x));
    return { model: m.label, partner: r.partner, survival: r.survival[m.key] };
  });
  return {
    perModelTop,
    distinctTops: new Set(perModelTop.map((t) => ad.partnerKey(t.partner))).size,
    best,
    worst,
    considered: results.length,
    tied,
    current: { meanSurvival: current.meanSurvival, minSurvival: current.minSurvival, maxSurvival: current.maxSurvival },
    models: scoringModels(bundle).length,
  };
}

// ---- Evidence lenses -------------------------------------------------------------------
// Every model bundle in models/ is a lens with its own population and target. A lens is
// scored when an adapter above maps the form onto its inputs; otherwise it is still listed,
// with its population, target and skill, but gives no number.
export const FORM_ADAPTERS = Object.keys(ADAPTERS);

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
  raceEth: RACE_ETH,
  priorChildren: ['Yes', 'No'],
  intactFamily: ['Yes', 'No'],
};
const COUPLE_SPEC = { yearsMarried: [0, 60], familyIncome: [0, 100000000], horizon: ['20', '30', '40', '50'], cohabitedFirst: ['Yes', 'No'] };

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
