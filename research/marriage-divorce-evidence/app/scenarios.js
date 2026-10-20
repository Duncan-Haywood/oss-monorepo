// "Compare scenarios": many full form states side by side, lens by lens. Pure functions only
// (the DOM is in scenarios-ui.js); tests/scenarios.test.mjs.
//
// A scenario is { id, name, fields, lit }: `fields` holds the form's own field names ('a.age',
// 'yearsMarried', 'b.hostTo3', ...) as cleaned strings, and `lit` the answers to the published-
// evidence questions. Scoring goes through summary.js `summariseLens` (couple.js adapters,
// refusals, typicality and population.js percentiles), so nothing here re-implements a model.
// Numbers are compared within one lens only; nothing is ever pooled across lenses.
//
// Privacy: hostility, abuse, substance use, low mood and childhood adversity (`isSensitive`)
// never go into a link, the CSV or this browser's storage. They go into an exported JSON file
// only when the user ticks "include sensitive answers".
import { PERSON_SPEC, COUPLE_SPEC, SENSITIVE, SAT_SCALE_KEYS, cleanValue, encodeScenario, decodeScenario, lensHorizons, primaryHorizon, fmtYears, scoringModels } from './couple.js';
import { HOSTILE_ITEMS, HOSTILE_SCALE, satisfactionSum, hostilitySum } from './lens-adapters.js';
import { encodeLiterature, decodeLiterature, LIT_SENSITIVE } from './literature-ui.js';
import { summariseLens, summariseAll } from './summary.js';
import { toCsv } from './batch.js';

export const MAX_SCENARIOS = 50;
export const MAX_VARY = 12; // copies one "vary one thing" click may make
export const FORMAT = 'divorce-odds-scenarios';
export const STORAGE_KEY = 'divorce-odds-scenarios-v1';
const NAME_MAX = 80;

// ---- The form, as data ------------------------------------------------------------------------
// The person and couple questions the newer lenses use (form names; app.js builds the inputs).
export const PERSON_NEW = ['bornUS', 'marriagesBefore', 'quality', 'hapmar', 'party', 'parentsView', 'kidsBefore', 'priorPartners', 'enrolled', 'religionRaised', 'attendDetail', 'motherEdu', 'motherAgeFirst', 'obsPos', 'obsNeg', 'obsEff', 'substance', 'ace', 'abuse', 'lowMood'];
export const COUPLE_NEW = ['status', 'yearsTogether', 'howMet', 'childrenHome', 'place', 'state', 'expecting', 'cohabMonths', 'netWorth', 'debt', 'unsecuredDebt', 'homeOwner'];
const HOST_KEYS = HOSTILE_ITEMS.flatMap((_, i) => [`hostTo${i + 1}`, `hostBy${i + 1}`]);
// Person-level answers that never leave the page unless the user asks (JSON file only).
export const SENSITIVE_KEYS = new Set([...SENSITIVE, ...HOST_KEYS]);
const DERIVED = new Set(['satSum', 'hostSum']); // computed from the items, never a form field

// The allowed values of one form field, or undefined when it is not a form field.
export function fieldSpec(name) {
  const m = /^([ab])\.([A-Za-z0-9]+)$/.exec(String(name));
  if (m) {
    const k = m[2];
    if (HOST_KEYS.includes(k)) return HOSTILE_SCALE;
    if (DERIVED.has(k)) return undefined;
    return Object.prototype.hasOwnProperty.call(PERSON_SPEC, k) ? PERSON_SPEC[k] : undefined;
  }
  return Object.prototype.hasOwnProperty.call(COUPLE_SPEC, name) ? COUPLE_SPEC[name] : undefined;
}
export function isSensitive(name) {
  const m = /^[ab]\.([A-Za-z0-9]+)$/.exec(String(name));
  return !!m && SENSITIVE_KEYS.has(m[1]);
}

