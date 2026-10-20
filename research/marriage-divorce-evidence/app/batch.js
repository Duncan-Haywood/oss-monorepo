// Batch scoring: many couples from a CSV, or one person against many candidate partners.
// Everything runs in the browser; nothing is uploaded. Each lens is scored separately and
// reported per lens: lenses are never pooled. Pure functions (no DOM); tests/batch.test.mjs.
import { PERSON_SPEC, COUPLE_SPEC, refusals, project, lifelong, rankPartners } from './couple.js';
import { referenceFor, percentileFromSurvival, referenceAttrs, atWedding } from './population.js';

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
];
export const COUPLE_COLUMNS = [
  ['years_married', 'yearsMarried', 'completed years married, 0–60 (blank = 0)'],
  ['family_income', 'familyIncome', 'household income per year in dollars (blank = both wages)'],
  ['cohabited_first', 'cohabitedFirst', 'Yes or No: lived together before marrying'],
];
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
  rows.push(['example-1', 'Woman', 27, '16–17 years', 'Bachelor', 52000, '2,000+ hours', 'Less than weekly', 'No', '', 'White', 'No', 'Yes',
    'Man', 29, '13–15 years', 'Some college', 48000, '2,000+ hours', 'Never', 'No', '', 'White', 'No', 'Yes', 0, '', 'Yes']);
  rows.push(['example-2', 'Man', 40, '16–17 years', 'Bachelor', 60000, '2,000+ hours', 'Less than weekly', 'No', 30, '', '', '',
    'Woman', 38, '16–17 years', 'Bachelor', 50000, '2,000+ hours', 'Less than weekly', 'No', 28, '', '', '', 5, '', '']);
  return toCsv(rows);
}
export function candidatesTemplate() {
  return toCsv([candidatesHeader(),
    ['Candidate A', 'Man', 29, '13–15 years', 'Some college', 48000, '2,000+ hours', 'Never', 'No', '', 'White', 'No', 'Yes'],
    ['Candidate B', 'Man', 34, '18+ years', 'Master', 90000, '2,000+ hours', 'Weekly or more', 'Yes', 26, 'Hispanic', 'Yes', 'Yes']]);
}

// ---- Scoring ---------------------------------------------------------------------------
const pctLabel = (c) => (!c ? '' : c.below || c.above ? c.label : c.percentile.toFixed(1));

// One couple through one lens. status: ok | abstain | not_scorable.
export function scoreLens(lens, a, b, couple, { horizons = HORIZONS, mortality = null } = {}) {
  const bundle = lens.bundle;
  const base = { lens: lens.summary.id, label: lens.summary.label };
  if (!lens.summary.scorable) return { ...base, status: 'not_scorable', reason: 'listed only: inputs not on the form, or a different outcome' };
  const why = refusals(bundle, a, b, couple);
  if (why.length) return { ...base, status: 'abstain', reason: why[0] };
  const H = Math.max(...horizons);
  const p = project(bundle, a, b, couple, H);
  const at = Object.fromEntries(horizons.map((h) => [h, { mean: p[h - 1].meanSurvival, min: p[h - 1].minSurvival, max: p[h - 1].maxSurvival, inSupport: p.slice(0, h).every((y) => y.inSupport), outside: p.slice(0, h).filter((y) => !y.inSupport).length }]));
  const out = { ...base, status: 'ok', at, extrapolatedYears: p.filter((y) => !y.inSupport).length };
  const ref = referenceFor(bundle);
  if (ref) {
    // Compare risk from the wedding with the surveyed marriages (reuse the projection when
    // the couple is marrying now).
    const w = atWedding(a, b, couple);
    const wp = w.a === a ? p : (refusals(bundle, w.a, w.b, w.couple).length ? null : project(bundle, w.a, w.b, w.couple, Math.max(...ref.horizons)));
    if (wp) {
      const surv = Object.fromEntries(ref.horizons.filter((h) => h <= wp.length).map((h) => [h, wp[h - 1].meanSurvival]));
      const cmp = percentileFromSurvival(bundle, referenceAttrs(bundle, w.a, w.b, w.couple), surv);
      out.percentile = Object.fromEntries(cmp.horizons.map((r) => [r.horizon, r.overall]));
      out.comparison = cmp;
    }
  } else out.percentileNote = 'no population reference for this lens';
  if (mortality) {
    const L = lifelong(bundle, mortality, a, b, couple, 40);
    out.lifelong = { widowhood: L.widowhood, divorce: L.divorce, stillMarried: L.stillMarried, lastYear: L.lastYear, extrapolated: L.extrapolated };
  }
  return out;
}

// Score many couples through every lens, in chunks so the page stays responsive.
// onProgress(done, total) is called after each chunk.
export async function scoreBatch(lenses, couples, { horizons = HORIZONS, onProgress = () => {}, chunk = 25, yieldFn } = {}) {
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
export function resultsCsv(results, horizons = HORIZONS) {
  const rows = [['id', 'lens', 'horizon_years', 'no_divorce', 'model_min', 'model_max', 'population_percentile', 'status', 'abstain_reason', 'years_outside_data']];
  const f = (x) => (Number.isFinite(x) ? x.toFixed(4) : '');
  for (const r of results) {
    for (const l of r.lenses) {
      for (const h of horizons) {
        if (l.status !== 'ok') { rows.push([r.id, l.lens, h, '', '', '', '', l.status, l.reason, '']); continue; }
        const a = l.at[h];
        rows.push([r.id, l.lens, h, f(a.mean), f(a.min), f(a.max), l.percentile?.[h] ? pctLabel(l.percentile[h]) : '', 'ok', '', a.outside]);
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
export function rankCandidates(lenses, me, candidates, couple, { horizons = HORIZONS, rankAt = 10, mortality = null } = {}) {
  const hs = [rankAt, ...horizons.filter((h) => h !== rankAt)];
  return lenses.filter((l) => l.summary.scorable).map((l) => {
    const bundle = l.bundle;
    const r = rankPartners(bundle, me, couple, candidates, { horizons: hs, keepRefused: true, describe: (p) => p.name });
    const ref = referenceFor(bundle);
    for (const row of r.ranked) {
      if (ref) {
        const w = atWedding(me, row.partner, couple);
        const wp = (couple.yearsMarried || 0) === 0 ? null : project(bundle, w.a, w.b, w.couple, Math.max(...ref.horizons));
        const surv = Object.fromEntries(ref.horizons.map((h) => [h, wp ? wp[h - 1].meanSurvival : row.at[h]?.meanSurvival]).filter(([, v]) => Number.isFinite(v)));
        const cmp = percentileFromSurvival(bundle, referenceAttrs(bundle, w.a, w.b, w.couple), surv);
        row.percentile = Object.fromEntries(cmp.horizons.map((z) => [z.horizon, z.overall]));
      }
      if (mortality) {
        const L = lifelong(bundle, mortality, me, row.partner, couple, 40);
        row.lifelong = { widowhood: L.widowhood, divorce: L.divorce, stillMarried: L.stillMarried, lastYear: L.lastYear };
      }
    }
    return { lens: l.summary.id, label: l.summary.label, ranked: r.ranked, refused: r.refused, tied: r.tied, models: r.models, hasReference: !!ref };
  });
}

