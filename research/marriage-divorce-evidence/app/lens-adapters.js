// Form adapters for the lenses added after the first four: HCMST couples (relationship quality,
// married and unmarried, same-sex), GSS panels (marriage happiness, a 2-year chance), NLSY79 and
// NLSY97 first marriages from the wedding, NSFG 1995–2023 pooled (women's models and a
// both-sexes view), Statistics Canada GSS first marriages, and the Los Angeles newlyweds.
//
// Each adapter maps the form (two people + the relationship) onto its bundle's inputs exactly as
// the bundle's `inputs` block documents them, lists what it cannot know (scored at the model's own
// "Unknown" level, or at the training median where the pipeline imputes), and refuses — gives no
// number — when an input the model has no "unknown" level for is missing, or when the couple is
// outside the lens's population (its `abstain` list). Time works three ways:
//   kind 'rate'     annual Poisson rates, projected year by year (the original lenses);
//   kind 'periods'  a probability per follow-up period, combined as the bundle's how_to_combine
//                   says (HCMST, newlyweds); nothing is projected beyond the last period;
//   kind 'fixed'    one probability over a fixed window (GSS: 2 years); nothing else is shown.
// Pure functions, no DOM, and no import from couple.js (couple.js merges these in).
// tests/adapters.test.mjs covers every adapter.

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const has = (v) => v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && Number.isNaN(v));
const nowYear = (couple) => (Number.isFinite(num(couple.currentYear)) ? num(couple.currentYear) : new Date().getUTCFullYear());
const ym = (couple) => num(couple.yearsMarried) || 0;
const yesNo = (v) => (v === true || v === 'Yes' ? 'Yes' : v === false || v === 'No' ? 'No' : null);

// ---- Answer lists for the new questions (also the URL/CSV whitelist; see couple.js) ----------
export const QUALITY = ['Excellent', 'Good', 'Fair', 'Poor or very poor'];
export const HAPMAR = ['Very happy', 'Pretty happy', 'Not too happy'];
export const PARTY = ['Democrat', 'Republican', 'Independent, other or no preference'];
export const PARENTS_VIEW = ['Approve', 'Neutral or unsure', 'Disapprove', 'No living parent'];
export const COUNT3 = ['0', '1', '2+'];
export const RELIGION_RAISED = ['None', 'Catholic', 'Baptist', 'Other Protestant', 'Jewish', 'Other'];
export const MOTHER_EDU = ['Less than high school', 'High school', 'Some college', 'Bachelor or more', 'No mother figure'];
export const MOTHER_AGE = ['Under 18', '18–19', '20–24', '25 or older', 'No mother figure'];
export const ATTEND_DETAIL = ['Never', 'Less than monthly', 'About monthly', 'Weekly or more'];
export const OFTEN = ['Almost never', 'Rarely', 'Sometimes', 'Often', 'Almost always'];
export const STATUS = ['Married, living together', 'Married, living apart', 'Not married, living together', 'Not married, not living together'];
export const HOW_MET = ['Online', 'Through friends', 'Through family', 'Work or coworkers', 'School or college', 'Bar or restaurant', 'Church', 'Other'];
export const YESNO = ['Yes', 'No'];
export const MARRIAGES_BEFORE = ['1', '2+'];
export const PLACE = ['U.S. — Northeast', 'U.S. — Midwest', 'U.S. — South', 'U.S. — West', 'Canada — Atlantic', 'Canada — Quebec', 'Canada — Ontario', 'Canada — Prairies', 'Canada — British Columbia', 'Elsewhere'];
// The Los Angeles newlywed study's 8 satisfaction areas and 7 hostile behaviours (bundle inputs).
export const SAT_ITEMS = ['Time together', 'Trust', 'Sharing thoughts and feelings', 'Sexual relations', 'Support in difficult times', 'Help with chores', 'Being understood (hopes and dreams)', 'The marriage overall'];
export const SAT_SCALE = ['Very dissatisfied', 'Somewhat dissatisfied', 'Neither', 'Somewhat satisfied', 'Very satisfied'];
export const HOSTILE_ITEMS = ['Insults or swearing', 'Stomping out of the room', 'Threats to hit', 'Throwing something', 'Pushing or grabbing', 'Slapping, kicking, biting or punching', 'Beating up'];
export const HOSTILE_SCALE = ['Never', 'Once or twice', 'Several times', 'Often'];

// Satisfaction: the study sums 8 items answered on 4- or 5-point scales (range 8–37); which items
// use which scale is not in the public files. The form asks all 8 on one 5-point scale and maps
// the 8–40 sum linearly onto 8–37. Labelled as an approximation wherever it is used.
export function satisfactionSum(items) {
  if (!Array.isArray(items) || items.length !== 8 || items.some((x) => !SAT_SCALE.includes(x))) return null;
  const s = items.reduce((t, x) => t + SAT_SCALE.indexOf(x) + 1, 0);
  return 8 + ((s - 8) * 29) / 32;
}
// Hostility: 7 behaviours, each done to you by your partner and done by you, 0–3 each: the
// study's own 14-item sum (0–42). Exact, no rescaling. Null unless all 14 are answered.
export function hostilitySum(toMe, byMe) {
  const all = [...(toMe || []), ...(byMe || [])];
  if (all.length !== 14 || all.some((x) => !HOSTILE_SCALE.includes(x))) return null;
  return all.reduce((t, x) => t + HOSTILE_SCALE.indexOf(x), 0);
}

// ---- Shared mappings ---------------------------------------------------------------------------
const DEGREE_YEARS = { 'Less than high school': 10, 'High school': 12, 'Some college': 14, Associate: 14, Bachelor: 16, Master: 18, PhD: 20, Professional: 20 };
const SCHOOL_YEARS = { '<12 years': 10, '12 years': 12, '13–15 years': 14, '16–17 years': 16, '18+ years': 18 };
// Years of schooling: the degree when given (it separates doctorates), else the schooling band.
export function eduYears(p) {
  if (DEGREE_YEARS[p.degree] !== undefined) return DEGREE_YEARS[p.degree];
  if (SCHOOL_YEARS[p.school] !== undefined) return SCHOOL_YEARS[p.school];
  return null;
}
// NLSY bands '<12 years' / '12 years' / '13-15 years' / '16+ years' from the schooling band (or degree).
export function gradeBand(p) {
  const s = { '<12 years': '<12 years', '12 years': '12 years', '13–15 years': '13-15 years', '16–17 years': '16+ years', '18+ years': '16+ years' }[p.school];
  if (s) return s;
  const y = DEGREE_YEARS[p.degree];
  if (y === undefined) return null;
  return y < 12 ? '<12 years' : y === 12 ? '12 years' : y < 16 ? '13-15 years' : '16+ years';
}
const nlsyRace = (r) => ({ Hispanic: 'Hispanic', Black: 'Black', White: 'Non-Black non-Hispanic', Asian: 'Non-Black non-Hispanic', Other: 'Non-Black non-Hispanic' })[r] || null;
const attendDetail = (p) => (ATTEND_DETAIL.includes(p.attendDetail) ? p.attendDetail : p.religion === 'Never' ? 'Never' : p.religion === 'Weekly or more' ? 'Weekly or more' : null);
const usRegion = (place) => ({ 'U.S. — Northeast': 'Northeast', 'U.S. — Midwest': 'Midwest', 'U.S. — South': 'South', 'U.S. — West': 'West' })[place] || null;
// U.S. state (two-letter code) -> Census region; a state, when given, decides the region.
export const STATES = ['AK', 'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT', 'WA', 'WI', 'WV', 'WY'];
const REGION_STATES = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  South: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  West: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
};
export const stateRegion = (st) => Object.keys(REGION_STATES).find((r) => REGION_STATES[r].includes(st)) || null;
const usRegionOf = (couple) => (STATES.includes(couple.state) ? stateRegion(couple.state) : usRegion(couple.place));
const canadaRegion = (place) => ({ 'Canada — Atlantic': 'Atlantic', 'Canada — Quebec': 'Quebec', 'Canada — Ontario': 'Ontario', 'Canada — Prairies': 'Prairies', 'Canada — British Columbia': 'British Columbia' })[place] || null;
const married = (couple) => !couple.status || String(couple.status).startsWith('Married');
const sexOk = (a, b) => (a.sex === 'Woman' || a.sex === 'Man') && (b.sex === 'Woman' || b.sex === 'Man');
const ageOk = (p) => Number.isFinite(num(p.age)) && num(p.age) >= 16 && num(p.age) <= 100;
// Dollars entered are read as 2024 dollars; CPI-U annual averages 2024 313.689, 2010 218.056,
// 2009 214.537, 2000 172.2.
export const CPI = { 2024: 313.689, 2010: 218.056, 2009: 214.537, 2000: 172.2 };
export function householdIncome(a, b, couple) {
  if (has(couple.familyIncome) && Number.isFinite(num(couple.familyIncome))) return num(couple.familyIncome);
  const x = num(a.wages);
  const y = num(b.wages);
  return Number.isFinite(x) && Number.isFinite(y) ? x + y : NaN;
}

function basicRefusals(a, b, lensName, { sameSexOk = false } = {}) {
  const out = [];
  if (!sexOk(a, b)) out.push(`Choose both partners’ sex: ${lensName} needs it.`);
  else if (!sameSexOk && a.sex === b.sex) out.push(`${lensName} has no (or too few) same-sex couples, so it gives no number rather than guess.`);
  for (const p of [a, b]) if (!ageOk(p)) { out.push('Enter an age between 16 and 100 for both partners.'); break; }
  return out;
}
// "You" and "your partner" as the survey respondent: the perspectives a respondent-level lens can
// score (the respondent must be in a first marriage when the lens covers first marriages only).
function perspectives(a, b, couple, firstOnly) {
  const only = couple.perspectives;
  const out = [];
  if ((!only || only.includes('a')) && (!firstOnly || !a.priorMarriage)) out.push({ who: 'a', p: a, s: b, label: 'You as the survey respondent' });
  if ((!only || only.includes('b')) && (!firstOnly || !b.priorMarriage)) out.push({ who: 'b', p: b, s: a, label: 'Your partner as the survey respondent' });
  return out;
}
const issueRange = (name, x, r, unit = '') => (Number.isFinite(x) && (x < r[0] || x > r[1]) ? [`${name} ${Math.round(x * 10) / 10}${unit} (data: ${Math.round(r[0] * 10) / 10}–${Math.round(r[1] * 10) / 10})`] : []);

// Wedding-year handling shared by the wedding lenses: hold at the latest wedding year in the data.
function weddingYear(bundle, couple, support = bundle.support) {
  const wy = nowYear(couple) - ym(couple);
  const hi = support.wedding_year?.[1];
  return { real: wy, used: Number.isFinite(hi) ? Math.min(wy, hi) : wy, held: Number.isFinite(hi) && wy > hi, hi };
}
const heldNote = (w) => (w.held ? [`Wedding year ${w.real} is after the latest in the data, so the models score it as a ${w.hi} wedding; newer marriages may differ.`] : []);
const unknownNote = (list) => (list.length ? [`Not on the form, scored as the model’s “unknown” level or its training median: ${list.join(', ')}.`] : []);

// Rate-lens partner search shared by the first-marriage lenses: age gap and schooling.
const SCHOOLS = ['12 years', '13–15 years', '16–17 years', '18+ years'];
const schoolDegree = { '12 years': 'High school', '13–15 years': 'Some college', '16–17 years': 'Bachelor', '18+ years': 'Master' };