// Clean a map of form fields. Blank answers are dropped (blank = not given; a missing checkbox is
// unticked). strict: unknown fields and disallowed values are errors (imports); otherwise they
// are dropped and listed (capturing the form, whose own `lens` select is not part of a scenario).
export function cleanFields(fields, { includeSensitive = true, strict = false } = {}) {
  const out = {};
  const errors = [];
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { fields: out, errors: ['fields must be an object'] };
  for (const [k, raw] of Object.entries(fields)) {
    if (!strict && k === 'lens') continue;
    const spec = fieldSpec(k);
    if (spec === undefined) { if (strict) errors.push(`unknown field “${k}”`); continue; }
    if (isSensitive(k) && !includeSensitive) continue;
    if (raw === '' || raw === null || raw === undefined || raw === false) continue;
    if (typeof raw === 'object') { errors.push(`“${k}” must be text or a number`); continue; }
    const c = cleanValue(spec, typeof raw === 'number' ? String(raw) : raw === true ? '1' : raw);
    if (c === undefined) { errors.push(`“${k}”: “${String(raw).slice(0, 40)}” is not an allowed value`); continue; }
    if (c === '' || (spec === 'bool' && c === '0')) continue;
    out[k] = c;
  }
  return { fields: out, errors };
}

// Literature answers through the link's own whitelist; strict lists what it dropped.
// Sensitive literature answers (LIT_SENSITIVE) are kept unless includeSensitive is false.
export function cleanLit(lit, { strict = false, includeSensitive = true } = {}) {
  if (lit === undefined || lit === null) return { lit: {}, errors: [] };
  if (typeof lit !== 'object' || Array.isArray(lit)) return { lit: {}, errors: ['literature must be an object'] };
  const o = { includeSensitive: true };
  const kept = decodeLiterature('#' + encodeLiterature(lit, o), o);
  if (!includeSensitive) for (const k of LIT_SENSITIVE) delete kept[k];
  const errors = strict ? Object.keys(lit).filter((k) => kept[k] === undefined || kept[k] !== String(lit[k])).map((k) => `literature answer “${k}”: not an allowed factor or value`) : [];
  return { lit: kept, errors };
}

// The form's fields (as app.js reads them, or a scenario's) -> the { a, b, couple, horizon }
// every adapter scores. The single place the form is turned into model inputs.
export function inputsFromFields(fields, { currentYear = new Date().getFullYear() } = {}) {
  const get = (k) => fields[k] ?? '';
  const person = (w) => {
    const p = {};
    for (const k of ['sex', 'age', 'school', 'degree', 'wages', 'work', 'religion', 'firstMarriageAge', 'raceEth', 'priorChildren', 'intactFamily', ...PERSON_NEW]) p[k] = get(`${w}.${k}`);
    p.age = Number(p.age);
    p.wages = p.wages === '' ? NaN : Number(p.wages);
    const pm = fields[`${w}.priorMarriage`];
    p.priorMarriage = pm === true || pm === 'on' || pm === '1';
    const s = satisfactionSum(SAT_SCALE_KEYS.map((k) => get(`${w}.${k}`)));
    p.satSum = s === null ? '' : s;
    const h = hostilitySum(HOSTILE_ITEMS.map((_, i) => get(`${w}.hostTo${i + 1}`)), HOSTILE_ITEMS.map((_, i) => get(`${w}.hostBy${i + 1}`)));
    p.hostSum = h === null ? '' : h;
    return p;
  };
  const couple = { yearsMarried: Number(get('yearsMarried') || 0), familyIncome: get('familyIncome'), cohabitedFirst: get('cohabitedFirst') || 'Unknown', currentYear };
  for (const k of COUPLE_NEW) couple[k] = get(k);
  const a = person('a');
  const b = person('b');
  // A first marriage started at (age - years married).
  for (const p of [a, b]) {
    if (p.firstMarriageAge === '' || p.firstMarriageAge === null) p.firstMarriageAge = p.priorMarriage ? null : p.age - couple.yearsMarried;
    else p.firstMarriageAge = Number(p.firstMarriageAge);
  }
  return { a, b, couple, horizon: Number(get('horizon') || 40) };
}

