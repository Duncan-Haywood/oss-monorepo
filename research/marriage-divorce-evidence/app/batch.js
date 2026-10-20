// Batch scoring: many couples from a CSV, or one person against many candidate partners.
// Everything runs in the browser; nothing is uploaded. Each lens is scored separately and
// reported per lens: lenses are never pooled. Pure functions (no DOM); tests/batch.test.mjs.
import { PERSON_SPEC, COUPLE_SPEC, refusals, project, lifelong, rankPartners, stepAt, lensHorizons, primaryHorizon, isRateLens } from './couple.js';
import { referenceFor, couplePercentile } from './population.js';

export const MAX_ROWS = 10000;
export const HORIZONS = [5, 10, 20];

// ---- CSV -------------------------------------------------------------------------------
// RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF.
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

// Quote when needed, and neutralise text a spreadsheet would run as a formula.
export function csvField(v) {
  let x = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(x) && !/^-?\d+(\.\d+)?$/.test(x)) x = "'" + x;
  return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
}
export const toCsv = (rows) => rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';

// ---- Schema ----------------------------------------------------------------------------
// Person columns (prefix a_ / b_ in the couples file; no prefix in the candidates file).
export const PERSON_COLUMNS = [
  ['sex', 'sex', 'Woman or Man (required)'],
  ['age', 'age', 'age today, 16–100 (required)'],
  ['school', 'school', 'years of schooling'],
  ['degree', 'degree', 'highest degree'],
  ['wages', 'wages', 'wages last year in dollars, 0–10,000,000'],
  ['work', 'work', 'work hours last year'],
  ['religion', 'religion', 'religious service attendance'],
  ['prior_marriage', 'priorMarriage', 'Yes or No: married before (blank = No)'],
  ['first_marriage_age', 'firstMarriageAge', 'age at first marriage, 13–80 (blank = this marriage)'],
  ['race_eth', 'raceEth', 'race-ethnicity (NSFG lenses need the wife’s)'],
  ['prior_children', 'priorChildren', 'Yes or No: children from an earlier relationship'],
  ['intact_family', 'intactFamily', 'Yes or No: lived with both parents from birth to 18'],
  // Inputs of the newer lenses (all optional; a lens that needs one and lacks it abstains).
  ['born_us', 'bornUS', 'Yes or No: born in the U.S. (SIPP, ACS)'],
  ['marriages_before', 'marriagesBefore', '1 or 2+: earlier marriages, if married before (ACS, SIPP couples)'],
  ['quality', 'quality', 'relationship quality (HCMST)'],
  ['hapmar', 'hapmar', 'marriage happiness (GSS)'],
  ['party', 'party', 'party preference (HCMST)'],
  ['parents_view', 'parentsView', 'parents’ view of the partner (HCMST)'],
  ['kids_before', 'kidsBefore', 'children born before the wedding: 0, 1, 2+ (NLSY, NSFG 1995–2023, Canada)'],
  ['prior_partners', 'priorPartners', 'earlier live-in partners: 0, 1, 2+ (NLSY97, Canada)'],
  ['enrolled', 'enrolled', 'Yes or No: in school or college at the wedding (NLSY)'],
  ['religion_raised', 'religionRaised', 'religion raised in (NLSY, NSFG 1995–2023)'],
  ['mother_edu', 'motherEdu', 'mother’s schooling (NSFG 1995–2023, NLSY79)'],
  ['mother_age_first_birth', 'motherAgeFirst', 'mother’s age at her first birth (NSFG 1995–2023)'],
  ['attend_detail', 'attendDetail', 'religious attendance in detail (NLSY, GSS)'],
  ['satisfaction', 'satSum', 'relationship satisfaction, the newlywed study’s 8-item sum 8–37'],
  ['hostility', 'hostSum', 'self-reported hostility, the newlywed study’s 14-item sum 0–42'],
  ['positivity', 'obsPos', 'how often warm or attentive in disagreements (approximation of observer codes)'],
  ['negativity', 'obsNeg', 'how often hostile or critical in disagreements (approximation)'],
  ['effective', 'obsEff', 'how often clear and constructive in disagreements (approximation)'],
  ['substance', 'substance', 'Yes or No: problem drinking or drug use, past 9 months (newlyweds)'],
  ['ace', 'ace', 'Yes or No: adverse childhood experiences (newlyweds)'],
  ['abuse', 'abuse', 'Yes or No: abuse or assault history (newlyweds)'],
  ['low_mood', 'lowMood', 'Yes or No: often sad, hopeless or nervous, last 30 days (newlyweds)'],
];
export const COUPLE_COLUMNS = [
  ['years_married', 'yearsMarried', 'completed years married, 0–60 (blank = 0)'],
  ['family_income', 'familyIncome', 'household income per year in dollars (blank = both wages)'],
  ['cohabited_first', 'cohabitedFirst', 'Yes or No: lived together before marrying'],
  ['status', 'status', 'relationship now (HCMST, GSS, SIPP couples)'],
  ['years_together', 'yearsTogether', 'years since the relationship began (HCMST)'],
  ['how_met', 'howMet', 'how you met (HCMST)'],
  ['children_home', 'childrenHome', 'children under 18 at home'],
  ['place', 'place', 'where you live (U.S. region or Canadian region)'],
  ['state', 'state', 'U.S. state, two-letter code (ACS; also sets the U.S. region)'],
  ['expecting', 'expecting', 'Yes or No: a baby expected at the wedding (NLSY97)'],
  ['cohab_months', 'cohabMonths', 'months lived together before the wedding (NLSY97)'],
  ['net_worth', 'netWorth', 'household net worth, $ (SIPP couples)'],
  ['debt', 'debt', 'household debt, $ (SIPP couples)'],
  ['unsecured_debt', 'unsecuredDebt', 'household unsecured debt, $ (SIPP couples)'],
  ['home_owner', 'homeOwner', 'Yes or No: own your home (SIPP couples)'],
];
const COUPLE_FIELDS = COUPLE_COLUMNS.map(([, f]) => f);
const REQUIRED = new Set(['sex', 'age']);