// ======================================================================================
// NLSY79 first marriages, from the wedding (annual legal-divorce rate).
// ======================================================================================
const NLSY_AGE_BAND = (x) => (x < 20 ? '<20' : x < 25 ? '20-24' : x < 30 ? '25-29' : x < 35 ? '30-34' : '35+');
const RAISED_NLSY79 = { None: 'No religion', Catholic: 'Catholic', Baptist: 'Baptist', 'Other Protestant': 'Other Protestant', Jewish: 'Jewish', Other: 'Other' };
const MOTHER_EDU_NLSY = { 'Less than high school': '<12 years', 'High school': '12 years', 'Some college': '13-15 years', 'Bachelor or more': '16+ years', 'No mother figure': 'Unknown' };

export function nlsy79FmRow(bundle, v, couple, k) {
  const { p, s } = v;
  const w = weddingYear(bundle, couple);
  const age = num(p.age) - ym(couple);
  const sage = num(s.age) - ym(couple);
  const ad = attendDetail(p);
  const own = gradeBand(p) || 'Unknown';
  const spouseEd = gradeBand(s) || 'Unknown';
  const kids = COUNT3.includes(p.kidsBefore) ? (p.kidsBefore === '0' ? 'No' : 'Yes') : null;
  return {
    marriage_years: ym(couple) + k,
    age_at_marriage: age,
    wedding_year: w.used,
    afqt: null, rotter: null, rosenberg: null, delinquency: null, income_percentile: null,
    spouse_age_at_marriage: sage,
    sex: p.sex,
    race: nlsyRace(p.raceEth),
    own_education: own,
    enrolled: p.enrolled === 'Yes' ? 'Enrolled' : p.enrolled === 'No' ? 'Not enrolled' : 'Unknown',
    mother_education: MOTHER_EDU_NLSY[p.motherEdu] || 'Unknown',
    father_education: 'Unknown',
    family_at_14: p.intactFamily === 'Yes' ? 'Both parents' : 'Unknown',
    religion_raised: RAISED_NLSY79[p.religionRaised] || 'Unknown',
    attendance: ad === 'Never' ? 'Never' : ad === 'Weekly or more' ? 'Weekly or more' : ad === 'About monthly' ? 'Monthly' : ad === 'Less than monthly' ? 'Several times a year or less' : 'Unknown',
    poverty: 'Unknown',
    region: { Northeast: 'Northeast', Midwest: 'North Central', South: 'South', West: 'West' }[usRegionOf(couple)] || 'Unknown',
    urban: 'Unknown',
    premarital_birth: kids,
    cohabiting_before: yesNo(couple.cohabitedFirst) || 'Unknown',
    lived_with_parents: 'Unknown',
    spouse_in_household: 'Yes',
    spouse_education: spouseEd,
    spouse_worked: s.work ? (s.work === 'No work hours' ? 'No' : 'Yes') : 'Unknown',
    // The bundle: "the app sets it from whether afqt is given"; the form never asks, so Missing.
    afqt_missing: 'Missing', income_missing: 'Missing', rosenberg_missing: 'Missing', delinquency_missing: 'Missing',
    education_pair: own + ' | ' + spouseEd,
    age_pair: NLSY_AGE_BAND(age) + ' | ' + NLSY_AGE_BAND(sage),
    sex_age_band: p.sex + ' | ' + NLSY_AGE_BAND(age),
  };
}

const NLSY79_FM = {
  id: 'nlsy79_first_marriage',
  kind: 'rate',
  outcome: 'In this lens, divorce means a legal divorce ending a first marriage, counted from the wedding (separation alone is not counted).',
  ageNote: 'Ages here are ages on the wedding day; marrying older was linked to fewer divorces, which is not evidence of an ideal age gap.',
  searchText: 'Searches the partner’s age on the wedding day (±6 years) and schooling, holding everything else fixed.',
  uses: 'each partner’s age and schooling on the wedding day, sex, race-ethnicity, children born before the wedding, mother’s schooling, religion raised in, religious attendance, family at 14, school enrolment, region, living together first, and whether the spouse worked',
  questions: ['raceEth', 'kidsBefore', 'motherEdu', 'religionRaised', 'attendDetail', 'enrolled', 'place', 'state', 'cohabitedFirst'],
  views: (a, b, couple) => perspectives(a, b, couple, true),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, true).map((v) => v.label),
  rows: (bundle, a, b, couple, k) => perspectives(a, b, couple, true).map((v) => nlsy79FmRow(bundle, v, couple, k)),
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The NLSY79 first-marriage lens');
    if (out.length) return out;
    const vs = perspectives(a, b, couple, true);
    if (!vs.length) return ['This lens covers first marriages only, and both partners were married before, so it gives no number.'];
    const s = bundle.support;
    const w = weddingYear(bundle, couple);
    if (w.real < s.wedding_year[0]) out.push(`The wedding year (${w.real}) is before 1981, the earliest wedding in this lens.`);
    for (const v of vs) {
      const r = nlsy79FmRow(bundle, v, couple, 0);
      const who = v.who === 'a' ? 'your' : 'your partner’s';
      if (r.age_at_marriage < s.age_at_marriage[0] || r.age_at_marriage > s.age_at_marriage[1]) out.push(`As respondent, ${who} age on the wedding day (${Math.round(r.age_at_marriage)}) is outside the ${Math.ceil(s.age_at_marriage[0])}–${Math.floor(s.age_at_marriage[1])} in the data.`);
      if (r.spouse_age_at_marriage < s.spouse_age_at_marriage[0] || r.spouse_age_at_marriage > s.spouse_age_at_marriage[1]) out.push(`The spouse’s age on the wedding day (${Math.round(r.spouse_age_at_marriage)}) is outside the ${Math.ceil(s.spouse_age_at_marriage[0])}–${Math.floor(s.spouse_age_at_marriage[1])} in the data.`);
      if (!r.race) out.push(`This lens needs ${v.who === 'a' ? 'your' : 'your partner’s'} race-ethnicity: the model has no “unknown” group for it.`);
      if (!r.premarital_birth) out.push(`This lens needs to know whether ${v.who === 'a' ? 'you' : 'your partner'} had a child before the wedding (“Children born before the wedding”): the model has no “unknown” group for it.`);
    }
    return [...new Set(out)];
  },
  notes(bundle, a, b, couple) {
    const out = heldNote(weddingYear(bundle, couple));
    out.push('Test scores and early-life scales (AFQT, self-esteem, locus of control, delinquency) and pre-wedding family income are not asked; the models score them as “not tested” / missing, as the bundle documents.');
    const unk = ['father’s schooling', 'poverty status', 'urban or rural', 'living with parents before the wedding'];
    if (a.intactFamily !== 'Yes') unk.push('family at 14 (the form asks only whether both parents were there)');
    return [...out, ...unknownNote(unk)];
  },
  changes: () => [],
  coupleChanges(couple, a, b) {
    if (ym(couple) !== 0) return [];
    return [2, 5].map((d) => ({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } }));
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 2) for (const school of SCHOOLS) out.push({ ...template, age: num(me.age) + gap, school, degree: schoolDegree[school] });
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${String(p.school).toLowerCase()} of schooling`,
  partnerKey: (p) => `${p.age}|${p.school}`,
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -4, -2, 0, 2, 4, 6] },
    { key: 'school', label: 'Years of schooling', values: SCHOOLS, patch: (v) => ({ school: v, degree: schoolDegree[v] }) },
    { key: 'work', label: 'Work hours', values: ['No work hours', '2,000+ hours'], show: (v) => (v === 'No work hours' ? 'did not work' : 'worked') },
  ],
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, true)[0];
    return v ? nlsy79FmRow(bundle, v, couple, 0) : {};
  },
};

// ======================================================================================
// NLSY97 first marriages, from the wedding (annual separation-or-divorce rate).
// ======================================================================================
const NLSY97_EDU = { 'Less than high school': 'No high school credential', 'High school': 'High school or GED', 'Some college': 'High school or GED', Associate: 'Associate', Bachelor: 'Bachelor', Master: 'Graduate degree', PhD: 'Graduate degree', Professional: 'Graduate degree' };
const SPOUSE_EDU_97 = { '<12 years': 'Less than 12 years', '12 years': '12 years', '13-15 years': '13-15 years', '16+ years': '16+ years' };
const AGE_BAND_97 = (x) => (x < 22 ? 'under 22' : x < 26 ? '22-25' : x < 30 ? '26-29' : '30+');
const COARSE_OWN_97 = { 'No high school credential': 'HS or less', 'High school or GED': 'HS or less', Associate: 'Some college', Bachelor: 'BA+', 'Graduate degree': 'BA+' };
const COARSE_SPOUSE_97 = { 'Less than 12 years': 'HS or less', '12 years': 'HS or less', '13-15 years': 'Some college', '16+ years': 'BA+' };
const RAISED_97 = { None: 'None', Catholic: 'Catholic', Baptist: 'Protestant', 'Other Protestant': 'Protestant', Jewish: 'Other', Other: 'Other' };
const HOURS_97 = { 'No work hours': 0, '1–1,999 hours': 1000, '2,000+ hours': 2080 };

export function nlsy97Row(bundle, v, couple, k) {
  const { p, s } = v;
  const age = num(p.age) - ym(couple);
  const sex = p.sex === 'Woman' ? 'Female' : 'Male';
  const race = nlsyRace(p.raceEth);
  const srace = nlsyRace(s.raceEth);
  const cohab = yesNo(couple.cohabitedFirst);
  const months = cohab === 'No' ? 0 : Number.isFinite(num(couple.cohabMonths)) && has(couple.cohabMonths) ? Math.min(120, Math.max(0, num(couple.cohabMonths))) : null;
  const edu = NLSY97_EDU[p.degree] || null;
  const sedu = SPOUSE_EDU_97[gradeBand(s)] || null;
  const ad = attendDetail(p);
  const fresh = ym(couple) === 0; // last year's wages and hours are "the year before the wedding" only for a wedding now
  const wage = num(p.wages);
  return {
    marriage_years: ym(couple) + k,
    sex,
    race_ethnicity: race,
    age_at_marriage: age,
    region: { Northeast: 'Northeast', Midwest: 'North Central', South: 'South', West: 'West' }[usRegionOf(couple)] || 'Unknown',
    urban: 'Unknown',
    cohabited_first: cohab,
    cohab_months_before: months,
    prior_cohabitations_band: COUNT3.includes(p.priorPartners) ? p.priorPartners : null,
    children_before_marriage: COUNT3.includes(p.kidsBefore) ? p.kidsBefore : null,
    pregnant_at_wedding: yesNo(couple.expecting),
    parent_max_grade: null,
    family_at_12: p.intactFamily === 'Yes' ? 'Both biological parents' : 'Unknown',
    poverty_ratio_1997: null,
    religion_raised: RAISED_97[p.religionRaised] || 'Unknown',
    parent_attendance_1997: 'Unknown',
    afqt_percentile: null, delinquency_1997: null, substance_1997: null,
    first_sex: 'Unknown',
    // The model's own level for attendance it has no measure of (weddings before 2000).
    attendance_before: ad || 'Not measured before wedding',
    mhi5_before: null,
    education_at_marriage: edu,
    enrolled_at_marriage: yesNo(p.enrolled),
    hours_year_before: fresh && p.work in HOURS_97 ? HOURS_97[p.work] : null,
    earnings_year_before_k: fresh && Number.isFinite(wage) ? Math.min(150, wage / 1000) : null,
    net_worth_before_k: null,
    spouse_age_gap: num(s.age) - num(p.age),
    spouse_education: sedu,
    spouse_race_ethnicity: srace,
    same_race_ethnicity: race && srace ? (race === srace ? 'Same' : 'Different') : null,
    spouse_married_before: s.priorMarriage ? 'Yes' : 'No',
    spouse_has_children: yesNo(s.priorChildren) || 'Unknown',
    pair_sex_age: `${sex} x ${AGE_BAND_97(age)}`,
    pair_education: edu && sedu ? `${COARSE_OWN_97[edu]} x spouse ${COARSE_SPOUSE_97[sedu]}` : null,
    pair_cohab_age: cohab ? `${cohab} x ${AGE_BAND_97(age)}` : null,
  };
}

const NEED_97 = [
  ['race_ethnicity', 'race-ethnicity'], ['spouse_race_ethnicity', 'the spouse’s race-ethnicity'], ['cohabited_first', 'whether you lived together before marrying'],
  ['prior_cohabitations_band', 'earlier live-in partners'], ['children_before_marriage', 'children born before the wedding'], ['pregnant_at_wedding', 'whether a baby was expected at the wedding'],
  ['education_at_marriage', 'highest degree'], ['enrolled_at_marriage', 'whether in school or college'], ['spouse_education', 'the spouse’s schooling'],
];
const NLSY97 = {
  id: 'nlsy97_first_marriage',
  kind: 'rate',
  outcome: 'In this lens, divorce means separation or divorce ending a first marriage, counted from the wedding.',
  ageNote: 'Ages here are ages on the wedding day; a partner’s age enters as the age gap, which is not evidence of an ideal gap.',
  searchText: 'Searches the age gap (±6 years), the partner’s schooling and whether they were married before or have children, holding everything else fixed.',
  uses: 'each respondent’s age on the wedding day, sex, race-ethnicity, highest degree, school enrolment, earnings and hours the year before, religion raised in, attendance, family at 12, region, earlier live-in partners, children before the wedding, a baby expected, living together first (and for how long), and the spouse’s age gap, schooling, race-ethnicity, earlier marriage and children',
  questions: ['raceEth', 'priorPartners', 'kidsBefore', 'expecting', 'enrolled', 'cohabitedFirst', 'cohabMonths', 'religionRaised', 'attendDetail', 'place', 'state'],
  views: (a, b, couple) => perspectives(a, b, couple, true),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, true).map((v) => v.label),
  rows: (bundle, a, b, couple, k) => perspectives(a, b, couple, true).map((v) => nlsy97Row(bundle, v, couple, k)),
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The NLSY97 lens');
    if (out.length) return out;
    const vs = perspectives(a, b, couple, true);
    if (!vs.length) return ['This lens covers the respondent’s first marriage only, and both partners were married before, so it gives no number.'];
    const s = bundle.support;
    for (const v of vs) {
      const r = nlsy97Row(bundle, v, couple, 0);
      const who = v.who === 'a' ? 'you' : 'your partner';
      if (r.age_at_marriage < s.age_at_marriage[0] || r.age_at_marriage > s.age_at_marriage[1]) out.push(`As respondent, ${v.who === 'a' ? 'your' : 'your partner’s'} age on the wedding day (${Math.round(r.age_at_marriage)}) is outside the ${Math.ceil(s.age_at_marriage[0])}–${Math.floor(s.age_at_marriage[1])} this cohort (born 1980–84) married at.`);
      const missing = NEED_97.filter(([c]) => !r[c]).map(([, l]) => l);
      if (missing.length) out.push(`With ${who} as respondent, this lens needs ${missing.join(', ')}: the model has no “unknown” group for ${missing.length > 1 ? 'these' : 'it'}.`);
    }
    return [...new Set(out)];
  },
  notes(bundle, a, b, couple) {
    const out = ['Parents’ schooling and income in 1997, test scores, delinquency, mental health and net worth before the wedding are not asked; the models score them at their training medians.'];
    const unk = ['urban or rural', 'parents’ worship attendance', 'age at first sex'];
    if (!ATTEND_DETAIL.includes(a.attendDetail) && a.religion === 'Less than weekly') unk.push('attendance in detail (scored as “not measured before the wedding”)');
    if (ym(couple) > 0) out.push('You are already married, so last year’s wages and hours are not the year before the wedding; they are scored at the training medians.');
    else out.push('Work hours are scored at 0, 1,000 or 2,080 hours for the three bands.');
    return [...out, ...unknownNote(unk)];
  },
  changes: () => [],
  coupleChanges(couple, a, b) {
    const out = [];
    if (ym(couple) !== 0) return out;
    for (const d of [2, 5]) out.push({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } });
    const c = yesNo(couple.cohabitedFirst);
    if (c === 'No') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c === 'Yes') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No', cohabMonths: '' } });
    return out;
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 2) for (const school of SCHOOLS) for (const priorMarriage of [false, true]) out.push({ ...template, age: num(me.age) + gap, school, degree: schoolDegree[school], priorMarriage });
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${String(p.school).toLowerCase()} of schooling, ${p.priorMarriage ? 'married before' : 'not married before'}`,
  partnerKey: (p) => `${p.age}|${p.school}|${p.priorMarriage}`,
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -4, -2, 0, 2, 4, 6] },
    { key: 'school', label: 'Years of schooling', values: SCHOOLS, patch: (v) => ({ school: v, degree: schoolDegree[v] }) },
    { key: 'priorMarriage', label: 'Married before', values: [false, true], show: (v) => (v ? 'married before' : 'not married before') },
    { key: 'priorChildren', label: 'Children from before', values: ['No', 'Yes'], show: (v) => (v === 'Yes' ? 'has children from before' : 'no children from before') },
  ],
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, true)[0];
    return v ? nlsy97Row(bundle, v, couple, 0) : {};
  },
  justMeReason: 'This lens’s partner distribution gives one spouse trait at a time (age gap, schooling, race-ethnicity, earlier marriage), not whole partner profiles, so averaging over it would assume the traits are independent. Enter a partner instead.',
};