// ---- The list ------------------------------------------------------------------------------
export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
export function autoName(list) {
  const used = new Set(list.map((s) => s.name));
  for (let n = list.length + 1; ; n++) if (!used.has(`Scenario ${n}`)) return `Scenario ${n}`;
}
function uniqueName(list, name) {
  const used = new Set(list.map((s) => s.name));
  if (!used.has(name)) return name;
  for (let n = 2; ; n++) {
    const c = `${name.slice(0, NAME_MAX - 6)} (${n})`;
    if (!used.has(c)) return c;
  }
}
export function nextId(list) {
  const n = list.reduce((m, s) => Math.max(m, Number(String(s.id).replace(/^s/, '')) || 0), 0);
  return 's' + (n + 1);
}
export const capMessage = () => `You have ${MAX_SCENARIOS} scenarios, the most this page keeps. Delete some to add more.`;

// Every operation returns a new list (and never mutates the old one).
export function addScenario(list, { name = '', fields = {}, lit = {} } = {}, at = list.length) {
  if (list.length >= MAX_SCENARIOS) return { list, error: capMessage() };
  const s = { id: nextId(list), name: uniqueName(list, cleanName(name) || autoName(list)), fields: { ...fields }, lit: { ...lit } };
  const out = list.slice();
  out.splice(Math.max(0, Math.min(at, out.length)), 0, s);
  return { list: out, scenario: s };
}
export function duplicateScenario(list, id) {
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return { list, error: 'No such scenario.' };
  return addScenario(list, { name: `${list[i].name} (copy)`, fields: list[i].fields, lit: list[i].lit }, i + 1);
}
export function renameScenario(list, id, name) {
  const n = cleanName(name);
  return list.map((s) => (s.id === id ? { ...s, name: n ? uniqueName(list.filter((z) => z.id !== id), n) : s.name } : s));
}
export const deleteScenario = (list, id) => list.filter((s) => s.id !== id);
export function moveScenario(list, id, delta) {
  const i = list.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export const updateScenario = (list, id, { fields, lit }) => list.map((s) => (s.id === id ? { ...s, fields: { ...fields }, lit: { ...(lit || {}) } } : s));
export const baselineOf = (list, id) => list.find((s) => s.id === id) || list[0] || null;

// ---- Vary one thing ---------------------------------------------------------------------------
const AGES = ['18', '20', '22', '25', '28', '30', '35', '40'];
const WAGES = ['0', '25000', '50000', '75000', '100000', '150000'];
const both = (k, you, partner, extra = {}) => [{ key: `a.${k}`, label: you, ...extra }, { key: `b.${k}`, label: partner, ...extra }];
// Each entry varies one form field across its allowed values (or a preset grid for numbers).
// `fixed` marks age, timing and background: shown to understand the models, never as a change
// to make (the UI lists them apart and never words them as suggestions).
// Sensitive answers are never varied. `a.marriageAge` is the age at the wedding: it moves the
// partner's age today with years married held fixed.
export const VARY_FIELDS = [
  ...both('marriageAge', 'Your age at the wedding', 'Partner’s age at the wedding', { values: AGES, fixed: true }),
  { key: 'yearsMarried', label: 'Years married so far', values: ['0', '2', '5', '10', '20'], fixed: true },
  { key: 'cohabitedFirst', label: 'Lived together before marrying', values: ['Yes', 'No', ''], valueLabels: { '': 'Not sure' } },
  ...both('degree', 'Your highest degree', 'Partner’s highest degree'),
  ...both('school', 'Your years of schooling', 'Partner’s years of schooling'),
  ...both('quality', 'Your rating of the relationship', 'Partner’s rating of the relationship'),
  ...both('hapmar', 'Your marriage happiness', 'Partner’s marriage happiness'),
  ...both('religion', 'Your religious attendance', 'Partner’s religious attendance'),
  ...both('work', 'Your work hours', 'Partner’s work hours'),
  ...both('wages', 'Your wages', 'Partner’s wages', { values: WAGES }),
  ...both('priorMarriage', 'You married before', 'Partner married before', { values: ['1', ''], valueLabels: { 1: 'Yes', '': 'No' }, fixed: true }),
  ...both('priorChildren', 'Your children from before', 'Partner’s children from before', { fixed: true }),
  ...both('intactFamily', 'You grew up with both parents', 'Partner grew up with both parents', { fixed: true }),
  { key: 'status', label: 'Relationship now' },
  { key: 'howMet', label: 'How you met' },
  { key: 'expecting', label: 'A baby expected at the wedding' },
  { key: 'homeOwner', label: 'Own your home' },
];
export function varyValues(v) {
  if (v.values) return v.values;
  const spec = fieldSpec(v.key);
  return Array.isArray(spec) && typeof spec[0] !== 'number' ? spec.slice() : [];
}
const valueLabel = (v, x) => v.valueLabels?.[x] ?? (v.values === WAGES ? '$' + Number(x).toLocaleString('en-US') : x);
const currentOf = (v, fields) => {
  if (/marriageAge$/.test(v.key)) {
    const who = v.key[0];
    const age = Number(fields[`${who}.age`]);
    return Number.isFinite(age) && fields[`${who}.age`] !== undefined ? String(age - Number(fields.yearsMarried || 0)) : '';
  }
  return fields[v.key] ?? '';
};
function withValue(v, fields, x) {
  const f = { ...fields };
  if (/marriageAge$/.test(v.key)) {
    const who = v.key[0];
    const age = Number(x) + Number(fields.yearsMarried || 0);
    if (age > 100) return null;
    f[`${who}.age`] = String(age);
    if (f[`${who}.firstMarriageAge`] !== undefined && f[`${who}.priorMarriage`] !== '1') f[`${who}.firstMarriageAge`] = String(x);
    return f;
  }
  if (v.key === 'yearsMarried') {
    // Keep both ages at the wedding: years married and ages today move together.
    const d = Number(x) - Number(fields.yearsMarried || 0);
    for (const w of ['a', 'b']) {
      if (fields[`${w}.age`] === undefined) continue;
      const age = Number(fields[`${w}.age`]) + d;
      if (age < 16 || age > 100) return null;
      f[`${w}.age`] = String(age);
    }
  }
  if (x === '') delete f[v.key]; else f[v.key] = x;
  return f;
}
// Copies of `base` ({ name, fields, lit }) with one field changed to each other allowed value,
// capped by MAX_VARY and by the room left under MAX_SCENARIOS (`existing` scenarios already).
export function varyOne(base, key, { existing = 0, cap = MAX_VARY } = {}) {
  const v = VARY_FIELDS.find((z) => z.key === key);
  if (!v) return { scenarios: [], skipped: [], error: 'That field cannot be varied here.' };
  const room = Math.max(0, Math.min(cap, MAX_SCENARIOS - existing));
  const cur = currentOf(v, base.fields);
  const out = [];
  const skipped = [];
  for (const x of varyValues(v)) {
    if (x === cur) { skipped.push({ value: valueLabel(v, x), reason: 'as in the starting scenario' }); continue; }
    const f = withValue(v, base.fields, x);
    if (!f) { skipped.push({ value: valueLabel(v, x), reason: 'would put an age outside 16–100' }); continue; }
    if (out.length >= room) { skipped.push({ value: valueLabel(v, x), reason: room < cap ? `the ${MAX_SCENARIOS}-scenario limit` : `at most ${cap} copies at a time` }); continue; }
    out.push({ name: cleanName(`${base.name} · ${v.label}: ${valueLabel(v, x)}`), fields: cleanFields(f).fields, lit: { ...(base.lit || {}) }, varied: { key, value: x } });
  }
  return { scenarios: out, skipped, label: v.label };
}

// ---- Comparison (one lens at a time; never pooled) -----------------------------------------
// summaries[lensId][i] = summariseLens(lens, scenario i). Computed once and reused by the table,
// the charts and the CSV at any horizon.
export function summariseScenarios(lenses, scenarios, lensIds, { currentYear, cache = null } = {}) {
  const inputs = scenarios.map((s) => inputsFromFields(s.fields, { currentYear }));
  const out = {};
  for (const id of lensIds) {
    const lens = lenses.find((l) => l.summary.id === id);
    if (!lens) continue;
    out[id] = scenarios.map((s, i) => {
      const key = id + '|' + currentYear + '|' + JSON.stringify(s.fields);
      if (cache?.has(key)) return cache.get(key);
      const r = summariseLens(lens, inputs[i].a, inputs[i].b, inputs[i].couple);
      cache?.set(key, r);
      return r;
    });
  }
  return out;
}

// One scenario's cell for one lens at horizon h: the chance of a break-up (risk = 1 - chance of
// none) with the model range and each scoring model's own risk, or the reason there is none.
export function cellAt(summary, h) {
  if (!summary) return { status: 'missing', reason: 'not scored' };
  if (summary.status !== 'ok') return { status: summary.status, reason: summary.reason };
  const z = summary.horizons.find((x) => Math.abs(x.h - h) < 0.02);
  if (!z) return { status: 'no_horizon', reason: `this lens covers only ${summary.horizons.map((x) => fmtYears(x.h)).join(', ')} years` };
  const pcs = summary.percentiles;
  const annual = pcs?.quantity === 'annual_rate';
  const pc = pcs ? (annual ? pcs.at[0] : Object.entries(pcs.at).find(([k]) => Math.abs(Number(k) - h) < 0.02)?.[1]) : null;
  return {
    status: 'ok',
    h,
    risk: 1 - z.mean,
    riskMin: 1 - z.max,
    riskMax: 1 - z.min,
    perModel: Object.fromEntries(Object.entries(z.survival || {}).map(([k, s]) => [k, 1 - s])),
    // Posterior draws of the risk, when a lens publishes them (none does yet): plugs into probLower.
    draws: Array.isArray(z.draws) ? z.draws.map((s) => 1 - s) : null,
    inSupport: z.inSupport,
    outside: summary.fit.outside,
    ood: summary.fit.ood,
    oodAbstainAbove: summary.fit.abstainAbove,
    percentile: pc && Number.isFinite(pc.percentile) ? { ...pc, of: annual ? 'annual rate now' : `risk by ${fmtYears(h)} years` } : null,
  };
}

// The change from the baseline within ONE lens, judged PAIRED: each scoring model's own
// difference (option − current plan) at the horizon, so a model that scores both higher counts
// once, however much the models disagree on the level. Verdicts (MATTERS = 1 point):
//   agree    every model moves the same way and the smallest move is at least 1 point;
//   majority a strict majority move the same way and their median move is at least 1 point;
//   split    no strict majority on the direction ("models disagree on the direction");
//   tiny     every move is under 1 point, or the majority's median is ("too small to matter").
// Only split and tiny mean the models cannot tell the two apart. When a lens publishes posterior
// draws (cell.draws: risks per draw, aligned between options), probLower is the share of draws
// in which the option's risk is lower than the current plan's; null otherwise.
export const MATTERS = 0.01;
const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
export function pairedVerdict(ds, matters = MATTERS) {
  const eps = 1e-12;
  const n = ds.length;
  const up = ds.filter((d) => d > eps);
  const down = ds.filter((d) => d < -eps);
  const abs = ds.map(Math.abs);
  if (!n || abs.every((x) => x < matters)) return { verdict: 'tiny', direction: 0, k: 0, n, none: abs.every((x) => x < eps) };
  const side = up.length > down.length ? up : down;
  const direction = up.length > down.length ? 1 : -1;
  const k = side.length;
  if (k * 2 <= n) return { verdict: 'split', direction: 0, k, n, up: up.length, down: down.length };
  const mags = side.map(Math.abs);
  const range = [Math.min(...mags), Math.max(...mags)];
  if (k === n && range[0] >= matters) return { verdict: 'agree', direction, k, n, range };
  if (median(mags) >= matters) return { verdict: 'majority', direction, k, n, range, flat: n - up.length - down.length, against: direction > 0 ? down.length : up.length };
  return { verdict: 'tiny', direction: 0, k, n, mostlySmall: true };
}
export function probLowerFromDraws(cellDraws, baseDraws) {
  if (!Array.isArray(cellDraws) || !Array.isArray(baseDraws) || !cellDraws.length || cellDraws.length !== baseDraws.length) return null;
  return cellDraws.reduce((t, x, i) => t + (x < baseDraws[i] ? 1 : 0), 0) / cellDraws.length;
}
export function diffVsBaseline(cell, base) {
  if (!cell || !base || cell.status !== 'ok' || base.status !== 'ok') return null;
  const points = cell.risk - base.risk;
  const keys = Object.keys(cell.perModel).filter((k) => k in base.perModel);
  const eps = 1e-12;
  const ds = keys.map((k) => cell.perModel[k] - base.perModel[k]);
  const flat = ds.filter((d) => Math.abs(d) < eps).length;
  const v = pairedVerdict(ds);
  return {
    points,
    lo: ds.length ? Math.min(...ds) : points,
    hi: ds.length ? Math.max(...ds) : points,
    ratio: base.risk > 0 ? cell.risk / base.risk : null,
    ...v,
    perModel: Object.fromEntries(keys.map((k, i) => [k, ds[i]])),
    flat,
    models: keys.length,
    cannotTell: v.verdict === 'split' || v.verdict === 'tiny',
    probLower: probLowerFromDraws(cell.draws, base.draws),
  };
}

// The paired verdict in words (scenarios.js pairedVerdict).
export function verdictText(d) {
  const by = (rg) => `${(100 * rg[0]).toFixed(1)}–${(100 * rg[1]).toFixed(1)} points`;
  const way = d.direction > 0 ? 'higher' : 'lower';
  if (d.verdict === 'agree') return `Models agree: ${way} risk by ${by(d.range)} (${d.k} of ${d.n})`;
  if (d.verdict === 'majority') return `Most models agree (${d.k} of ${d.n}): ${way} risk by ${by(d.range)}${d.flat ? `; ${d.flat} do${d.flat === 1 ? 'es' : ''} not move` : ''}${d.against ? `; ${d.against} move${d.against === 1 ? 's' : ''} the other way` : ''}`;
  if (d.verdict === 'split') return `Cannot tell apart: models disagree on the direction (${d.up} higher, ${d.down} lower, of ${d.n})`;
  if (d.none) return `No difference: none of the ${d.n} models move`;
  return `Cannot tell apart: too small to matter (under 1 point${d.mostlySmall ? ' for most models' : ''})`;
}
// The table for one lens at one horizon: one row per scenario, each with its diff vs baseline.
export function lensComparison(lens, summaries, scenarios, { horizon, baselineId } = {}) {
  const h = horizon ?? primaryHorizon(lens.bundle);
  const bi = Math.max(0, scenarios.findIndex((s) => s.id === baselineId));
  const cells = scenarios.map((s, i) => cellAt(summaries[i], h));
  const base = cells[bi];
  return {
    id: lens.summary.id,
    label: lens.summary.label,
    outcome: summaries.find((x) => x?.outcome)?.outcome || lens.summary.target,
    horizon: h,
    models: scoringModels(lens.bundle).length,
    baselineIndex: bi,
    rows: scenarios.map((s, i) => ({ id: s.id, name: s.name, baseline: i === bi, ...cells[i], diff: i === bi ? null : diffVsBaseline(cells[i], base) })),
  };
}

// The lenses to show first: the most relevant for the baseline scenario (summary.js relevance,
// which only orders lenses), then any other scorable lens to fill up to n.
export function defaultLenses(lenses, scenario, { currentYear, n = 3 } = {}) {
  if (!scenario) return lenses.filter((l) => l.summary.scorable).slice(0, n).map((l) => l.summary.id);
  const { a, b, couple } = inputsFromFields(scenario.fields, { currentYear });
  const ranked = summariseAll(lenses, a, b, couple).synthesis.ranked.map((r) => r.id);
  const rest = lenses.filter((l) => l.summary.scorable && !ranked.includes(l.summary.id)).map((l) => l.summary.id);
  return [...ranked, ...rest].slice(0, n);
}
export const horizonsOf = (lens) => lensHorizons(lens.bundle);

// ---- CSV: one row per scenario, lens and horizon ---------------------------------------------
// No input answers are written (only the scenario's name), so nothing sensitive can leak.
export const CSV_HEADER = ['scenario', 'is_baseline', 'lens', 'horizon_years', 'status', 'breakup_chance', 'model_min', 'model_max', 'population_percentile', 'percentile_of', 'outside_data_steps', 'typicality_percentile', 'abstain_reason', 'diff_points_vs_baseline', 'diff_min_points', 'diff_max_points', 'ratio_vs_baseline', 'verdict', 'models_same_direction', 'models', 'prob_lower'];
export function comparisonCsv(lenses, scenarios, summaries, { baselineId, lensIds = Object.keys(summaries) } = {}) {
  const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : '');
  const rows = [CSV_HEADER];
  for (const id of lensIds) {
    const lens = lenses.find((l) => l.summary.id === id);
    if (!lens || !summaries[id]) continue;
    for (const h of horizonsOf(lens)) {
      const c = lensComparison(lens, summaries[id], scenarios, { horizon: h, baselineId });
      for (const r of c.rows) {
        const hy = Number.isInteger(h) ? h : h.toFixed(2);
        if (r.status !== 'ok') { rows.push([r.name, r.baseline ? 'yes' : 'no', id, hy, r.status === 'not_scorable' ? 'not_scorable' : 'abstain', '', '', '', '', '', '', '', r.reason, '', '', '', '', '', '', '']); continue; }
        const pc = r.percentile;
        rows.push([r.name, r.baseline ? 'yes' : 'no', id, hy, 'ok', f(r.risk), f(r.riskMin), f(r.riskMax), pc ? (pc.below || pc.above ? pc.label : pc.percentile.toFixed(1)) : '', pc ? pc.of : '', r.outside, f(r.ood, 1), '',
          r.diff ? f(r.diff.points * 100, 2) : '', r.diff ? f(r.diff.lo * 100, 2) : '', r.diff ? f(r.diff.hi * 100, 2) : '', r.diff && Number.isFinite(r.diff.ratio) ? f(r.diff.ratio, 3) : '', r.diff ? r.diff.verdict : '', r.diff ? r.diff.k : '', r.diff ? r.diff.models : '', r.diff && r.diff.probLower !== null ? f(r.diff.probLower, 3) : '']);
      }
    }
  }
  return toCsv(rows);
}