export const couplesHeader = () => ['id', ...['a', 'b'].flatMap((w) => PERSON_COLUMNS.map(([c]) => `${w}_${c}`)), ...COUPLE_COLUMNS.map(([c]) => c)];
export const candidatesHeader = () => ['name', ...PERSON_COLUMNS.map(([c]) => c)];

// Allowed values for documentation and the template.
export function allowedValues(field) {
  const spec = field in PERSON_SPEC ? PERSON_SPEC[field] : COUPLE_SPEC[field];
  if (field === 'priorMarriage') return 'Yes, No';
  if (Array.isArray(spec) && typeof spec[0] === 'number') return `number ${spec[0]}–${spec[1]}`;
  if (Array.isArray(spec)) return spec.join(' | ');
  return '';
}

const DASH = (v) => v.replace(/(\d)-(\d)/g, '$1–$2'); // "13-15 years" means "13–15 years"

// One cell -> a clean value, or { error }. Blank -> '' (unknown) unless required.
export function cleanCell(field, raw) {
  const v = String(raw ?? '').trim();
  if (v === '') return REQUIRED.has(field) ? { error: 'required' } : '';
  if (field === 'priorMarriage') return v === 'Yes' ? true : v === 'No' ? false : { error: 'must be Yes or No' };
  const spec = field in PERSON_SPEC ? PERSON_SPEC[field] : COUPLE_SPEC[field];
  if (Array.isArray(spec) && typeof spec[0] === 'number') {
    if (!/^-?\d+(\.\d+)?$/.test(v)) return { error: 'must be a number' };
    const x = Number(v);
    return x >= spec[0] && x <= spec[1] ? x : { error: `must be between ${spec[0]} and ${spec[1]}` };
  }
  if (Array.isArray(spec)) {
    if (spec.includes(v)) return v;
    if (spec.includes(DASH(v))) return DASH(v);
    return { error: `must be one of: ${spec.join(' | ')}` };
  }
  return { error: 'unknown column' };
}

// Fill the derived fields the way the form does (app.js readForm).
export function normalise(a, b, couple, currentYear = new Date().getUTCFullYear()) {
  const c = {
    ...Object.fromEntries(COUPLE_FIELDS.map((f) => [f, couple[f] === undefined ? '' : couple[f]])),
    yearsMarried: Number.isFinite(couple.yearsMarried) ? couple.yearsMarried : 0,
    familyIncome: couple.familyIncome === '' || couple.familyIncome === undefined ? '' : String(couple.familyIncome),
    cohabitedFirst: couple.cohabitedFirst || 'Unknown',
    currentYear,
  };
  const person = (p) => {
    const q = { ...p };
    q.age = Number(q.age);
    q.wages = q.wages === '' || q.wages === undefined ? NaN : Number(q.wages);
    q.priorMarriage = q.priorMarriage === true;
    if (q.firstMarriageAge === '' || q.firstMarriageAge === undefined || q.firstMarriageAge === null) q.firstMarriageAge = q.priorMarriage ? null : q.age - c.yearsMarried;
    for (const k of ['school', 'degree', 'work', 'religion', 'raceEth', 'priorChildren', 'intactFamily', 'sex']) if (q[k] === undefined) q[k] = '';
    return q;
  };
  return { a: person(a), b: b ? person(b) : null, couple: c };
}