// ======================================================================================
// NSFG 1995–2023 pooled: women's models (the wife's report) and the both-sexes view.
// ======================================================================================
const MOTHER_EDU_NSFG = { 'Less than high school': '<HS', 'High school': 'HS', 'Some college': 'Some college', 'Bachelor or more': 'BA+', 'No mother figure': 'No mother figure' };
const MOTHER_AGE_NSFG = { 'Under 18': '<18', '18–19': '18-19', '20–24': '20-24', '25 or older': '25+', 'No mother figure': 'No mother figure' };
const RAISED_NSFG = { None: 'None', Catholic: 'Catholic', Baptist: 'Protestant', 'Other Protestant': 'Protestant', Jewish: 'Other', Other: 'Other' };
const RACE4 = ['Hispanic', 'White', 'Black', 'Other'];
// The form's race-ethnicity adds Asian (SIPP and ACS have it); four-group lenses read it as Other.
const race4 = (r) => (r === 'Asian' ? 'Other' : RACE4.includes(r) ? r : null);
// A bachelor's degree by the wedding: known "No" when the degree today is below a bachelor's;
// "Yes" for a wedding now; otherwise the degree may have come after the wedding.
function baByWedding(p, couple) {
  const y = DEGREE_YEARS[p.degree];
  if (y === undefined) return 'Unknown';
  if (y < 16) return 'No';
  return ym(couple) === 0 ? 'Yes' : 'Unknown';
}
const kidsYN = (p) => (COUNT3.includes(p.kidsBefore) ? (p.kidsBefore === '0' ? 'No' : 'Yes') : null);

export function nsfgPooledRow(bundle, a, b, couple, k) {
  const wife = a.sex === 'Woman' ? a : b;
  const husband = a.sex === 'Woman' ? b : a;
  const w = weddingYear(bundle, couple);
  const wr = race4(wife.raceEth);
  const hr = race4(husband.raceEth);
  return {
    marriage_years: ym(couple) + k,
    wife_age_at_marriage: num(wife.age) - ym(couple),
    husband_age_at_marriage: num(husband.age) - ym(couple),
    wedding_year: w.used,
    wife_premarital_sex_years: null,
    cohabited_first: yesNo(couple.cohabitedFirst) || 'Unknown',
    husband_married_before: husband.priorMarriage ? 'Yes' : 'No',
    husband_prior_children: yesNo(husband.priorChildren) || 'Unknown',
    wife_race_ethnicity: wr,
    same_race_ethnicity: wr && hr ? (wr === hr ? 'Same' : 'Different') : 'Unknown',
    wife_intact_family: yesNo(wife.intactFamily) || 'Unknown',
    wife_premarital_birth: kidsYN(wife),
    wife_premarital_partners: 'Unknown',
    wife_ba_by_wedding: baByWedding(wife, couple),
    wife_mother_education: MOTHER_EDU_NSFG[wife.motherEdu] || null,
    wife_mother_age_first_birth: MOTHER_AGE_NSFG[wife.motherAgeFirst] || null,
    wife_religion_raised: RAISED_NSFG[wife.religionRaised] || 'Unknown',
    wife_born_outside_us: 'Unknown',
  };
}

