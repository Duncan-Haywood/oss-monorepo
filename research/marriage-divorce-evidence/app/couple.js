// Couple layer: turns two people's profiles into each evidence lens's model inputs (one
// adapter per lens), projects year-by-year divorce hazards, flags out-of-support inputs and
// refuses unsupported couples, and ranks what-if changes.
// Pure functions; no DOM. tests/couple.test.mjs covers it.
import { predict, contributions, explainTree, oodScore } from './engine.js';
import { personRow, familyIncome, supportIssues as personIssues } from './individuals.js';
import { competingRisks } from './mortality.js';
import { NEW_ADAPTERS, bothSexesView, QUALITY, HAPMAR, PARTY, PARENTS_VIEW, COUNT3, RELIGION_RAISED, MOTHER_EDU, MOTHER_AGE, ATTEND_DETAIL, OFTEN, STATUS, HOW_MET, PLACE, STATES, YESNO, MARRIAGES_BEFORE, SAT_SCALE } from './lens-adapters.js';
export const SAT_SCALE_KEYS = ['sat1', 'sat2', 'sat3', 'sat4', 'sat5', 'sat6', 'sat7', 'sat8'];

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
  // Partner traits this lens models, in search priority order (dashboard.js). `gap` traits
  // set the partner's age relative to yours.
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -3, 0, 3, 6] },
    { key: 'degree', label: 'Highest degree', values: ['High school', 'Some college', 'Bachelor', 'Master', 'Professional'], patch: (v) => ({ degree: v, school: SCHOOL[defaultSchool(v)] }) },
    { key: 'wages', label: 'Wages last year, $', values: [0, 15000, 30000, 50000, 80000, 120000] },
    { key: 'religion', label: 'Religious attendance', values: RELIGION },
    { key: 'work', label: 'Work hours', values: WORK },
    { key: 'priorMarriage', label: 'Married before', values: [false, true], show: (v) => (v ? 'married before' : 'not married before') },
  ],
};

// NSFG 2002: the wife's own report on her first marriage, scored from the wedding day.
export const RACE_ETH = ['Hispanic', 'White', 'Black', 'Asian', 'Other'];
const RACE4_2002 = (r) => (r === 'Asian' ? 'Other' : ['Hispanic', 'White', 'Black', 'Other'].includes(r) ? r : null);
const yn = (v) => (v === true || v === 'Yes' ? 'Yes' : v === false || v === 'No' ? 'No' : 'Unknown');

export function nsfgRow(bundle, a, b, couple, k) {
  const wife = a.sex === 'Woman' ? a : b;
  const husband = a.sex === 'Woman' ? b : a;
  const ym = num(couple.yearsMarried) || 0;
  const s = bundle.support;
  const wy = (Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear()) - ym;
  const wr = RACE4_2002(wife.raceEth);
  const hr = RACE4_2002(husband.raceEth);
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
    const out = wy > bundle.support.wedding_year[1]
      ? [`Wedding year ${wy} is after the latest in the data, so the models score it as a ${bundle.support.wedding_year[1]} wedding; newer marriages may differ.`]
      : [];
    return out;
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
  // Only the husband's history and the wife's background enter, so the traits depend on
  // which partner is the wife. A wife married before is outside the lens, so it is not varied.
  partnerTraits(me) {
    const sameOrNot = RACE_ETH.includes(me.raceEth)
      ? [{ key: 'raceEth', label: 'Race-ethnicity', values: [me.raceEth, RACE_ETH.find((r) => RACE4_2002(r) !== RACE4_2002(me.raceEth))], show: (v) => (v === me.raceEth ? 'same race-ethnicity as you' : 'different race-ethnicity') }]
      : [];
    if (me.sex === 'Woman') {
      return [
        { key: 'age', label: 'Age gap (husband minus you)', gap: true, values: [-4, -2, 0, 2, 4, 6, 8, 10] },
        { key: 'priorMarriage', label: 'Married before', values: [false, true], show: (v) => (v ? 'married before' : 'not married before') },
        { key: 'priorChildren', label: 'Children from before', values: ['No', 'Yes'], show: (v) => (v === 'Yes' ? 'has children from before' : 'no children from before') },
        ...sameOrNot,
      ];
    }
    return [
      { key: 'age', label: 'Age gap (wife minus you)', gap: true, values: [-10, -8, -6, -4, -2, 0, 2, 4] },
      { key: 'raceEth', label: 'Race-ethnicity', values: ['Hispanic', 'White', 'Black', 'Other'] },
      { key: 'intactFamily', label: 'Lived with both parents to 18', values: ['Yes', 'No'], show: (v) => (v === 'Yes' ? 'grew up with both parents' : 'did not grow up with both parents') },
    ];
  },
  // Subgroup attributes for the population comparison: the wedding-day inputs, with the real
  // wedding year (the model row holds it at the latest year in the data).
  referenceAttrs(bundle, a, b, couple) {
    const cy = Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear();
    return { ...nsfgRow(bundle, a, b, couple, 0), wedding_year: cy - (num(couple.yearsMarried) || 0) };
  },
};