function readRows(text, header, maxRows) {
  const rows = parseCsv(text);
  if (!rows.length) return { fatal: 'The file is empty.' };
  const head = rows[0].map((h) => h.trim());
  const unknown = head.filter((h) => h && !header.includes(h));
  const missing = header.filter((h) => !head.includes(h) && (REQUIRED.has(h.replace(/^[ab]_/, '')) || h === header[0]));
  if (unknown.length || missing.length) {
    return { fatal: [unknown.length ? `Unknown columns: ${unknown.join(', ')}.` : '', missing.length ? `Missing required columns: ${missing.join(', ')}.` : ''].filter(Boolean).join(' ') + ' Download the template for the exact header.' };
  }
  const data = rows.slice(1);
  if (data.length > maxRows) return { fatal: `The file has ${data.length.toLocaleString('en-US')} rows; the limit is ${maxRows.toLocaleString('en-US')}. Split it into smaller files.` };
  return { head, data };
}

// Couples CSV -> { couples: [{ line, id, a, b, couple }], errors: [{ line, column, value, message }], fatal? }
export function validateCouples(text, { maxRows = MAX_ROWS, currentYear } = {}) {
  const r = readRows(text, couplesHeader(), maxRows);
  if (r.fatal) return { couples: [], errors: [], fatal: r.fatal };
  const couples = [];
  const errors = [];
  const ids = new Set();
  r.data.forEach((cells, i) => {
    const line = i + 2;
    const get = (col) => cells[r.head.indexOf(col)] ?? '';
    if (cells.length > r.head.length && cells.slice(r.head.length).some((x) => x.trim() !== '')) errors.push({ line, column: '', value: '', message: 'more cells than header columns' });
    const id = get('id').trim() || String(line - 1);
    if (ids.has(id)) errors.push({ line, column: 'id', value: id, message: 'duplicate id' });
    ids.add(id);
    const people = { a: {}, b: {} };
    const couple = {};
    let bad = false;
    for (const w of ['a', 'b']) {
      for (const [col, field] of PERSON_COLUMNS) {
        const v = cleanCell(field, get(`${w}_${col}`));
        if (v && typeof v === 'object' && 'error' in v) { errors.push({ line, column: `${w}_${col}`, value: get(`${w}_${col}`), message: v.error }); bad = true; } else people[w][field] = v;
      }
    }
    for (const [col, field] of COUPLE_COLUMNS) {
      const v = cleanCell(field, get(col));
      if (v && typeof v === 'object' && 'error' in v) { errors.push({ line, column: col, value: get(col), message: v.error }); bad = true; } else couple[field] = v === '' ? '' : v;
    }
    if (bad || errors.some((e) => e.line === line)) return;
    const n = normalise(people.a, people.b, { ...couple, yearsMarried: couple.yearsMarried === '' ? 0 : couple.yearsMarried }, currentYear);
    couples.push({ line, id, ...n });
  });
  return { couples, errors };
}

// Candidates CSV -> { candidates: [person + name], errors, fatal? }
export function validateCandidates(text, { maxRows = 200 } = {}) {
  const r = readRows(text, candidatesHeader(), maxRows);
  if (r.fatal) return { candidates: [], errors: [], fatal: r.fatal };
  const candidates = [];
  const errors = [];
  r.data.forEach((cells, i) => {
    const line = i + 2;
    const get = (col) => cells[r.head.indexOf(col)] ?? '';
    const p = { name: get('name').trim().slice(0, 60) || `Candidate ${i + 1}` };
    let bad = false;
    for (const [col, field] of PERSON_COLUMNS) {
      const v = cleanCell(field, get(col));
      if (v && typeof v === 'object' && 'error' in v) { errors.push({ line, column: col, value: get(col), message: v.error }); bad = true; } else p[field] = v;
    }
    if (!bad) candidates.push(p);
  });
  return { candidates, errors };
}