const NSFG_POOLED = {
  id: 'nsfg_pooled_first_marriage',
  kind: 'rate',
  outcome: 'In this lens, divorce means the end of the wife’s first marriage by divorce, annulment or separation, counted from the wedding day.',
  ageNote: 'Ages here are ages on the wedding day; marrying older was linked to fewer break-ups, which is not evidence of an ideal age gap.',
  searchText: 'Searches the husband’s age on the wedding day (±6 years), whether he was married before and whether he has children from an earlier relationship.',
  uses: 'both ages on the wedding day, wedding year, living together first, the husband’s earlier marriage and children, both race-ethnicities, and the wife’s family of origin, children before the wedding, bachelor’s degree, mother’s schooling and age at first birth, and religion raised in',
  questions: ['raceEth', 'kidsBefore', 'motherEdu', 'motherAgeFirst', 'religionRaised', 'cohabitedFirst'],
  rowLabels: () => ['Scored from the wife’s survey answers'],
  rows: (bundle, a, b, couple, k) => [nsfgPooledRow(bundle, a, b, couple, k)],
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The NSFG 1995–2023 lens');
    if (out.length) return out;
    const wife = a.sex === 'Woman' ? a : b;
    const r = nsfgPooledRow(bundle, a, b, couple, 0);
    const s = bundle.support;
    if (wife.priorMarriage) out.push('This lens covers only women’s first marriages, so it gives no number when the wife was married before.');
    if (r.wife_age_at_marriage < s.wife_age_at_marriage[0] || r.wife_age_at_marriage > s.wife_age_at_marriage[1]) out.push(`The wife’s age on the wedding day (${Math.round(r.wife_age_at_marriage)}) is outside the ${s.wife_age_at_marriage[0]}–${s.wife_age_at_marriage[1]} in the data.`);
    if (r.husband_age_at_marriage < s.husband_age_at_marriage[0] || r.husband_age_at_marriage > s.husband_age_at_marriage[1]) out.push(`The husband’s age on the wedding day (${Math.round(r.husband_age_at_marriage)}) is outside the ${s.husband_age_at_marriage[0]}–${s.husband_age_at_marriage[1]} in the data.`);
    const miss = [];
    if (!r.wife_race_ethnicity) miss.push('the wife’s race-ethnicity');
    if (!r.wife_premarital_birth) miss.push('whether the wife had a child before the wedding');
    if (!r.wife_mother_education) miss.push('the wife’s mother’s schooling');
    if (!r.wife_mother_age_first_birth) miss.push('the wife’s mother’s age at her first birth');
    if (miss.length) out.push(`This lens needs ${miss.join(', ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    return out;
  },
  notes(bundle, a, b, couple) {
    return [...heldNote(weddingYear(bundle, couple)), 'The wife’s years between first sex and the wedding are not asked (scored at the training median); her number of earlier partners and birthplace are scored as unknown.'];
  },
  changes: () => [],
  coupleChanges(couple, a, b) {
    const out = [];
    const c = yesNo(couple.cohabitedFirst);
    if (c !== 'Yes') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c !== 'No') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No' } });
    if (ym(couple) === 0) for (const d of [2, 5]) out.push({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } });
    return out;
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 2) for (const priorMarriage of [false, true]) for (const priorChildren of ['No', 'Yes']) out.push({ ...template, age: num(me.age) + gap, priorMarriage, priorChildren });
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${p.priorMarriage ? 'married before' : 'not married before'}, ${p.priorChildren === 'Yes' ? 'has children from before' : 'no children from before'}`,
  partnerKey: (p) => `${p.age}|${p.priorMarriage}|${p.priorChildren}`,
  partnerTraits(me) {
    if (me.sex === 'Woman') {
      return [
        { key: 'age', label: 'Age gap (husband minus you)', gap: true, values: [-4, -2, 0, 2, 4, 6, 8, 10] },
        { key: 'priorMarriage', label: 'Married before', values: [false, true], show: (v) => (v ? 'married before' : 'not married before') },
        { key: 'priorChildren', label: 'Children from before', values: ['No', 'Yes'], show: (v) => (v === 'Yes' ? 'has children from before' : 'no children from before') },
      ];
    }
    return [
      { key: 'age', label: 'Age gap (wife minus you)', gap: true, values: [-10, -8, -6, -4, -2, 0, 2, 4] },
      { key: 'intactFamily', label: 'Lived with both parents to 18', values: ['Yes', 'No'], show: (v) => (v === 'Yes' ? 'grew up with both parents' : 'did not grow up with both parents') },
      { key: 'kidsBefore', label: 'Children born before the wedding', values: ['0', '1'], show: (v) => (v === '0' ? 'no children before the wedding' : 'a child before the wedding') },
    ];
  },
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => ({ ...nsfgPooledRow(bundle, a, b, couple, 0), wedding_year: weddingYear(bundle, couple).real }),
  // partner_distribution has the NSFG 2002 shape (given_wife / given_husband): population.js's default.
  nsfgPartnerDistribution: true,
};

// Before the wedding (workstream B's harmonized NSFG 1995–2023 model, prewedding_harmonized.json):
// only facts knowable on the wedding day, from either partner's side. The survey interviewed one
// spouse, so the couple is scored with each partner as the respondent and the two rates averaged.
// Unknown answers take the training mode inside the engine (the bundle's unknown_policy).
export function preweddingRow(bundle, p, q, couple, k) {
  const husband = p.sex === 'Man' ? p : q;
  const wife = p.sex === 'Man' ? q : p;
  const pr = race4(p.raceEth);
  const qr = race4(q.raceEth);
  const yn = (v) => yesNo(v) || 'Unknown';
  return {
    marriage_years: ym(couple) + k,
    respondent_age: num(p.age) - ym(couple),
    spouse_age: num(q.age) - ym(couple),
    age_gap: num(husband.age) - num(wife.age),
    wedding_year: weddingYear(bundle, couple).used,
    spouse_prior_marriage: q.priorMarriage ? 'Yes' : 'No',
    respondent_prior_children: kidsYN(p) || 'Unknown',
    spouse_prior_children: kidsYN(q) || 'Unknown',
    cohabited_first: yn(couple.cohabitedFirst),
    respondent_race: pr || 'Unknown',
    spouse_race: qr || 'Unknown',
    same_race: pr && qr ? (pr === qr ? 'Same' : 'Different') : 'Unknown',
    intact_family: yn(p.intactFamily),
    religion_raised: RAISED_NSFG[p.religionRaised] || 'Unknown',
    respondent_sex: p.sex === 'Man' ? 'Man' : 'Woman',
  };
}
const PREWED_ASKED = { respondent_prior_children: 'children born before the wedding', spouse_prior_children: 'children born before the wedding', cohabited_first: 'living together first', respondent_race: 'race-ethnicity', spouse_race: 'race-ethnicity', same_race: 'race-ethnicity', intact_family: 'lived with both parents to 18', religion_raised: 'religion raised in' };

const PREWEDDING = {
  id: 'prewedding_harmonized',
  kind: 'rate',
  outcome: 'In this lens, divorce means the end of a first marriage by divorce, annulment or separation, counted from the wedding day, judged only from facts knowable on the wedding day.',
  ageNote: 'Ages here are ages on the wedding day; marrying older was linked to fewer break-ups, which is not evidence of an ideal age gap.',
  searchText: 'Searches the partner’s age on the wedding day (±6 years), whether they were married before and whether they had a child before the wedding — facts known before marrying.',
  uses: 'both ages on the wedding day, wedding year, living together first, each partner’s earlier marriage and children born before the wedding, both race-ethnicities, each partner’s family of origin and religion raised in, and sex',
  questions: ['raceEth', 'kidsBefore', 'religionRaised', 'cohabitedFirst'],
  rowLabels: () => ['Scored with you as the surveyed spouse', 'Scored with your partner as the surveyed spouse'],
  rows: (bundle, a, b, couple, k) => [preweddingRow(bundle, a, b, couple, k), preweddingRow(bundle, b, a, couple, k)],
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The before-the-wedding lens');
    if (out.length) return out;
    const s = bundle.support;
    if (a.priorMarriage || b.priorMarriage) out.push('This lens covers first marriages only (each partner’s first), so it gives no number when either partner was married before.');
    for (const [who, p] of [['your', a], ['your partner’s', b]]) {
      const age = num(p.age) - ym(couple);
      if (!(age >= s.respondent_age[0] && age <= s.respondent_age[1])) out.push(`${who[0].toUpperCase() + who.slice(1)} age on the wedding day (${Math.round(age)}) is outside the ${Math.ceil(s.respondent_age[0])}–${Math.floor(s.respondent_age[1])} the survey covers for a first marriage.`);
    }
    return out;
  },
  notes(bundle, a, b, couple) {
    const miss = new Set();
    for (const r of PREWEDDING.rows(bundle, a, b, couple, 0)) for (const [k, label] of Object.entries(PREWED_ASKED)) if (r[k] === 'Unknown') miss.add(label);
    return [...heldNote(weddingYear(bundle, couple)), ...(miss.size ? [`Not answered, so scored at the survey’s most common answer: ${[...miss].join(', ')}.`] : [])];
  },
  changes: () => [],
  coupleChanges(couple, a, b) {
    const out = [];
    const c = yesNo(couple.cohabitedFirst);
    if (c !== 'Yes') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c !== 'No') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No' } });
    if (ym(couple) === 0) for (const d of [2, 5]) out.push({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } });
    return out;
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 2) for (const kidsBefore of ['0', '1']) out.push({ ...template, age: num(me.age) + gap, priorMarriage: false, kidsBefore });
    return out;
  },
  describePartner: (p) => `age ${p.age} at the wedding, ${p.kidsBefore === '0' ? 'no child before the wedding' : 'a child before the wedding'}`,
  partnerKey: (p) => `${p.age}|${p.kidsBefore}`,
  partnerTraits(me) {
    return [
      { key: 'age', label: me.sex === 'Woman' ? 'Age gap (partner minus you)' : 'Age gap (partner minus you)', gap: true, values: [-8, -6, -4, -2, 0, 2, 4, 6, 8] },
      { key: 'kidsBefore', label: 'Children born before the wedding', values: ['0', '1'], show: (v) => (v === '0' ? 'no child before the wedding' : 'a child before the wedding') },
      { key: 'intactFamily', label: 'Lived with both parents to 18', values: ['Yes', 'No'], show: (v) => (v === 'Yes' ? 'grew up with both parents' : 'did not grow up with both parents') },
      { key: 'religionRaised', label: 'Religion raised in', values: ['None', 'Catholic', 'Other Protestant', 'Other'], show: (v) => `raised ${v === 'None' ? 'with no religion' : v}` },
    ];
  },
};

export function nsfgBothRow(bundle, v, couple, k) {
  const { p } = v;
  const w = weddingYear(bundle, couple);
  return {
    marriage_years: ym(couple) + k,
    respondent_age_at_marriage: num(p.age) - ym(couple),
    wedding_year: w.used,
    respondent_premarital_sex_years: null,
    respondent_sex: p.sex === 'Woman' ? 'Female' : 'Male',
    cohabited_first: yesNo(couple.cohabitedFirst) || 'Unknown',
    respondent_premarital_birth: kidsYN(p),
    respondent_race_ethnicity: race4(p.raceEth),
    respondent_intact_family: yesNo(p.intactFamily) || 'Unknown',
    respondent_ba_by_wedding: baByWedding(p, couple),
    respondent_mother_education: MOTHER_EDU_NSFG[p.motherEdu] || null,
    respondent_mother_age_first_birth: MOTHER_AGE_NSFG[p.motherAgeFirst] || null,
    respondent_religion_raised: RAISED_NSFG[p.religionRaised] || 'Unknown',
    respondent_born_outside_us: 'Unknown',
  };
}