// NLSY79 individual models: each partner scored from their own traits only (the spouse's
// traits are not inputs), using individuals.js's row mapping; the couple rate averages the two.
const IND_DEGREES = [['High school', '12 years'], ['Some college', '13–15 years'], ['Bachelor', '16–17 years'], ['Master', '18+ years']];
const NLSY79_IND = {
  id: 'nlsy79_individuals',
  rowLabels: ['You, from your own traits only', 'Your partner, from their own traits only'],
  outcome: 'Divorce here means legal divorce. Each partner is scored from their own traits only, and the two rates are averaged.',
  ageNote: 'Partner age enters these models as that person’s own age, and older people divorced less in these data; it is not evidence of an ideal age gap.',
  searchText: 'Searches partner age (±6 years), degree and work hours, holding everything else fixed. In this lens a partner’s traits only enter through their own rate.',
  uses: 'each partner’s own age, age at first marriage, sex, degree (graduate degrees pooled), work hours and religious attendance, plus family income',
  rows: (bundle, a, b, couple, k) => {
    const inc = familyIncome(a, b, couple);
    return [personRow(bundle, a, inc, k), personRow(bundle, b, inc, k)];
  },
  issues: (bundle, a, b, couple, k) => NLSY79_IND.rows(bundle, a, b, couple, k).flatMap((r) => personIssues(bundle, r)),
  refuse: (bundle, a, b) => unsupported(a, b).map((x) => x.replace('in the NLSY79', 'in this lens')),
  notes: () => [],
  changes(who, person) {
    const out = [];
    for (const w of WORK) if (w !== person.work) out.push({ label: `Work hours: ${w}`, [who]: { work: w } });
    for (const r of RELIGION) if (r !== person.religion) out.push({ label: `Religious attendance: ${r}`, [who]: { religion: r } });
    const order = ['Less than high school', 'High school', 'Some college', 'Associate', 'Bachelor', 'Master'];
    const cur = order.indexOf(['PhD', 'Professional'].includes(person.degree) ? 'Master' : person.degree);
    for (const d of order.slice(Math.max(cur + 1, 0))) out.push({ label: d === 'Master' ? 'Complete a graduate degree' : `Complete a ${d.toLowerCase()} degree`, [who]: { degree: d } });
    return out;
  },
  coupleChanges(couple, a, b) {
    const inc = familyIncome(a, b, couple);
    if (!(Number.isFinite(inc) && inc > 0)) return [];
    return [
      { label: 'Family income +25%', couple: { familyIncome: Math.round(inc * 1.25) } },
      { label: 'Family income −25%', couple: { familyIncome: Math.round(inc * 0.75) } },
    ];
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 3) {
      for (const [degree, school] of IND_DEGREES) for (const work of WORK) out.push({ ...template, age: num(me.age) + gap, degree, school, work });
    }
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${p.degree.toLowerCase()}, ${p.work.toLowerCase()}`,
  partnerKey: (p) => `${p.age}|${p.degree}|${p.work}`,
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -3, 0, 3, 6] },
    { key: 'degree', label: 'Highest degree', values: IND_DEGREES.map((d) => d[0]), patch: (v) => ({ degree: v, school: IND_DEGREES.find((d) => d[0] === v)[1] }) },
    { key: 'religion', label: 'Religious attendance', values: RELIGION },
    { key: 'work', label: 'Work hours', values: WORK },
  ],
};

// The NSFG classical-family bundle (workstream B) shares the first-marriage bundle's data,
// inputs, folds and target, so it uses the same adapter.
export const ADAPTERS = { nlsy79_couples: NLSY79, nsfg2002_first_marriage: NSFG2002, nsfg2002_family: NSFG2002, nlsy79_individuals: NLSY79_IND, ...NEW_ADAPTERS };

// Distance of the couple's fixed inputs from the training people (engine.oodScore), when
// the bundle ships an `ood` spec; null otherwise.
// Bundles of the same survey, inputs and folds share one out-of-distribution spec: give it to
// every NSFG-adapter bundle that lacks one (returns the bundles, changed in place).
export function shareOod(bundles) {
  const spec = bundles.find((b) => adapterFor(b) === NSFG2002 && b.ood)?.ood;
  if (spec) for (const b of bundles) if (adapterFor(b) === NSFG2002 && !b.ood) b.ood = spec;
  return bundles;
}

// Distance from the training data, for THIS lens: each of the adapter's rows (its perspectives)
// at the start of the projection is scored with the bundle's own `ood` spec, and the most unusual
// one is reported (abstaining if any perspective is beyond the line). Null without a spec.
export function typicality(bundle, a, b, couple) {
  if (!bundle.ood) return null;
  const ad = adapterFor(bundle);
  const raw = ad.oodRows ? ad.oodRows(bundle, a, b, couple) : ad.rows(bundle, a, b, couple, 0);
  if (!raw.length) return null;
  const neutral = new Set();
  const rows = raw.map((r) => neutralise(bundle.ood, r, neutral));
  const scores = rows.map((r) => oodScore(bundle.ood, r));
  const worst = scores.reduce((x, y) => (y.percentile > x.percentile ? y : x));
  return { ...worst, perspectives: scores.length, unseen: [...new Set(scores.flatMap((z) => z.unseen))], neutralised: [...neutral] };
}

// Inputs the person did not give (null, "Unknown", "Missing", "Not asked") say nothing about how
// unusual the couple is, so for the distance only they are set to the training data's most common
// level (categorical; read off the spec's one-hot means) or its median (numeric, as oodScore does
// for null). The models themselves still see the "unknown" level.
const UNGIVEN = new Set(['Unknown', 'Missing', 'Not asked']);
const MODES = new WeakMap();
function modes(spec) {
  if (MODES.has(spec)) return MODES.get(spec);
  const out = {};
  let i = spec.numeric.length;
  for (const c of spec.categorical) {
    const lv = spec.levels[c];
    const freq = lv.slice(1).map((_, k) => spec.mean[i + k]);
    const ref = 1 - freq.reduce((x, y) => x + y, 0);
    let best = 0;
    freq.forEach((f, k) => { if (f > (best === 0 ? ref : freq[best - 1])) best = k + 1; });
    out[c] = lv[best];
    i += lv.length - 1;
  }
  MODES.set(spec, out);
  return out;
}
function neutralise(spec, row, seen) {
  const r = { ...row };
  const m = modes(spec);
  for (const c of spec.categorical) {
    const v = r[c];
    if (v === null || v === undefined || UNGIVEN.has(v)) { r[c] = m[c]; seen.add(c); }
  }
  for (const c of spec.numeric) if (r[c] === null || r[c] === undefined || Number.isNaN(r[c])) seen.add(c);
  return r;
}

// A bundle with extra views (NSFG 1995–2023 pooled carries a both-sexes model set) is loaded as
// one lens per view; each view has the top-level fields every lens has.
export function expandLens(bundle) {
  const both = bothSexesView(bundle);
  return both ? [bundle, both] : [bundle];
}

// A bundle with several training populations (nlsy79_individuals) is viewed through one of
// them, so every lens has top-level models, support, training and constant_rate. The app uses
// the currently-married population: it is the one that matches an intact couple. (The
// including-separated population scores far better held out, but only because people already
// separated are about to divorce.)
export const LENS_POPULATION = { nlsy79_individuals: 'currently_married_only' };
export function lensView(bundle) {
  if (!Array.isArray(bundle.populations) || Array.isArray(bundle.models)) return bundle;
  const key = LENS_POPULATION[bundle.id] || bundle.populations[0].key;
  const pop = bundle.populations.find((p) => p.key === key) || bundle.populations[0];
  return { ...bundle, population_key: pop.key, population_label: pop.label, models: pop.models, support: pop.support, training: pop.training, constant_rate: pop.constant_rate, categories: pop.categories };
}

// A baseline model ignores the couple (e.g. a duration-only curve). It is shown as a
// reference, like the constant rate, and kept out of averages, ranges and agreement counts.
// Naive Bayes is kept out for the same reason as a baseline: on held-out people it predicted
// 173 dissolutions per 1,000 marriage-years in the riskiest tenth against 91 observed.
// With a bundle, models outside the lens's scoring set (the bundle's own `scoring_models`, or
// the adapter's `scoring` list) are reference rows too, with the adapter's reason.
export function excludeReason(m, bundle = null) {
  if (m.baseline === true || m.key === 'duration_only' || m.key === 'period_only') return 'baseline, ignores the couple; not averaged';
  if (m.kind === 'naive_bayes') return 'overconfident at the top on held-out people (173 predicted vs 91 observed per 1,000 in the riskiest tenth); not averaged';
  if (bundle) {
    const keys = scoringKeys(bundle);
    if (keys && !keys.includes(m.key)) return adapterFor(bundle).referenceModels?.[m.key] || 'not one of this lens’s scoring models; shown for reference, not averaged';
  }
  return null;
}
export const isBaseline = (m) => excludeReason(m) !== null;
function scoringKeys(bundle) {
  if (Array.isArray(bundle.scoring_models)) return bundle.scoring_models;
  return adapterFor(bundle).scoring || null;
}
export const scoringModels = (bundle) => bundle.models.filter((m) => excludeReason(m, bundle) === null);
export const referenceOnlyModels = (bundle) => bundle.models.filter((m) => excludeReason(m, bundle) !== null);
export const adapterFor = (bundle) => ADAPTERS[bundle.adapter || bundle.id] || NLSY79;

// Reasons this lens cannot score this couple at all (refuse rather than guess), then the joint
// out-of-distribution check on this lens's own rows.
export function refusals(bundle, a, b, couple = {}) {
  const out = adapterFor(bundle).refuse(bundle, a, b, couple);
  if (out.length) return out;
  const o = typicality(bundle, a, b, couple);
  if (o && o.abstain) out.push(`This couple is more unusual than ${o.percentile.toFixed(2)}% of the surveyed ${bundle.ood.unit ? 'couple-years' : 'people'} (distance from the training data, above the ${bundle.ood.abstain_above_percentile}th-percentile line), so the lens abstains.`);
  return out;
}
export function lensNotes(bundle, a, b, couple = {}) {
  const out = adapterFor(bundle).notes(bundle, a, b, couple);
  const o = typicality(bundle, a, b, couple);
  if (o) out.push(`Typicality: this couple is more unusual than ${o.percentile.toFixed(0)}% of the surveyed ${bundle.ood.unit ? 'couple-years' : 'people'} (the lens abstains above ${bundle.ood.abstain_above_percentile}%)${o.perspectives > 1 ? `; the more unusual of ${o.perspectives} perspectives` : ''}.`);
  return out;
}
// The perspective labels this lens averages over for this couple.
export function rowLabels(bundle, a, b, couple = {}) {
  const l = adapterFor(bundle).rowLabels;
  return typeof l === 'function' ? l(a, b, couple) : l;
}

// ---- Time: annual rates, follow-up periods, or one fixed window ----------------------------
// 'rate' lenses give an annual Poisson rate; 'periods' and 'fixed' lenses give a probability for
// each period (logistic models and probability trees) or a rate over it (Poisson models).
export const lensKind = (bundle) => adapterFor(bundle).kind || 'rate';
export const isRateLens = (bundle) => lensKind(bundle) === 'rate';
// The horizons (years from the start of the projection) a lens can speak to: 5/10/20 years for
// rate lenses, otherwise only the ends of its own follow-up (never extrapolated).
export function lensHorizons(bundle) {
  const ad = adapterFor(bundle);
  return ad.horizons ? ad.horizons(bundle) : [5, 10, 20];
}
// The horizon tables rank and summarise at: 10 years, or the longest supported horizon up to 10.
export function primaryHorizon(bundle) {
  const hs = lensHorizons(bundle);
  if (isRateLens(bundle)) return hs.includes(10) ? 10 : hs[Math.min(1, hs.length - 1)];
  const up = hs.filter((h) => h <= 10.01);
  return up.length ? up[up.length - 1] : hs[0];
}
export const fmtYears = (h) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
function steps(bundle, couple, horizon) {
  const ad = adapterFor(bundle);
  if (ad.steps) return ad.steps(bundle).filter((st) => st.end <= horizon + 0.01);
  return Array.from({ length: horizon }, (_, k) => ({ k, start: k, end: k + 1 }));
}
// Does a model give a probability over the step (logistic, or a tree fitted to 0/1 outcomes in a
// probability lens) or a Poisson rate? Only matters outside the rate lenses.
function givesProbability(bundle, m) {
  if (isRateLens(bundle)) return false;
  if (m.kind === 'logistic_glm') return true;
  if (m.kind === 'tree') return !/poisson/i.test(m.label || '');
  return false;
}
// Chance of the event over one step for one model, averaged over the adapter's perspectives.
function stepProbability(bundle, m, a, b, couple, st) {
  const rows = adapterFor(bundle).rows(bundle, a, b, couple, st.k);
  const len = st.end - st.start;
  const prob = givesProbability(bundle, m);
  return rows.reduce((t, r) => {
    const v = predict(m, r);
    return t + (prob ? v : 1 - Math.exp(-v * len));
  }, 0) / rows.length;
}
// The step of a projection that ends at horizon h (years from its start), or null.
export function stepAt(proj, h) {
  return proj.find((y) => Math.abs(y.elapsed - h) < 0.02) || null;
}

// Annual rate for a couple: the average over the adapter's perspectives. For NLSY79 that is
// both partners as survey respondent, because the respondent's sex and own traits are inputs.
export function coupleRate(bundle, model, a, b, couple, years) {
  const rows = adapterFor(bundle).rows(bundle, a, b, couple, years);
  return rows.reduce((s, r) => s + predict(model, r), 0) / rows.length;
}

// Year-by-year projection. P(divorce in year k | married at its start) = 1 - exp(-rate_k).
// Mortality is not modelled: "still married" means "no divorce, if both partners live".
// For 'periods' and 'fixed' lenses each step is one follow-up period (P(no break-up through k) =
// product of (1 - p_j), the bundles' how_to_combine), and steps beyond the lens's follow-up are
// never produced, whatever `horizon` asks for. `rates` then holds the annual-equivalent rate
// -ln(1 - p) / length, for display only.
export function project(bundle, a, b, couple, horizon = 40, models = scoringModels(bundle)) {
  const ad = adapterFor(bundle);
  const rate = isRateLens(bundle);
  const years = [];
  let surv = Object.fromEntries(models.map((m) => [m.key, 1]));
  for (const st of steps(bundle, couple, horizon)) {
    const k = st.k;
    const rates = {};
    const yearProb = {};
    const survivalEnd = {};
    for (const m of models) {
      if (rate) {
        rates[m.key] = coupleRate(bundle, m, a, b, couple, k);
        yearProb[m.key] = 1 - Math.exp(-rates[m.key]);
      } else {
        yearProb[m.key] = stepProbability(bundle, m, a, b, couple, st);
        rates[m.key] = -Math.log1p(-yearProb[m.key]) / (st.end - st.start);
      }
      surv[m.key] *= 1 - yearProb[m.key];
      survivalEnd[m.key] = surv[m.key];
    }
    const issues = ad.issues(bundle, a, b, couple, k);
    const vals = Object.values(yearProb);
    const svals = Object.values(survivalEnd);
    years.push({
      year: num(couple.yearsMarried) + st.end,
      elapsed: st.end,
      start: st.start,
      label: st.label || null,
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

// "Lifelong" with mortality: each scoring model's divorce rates compete with the death of
// either partner (UN WPP 2024 U.S. rates, mortality.js), from today's ages and calendar
// year over `horizon` marriage years. Returns, per model and as mean and range: the chance
// the marriage ends in divorce, ends in a partner's death while still married (lifelong),
// or is still going with both alive at the horizon. Population death rates: married people
// live longer and spouses' deaths are correlated, neither of which is modelled.
export function lifelong(bundle, table, a, b, couple, horizon = 40) {
  // Short-horizon lenses (periods, a fixed window) never project 40 years: no lifelong figure.
  if (!isRateLens(bundle)) return null;
  const sx = (p) => (p.sex === 'Man' ? 'M' : 'F');
  const years = project(bundle, a, b, couple, horizon);
  const start = Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear();
  const per = {};
  for (const m of scoringModels(bundle)) {
    per[m.key] = competingRisks(table, { sex: sx(a), age: num(a.age) }, { sex: sx(b), age: num(b.age) }, start, years.map((y) => y.rates[m.key]), horizon);
  }
  const stat = (k) => {
    const v = Object.values(per).map((r) => r[k]);
    return { mean: v.reduce((x, y) => x + y, 0) / v.length, min: Math.min(...v), max: Math.max(...v) };
  };
  return {
    per,
    divorce: stat('p_divorce'),
    widowhood: stat('p_widowhood'),
    stillMarried: stat('p_still_married'),
    horizon,
    lastYear: num(couple.yearsMarried) + horizon,
    extrapolated: years.filter((y) => !y.inSupport).length,
  };
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
  // scale: log_rate (GLMs, boosting), hazard_log_odds (logistic hazard, naive Bayes) or rate (forest).
  // `perRow` keeps each perspective's own exact contributions (they reproduce that row's rate);
  // `terms` averages them, which is only approximate for the averaged rate.
  return { intercept: cs[0].intercept, terms, scale: cs[0].scale || 'log_rate', perRow: cs.map((c) => ({ intercept: c.intercept, terms: c.terms, scale: c.scale || 'log_rate' })) };
}

// Group raw model columns into what a person would recognise.
export const TERM_LABELS = {
  // The harmonized before-the-wedding lens (scored from each partner's side).
  respondent_age: 'This partner’s age on the wedding day',
  spouse_age: 'The other partner’s age on the wedding day',
  spouse_prior_marriage: 'Other partner married before',
  respondent_prior_children: 'This partner’s child before the wedding',
  spouse_prior_children: 'Other partner’s child before the wedding',
  respondent_race: 'This partner’s race-ethnicity',
  spouse_race: 'Other partner’s race-ethnicity',
  same_race: 'Same race-ethnicity',
  intact_family: 'Grew up with both parents',
  religion_raised: 'Religion raised in',
  respondent_sex: 'Sex of the surveyed spouse (survey design)',
  age_gap: 'Age gap',
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
  income_quartile: 'Family income',
  education_model: 'Own highest degree',
  religion_2000: 'Own religious attendance (as reported in 2000)',
  start_wave: 'Survey year',
  baseline_status: 'Already separated',
};

export function groupedTerms(terms) {
  const out = {};
  for (const [k, v] of Object.entries(terms)) {
    const label = TERM_LABELS[k] || k;
    out[label] = (out[label] || 0) + v;
  }
  return Object.entries(out).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
}

const survivalAt = (bundle, a, b, couple, n) => stepAt(project(bundle, a, b, couple, n), n);

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
export function selfChanges(bundle, who, a, b, couple, n = primaryHorizon(bundle)) {
  return scoreChanges(bundle, adapterFor(bundle).changes(who, who === 'a' ? a : b), a, b, couple, n);
}

// What-if changes the couple makes together (e.g. timing of the wedding), where the lens has any.
export function coupleChanges(bundle, a, b, couple, n = primaryHorizon(bundle)) {
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
export function idealPartners(bundle, me, partnerTemplate, couple, { n = primaryHorizon(bundle), top = 5 } = {}) {
  const ad = adapterFor(bundle);
  const r = rankPartners(bundle, me, couple, ad.partnerGrid(me, partnerTemplate), { horizons: [n], current: partnerTemplate });
  const results = r.ranked;
  const best = results.slice(0, top);
  return {
    perModelTop: r.perModelTop,
    distinctTops: r.distinctTops,
    best,
    worst: results[results.length - 1],
    considered: results.length,
    tied: r.tied,
    current: r.current,
    models: r.models,
  };
}

// Score a list of partner profiles for `me` at each horizon (default 10 years) and rank them
// by the lens's mean chance of no divorce. Shared by the partner search above, the dashboard's
// partner ranking and the batch candidate table. Each entry carries the mean and model range
// at every horizon, how many models score it above `current` (when given), and whether any
// projected year is outside the data. Profiles the lens refuses are skipped, or kept with
// their reason when keepRefused is set (they rank last). `tied` counts the scored profiles
// whose model range overlaps the top one's at the first horizon: the models cannot tell them
// apart. `distinctTops` counts the different profiles the models put first on their own.
export function rankPartners(bundle, me, couple, list, { horizons = [primaryHorizon(bundle)], current = null, keepRefused = false, describe } = {}) {
  const ad = adapterFor(bundle);
  const models = scoringModels(bundle);
  const H = Math.max(...horizons);
  const n = horizons[0];
  const stat = (y) => ({ meanSurvival: y.meanSurvival, minSurvival: y.minSurvival, maxSurvival: y.maxSurvival, survival: y.survival });
  let cur = null;
  if (current && !refusals(bundle, me, current, couple).length) {
    const p = project(bundle, me, current, couple, H);
    cur = stat(stepAt(p, n));
  }
  const ranked = [];
  const refused = [];
  for (const [i, p] of list.entries()) {
    const why = refusals(bundle, me, p, couple);
    const description = describe ? describe(p, i) : ad.describePartner(p);
    if (why.length) {
      if (keepRefused) refused.push({ partner: p, index: i, description, refused: why });
      continue;
    }
    const proj = project(bundle, me, p, couple, H);
    const y = stepAt(proj, n);
    ranked.push({
      partner: p,
      index: i,
      description,
      ...stat(y),
      at: Object.fromEntries(horizons.map((h) => [h, stat(stepAt(proj, h))])),
      beats: cur ? models.filter((m) => y.survival[m.key] > cur.survival[m.key]).length : null,
      inSupport: proj.filter((z) => z.elapsed <= n + 0.01).every((z) => z.inSupport),
      issues: [...new Set(proj.flatMap((z) => z.issues))],
    });
  }
  ranked.sort((x, y) => y.meanSurvival - x.meanSurvival || x.index - y.index);
  const top = ranked[0];
  for (const r of ranked) r.indistinguishable = !!top && r.maxSurvival >= top.minSurvival;
  const perModelTop = ranked.length ? models.map((m) => {
    const r = ranked.reduce((x, y) => (y.survival[m.key] > x.survival[m.key] ? y : x));
    return { model: m.label, partner: r.partner, survival: r.survival[m.key] };
  }) : [];
  return {
    ranked,
    refused,
    tied: ranked.filter((r) => r.indistinguishable).length,
    perModelTop,
    distinctTops: new Set(perModelTop.map((t) => (ad.partnerKey ? ad.partnerKey(t.partner) : JSON.stringify(t.partner)))).size,
    current: cur,
    models: models.length,
  };
}

// ---- Evidence lenses -------------------------------------------------------------------
// Every model bundle in models/ is a lens with its own population and target. A lens is
// scored when an adapter above maps the form onto its inputs; otherwise it is still listed,
// with its population, target and skill, but gives no number.
export const FORM_ADAPTERS = Object.keys(ADAPTERS);

// Held-out skill of one model in one shape across bundles: the gain over a constant rate
// (deviance or log loss, with its interval), the concordance (Harrell's C) and an AUC.
export function modelSkill(m) {
  const h = m.heldout || {};
  const gain = Number.isFinite(h.deviance_improvement_percent) ? h.deviance_improvement_percent : Number.isFinite(h.deviance_gain_percent) ? h.deviance_gain_percent : Number.isFinite(h.logloss_improvement_percent) ? h.logloss_improvement_percent : null;
  let gainCi = h.ci95 || h.logloss_improvement_ci || h.logloss_improvement_ci95 || null;
  // NLSY79 individuals publish the interval per person-year; rescale it to percent.
  if (gainCi && Number.isFinite(h.deviance_improvement_per_person_year) && h.deviance_improvement_per_person_year > 0) gainCi = gainCi.map((x) => (x * gain) / h.deviance_improvement_per_person_year);
  if (gainCi && !(gainCi[0] <= gain + 1e-9 && gain <= gainCi[1] + 1e-9)) gainCi = null;
  const cKey = ['harrell_c', 'c_index', 'c_index_10y'].find((k) => Number.isFinite(h[k]));
  const aucKey = ['auc10', 'auc_10y', 'auc', 'auc_breakup_by_2011', 'auc_2.3y', 'auc5', 'auc_5y'].find((k) => Number.isFinite(h[k]));
  return {
    gain, gainCi,
    c: cKey ? h[cKey] : null, cCi: cKey ? h[cKey + '_ci95'] || h[cKey + '_ci'] || null : null,
    auc: aucKey ? h[aucKey] : null, aucCi: aucKey ? h[aucKey + '_ci95'] || h[aucKey + '_ci'] || null : null,
    aucLabel: aucKey ? { auc10: 'AUC at 10 years', auc_10y: 'AUC at 10 years', auc: 'AUC', auc_breakup_by_2011: 'AUC for a break-up by 2011', 'auc_2.3y': 'AUC at 2.3 years', auc5: 'AUC at 5 years', auc_5y: 'AUC at 5 years' }[aucKey] : null,
  };
}
// The lens's best scoring model by held-out gain, with its skill.
export function lensSkill(bundle) {
  const ms = (Array.isArray(bundle.models) ? scoringModels(bundle) : []).map((m) => ({ key: m.key, label: m.label, ...modelSkill(m) })).filter((m) => Number.isFinite(m.gain));
  return ms.length ? ms.reduce((x, y) => (y.gain > x.gain ? y : x)) : null;
}

export function lensSummary(raw, entry = {}) {
  const bundle = lensView(raw);
  const metrics = (bundle.models || []).map((m) => ({ key: m.key, label: m.label, ...(m.heldout || {}), deviance_improvement_percent: modelSkill(m).gain }));
  const dev = metrics.filter((m) => Number.isFinite(m.deviance_improvement_percent));
  const best = dev.length ? dev.reduce((x, y) => (y.deviance_improvement_percent > x.deviance_improvement_percent ? y : x)) : null;
  const adapter = entry.adapter || bundle.adapter || bundle.id;
  return {
    id: bundle.id || entry.file,
    label: (bundle.view_of ? null : entry.label) || bundle.label || entry.label || bundle.id,
    population: (bundle.source || bundle.population || 'not stated') + (bundle.population_label ? `; population used here: ${bundle.population_label.toLowerCase()}` : ''),
    target: bundle.target || 'not stated',
    training: bundle.training || {},
    models: metrics.length,
    best: best ? { label: best.label, improvement: best.deviance_improvement_percent } : null,
    metrics,
    scorable: FORM_ADAPTERS.includes(adapter) && Array.isArray(bundle.models) && bundle.models.length > 0,
    skill: Array.isArray(bundle.models) && FORM_ADAPTERS.includes(adapter) ? lensSkill(bundle) : null,
  };
}

// ---- Shareable scenarios ---------------------------------------------------------------
// A scenario lives in the URL fragment (never sent to a server). Decoding accepts only
// known fields and allowed values, so a crafted link cannot inject anything.
export const PERSON_SPEC = {
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
  // Questions the newer lenses use (lens-adapters.js says which lens reads which).
  bornUS: YESNO,
  marriagesBefore: MARRIAGES_BEFORE,
  quality: QUALITY,
  hapmar: HAPMAR,
  party: PARTY,
  parentsView: PARENTS_VIEW,
  kidsBefore: COUNT3,
  priorPartners: COUNT3,
  enrolled: YESNO,
  religionRaised: RELIGION_RAISED,
  motherEdu: MOTHER_EDU,
  motherAgeFirst: MOTHER_AGE,
  attendDetail: ATTEND_DETAIL,
  satSum: [8, 37],
  hostSum: [0, 42],
  obsPos: OFTEN,
  obsNeg: OFTEN,
  obsEff: OFTEN,
  substance: YESNO,
  ace: YESNO,
  abuse: YESNO,
  lowMood: YESNO,
  ...Object.fromEntries(SAT_SCALE_KEYS.map((k) => [k, SAT_SCALE])),
};
export const COUPLE_SPEC = {
  yearsMarried: [0, 60], familyIncome: [0, 100000000], horizon: ['20', '30', '40', '50'], cohabitedFirst: ['Yes', 'No'],
  status: STATUS, yearsTogether: [0, 80], howMet: HOW_MET, childrenHome: [0, 15], place: PLACE, state: STATES,
  expecting: YESNO, cohabMonths: [0, 240], netWorth: [-10000000, 100000000], debt: [0, 100000000], unsecuredDebt: [0, 10000000], homeOwner: YESNO,
};
// Answers that are never written into a shareable link (they stay in the page): hostility,
// abuse, substance use, low mood, adverse childhood experiences.
export const SENSITIVE = new Set(['hostSum', 'substance', 'ace', 'abuse', 'lowMood']);

// ---- Stage: before the wedding, or already married ----------------------------------------
// The calculator's default question is the owner's: will a marriage last, asked BEFORE the
// wedding, for a couple or a candidate partner. Only lenses whose clock starts at the wedding and
// whose inputs are fixed by then answer it (the leakage audit, reproducibility/prewedding/,
// lists the post-wedding inputs some of their published models used). Lenses that score couples
// who are already married, or whose outcome is not divorce, sit behind "Already married".
export const STAGES = ['before', 'married'];
const BEFORE_LENSES = new Set([
  'prewedding_harmonized', 'nsfg_pooled_first_marriage', 'nlsy97_first_marriage', 'nlsy79_first_marriage',
  'sipp_first_marriage', 'canada_gss_first_marriage', 'nsfg2002_first_marriage', 'nsfg2002_family',
  'hcmst_dating_marriage', 'hcmst_dating_breakup',
]);
export function lensStage(bundle) {
  if (STAGES.includes(bundle.stage)) return bundle.stage;
  return BEFORE_LENSES.has(bundle.view_of || bundle.id) ? 'before' : 'married';
}
export const lensesForStage = (lenses, stage) => lenses.filter((l) => lensStage(l.bundle) === stage);
// First scorable lens in this order, else the stage's first scorable lens.
const DEFAULT_LENS = { before: ['prewedding_harmonized', 'nsfg_pooled_first_marriage'], married: ['nlsy79_couples'] };
export function defaultLens(lenses, stage) {
  const ok = lensesForStage(lenses, stage).filter((l) => l.summary.scorable);
  for (const id of DEFAULT_LENS[stage] || []) {
    const hit = ok.find((l) => l.summary.id === id);
    if (hit) return hit;
  }
  return ok[0] || lensesForStage(lenses, stage)[0] || lenses[0];
}

function specFor(name) {
  const [who, k] = name.includes('.') ? name.split('.') : [null, name];
  if (who === 'a' || who === 'b') return SENSITIVE.has(k) ? undefined : PERSON_SPEC[k];
  if (who === null) return COUPLE_SPEC[k] || (k === 'lens' ? 'id' : k === 'stage' ? STAGES : undefined);
  return undefined;
}

export function cleanValue(spec, v) {
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