// A template: the header, the allowed values, and two illustrative rows (not data).
export function couplesTemplate() {
  const rows = [couplesHeader()];
  const head = rows[0];
  const ex1 = {
    id: 'example-1', a_sex: 'Woman', a_age: 27, a_school: '16–17 years', a_degree: 'Bachelor', a_wages: 52000, a_work: '2,000+ hours', a_religion: 'Less than weekly', a_prior_marriage: 'No', a_race_eth: 'White', a_prior_children: 'No', a_intact_family: 'Yes',
    b_sex: 'Man', b_age: 29, b_school: '13–15 years', b_degree: 'Some college', b_wages: 48000, b_work: '2,000+ hours', b_religion: 'Never', b_prior_marriage: 'No', b_race_eth: 'White', b_prior_children: 'No', b_intact_family: 'Yes',
    years_married: 0, cohabited_first: 'Yes',
    a_born_us: 'Yes', b_born_us: 'Yes', a_quality: 'Excellent', b_quality: 'Good', a_hapmar: 'Very happy', b_hapmar: 'Very happy', a_party: 'Democrat', b_party: 'Independent, other or no preference', a_kids_before: '0', b_kids_before: '0', a_prior_partners: '0', b_prior_partners: '1', a_enrolled: 'No', b_enrolled: 'No',
    status: 'Married, living together', years_together: 3, how_met: 'Through friends', children_home: 0, place: 'U.S. — Midwest', state: 'OH', expecting: 'No', home_owner: 'No',
  };
  const ex2 = {
    id: 'example-2', a_sex: 'Man', a_age: 40, a_school: '16–17 years', a_degree: 'Bachelor', a_wages: 60000, a_work: '2,000+ hours', a_religion: 'Less than weekly', a_prior_marriage: 'No', a_first_marriage_age: 30,
    b_sex: 'Woman', b_age: 38, b_school: '16–17 years', b_degree: 'Bachelor', b_wages: 50000, b_work: '2,000+ hours', b_religion: 'Less than weekly', b_prior_marriage: 'No', b_first_marriage_age: 28, years_married: 5,
  };
  for (const ex of [ex1, ex2]) rows.push(head.map((h) => (h in ex ? ex[h] : '')));
  return toCsv(rows);
}
export function candidatesTemplate() {
  const head = candidatesHeader();
  const a = { name: 'Candidate A', sex: 'Man', age: 29, school: '13–15 years', degree: 'Some college', wages: 48000, work: '2,000+ hours', religion: 'Never', prior_marriage: 'No', race_eth: 'White', prior_children: 'No', intact_family: 'Yes', born_us: 'Yes', kids_before: '0', prior_partners: '0', enrolled: 'No' };
  const b = { name: 'Candidate B', sex: 'Man', age: 34, school: '18+ years', degree: 'Master', wages: 90000, work: '2,000+ hours', religion: 'Weekly or more', prior_marriage: 'Yes', first_marriage_age: 26, race_eth: 'Hispanic', prior_children: 'Yes', intact_family: 'Yes', marriages_before: '1' };
  return toCsv([head, ...[a, b].map((x) => head.map((h) => (h in x ? x[h] : '')))]);
}

// ---- Scoring ---------------------------------------------------------------------------
const pctLabel = (c) => (!c ? '' : c.below || c.above ? c.label : c.percentile.toFixed(1));

// The horizons a lens reports in a batch: the caller's (5/10/20 by default) for rate lenses,
// and only the lens's own follow-up ends otherwise (never extrapolated).
const horizonsFor = (bundle, horizons) => (isRateLens(bundle) ? horizons || HORIZONS : lensHorizons(bundle));

// One couple through one lens. status: ok | abstain | not_scorable.
export function scoreLens(lens, a, b, couple, { horizons = null, mortality = null } = {}) {
  const bundle = lens.bundle;
  const base = { lens: lens.summary.id, label: lens.summary.label };
  if (!lens.summary.scorable) return { ...base, status: 'not_scorable', reason: 'listed only: inputs not on the form, or a different outcome' };
  const why = refusals(bundle, a, b, couple);
  if (why.length) return { ...base, status: 'abstain', reason: why[0] };
  const hs = horizonsFor(bundle, horizons);
  const H = Math.max(...hs);
  const p = project(bundle, a, b, couple, H);
  const at = {};
  for (const h of hs) {
    const y = stepAt(p, h);
    if (!y) continue;
    const upto = p.filter((z) => z.elapsed <= h + 0.01);
    at[h] = { mean: y.meanSurvival, min: y.minSurvival, max: y.maxSurvival, inSupport: upto.every((z) => z.inSupport), outside: upto.filter((z) => !z.inSupport).length };
  }
  const out = { ...base, status: 'ok', horizons: Object.keys(at).map(Number), primary: primaryHorizon(bundle), at, extrapolatedYears: p.filter((y) => !y.inSupport).length };
  const ref = referenceFor(bundle);
  if (ref) {
    // The reference's own quantity (from the wedding, from today, or an annual rate now).
    const pc = couplePercentile(bundle, a, b, couple);
    if (pc) {
      out.percentile = pc;
      out.percentileOf = ref.quantity === 'annual_rate' ? 'annual rate now' : 'cumulative risk at this horizon';
    }
  } else out.percentileNote = 'no population reference for this lens';
  if (mortality) {
    const L = lifelong(bundle, mortality, a, b, couple, 40);
    if (L) out.lifelong = { widowhood: L.widowhood, divorce: L.divorce, stillMarried: L.stillMarried, lastYear: L.lastYear, extrapolated: L.extrapolated };
  }
  return out;
}