// ---- JSON files and this browser's storage ---------------------------------------------------
export function exportJson(scenarios, baselineId, { includeSensitive = false, selection = null } = {}) {
  const bi = scenarios.findIndex((s) => s.id === baselineId);
  const doc = {
    format: FORMAT,
    version: 1,
    includes_sensitive_answers: !!includeSensitive,
    baseline: bi < 0 ? 0 : bi,
    scenarios: scenarios.map((s) => ({ name: s.name, fields: cleanFields(s.fields, { includeSensitive }).fields, literature: cleanLit(s.lit, { includeSensitive }).lit })),
  };
  if (selection) doc.selection = selection;
  return doc;
}
const TOP_KEYS = new Set(['format', 'version', 'includes_sensitive_answers', 'baseline', 'scenarios', 'selection']);
const SC_KEYS = new Set(['name', 'fields', 'literature']);

// Validate a scenarios file. Any unknown key, field or value rejects the whole file (`fatal`
// with the list): nothing half-imported. `room` caps how many are taken; the rest are counted.
export function importJson(input, { room = MAX_SCENARIOS } = {}) {
  let doc = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { return { fatal: 'This is not a JSON file.', errors: [] }; }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { fatal: 'Expected a scenarios file (a JSON object).', errors: [] };
  const errors = [];
  for (const k of Object.keys(doc)) if (!TOP_KEYS.has(k)) errors.push(`unknown key “${k}”`);
  if (doc.format !== FORMAT) errors.push(`“format” must be “${FORMAT}”`);
  if (doc.version !== 1) errors.push('“version” must be 1');
  if (!Array.isArray(doc.scenarios)) return { fatal: 'The file has no “scenarios” list.', errors };
  const out = [];
  doc.scenarios.forEach((s, i) => {
    const at = `scenario ${i + 1}`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`${at}: not an object`); return; }
    for (const k of Object.keys(s)) if (!SC_KEYS.has(k)) errors.push(`${at}: unknown key “${k}”`);
    if (s.name !== undefined && typeof s.name !== 'string') errors.push(`${at}: “name” must be text`);
    const f = cleanFields(s.fields ?? {}, { strict: true });
    const l = cleanLit(s.literature, { strict: true });
    for (const e of [...f.errors, ...l.errors]) errors.push(`${at}: ${e}`);
    out.push({ name: cleanName(s.name), fields: f.fields, lit: l.lit });
  });
  const b = doc.baseline;
  if (b !== undefined && !(Number.isInteger(b) && b >= 0 && b < Math.max(1, out.length))) errors.push('“baseline” must be the index of a scenario');
  const selection = cleanSelection(doc.selection, errors);
  if (errors.length) return { fatal: `The file was not imported: ${errors.length} problem${errors.length > 1 ? 's' : ''}.`, errors: errors.slice(0, 25) };
  const take = Math.max(0, room);
  return { scenarios: out.slice(0, take), dropped: Math.max(0, out.length - take), baseline: Number.isInteger(b) && b < take ? b : 0, selection, errors: [] };
}
function cleanSelection(sel, errors) {
  if (sel === undefined || sel === null) return null;
  const ok = sel && typeof sel === 'object' && !Array.isArray(sel) && Array.isArray(sel.lenses) && sel.lenses.every((x) => typeof x === 'string' && /^[a-z0-9_]{1,64}$/.test(x))
    && (sel.horizons === undefined || (sel.horizons && typeof sel.horizons === 'object' && !Array.isArray(sel.horizons) && Object.entries(sel.horizons).every(([k, v]) => /^[a-z0-9_]{1,64}$/.test(k) && Number.isFinite(v) && v > 0 && v <= 60)))
    && Object.keys(sel).every((k) => k === 'lenses' || k === 'horizons');
  if (!ok) { errors.push('“selection” is not a list of lens ids with horizons'); return null; }
  return { lenses: sel.lenses.slice(0, 30), horizons: { ...(sel.horizons || {}) } };
}