const NSFG_BOTH = {
  id: 'nsfg_pooled_both_sexes',
  kind: 'rate',
  outcome: 'In this lens, divorce means the end of a first marriage by divorce, annulment or separation, counted from the wedding day; each partner is scored from their own report, as the survey interviewed one spouse.',
  ageNote: 'Only the reporting partner’s own traits enter; the other partner matters only through living together first.',
  searchText: 'The partner’s traits are not inputs here (each spouse is scored from their own report), so there is no partner search.',
  uses: 'each partner’s own age on the wedding day, sex, race-ethnicity, family of origin, children before the wedding, bachelor’s degree, mother’s schooling and age at first birth and religion raised in, plus wedding year and living together first',
  questions: ['raceEth', 'kidsBefore', 'motherEdu', 'motherAgeFirst', 'religionRaised', 'cohabitedFirst'],
  views: (a, b, couple) => perspectives(a, b, couple, true),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, true).map((v) => v.label),
  rows: (bundle, a, b, couple, k) => perspectives(a, b, couple, true).map((v) => nsfgBothRow(bundle, v, couple, k)),
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The NSFG both-sexes lens');
    if (out.length) return out;
    const vs = perspectives(a, b, couple, true);
    if (!vs.length) return ['This lens covers first marriages only, and both partners were married before, so it gives no number.'];
    const s = bundle.support;
    for (const v of vs) {
      const r = nsfgBothRow(bundle, v, couple, 0);
      const who = v.who === 'a' ? 'your' : 'your partner’s';
      if (r.respondent_age_at_marriage < s.respondent_age_at_marriage[0] || r.respondent_age_at_marriage > s.respondent_age_at_marriage[1]) out.push(`As respondent, ${who} age on the wedding day (${Math.round(r.respondent_age_at_marriage)}) is outside the ${Math.ceil(s.respondent_age_at_marriage[0])}–${Math.floor(s.respondent_age_at_marriage[1])} in the data.`);
      const miss = [];
      if (!r.respondent_race_ethnicity) miss.push('race-ethnicity');
      if (!r.respondent_premarital_birth) miss.push('children born before the wedding');
      if (!r.respondent_mother_education) miss.push('mother’s schooling');
      if (!r.respondent_mother_age_first_birth) miss.push('mother’s age at her first birth');
      if (miss.length) out.push(`With ${v.who === 'a' ? 'you' : 'your partner'} as respondent, this lens needs ${miss.join(', ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    }
    return [...new Set(out)];
  },
  notes(bundle, a, b, couple) {
    return [...heldNote(weddingYear(bundle, couple)), 'Years between first sex and the wedding are not asked (training median); birthplace is scored as unknown. This view of the bundle has no out-of-distribution score (the bundle’s is for the women’s models), so only the range checks apply.'];
  },
  changes: () => [],
  coupleChanges(couple) {
    const out = [];
    const c = yesNo(couple.cohabitedFirst);
    if (c !== 'Yes') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c !== 'No') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No' } });
    return out;
  },
  partnerGrid: () => [],
  describePartner: (p) => `age ${p.age}`,
  partnerKey: (p) => `${p.age}`,
  partnerTraits: () => [],
  selfOnly: true,
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, true)[0];
    return v ? { ...nsfgBothRow(bundle, v, couple, 0), wedding_year: weddingYear(bundle, couple).real } : {};
  },
};

// The both-sexes models live in the same bundle; this view gives them the top-level fields every
// lens has. Its out-of-distribution spec is the women's models', so the view has none.
export function bothSexesView(bundle) {
  if (!Array.isArray(bundle.models_both_sexes)) return null;
  return {
    id: 'nsfg_pooled_both_sexes',
    adapter: 'nsfg_pooled_both_sexes',
    label: 'NSFG 1995–2023 first marriages, both sexes: each spouse scored from their own report (U.S., weddings 1970–2023)',
    view_of: bundle.id,
    source: bundle.source,
    target: bundle.target,
    population: 'U.S. household population; first marriages reported by women (1995–2023) and men (2002–2023), each from the reporting spouse’s own traits (models_both_sexes)',
    weights: bundle.weights,
    training: bundle.training,
    constant_rate: bundle.constant_rate,
    support: bundle.support_both_sexes,
    inputs: bundle.inputs_both_sexes,
    models: bundle.models_both_sexes,
    scoring_models: bundle.scoring_models,
    population_reference: bundle.population_reference_both_sexes,
    sklearn: bundle.sklearn,
  };
}

// ======================================================================================
// Statistics Canada GSS first marriages (respondent-level; one partner at a time).
// ======================================================================================
export function canadaRow(bundle, v, couple, k) {
  const { p } = v;
  const w = weddingYear(bundle, couple);
  return {
    marriage_years: ym(couple) + k,
    age_at_marriage: num(p.age) - ym(couple),
    wedding_year: w.used,
    respondent_sex: p.sex === 'Woman' ? 'Female' : 'Male',
    cohabited_first: yesNo(couple.cohabitedFirst) || 'Unknown',
    prior_union: COUNT3.includes(p.priorPartners) ? (p.priorPartners === '0' ? 'No' : 'Yes') : null,
    premarital_birth: kidsYN(p),
    intact_family_15: yesNo(p.intactFamily) || 'Unknown',
    born_outside_canada: 'Unknown',
    first_language: 'Unknown',
    region: canadaRegion(couple.place),
    survey_cycle: bundle.app_defaults?.survey_cycle || '2017',
  };
}

const CANADA = {
  id: 'canada_gss_first_marriage',
  kind: 'rate',
  outcome: 'In this lens, divorce means separation (or divorce without a recorded separation) ending a first marriage in Canada, counted from the wedding; each partner is scored from their own report.',
  ageNote: 'Only the reporting partner’s own traits enter; the other partner matters only through living together first.',
  searchText: 'The partner’s traits are not inputs here (each spouse reports one marriage), so there is no partner search.',
  uses: 'each partner’s own age on the wedding day, sex, earlier live-in partner, children before the wedding and family at 15, plus the wedding year, living together first and the Canadian region',
  questions: ['place', 'priorPartners', 'kidsBefore', 'cohabitedFirst'],
  views: (a, b, couple) => perspectives(a, b, couple, true),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, true).map((v) => v.label),
  rows: (bundle, a, b, couple, k) => perspectives(a, b, couple, true).map((v) => canadaRow(bundle, v, couple, k)),
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The Statistics Canada lens');
    if (out.length) return out;
    const vs = perspectives(a, b, couple, true);
    if (!vs.length) return ['This lens models first marriages only, and both partners were married before, so it gives no number.'];
    if (has(couple.place) && !canadaRegion(couple.place)) out.push('This lens’s population is the ten Canadian provinces; you said you live elsewhere, so it gives no number.');
    else if (!canadaRegion(couple.place)) out.push('This lens needs your Canadian region (“Where you live”): the model has no “unknown” region.');
    const s = bundle.support;
    for (const v of vs) {
      const r = canadaRow(bundle, v, couple, 0);
      if (r.age_at_marriage < s.age_at_marriage[0] || r.age_at_marriage > s.age_at_marriage[1]) out.push(`As respondent, ${v.who === 'a' ? 'your' : 'your partner’s'} age on the wedding day (${Math.round(r.age_at_marriage)}) is outside the ${Math.ceil(s.age_at_marriage[0])}–${Math.floor(s.age_at_marriage[1])} in the data.`);
      const miss = [];
      if (!r.prior_union) miss.push('earlier live-in partners');
      if (!r.premarital_birth) miss.push('children born before the wedding');
      if (miss.length) out.push(`With ${v.who === 'a' ? 'you' : 'your partner'} as respondent, this lens needs ${miss.join(' and ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    }
    if (weddingYear(bundle, couple).real < s.wedding_year[0]) out.push(`The wedding year is before ${s.wedding_year[0]}, the earliest in the data.`);
    return [...new Set(out)];
  },
  notes(bundle, a, b, couple) {
    return [...heldNote(weddingYear(bundle, couple)), `Scored as the ${bundle.app_defaults?.survey_cycle || '2017'} survey cycle (the bundle’s app default). Birthplace and first language are scored as unknown. “Both parents to 18” stands in for the survey’s “both parents until 15”.`];
  },
  changes: () => [],
  coupleChanges(couple) {
    const out = [];
    const c = yesNo(couple.cohabitedFirst);
    if (c !== 'Yes') out.push({ label: 'Live together before marrying', couple: { cohabitedFirst: 'Yes' } });
    if (c !== 'No') out.push({ label: 'Do not live together before marrying', couple: { cohabitedFirst: 'No' } });
    return out;
  },
  partnerGrid: () => [],
  describePartner: (p) => `age ${p.age}`,
  partnerKey: (p) => `${p.age}`,
  partnerTraits: () => [],
  selfOnly: true,
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, true)[0];
    return v ? { ...canadaRow(bundle, v, couple, 0), wedding_year: weddingYear(bundle, couple).real } : {};
  },
};

// ======================================================================================
// GSS panels: married now, divorced or separated two years later (one probability).
// ======================================================================================
const GSS_DEGREE = { 'Less than high school': 'Less than high school', 'High school': 'High school', 'Some college': 'High school', Associate: 'Junior college', Bachelor: 'Bachelor', Master: 'Graduate', PhD: 'Graduate', Professional: 'Graduate' };
const GSS_WORK = { '2,000+ hours': 'Full-time', '1–1,999 hours': 'Part-time' };
const GSS_RACE = { White: 'White', Black: 'Black', Asian: 'Other', Other: 'Other' };
// ATTEND codes: 0 never ... 4 once a month, 7 every week (the representative code of each answer).
const GSS_ATTEND = { Never: 0, 'Less than monthly': 2, 'About monthly': 4, 'Weekly or more': 7 };
function gssIncomeBand(a, b, couple) {
  const inc = householdIncome(a, b, couple);
  if (!Number.isFinite(inc)) return 'Unknown';
  const x = (inc * CPI[2000]) / CPI[2024];
  return x < 20000 ? 'Under $20k' : x < 40000 ? '$20k-$40k' : x < 75000 ? '$40k-$75k' : '$75k+';
}
export function gssRow(bundle, v, couple, a, b) {
  const { p, s } = v;
  const ad = attendDetail(p);
  return {
    age: Math.min(89, num(p.age)),
    childs: null,
    attend: ad ? GSS_ATTEND[ad] : null,
    hapmar: HAPMAR.includes(p.hapmar) ? p.hapmar : 'Unknown',
    happy: 'Unknown',
    sex: p.sex === 'Woman' ? 'Female' : 'Male',
    race: GSS_RACE[p.raceEth] || null,
    degree: GSS_DEGREE[p.degree] || 'Unknown',
    spouse_degree: GSS_DEGREE[s.degree] || 'Unknown',
    work: GSS_WORK[p.work] || 'Unknown',
    spouse_work: GSS_WORK[s.work] || 'Unknown',
    family_income: gssIncomeBand(a, b, couple),
    religion: 'Unknown', spouse_religion: 'Unknown', same_religion: 'Unknown',
    divorced_before: p.priorMarriage ? 'Yes' : 'No',
    family_at_16: p.intactFamily === 'Yes' ? 'Both parents' : 'Unknown',
    health: 'Unknown', fefam: 'Unknown', sexfreq: 'Unknown', evstray: 'Unknown', satfin: 'Unknown', xmarsex: 'Unknown',
    region: usRegionOf(couple),
    place: 'Unknown',
  };
}
const gssViews = (a, b, couple) => perspectives(a, b, couple, false).filter((v) => HAPMAR.includes(v.p.hapmar));

const GSS = {
  id: 'gss_panel_marriages',
  kind: 'fixed',
  steps: () => [{ k: 0, start: 0, end: 2, label: 'next 2 years' }],
  horizons: () => [2],
  outcome: 'In this lens, the outcome is being divorced or separated at a re-interview two years later, starting from a married person; it is a 2-year chance only, never a lifetime figure.',
  ageNote: 'The spouse enters only through their degree and work; nothing here is evidence of an ideal partner.',
  searchText: 'Searches the partner’s degree and work hours, holding everything else fixed.',
  uses: 'each spouse’s own marriage happiness, age, sex, race, degree, work, religious attendance and earlier divorce, the other spouse’s degree and work, household income and U.S. region',
  questions: ['hapmar', 'raceEth', 'attendDetail', 'place', 'state'],
  views: gssViews,
  rowLabels: (a, b, couple) => gssViews(a, b, couple).map((v) => v.label),
  rows: (bundle, a, b, couple) => gssViews(a, b, couple).map((v) => gssRow(bundle, v, couple, a, b)),
  issues: () => [],
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The GSS panel lens');
    if (out.length) return out;
    if (!married(couple)) out.push('This lens starts from people who are married now (it predicts the next two years of a marriage), so it gives no number for a couple who is not married.');
    const vs = gssViews(a, b, couple);
    if (!vs.length) out.push('This lens needs marriage happiness (“Taken all together, how would you describe your marriage?”) from at least one of you; it is the lens’s main input.');
    for (const v of vs) {
      const r = gssRow(bundle, v, couple, a, b);
      if (num(v.p.age) < 18) out.push('The GSS interviews adults 18 and older.');
      if (!r.race) out.push(`This lens needs ${v.who === 'a' ? 'your' : 'your partner’s'} race as White, Black or Other: the GSS asks race separately from Hispanic origin, the model has no “unknown” race, and Hispanic cannot be mapped to one of its three groups without guessing.`);
    }
    if (!usRegionOf(couple)) out.push('This lens needs your U.S. region (“Where you live”): the model has no “unknown” region, and its population is U.S. adults.');
    return [...new Set(out)];
  },
  notes(bundle, a, b) {
    const out = ['The 2-year window is all this lens predicts; it does not project further. The bundle’s 4-year results come from a separate model that is not exported, so the app shows them only as observed rates by marriage happiness.'];
    const r4 = (bundle.hapmar_rates_4y || []).filter((x) => HAPMAR.includes(x.hapmar)).map((x) => `${x.hapmar.toLowerCase()} ${(100 * x.weighted_rate).toFixed(1)}% (${(100 * x.ci95[0]).toFixed(1)}–${(100 * x.ci95[1]).toFixed(1)}%)`);
    if (r4.length) out.push(`Observed in the panels (no model): divorced or separated within 4 years, by marriage happiness: ${r4.join('; ')}.`);
    out.push('Number of children is not asked (training median); religion, general happiness, health, attitudes and size of place are scored as unknown. Work “no hours” is scored as unknown (it could be retired, keeping house or out of work). “Married before” stands in for “ever divorced or legally separated”.');
    return out;
  },
  changes: () => [],
  coupleChanges: () => [],
  partnerGrid(me, template) {
    const out = [];
    for (const degree of ['High school', 'Associate', 'Bachelor', 'Master']) for (const work of WORK3) out.push({ ...template, degree, work });
    return out;
  },
  describePartner: (p) => `${String(p.degree).toLowerCase()}, ${String(p.work).toLowerCase()}`,
  partnerKey: (p) => `${p.degree}|${p.work}`,
  partnerTraits: () => [
    { key: 'degree', label: 'Highest degree', values: ['Less than high school', 'High school', 'Associate', 'Bachelor', 'Master'] },
    { key: 'work', label: 'Work hours', values: WORK3 },
  ],
  referenceAt: 'now',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = gssViews(a, b, couple)[0];
    return v ? gssRow(bundle, v, couple, a, b) : {};
  },
  scoring: ['logistic_additive', 'tree_depth3'],
  referenceModels: { hapmar_only: 'one question only (marriage happiness); shown for reference, not averaged' },
};
const WORK3 = ['No work hours', '1–1,999 hours', '2,000+ hours'];