// Score many couples through every lens, in chunks so the page stays responsive.
// onProgress(done, total) is called after each chunk.
export async function scoreBatch(lenses, couples, { horizons = null, onProgress = () => {}, chunk = 25, yieldFn } = {}) {
  const out = [];
  const pause = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
  for (let i = 0; i < couples.length; i += chunk) {
    for (const c of couples.slice(i, i + chunk)) {
      out.push({ id: c.id, line: c.line, lenses: lenses.map((l) => scoreLens(l, c.a, c.b, c.couple, { horizons })) });
    }
    onProgress(Math.min(i + chunk, couples.length), couples.length);
    if (i + chunk < couples.length) await pause();
  }
  return out;
}

// Long format: one row per couple, lens and horizon. Never a pooled column.
// Each lens contributes its own horizons (5/10/20 years, or its follow-up ends such as 2 years
// for GSS); a lens that gives no number gets one row per default horizon with the reason.
export function resultsCsv(results, horizons = HORIZONS) {
  const rows = [['id', 'lens', 'horizon_years', 'no_divorce', 'model_min', 'model_max', 'population_percentile', 'percentile_of', 'status', 'abstain_reason', 'years_outside_data']];
  const f = (x) => (Number.isFinite(x) ? x.toFixed(4) : '');
  const hy = (h) => (Number.isInteger(h) ? h : h.toFixed(2));
  for (const r of results) {
    for (const l of r.lenses) {
      if (l.status !== 'ok') { for (const h of horizons) rows.push([r.id, l.lens, h, '', '', '', '', '', l.status, l.reason, '']); continue; }
      for (const h of l.horizons) {
        const a = l.at[h];
        const pc = l.percentile?.[h] || (l.percentileOf === 'annual rate now' ? l.percentile?.[0] : null);
        rows.push([r.id, l.lens, hy(h), f(a.mean), f(a.min), f(a.max), pc ? pctLabel(pc) : '', pc ? l.percentileOf : '', 'ok', '', a.outside]);
      }
    }
  }
  return toCsv(rows);
}

// ---- Me + many candidates --------------------------------------------------------------
// Rank candidate partners for `me`, separately in every scorable lens. Each lens's table is
// ranked by its own mean chance of no divorce at `horizons[1]` (10 years by default);
// `indistinguishable` marks candidates whose model range overlaps the top candidate's. A
// candidate the lens abstains on is listed last with the reason. Nobody is called ideal.
// Each lens ranks at its own primary horizon (10 years, or the longest it supports up to 10) and
// reports its own horizons.
export function rankCandidates(lenses, me, candidates, couple, { horizons = HORIZONS, mortality = null } = {}) {
  return lenses.filter((l) => l.summary.scorable).map((l) => {
    const bundle = l.bundle;
    const rankAt = primaryHorizon(bundle);
    const own = horizonsFor(bundle, horizons);
    const hs = [rankAt, ...own.filter((h) => h !== rankAt)];
    const r = rankPartners(bundle, me, couple, candidates, { horizons: hs, keepRefused: true, describe: (p) => p.name });
    const ref = referenceFor(bundle);
    for (const row of r.ranked) {
      if (ref) row.percentile = couplePercentile(bundle, me, row.partner, couple);
      if (mortality) {
        const L = lifelong(bundle, mortality, me, row.partner, couple, 40);
        if (L) row.lifelong = { widowhood: L.widowhood, divorce: L.divorce, stillMarried: L.stillMarried, lastYear: L.lastYear };
      }
    }
    return { lens: l.summary.id, label: l.summary.label, ranked: r.ranked, refused: r.refused, tied: r.tied, models: r.models, hasReference: !!ref, horizons: own, rankAt, percentileOf: ref ? (ref.quantity === 'annual_rate' ? 'annual rate now' : 'cumulative risk') : null };
  });
}