// ---- Share link: the # fragment, through the existing link whitelist only -------------------
// '#view=scenarios&sc=<first scenario>&sc=<changes from the first>&…&scb=<baseline index>'. Each
// `sc` is itself a query string: n=name, then encodeScenario's fields and the lit.* answers. To
// keep links short, every scenario after the first lists only what differs from the first (an
// empty value means "not given"). Decoding runs each scenario through decodeScenario and
// decodeLiterature, so a crafted link can set nothing the single-scenario link cannot.
const linkParams = (s) => {
  const fields = { ...s.fields };
  delete fields.lens;
  return new Map([...new URLSearchParams(encodeScenario(fields).slice(1)), ...new URLSearchParams(encodeLiterature(s.lit || {}))]);
};
export function encodeScenarioLink(scenarios, baselineId) {
  const q = new URLSearchParams();
  q.set('view', 'scenarios');
  const kept = scenarios.slice(0, MAX_SCENARIOS);
  const first = kept.length ? linkParams(kept[0]) : new Map();
  kept.forEach((s, i) => {
    const own = linkParams(s);
    const v = new URLSearchParams([['n', s.name]]);
    if (i === 0) for (const [k, x] of own) v.append(k, x);
    else {
      for (const [k, x] of own) if (first.get(k) !== x) v.append(k, x);
      for (const k of first.keys()) if (!own.has(k)) v.append(k, '');
    }
    q.append('sc', v.toString());
  });
  const bi = kept.findIndex((s) => s.id === baselineId);
  if (bi > 0) q.set('scb', String(bi));
  return '#' + q.toString();
}
export function decodeScenarioLink(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const list = q.getAll('sc');
  if (!list.length) return null;
  const params = (v) => [...new URLSearchParams(v)].filter(([k]) => k !== 'n');
  const first = new Map(params(list[0]));
  const scenarios = list.slice(0, MAX_SCENARIOS).map((v, i) => {
    const m = new Map(first);
    if (i > 0) for (const [k, x] of params(v)) { if (x === '') m.delete(k); else m.set(k, x); }
    const merged = '#' + new URLSearchParams([...m]).toString();
    const fields = decodeScenario(merged);
    delete fields.lens;
    return { name: cleanName(new URLSearchParams(v).get('n')), fields: cleanFields(fields, { includeSensitive: false }).fields, lit: decodeLiterature(merged) };
  });
  const b = Number(q.get('scb'));
  return { scenarios, baseline: Number.isInteger(b) && b >= 0 && b < scenarios.length ? b : 0, dropped: Math.max(0, list.length - MAX_SCENARIOS) };
}