// ======================================================================================
// HCMST couples: married or not, same-sex or not; a break-up probability per follow-up period.
// ======================================================================================
function couplePair(a, b, f) {
  const x = f(a);
  const y = f(b);
  return [x, y];
}
function partyPair(a, b) {
  const [x, y] = couplePair(a, b, (p) => (PARTY.includes(p.party) ? p.party : null));
  if (!x || !y) return null;
  if (x === PARTY[2] || y === PARTY[2]) return 'Other or independent';
  if (x === y) return x === 'Democrat' ? 'Both Democrats' : 'Both Republicans';
  return 'One Republican, one Democrat';
}
function coupleRace(a, b) {
  const [x, y] = couplePair(a, b, (p) => race4(p.raceEth));
  if (!x || !y) return 'Unknown';
  return x === y ? `Both ${x}` : 'Interracial';
}
function earningsHcmst(a, b) {
  const x = num(a.wages);
  const y = num(b.wages);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x + y <= 0) return 'Unknown';
  const sh = x / (x + y);
  return sh >= 0.4 && sh <= 0.6 ? 'About equal' : 'One earned more';
}
export function hcmstRow(bundle, v, a, b, couple, k) {
  const off = Number(bundle.time_offsets?.[String(k + 1)] ?? 0);
  const ya = eduYears(a);
  const yb = eduYears(b);
  const inc = householdIncome(a, b, couple);
  const inc09 = Number.isFinite(inc) ? (inc * CPI[2009]) / CPI[2024] / 1000 : null;
  const st = couple.status;
  const type = a.sex === b.sex ? (a.sex === 'Man' ? 'Two men' : 'Two women') : 'Man-woman';
  const ch = num(couple.childrenHome);
  return {
    period: String(k + 1),
    relationship_quality: QUALITY.includes(v.p.quality) ? v.p.quality : 'Unknown',
    married: st ? (String(st).startsWith('Married') ? 'Yes' : 'No') : null,
    cohabiting: st === 'Married, living together' || st === 'Not married, living together' ? 'Yes' : st ? 'No' : 'Unknown',
    couple_type: type,
    couple_race: coupleRace(a, b),
    party_pair: partyPair(a, b),
    how_met: HOW_MET.includes(couple.howMet) ? couple.howMet : 'Unknown',
    prior_marriage: v.p.priorMarriage ? 'Yes' : 'No',
    earnings: earningsHcmst(a, b),
    religion_pair: 'Unknown',
    parental_approval: { Approve: 'Approve', 'Neutral or unsure': 'Neutral or unsure', Disapprove: 'Disapprove', 'No living parent': 'Not asked (no living parent)' }[v.p.parentsView] || 'Unknown',
    mean_age: (num(a.age) + num(b.age)) / 2 + off,
    age_gap: Math.abs(num(a.age) - num(b.age)),
    relationship_years: has(couple.yearsTogether) && Number.isFinite(num(couple.yearsTogether)) ? Math.max(0.05, num(couple.yearsTogether)) + off : null,
    edu_years_mean: ya !== null && yb !== null ? (ya + yb) / 2 : null,
    edu_gap: ya !== null && yb !== null ? Math.abs(ya - yb) : null,
    // HCMST top-codes household income at $175,000+ (2009 dollars) and values it at 200.
    hh_income_k: inc09 === null ? null : inc09 >= 175 ? 200 : Math.max(2.5, inc09),
    children_in_hh: Number.isFinite(ch) && has(couple.childrenHome) ? Math.min(ch, 10) : null,
  };
}
const hcmstViews = (a, b, couple) => perspectives(a, b, couple, false).filter((v) => QUALITY.includes(v.p.quality));
const HCMST = {
  id: 'hcmst_couples',
  kind: 'periods',
  steps: (bundle) => bundle.periods.map((p, k) => ({ k, start: Number(bundle.time_offsets[p.period]), end: p.years_since_start_at_end, label: `period ${p.period} (${p.start} to ${p.end})` })),
  horizons: () => [2.167, 4.083, 8.417],
  outcome: 'In this lens, a break-up means divorce, separation or the end of an unmarried relationship, counted from today over the next 8.4 years at most.',
  ageNote: 'Age enters as the couple’s mean age and the gap between you; neither is evidence of an ideal partner.',
  searchText: 'Searches the age gap (±6 years) and the partner’s highest degree, holding everything else fixed.',
  uses: 'relationship quality (each partner’s own rating, averaged over who rates), whether you are married and live together, years together, both ages, both degrees, household income, children at home, how you met, both party preferences, both race-ethnicities, earlier marriage of the rater, who earns more and parents’ approval',
  questions: ['quality', 'status', 'yearsTogether', 'howMet', 'party', 'parentsView', 'childrenHome', 'raceEth'],
  views: hcmstViews,
  rowLabels: (a, b, couple) => hcmstViews(a, b, couple).map((v) => (v.who === 'a' ? 'Your rating of the relationship' : 'Your partner’s rating of the relationship')),
  rows: (bundle, a, b, couple, k) => hcmstViews(a, b, couple).map((v) => hcmstRow(bundle, v, a, b, couple, k)),
  issues(bundle, a, b, couple, k) {
    const v = hcmstViews(a, b, couple)[0];
    if (!v) return [];
    const r = hcmstRow(bundle, v, a, b, couple, k);
    const s = bundle.support;
    return [...issueRange('mean age', r.mean_age, s.mean_age), ...issueRange('years together', r.relationship_years, s.relationship_years), ...issueRange('children at home', r.children_in_hh, s.children_in_hh), ...issueRange('age gap', r.age_gap, s.age_gap)];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The HCMST lens', { sameSexOk: true });
    if (out.length) return out;
    if (num(a.age) < 18 || num(b.age) < 18) out.push('HCMST covers adults: both partners must be 18 or older.');
    if (!hcmstViews(a, b, couple).length) out.push('This lens needs relationship quality (“How would you describe the quality of your relationship?”) from at least one of you; it is the lens’s main input.');
    if (!STATUS.includes(couple.status)) out.push('This lens needs whether you are married and live together (“Relationship now”).');
    if (!has(couple.yearsTogether)) out.push('This lens needs how many years you have been together (since the relationship began).');
    else if (num(couple.yearsTogether) < num(couple.yearsMarried)) out.push('Years together cannot be fewer than years married.');
    if (!partyPair(a, b)) out.push('This lens needs both partners’ party preference (“Independent, other or no preference” is an answer): the model has no “unknown” group for the couple’s politics.');
    return out;
  },
  notes() {
    return ['The couple is scored from each partner’s own rating of the relationship (averaged over those who answered). Religion pair is scored as unknown; education is read from the highest degree in years (12 high school, 14 some college or associate, 16 bachelor, 18 master, 20 doctorate). Dollars are read as 2024 dollars and converted to 2009 dollars.'];
  },
  changes(who, person) {
    const out = [];
    for (const q of QUALITY) if (q !== person.quality && QUALITY.indexOf(q) < QUALITY.indexOf(person.quality)) out.push({ label: `Relationship quality felt as “${q.toLowerCase()}”`, [who]: { quality: q } });
    return out;
  },
  coupleChanges(couple) {
    const out = [];
    if (couple.status === 'Not married, living together') out.push({ label: 'Marry (living together)', couple: { status: 'Married, living together' } });
    if (couple.status === 'Not married, not living together') out.push({ label: 'Move in together (not married)', couple: { status: 'Not married, living together' } });
    return out;
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 3) for (const degree of ['High school', 'Some college', 'Bachelor', 'Master']) out.push({ ...template, age: num(me.age) + gap, degree });
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${String(p.degree).toLowerCase()}`,
  partnerKey: (p) => `${p.age}|${p.degree}`,
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -3, 0, 3, 6] },
    { key: 'degree', label: 'Highest degree', values: ['High school', 'Some college', 'Bachelor', 'Master', 'PhD'] },
    { key: 'party', label: 'Party preference', values: PARTY },
  ],
  referenceAt: 'now',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = hcmstViews(a, b, couple)[0];
    return v ? hcmstRow(bundle, v, a, b, couple, 0) : {};
  },
  scoring: ['additive_core', 'additive_full', 'tree_depth3'],
  referenceModels: { quality_only: 'relationship quality only; shown for reference, not averaged' },
};

// ======================================================================================
// Los Angeles newlyweds: both spouses measured; divorce per follow-up interval, ~12 years.
// ======================================================================================
// 2010 HHS poverty guideline for the 48 states: $10,830 for one person plus $3,740 per person.
const fpl2010 = (n) => 10830 + 3740 * (n - 1);
const bin01 = (v) => (v === 'Yes' ? 1 : v === 'No' ? 0 : null);
export function newlywedRow(bundle, a, b, couple, k) {
  const H = a.sex === 'Man' ? a : b;
  const W = a.sex === 'Man' ? b : a;
  const per = bundle.periods[k];
  const row = {};
  for (const p of bundle.periods.slice(1)) row['period_' + p.period] = p.period === per.period ? 1 : 0;
  row.period_years = per.length_years;
  const inc = householdIncome(a, b, couple);
  const inc10 = Number.isFinite(inc) ? (inc * CPI[2010]) / CPI[2024] : NaN;
  const ch = num(couple.childrenHome);
  const size = has(couple.childrenHome) && Number.isFinite(ch) ? 2 + ch : null;
  const lessBA = (p) => (DEGREE_YEARS[p.degree] === undefined ? null : DEGREE_YEARS[p.degree] < 16 ? 1 : 0);
  Object.assign(row, {
    H_educ_D: lessBA(H), W_educ_D: lessBA(W),
    income_k: Number.isFinite(inc10) ? Math.min(100, Math.max(2.5, inc10 / 1000)) : null,
    Household_comp: size,
    Low_income_D: Number.isFinite(inc10) && size !== null ? (inc10 < 2 * fpl2010(size) ? 1 : 0) : null,
    Couple_unemployment_D: null, Couple_fin_strain_D: null, Neighborhood_unemploy: null, Neighborhood_income_k: null,
  });
  for (const [x, p] of [['H', H], ['W', W]]) {
    row[`${x}_substance_D`] = bin01(p.substance);
    row[`${x}_ACE_D`] = bin01(p.ace);
    row[`${x}_abuse_D`] = bin01(p.abuse);
    row[`${x}_neg_affect_D`] = bin01(p.lowMood);
    row[`${x}_parent_marriage_D`] = p.intactFamily === 'Yes' ? 0 : p.intactFamily === 'No' ? 1 : null;
    row[`${x}_sat_sum`] = Number.isFinite(num(p.satSum)) && has(p.satSum) ? num(p.satSum) : null;
    row[`${x}_Hostility`] = Number.isFinite(num(p.hostSum)) && has(p.hostSum) ? num(p.hostSum) : null;
    for (const [code, f] of [['Positivity', 'obsPos'], ['Negativity', 'obsNeg'], ['Effective', 'obsEff']]) {
      const map = bundle.inputs[`${x}_${code}`]?.self_report_proxy?.answers || {};
      row[`${x}_${code}`] = p[f] in map ? map[p[f]] : null;
    }
  }
  row.couple_satisfaction = row.H_sat_sum !== null && row.W_sat_sum !== null ? (row.H_sat_sum + row.W_sat_sum) / 2 : null;
  return row;
}
const proxiesUsed = (a, b) => [a, b].some((p) => OFTEN.includes(p.obsPos) || OFTEN.includes(p.obsNeg) || OFTEN.includes(p.obsEff));
const NEWLYWED = {
  id: 'newlywed_la_couples',
  kind: 'periods',
  steps: (bundle) => bundle.periods.map((p, k) => ({ k, start: p.start_years, end: p.end_years, label: `interval ${p.period} (${p.follow_up_fieldwork})` })),
  horizons: () => [2.34, 4.15, 8.77, 12.04],
  outcome: 'In this lens, divorce means a couple-level report of divorce, counted from the first months of marriage over about 12 years, in 368 low-income, mostly Hispanic Los Angeles newlywed couples.',
  ageNote: 'Age is not an input here; the lens is about how newlyweds feel, behave and live.',
  searchText: 'The partner’s education is the only partner trait this lens takes from the form, so there is no partner search.',
  uses: 'each spouse’s relationship satisfaction (8 areas), self-reported hostility, the conflict-behaviour questions (an approximation of trained observers’ codes), substance problems, adverse childhood experiences, abuse history, low mood and parents’ marriage, plus both degrees, household income and size',
  questions: ['satisfaction', 'hostility', 'observed', 'vulnerabilities', 'childrenHome'],
  rowLabels: () => ['The couple (both spouses’ answers)'],
  rows: (bundle, a, b, couple, k) => [newlywedRow(bundle, a, b, couple, k)],
  issues: () => [],
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The Los Angeles newlywed lens');
    if (out.length) return out;
    if (num(a.age) < 18 || num(b.age) < 18) out.push('The study enrolled spouses aged 18 and older.');
    if (ym(couple) > 0) out.push('This lens knows only the first months of marriage (couples married under about 6 months), so it gives no number for a couple married a year or more.');
    if (a.priorMarriage || b.priorMarriage) out.push('The study enrolled first-married couples only, so it gives no number when either partner was married before.');
    const r = newlywedRow(bundle, a, b, couple, 0);
    if (r.H_sat_sum === null && r.W_sat_sum === null) out.push('This lens needs at least one spouse’s relationship satisfaction (the 8 areas under “Newlywed study questions”); satisfaction is the lens’s main input.');
    return out;
  },
  notes(bundle, a, b, couple) {
    const out = ['A sample of 368 couples: percentiles beyond p5–p95 rest on a handful of couples, and these couples are not U.S. couples in general.'];
    if (!married(couple)) out.push('You are not married yet: scored as if you married now (the study began in the first months of marriage).');
    if (proxiesUsed(a, b)) out.push(bundle.inputs.H_Positivity.self_report_proxy.caveat);
    out.push('Satisfaction: the study used 4- and 5-point items summed to 8–37; the form asks all 8 on a 5-point scale and rescales the sum, so treat it as approximate. Unanswered inputs (and neighbourhood, unemployment and financial strain, which are not asked) are scored at the study’s median, as its pipeline does.');
    return out;
  },
  changes(who, person) {
    const out = [];
    if (OFTEN.includes(person.obsNeg) && OFTEN.indexOf(person.obsNeg) > 0) out.push({ label: 'Hostile or critical in disagreements less often (one step; approximation of observer codes)', [who]: { obsNeg: OFTEN[OFTEN.indexOf(person.obsNeg) - 1] } });
    if (OFTEN.includes(person.obsPos) && OFTEN.indexOf(person.obsPos) < 4) out.push({ label: 'Warm or attentive in disagreements more often (one step; approximation)', [who]: { obsPos: OFTEN[OFTEN.indexOf(person.obsPos) + 1] } });
    return out;
  },
  coupleChanges: () => [],
  partnerGrid: () => [],
  describePartner: (p) => `${String(p.degree || '').toLowerCase()}`,
  partnerKey: (p) => `${p.degree}`,
  partnerTraits: () => [],
  referenceAt: 'now',
  referenceAttrs: (bundle, a, b, couple) => newlywedRow(bundle, a, b, couple, 0),
  scoring: ['satisfaction', 'ses_vul_sat', 'ses_vul_sat_obs', 'all', 'all_lasso'],
  referenceModels: { tree: 'no held-out skill over the interval-only baseline (gain 0.03%, interval −2.1 to +2.1); shown for reference, not averaged' },
  justMeReason: 'This lens has no partner distribution (368 couples), and its inputs are about the two of you together, so it cannot be averaged over partners. Enter a partner instead.',
};

// ======================================================================================
// SIPP first marriages (respondent-level, from the wedding; spouse traits are not inputs).
// ======================================================================================
const RACE5 = ['Hispanic', 'White', 'Black', 'Asian', 'Other'];
const nativity = (p) => (p.bornUS === 'Yes' ? 'US-born' : p.bornUS === 'No' ? 'Foreign-born' : null);
export function sippFmRow(bundle, v, couple, k) {
  const { p } = v;
  const hi = bundle.support.marriage_year[1];
  const wy = nowYear(couple) - ym(couple);
  return {
    marriage_years: ym(couple) + k,
    age_at_marriage: num(p.age) - ym(couple),
    marriage_year: Math.min(wy, hi),
    sex: p.sex,
    race_ethnicity: RACE5.includes(p.raceEth) ? p.raceEth : null,
    nativity: nativity(p),
    education_at_wedding: 'Unknown',
  };
}
const SIPP_FM = {
  id: 'sipp_first_marriage',
  kind: 'rate',
  outcome: 'In this lens, divorce means separation or divorce ending a first marriage (dated by the year of separation), counted from the wedding; each partner is scored from their own history.',
  ageNote: 'Only the reporting partner’s own traits enter (the survey holds only the current spouse, so spouse traits would leak the outcome).',
  searchText: 'The partner’s traits are not inputs here, so there is no partner search.',
  uses: 'each partner’s own age on the wedding day, sex, race-ethnicity and birthplace (U.S.-born or not), plus the wedding year',
  questions: ['raceEth', 'bornUS'],
  views: (a, b, couple) => perspectives(a, b, couple, true),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, true).map((v) => v.label),
  rows: (bundle, a, b, couple, k) => perspectives(a, b, couple, true).map((v) => sippFmRow(bundle, v, couple, k)),
  issues(bundle, a, b, couple, k) {
    const s = bundle.support.marriage_years;
    return ym(couple) + k > s[1] ? [`marriage year ${ym(couple) + k + 1} (data reach year ${s[1] + 1})`] : [];
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The SIPP first-marriage lens', { sameSexOk: true });
    if (out.length) return out;
    const vs = perspectives(a, b, couple, true);
    if (!vs.length) return ['This lens covers first marriages only (a remarriage gets no number), and both partners were married before.'];
    const s = bundle.support;
    for (const v of vs) {
      const r = sippFmRow(bundle, v, couple, 0);
      if (r.age_at_marriage < s.age_at_marriage[0] || r.age_at_marriage > s.age_at_marriage[1]) out.push(`As respondent, ${v.who === 'a' ? 'your' : 'your partner’s'} age on the wedding day (${Math.round(r.age_at_marriage)}) is outside the ${s.age_at_marriage[0]}–${s.age_at_marriage[1]} in the data.`);
      const miss = [];
      if (!r.race_ethnicity) miss.push('race-ethnicity');
      if (!r.nativity) miss.push('whether born in the U.S.');
      if (miss.length) out.push(`With ${v.who === 'a' ? 'you' : 'your partner'} as respondent, this lens needs ${miss.join(' and ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    }
    if (nowYear(couple) - ym(couple) < s.marriage_year[0]) out.push(`The wedding year is before ${s.marriage_year[0]}, the earliest in the data.`);
    return [...new Set(out)];
  },
  notes(bundle, a, b, couple) {
    const wy = nowYear(couple) - ym(couple);
    const hi = bundle.support.marriage_year[1];
    return [...(wy > hi ? [`Wedding year ${wy} is after the latest in the data, so the models score it as a ${hi} wedding; newer marriages may differ.`] : []), 'Same-sex first marriages are in the data (the spouse’s sex is not an input). Education at the wedding enters only a reference model fitted on the 2001–2008 panels, which is not averaged.'];
  },
  changes: () => [],
  coupleChanges(couple, a, b) {
    if (ym(couple) !== 0) return [];
    return [2, 5].map((d) => ({ label: `Marry ${d} years later (both ${d} years older on the wedding day)`, a: { age: num(a.age) + d }, b: { age: num(b.age) + d } }));
  },
  partnerGrid: () => [],
  describePartner: (p) => `age ${p.age}`,
  partnerKey: (p) => `${p.age}`,
  partnerTraits: () => [],
  selfOnly: true,
  referenceAt: 'wedding',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, true)[0];
    return v ? { ...sippFmRow(bundle, v, couple, 0), wedding_year: nowYear(couple) - ym(couple) } : {};
  },
  scoring: ['additive_spline', 'tree_depth4', 'gradient_boosting'],
  referenceModels: { additive_spline_education: 'adds education at the wedding but was fitted on the 2001–2008 panels only; shown for reference, not averaged' },
};

// ======================================================================================
// SIPP married couples, one year ahead, with both spouses' economics (prospective).
// ======================================================================================
const SIPP_EDU = { 'Less than high school': 'Less than high school', 'High school': 'High school', 'Some college': 'Some college', Associate: 'Associate', Bachelor: 'Bachelor', Master: 'Graduate or professional', PhD: 'Graduate or professional', Professional: 'Graduate or professional' };
const timesMarried = (p, unknown) => (!p.priorMarriage ? 'Once' : p.marriagesBefore === '1' ? 'Twice' : p.marriagesBefore === '2+' ? 'Three or more' : unknown);
const clampTo = (x, r) => (Number.isFinite(x) ? Math.min(r[1], Math.max(r[0], x)) : null);
const money = (v) => (has(v) && Number.isFinite(num(v)) ? num(v) : NaN);
export function sippCouplesRow(bundle, a, b, couple) {
  const H = a.sex === 'Man' ? a : b;
  const W = a.sex === 'Man' ? b : a;
  const s = bundle.support;
  const inc = householdIncome(a, b, couple);
  const wr = RACE5.includes(W.raceEth) ? W.raceEth : null;
  const hr = RACE5.includes(H.raceEth) ? H.raceEth : null;
  return {
    wife_age: num(W.age),
    husband_age: num(H.age),
    marriage_years: ym(couple),
    wife_times_married: timesMarried(W, 'Unknown'),
    husband_times_married: timesMarried(H, 'Unknown'),
    wife_education: SIPP_EDU[W.degree] || null,
    husband_education: SIPP_EDU[H.degree] || null,
    wife_race_ethnicity: wr,
    same_race_ethnicity: wr && hr ? (wr === hr ? 'Same' : 'Different') : null,
    wife_nativity: nativity(W),
    husband_nativity: nativity(H),
    wife_earnings: clampTo(num(W.wages), s.wife_earnings),
    husband_earnings: clampTo(num(H.wages), s.husband_earnings),
    household_income: clampTo(inc, s.household_income),
    household_net_worth: clampTo(money(couple.netWorth), s.household_net_worth),
    household_debt: clampTo(money(couple.debt), s.household_debt),
    household_unsecured_debt: clampTo(money(couple.unsecuredDebt), s.household_unsecured_debt),
    children_under18_in_household: has(couple.childrenHome) && Number.isFinite(num(couple.childrenHome)) ? Math.min(5, num(couple.childrenHome)) : null,
    wife_months_employed: W.work === 'No work hours' ? 0 : null,
    husband_months_employed: H.work === 'No work hours' ? 0 : null,
    home_owner: yesNo(couple.homeOwner),
  };
}
const SIPP_COUPLES = {
  id: 'sipp_prospective_couples',
  kind: 'fixed',
  steps: () => [{ k: 0, start: 0, end: 1, label: 'next calendar year' }],
  horizons: () => [1],
  outcome: 'In this lens, the outcome is the wife reporting separation or divorce in the next calendar year, starting from a married couple living together; a 1-year chance only.',
  ageNote: 'Both spouses’ ages, schooling and earnings enter; none of it is evidence of an ideal partner.',
  searchText: 'Searches the partner’s age (±6 years) and highest degree, holding everything else fixed.',
  uses: 'both spouses’ ages, schooling, earlier marriages, race-ethnicity, birthplace, earnings and work, plus years married, household income, net worth, debt, home ownership and children at home',
  questions: ['status', 'raceEth', 'bornUS', 'marriagesBefore', 'netWorth', 'debt', 'unsecuredDebt', 'homeOwner', 'childrenHome'],
  rowLabels: () => ['The couple (the wife’s report, as in the survey)'],
  rows: (bundle, a, b, couple) => [sippCouplesRow(bundle, a, b, couple)],
  issues: () => [],
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The SIPP couples lens');
    if (out.length) return out;
    if (couple.status !== 'Married, living together') out.push('This lens starts from married couples living together (“Relationship now”), so it gives no number otherwise.');
    const r = sippCouplesRow(bundle, a, b, couple);
    const s = bundle.support;
    if (r.wife_age < s.wife_age[0] || r.wife_age > s.wife_age[1]) out.push(`The wife’s age (${r.wife_age}) is outside the ${s.wife_age[0]}–${s.wife_age[1]} in the linked sample.`);
    if (r.husband_age < s.husband_age[0] || r.husband_age > s.husband_age[1]) out.push(`The husband’s age (${r.husband_age}) is outside the ${s.husband_age[0]}–${s.husband_age[1]} in the linked sample.`);
    if (r.marriage_years > s.marriage_years[1]) out.push(`Years married (${r.marriage_years}) is beyond the ${s.marriage_years[1]} in the data.`);
    const miss = [];
    if (!r.wife_education || !r.husband_education) miss.push('both highest degrees');
    if (!r.wife_race_ethnicity || !r.same_race_ethnicity) miss.push('both race-ethnicities');
    if (!r.wife_nativity || !r.husband_nativity) miss.push('whether each of you was born in the U.S.');
    if (!r.home_owner) miss.push('whether you own your home');
    if (miss.length) out.push(`This lens needs ${miss.join(', ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    return out;
  },
  notes() {
    return ['Money is clamped to the range in the data, as the bundle says. Net worth and debts not entered, and months with a job for anyone who worked, are scored at the training medians. Earlier marriages are “Once” for a first marriage; for someone married before, the number of earlier marriages decides “Twice” or “Three or more” (otherwise unknown). In the bundle, adding wealth did not improve held-out prediction over demographics alone (gain −0.8 points, −2.8 to +0.9).'];
  },
  changes(who, person) {
    const out = [];
    const order = ['Less than high school', 'High school', 'Some college', 'Associate', 'Bachelor', 'Master'];
    const cur = order.indexOf(['PhD', 'Professional'].includes(person.degree) ? 'Master' : person.degree);
    for (const d of order.slice(Math.max(cur + 1, 0))) out.push({ label: `Complete a ${d.toLowerCase()} degree`, [who]: { degree: d } });
    return out;
  },
  coupleChanges(couple) {
    return couple.homeOwner === 'No' ? [{ label: 'Own your home', couple: { homeOwner: 'Yes' } }] : [];
  },
  partnerGrid(me, template) {
    const out = [];
    for (let gap = -6; gap <= 6; gap += 3) for (const degree of ['High school', 'Some college', 'Bachelor', 'Master']) out.push({ ...template, age: num(me.age) + gap, degree });
    return out;
  },
  describePartner: (p) => `age ${p.age}, ${String(p.degree).toLowerCase()}`,
  partnerKey: (p) => `${p.age}|${p.degree}`,
  partnerTraits: () => [
    { key: 'age', label: 'Age gap (partner minus you)', gap: true, values: [-6, -3, 0, 3, 6] },
    { key: 'degree', label: 'Highest degree', values: ['High school', 'Some college', 'Associate', 'Bachelor', 'Master'] },
    { key: 'wages', label: 'Earnings last year, $', values: [0, 15000, 30000, 50000, 80000, 120000] },
  ],
  referenceAt: 'now',
  referenceAttrs: (bundle, a, b, couple) => sippCouplesRow(bundle, a, b, couple),
  justMeReason: 'This lens has no partner distribution, so it cannot average over realistic partners. Enter a partner instead.',
};

// ======================================================================================
// ACS one-year divorce incidence (cross-sectional; each married partner's own report).
// ======================================================================================
const ACS_EDU = { 'Less than high school': 'Less than high school', 'High school': 'High school or GED', 'Some college': 'Some college', Associate: 'Associate', Bachelor: 'Bachelor', Master: 'Graduate or professional', PhD: 'Graduate or professional', Professional: 'Graduate or professional' };
export function acsRow(bundle, v, couple) {
  const { p } = v;
  return {
    age: num(p.age),
    marriage_years: ym(couple),
    sex: p.sex,
    times_married: timesMarried(p, null),
    education: ACS_EDU[p.degree] || null,
    race_ethnicity: RACE5.includes(p.raceEth) ? p.raceEth : null,
    nativity: nativity(p),
    state: STATES.includes(couple.state) ? couple.state : null,
  };
}
const ACS = {
  id: 'acs_one_year_divorce',
  kind: 'fixed',
  steps: () => [{ k: 0, start: 0, end: 1, label: 'a 12-month window' }],
  horizons: () => [1],
  outcome: 'CROSS-SECTIONAL: the share of married people like each of you who reported a divorce in the past 12 months, measured at one interview after any divorce. It is an incidence for people like you, not a forecast for your marriage.',
  ageNote: 'Only each person’s own traits enter; nothing here is evidence of an ideal partner.',
  searchText: 'The partner’s traits are not inputs here, so there is no partner search.',
  uses: 'each partner’s own age, sex, years since the wedding, number of marriages, highest degree, race-ethnicity, birthplace and U.S. state (measured at the interview, after any divorce)',
  questions: ['raceEth', 'bornUS', 'marriagesBefore', 'state'],
  views: (a, b, couple) => perspectives(a, b, couple, false),
  rowLabels: (a, b, couple) => perspectives(a, b, couple, false).map((v) => (v.who === 'a' ? 'People like you' : 'People like your partner')),
  rows: (bundle, a, b, couple) => perspectives(a, b, couple, false).map((v) => acsRow(bundle, v, couple)),
  issues(bundle, a, b, couple) {
    const s = bundle.support;
    return perspectives(a, b, couple, false).flatMap((v) => issueRange('age', num(v.p.age), s.age));
  },
  refuse(bundle, a, b, couple) {
    const out = basicRefusals(a, b, 'The ACS lens', { sameSexOk: true });
    if (out.length) return out;
    if (!married(couple)) out.push('This lens covers people married at some point in the past year; a couple who is not married has no marriage at risk in it.');
    for (const v of perspectives(a, b, couple, false)) {
      const r = acsRow(bundle, v, couple);
      const miss = [];
      if (!r.times_married) miss.push('how many times married (“Earlier marriages”)');
      if (!r.education) miss.push('highest degree');
      if (!r.race_ethnicity) miss.push('race-ethnicity');
      if (!r.nativity) miss.push('whether born in the U.S.');
      if (!r.state) miss.push('U.S. state');
      if (miss.length) out.push(`For ${v.who === 'a' ? 'you' : 'your partner'}, this lens needs ${miss.join(', ')}: the model has no “unknown” group for ${miss.length > 1 ? 'these' : 'it'}.`);
    }
    return [...new Set(out)];
  },
  notes(bundle) {
    return [`${bundle.timing} The income, employment and occupation models are not used for that reason.`];
  },
  changes: () => [],
  coupleChanges: () => [],
  partnerGrid: () => [],
  describePartner: (p) => `age ${p.age}`,
  partnerKey: (p) => `${p.age}`,
  partnerTraits: () => [],
  selfOnly: true,
  referenceAt: 'now',
  referenceAttrs: (bundle, a, b, couple) => {
    const v = perspectives(a, b, couple, false)[0];
    return v ? acsRow(bundle, v, couple) : {};
  },
  scoring: ['logistic_additive', 'poisson_additive', 'tree_depth5', 'gradient_boosting'],
  referenceModels: {
    logistic_additive_post: 'adds income, employment and occupation, measured after any divorce; not used',
    gradient_boosting_post: 'adds income, employment and occupation, measured after any divorce; not used',
  },
};

export const NEW_ADAPTERS = {
  prewedding_harmonized: PREWEDDING,
  sipp_first_marriage: SIPP_FM,
  sipp_prospective_couples: SIPP_COUPLES,
  acs_one_year_divorce: ACS,
  nlsy79_first_marriage: NLSY79_FM,
  nlsy97_first_marriage: NLSY97,
  nsfg_pooled_first_marriage: NSFG_POOLED,
  nsfg_pooled_both_sexes: NSFG_BOTH,
  canada_gss_first_marriage: CANADA,
  gss_panel_marriages: GSS,
  hcmst_couples: HCMST,
  newlywed_la_couples: NEWLYWED,
};

// Which form questions feed which lenses (shown next to each question group).
export const QUESTION_LENSES = Object.fromEntries(
  [...new Set(Object.values(NEW_ADAPTERS).flatMap((a) => a.questions || []))].map((q) => [q, Object.values(NEW_ADAPTERS).filter((a) => (a.questions || []).includes(q)).map((a) => a.id)]),
);
