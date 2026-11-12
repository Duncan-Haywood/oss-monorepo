// The watch's logic with no file, network or process access, so the page, the CLI (watch.mjs) and
// the agent tool (platform/agents/tools.mjs, which exposes what the page imports) share one copy.
// watch.mjs adds the state file, the CSV URL, the webhook and the exit code around it.

import { analyze, parseSeries, peaks } from './engine.mjs';

// Defaults chosen on synthetic streams only (eval/watch-replay.mjs, eval/watch-replay.out.txt), then
// scored once on the TCPD series without changing them (same file, "TCPD replay").
// Pre-registered rule: of the candidates finding at least 90% of 2-sd steps, the fewest false alerts on three null
// streams. Chosen: the Bayesian detections with 5 points of confirmation (0 per 1,000 checks on independent noise,
// 7.5 on AR(1) 0.5, 2.5 on t3; PELT's level model 2.5 / 49.75 / 12.75). On TCPD: 193 alerts against PELT's 626.
// Round 3 (eval/watch-replay-round3.out.txt, rule pre-registered in eval/watch-replay.mjs) replaced the detector with
// the AR(1) Bayesian pass, probability summed over 5 neighbours: mean null false alerts 2.38 per 1,000 against 10.56
// (AR(1) 0.8: 1.5 against 32.25), 38 steps found against 35. The AR(1) term is for the level model only, so with
// --model poisson or meanvar the default stays 'bocpd'.
// Round 4 (eval/watch-replay-round4.out.txt, rule pre-registered in eval/watch-rho.mjs) capped the AR(1) pass's rho at 0.8:
// 15 of the 17 marked TCPD changes the AR(1) pass lost were at the 0.95 clip (eval/watch-rho-why.out.txt). With the cap,
// 33 of 52 marked changes against 29, 41% of alerts at a mark against 38%, synthetic nulls and steps unchanged; the cost
// is noise that really is that sticky (AR(1) 0.95: 3.0 false alerts per 1,000 checks against 1.25).
// Round 5 (eval/watch-flicker.out.txt, rule pre-registered in eval/watch-flicker.mjs) holds changes dated inside the history
// the first check called quiet instead of alerting them: TCPD 115 alerts to 106 with the same 33 of 52 marked changes and
// 42% at a mark against 41%; synthetic cells unchanged; on the 7 held-out TCPD series 68 to 61 alerts, the same 9 of 12.
// persist 2 (wait for a second check) failed round 5 by one marked TCPD change, which round 7 (eval/watch-persist-censor.mjs,
// rule pre-registered there) traced to the replay ending: the change was first seen at the series' last point. Scored
// with end-pending changes apart, it passed on fresh synthetic seeds and on TCPD (103 alerts against 105, the same 32 of
// 51 marks) and the held-out 7 (59 against 61, the same 9 of 12), so it is the default from round 7; --persist 1 turns
// it off. It costs one check of delay on every alert.
export const WATCH_DEFAULTS = { confirm: 5, tolerance: 5, window: 1000, detector: 'bocpd-ar1-window', model: 'mean', rhoCap: 0.8, holdHistory: true, persist: 2 };
/** The default detector for a model: the AR(1) pass for the level model, the plain Bayesian pass otherwise. */
export const defaultDetector = (model = 'mean') => (model === 'mean' ? WATCH_DEFAULTS.detector : 'bocpd');

const STATE_VERSION = 1;
export const DETECTORS = ['bocpd', 'bocpd-window', 'bocpd-ar1', 'bocpd-ar1-window', 'pelt'];

export function emptyState() {
  return { version: STATE_VERSION, alerted: [], n: 0, lastLabel: null };
}

/**
 * The changes the chosen detector finds in the newest `window` points. Indexes are absolute
 * (0-based in the full series). opts: detector 'pelt' | 'bocpd', model, penalty, period, log, ...
 */
export function detectChanges(values, labels, opts = {}) {
  const d = opts.detector ?? defaultDetector(opts.model ?? 'mean');
  if (d.startsWith('bocpd-ar1') && (opts.model ?? 'mean') !== 'mean') throw new Error(`--detector ${d} is for the level model (--model mean) only.`);
  const all = detectBoth(values, labels, { ...opts, detector: d });
  if (!all[d]) throw new Error(`Unknown detector ${d}.`);
  return all[d];
}

/** Both detectors' changes from one engine run: { pelt, bocpd }. */
export function detectBoth(values, labels, opts = {}) {
  const o = { ...WATCH_DEFAULTS, ...opts };
  const off = Math.max(0, values.length - o.window);
  const v = values.slice(off), l = labels.slice(off);
  const { confirm, tolerance, window, detector, alertHistory, ar1Detectors, rhoCap, holdHistory, persist, ...engine } = o;
  // With an AR(1) detector chosen and the plain lists not asked for, the plain engine run is skipped (half the time per check).
  const ar1Only = String(detector).startsWith('bocpd-ar1') && !o.ar1Detectors && (engine.model ?? 'mean') === 'mean';
  const map = (c) => ({
    index: c.index + off,
    label: c.label,
    ...(c.meanBefore !== undefined ? { meanBefore: c.meanBefore, meanAfter: c.meanAfter, shift: c.shift } : {}),
    ...(c.shiftInNoiseSd !== undefined ? { shiftInNoiseSd: c.shiftInNoiseSd } : {}),
    ...(c.sdBefore !== undefined ? { sdBefore: c.sdBefore, sdAfter: c.sdAfter } : {}),
    ...(c.probability !== undefined ? { probability: c.probability } : {}),
  });
  let out = {};
  if (!ar1Only) { const r = analyze({ ...engine, values: v, labels: l }); out = { pelt: r.pelt.changepoints.map(map), ...bayesLists(r, map, '') }; }
  // 'bocpd-ar1' / 'bocpd-ar1-window': the same Bayesian pass with the engine's AR(1) term (--ar1: rho from the
  // window, the conditional AR(1) likelihood in bocpd), for sticky noise. A second engine run, so only on request.
  if ((o.ar1Detectors || String(detector).startsWith('bocpd-ar1')) && (engine.model ?? 'mean') === 'mean') {
    Object.assign(out, bayesLists(analyze({ ...engine, values: v, labels: l, ar1: true, ...(rhoCap != null ? { ar1RhoCap: rhoCap } : {}) }), map, '-ar1'));
  }
  return out;
}

// The Bayesian detections of one engine run, with the levels on each side, as { bocpd<suffix>, bocpd<suffix>-window }.
function bayesLists(r, map, suffix) {
  const sd = r.noiseSd;
  const mean = (a, b) => { let t = 0; for (let i = a; i < b; i++) t += r.values[i]; return t / Math.max(1, b - a); };
  // A Bayesian detection carries only a probability; give it the levels on each side (from the previous
  // detection, or the window's start, to the next one or the end) so a message can say what moved.
  const withLevels = (list) => list.map((c, i) => {
    const a = i ? list[i - 1].index : 0, b = i + 1 < list.length ? list[i + 1].index : r.values.length;
    const meanBefore = mean(a, c.index), meanAfter = mean(c.index, b), shift = meanAfter - meanBefore;
    return { ...map(c), meanBefore, meanAfter, shift, ...(sd > 0 ? { shiftInNoiseSd: shift / sd } : {}) };
  });
  // The '-window' variant: the Bayesian probability summed over 5 neighbouring points, because on a clear step the
  // probability is often split between neighbours (a 3-sd step at 0.15, 0.03, 0.17, 0.36: no single point at 0.5).
  const cp = r.bocpd.changeProb, H = 2;
  const m = cp.map((_, i) => { let t = 0; for (let j = Math.max(0, i - H); j <= Math.min(cp.length - 1, i + H); j++) t += cp[j]; return Math.min(1, t); });
  const wdet = peaks(m, r.bocpd.threshold, 2 * H + 1).map((i) => {
    let best = i;
    for (let j = Math.max(1, i - H); j <= Math.min(cp.length - 1, i + H); j++) if (cp[j] > cp[best]) best = j;
    return { index: best, label: r.labels[best], probability: Math.round(m[i] * 1000) / 1000 };
  });
  return { [`bocpd${suffix}`]: withLevels(r.bocpd.detections), [`bocpd${suffix}-window`]: withLevels(wdet) };
}

// Where a previously alerted change sits in today's series: by its label when labels are unique
// (a rolling file that drops old rows keeps its dates), else by its stored index.
function locate(a, labelIndex) {
  if (labelIndex && a.label != null && labelIndex.has(a.label)) return labelIndex.get(a.label);
  return a.index;
}

/**
 * Compare today's changes with the state and decide what to report. Pure: returns
 * { alerts, pending, baseline, held, state, notes }. `changes` from detectChanges on the same series.
 * Two flicker guards (round 5, eval/watch-flicker.mjs):
 *   holdHistory (on by default since round 5): a change dated where the first check already had `confirm` points after it (history the
 *     baseline called quiet) is recorded as `held`, not alerted.
 *   persist (2 by default since round 7; 1 turns it off): 2 makes a change wait until a detection within `tolerance` of it was also present at the
 *     previous check (state.seen), so a detection that appears for one check and vanishes is never sent.
 */
export function advance(state, changes, n, labels, opts = {}) {
  const { confirm, tolerance, holdHistory, persist } = { ...WATCH_DEFAULTS, ...opts };
  const st = state && state.version === STATE_VERSION ? state : emptyState();
  const notes = [];
  if (st.n && n < st.n) notes.push(`The series is shorter than at the last check (${n} points, was ${st.n}): rows were removed or the file was replaced.`);
  const unique = new Set(labels).size === labels.length;
  const labelIndex = unique ? new Map(labels.map((x, i) => [String(x), i])) : null;
  if (st.lastLabel != null && labelIndex && !labelIndex.has(st.lastLabel)) notes.push(`The last label seen before (${st.lastLabel}) is no longer in the series: its history was rewritten.`);
  const known = st.alerted.map((a) => locate(a, labelIndex));
  const alerts = [], pending = [], baseline = [], held = [];
  // The first check of a file that already has history records the changes in it as the baseline
  // instead of alerting on each (opts.alertHistory reports them).
  const first = !st.n && !st.alerted.length && !opts.alertHistory;
  // The last row the first check had `confirm` points after: changes up to it are history the baseline saw.
  const quiet = first ? (n - confirm >= 0 ? { index: n - confirm, label: String(labels[n - confirm]) } : null) : st.quietUntil ?? null;
  const quietAt = !quiet ? -1 : labelIndex ? (labelIndex.has(quiet.label) ? labelIndex.get(quiet.label) : -1) : quiet.index;
  const seen = Array.isArray(st.seen) ? st.seen.map((a) => locate(a, labelIndex)) : [];
  for (const c of changes) {
    if (known.some((k) => Math.abs(k - c.index) <= tolerance)) continue;
    const after = n - c.index; // points from the change to the newest, inclusive
    if (after < confirm) { pending.push({ ...c, pointsAfter: after }); continue; }
    if (first) baseline.push({ ...c, pointsAfter: after });
    else if (holdHistory && c.index <= quietAt) held.push({ ...c, pointsAfter: after });
    // Only once there was a previous check: a first check with --alert-history has nothing to compare with.
    else if (persist > 1 && st.n && !seen.some((k) => Math.abs(k - c.index) <= tolerance)) { pending.push({ ...c, pointsAfter: after, unconfirmed: true }); continue; }
    else alerts.push({ ...c, pointsAfter: after, late: after > 2 * confirm + 1 });
    known.push(c.index);
  }
  const rec = (a, extra) => ({ index: a.index, label: String(a.label), reportedAtN: n, ...(a.shift !== undefined ? { shift: a.shift } : {}), ...extra });
  const next = {
    version: STATE_VERSION,
    alerted: [...st.alerted, ...baseline.map((a) => rec(a, { baseline: true })), ...held.map((a) => rec(a, { held: true })), ...alerts.map((a) => rec(a, {}))],
    n,
    lastLabel: labels.length ? String(labels[labels.length - 1]) : null,
    ...(quiet ? { quietUntil: quiet } : {}),
    ...(persist > 1 ? { seen: changes.map((c) => ({ index: c.index, label: String(c.label) })) } : {}),
    // The setting `--detector auto` picked at the first check (watch.mjs), kept so later checks use the same one.
    ...(st.choice ? { choice: st.choice } : {}),
  };
  return { alerts, pending, baseline, held, state: next, notes };
}

const fmt = (v) => (Math.abs(v) >= 100 ? String(Math.round(v * 10) / 10) : String(Number(v.toPrecision(3))));

export function alertText(res, { column = 'the series', model = 'mean' } = {}) {
  const lines = [];
  for (const a of res.alerts) {
    let what = `${column} changed from ${a.label}`;
    if (a.meanBefore !== undefined) {
      const dir = a.shift > 0 ? 'up' : 'down';
      what += `: ${model === 'poisson' ? 'rate' : 'level'} ${dir} from ${fmt(a.meanBefore)} to ${fmt(a.meanAfter)}`;
      if (a.shiftInNoiseSd !== undefined) what += ` (${fmt(Math.abs(a.shiftInNoiseSd))} noise sd)`;
      if (a.sdBefore !== undefined && model === 'meanvar') what += `, sd ${fmt(a.sdBefore)} to ${fmt(a.sdAfter)}`;
    }
    if (a.probability !== undefined) what += `, Bayesian probability ${Math.round(a.probability * 100)}%`;
    what += `; ${a.pointsAfter} points since${a.late ? ' (dated well back: it took more data to show)' : ''}.`;
    lines.push(what);
  }
  return lines.join('\n');
}

export function statusText(res, opts = {}) {
  const lines = [];
  if (res.alerts.length) lines.push(`New change${res.alerts.length > 1 ? 's' : ''}:`, alertText(res, opts).split('\n').map((l) => `  ${l}`).join('\n'));
  else if (res.baseline && res.baseline.length) lines.push(`First check: ${res.baseline.length} change${res.baseline.length > 1 ? 's' : ''} already in the history, recorded as the baseline, not alerted (${res.baseline.map((b) => b.label).join(', ')}).`);
  else lines.push('No new confirmed change.');
  for (const p of res.pending) lines.push(p.unconfirmed
    ? `Watching: a possible change from ${p.label}, found at this check for the first time; reported if the next check finds it too.`
    : `Watching: a possible change from ${p.label}, ${p.pointsAfter} point${p.pointsAfter === 1 ? '' : 's'} after it so far (reported at ${opts.confirm ?? WATCH_DEFAULTS.confirm}).`);
  for (const h of res.held ?? []) lines.push(`Held, not alerted: a change from ${h.label}, dated inside the history the first check called quiet.`);
  for (const n of res.notes) lines.push(`Note: ${n}`);
  lines.push(`Changes on record: ${res.state.alerted.length}. Points: ${res.state.n}.`);
  return lines.join('\n');
}

/** One body that Slack, Mattermost and Teams incoming webhooks read as `text` and Discord as `content`. */
export function webhookBody(text) {
  return { text, content: text.length > 1990 ? text.slice(0, 1987) + '...' : text };
}

/** Every change on record in a state, oldest first, as "label (up 1.2)" lines; baseline ones marked. */
export function recordText(state) {
  const a = state && Array.isArray(state.alerted) ? state.alerted : [];
  if (!a.length) return 'No changes on record yet.';
  return a.map((c) => {
    let s = `${c.label}`;
    if (c.shift !== undefined) s += `: ${c.shift > 0 ? 'up' : 'down'} ${fmt(Math.abs(c.shift))}`;
    s += c.baseline ? ' (in the history at the first check)' : c.held ? ` (found at point ${c.reportedAtN}, dated inside the history the first check saw; not alerted)` : ` (reported at point ${c.reportedAtN})`;
    return s;
  }).join('\n');
}

/**
 * One check of a growing series, from CSV text and the state the previous check returned (or none).
 * Returns { column, n, alerts, pending, baseline, notes, state, text }; keep `state` for the next check.
 * The page keeps it in the browser; an agent keeps it wherever it keeps notes. Options as the CLI's:
 * column, labelColumn, model (mean | meanvar | poisson), detector, penalty, period, log, confirm,
 * tolerance, window, rhoCap, alertHistory.
 */
export function watchCheck({ csv, state = null, column = null, labelColumn = null, alertHistory = false, ...opts } = {}) {
  if (typeof csv !== 'string' || !csv.trim()) throw new Error('Give the series as CSV text (csv).');
  const model = opts.model ?? 'mean';
  if (!['mean', 'meanvar', 'poisson'].includes(model)) throw new Error('The watch takes model mean, meanvar or poisson.');
  if (opts.detector != null && !DETECTORS.includes(opts.detector)) throw new Error(`detector takes ${DETECTORS.join(', ')}.`);
  const parsed = parseSeries(csv, column ?? null, labelColumn ?? null);
  const { labels, values } = parsed;
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  const clean = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const changes = detectChanges(values, labels, clean);
  const res = advance(state, changes, values.length, labels, { ...clean, alertHistory });
  const text = statusText(res, { column: parsed.column, model, confirm: clean.confirm });
  return { column: parsed.column, n: values.length, ...res, text };
}

/**
 * Work one replay may do, in (points refit)^2 summed over its checks: each check refits the newest
 * `window` points, and the Bayesian pass costs about the square of that (175 ms for 1,000 points on
 * one 2026 cloud core). 3e7 is about 5 s there: a 500-point series is checked every 2 points, 1,000
 * points every 11, a 2,000-point series every 30 or so.
 */
export const REPLAY_BUDGET = 3e7;

/**
 * Replay the watch over a finished series, as if it had run after each new point, and return what it
 * would have sent and when. The question a person asks before setting a watch up: "on my own history,
 * how often would this have pinged me, and how late?" values: numbers, oldest first; labels: dates or
 * row names (default 1..n). opts: the watch options (model, detector, confirm, tolerance, window,
 * penalty, period, log, rhoCap) plus from (the number of points at the first check; default 20% of the
 * series, at least 20, as in eval/watch-replay.mjs), step (points between checks; default 1, raised to
 * keep within budget, default REPLAY_BUDGET). With step above 1, a check that finds an alert is
 * bisected back to the first point whose arrival sends it, so each alert's date and delay are those of
 * a watch run after every point (assuming an alert, once due, stays due: true in every test here); a
 * detection that showed and vanished between two checks is not seen, so false alerts can be undercounted.
 * The first check records the changes already in the history as the baseline, as a real first run does.
 * Returns { n, from, step, checks, settings, baseline, alerts, pending }; each alert carries the change
 * (index, label, levels each side when known), reportedAt / reportedAtLabel (the point whose arrival
 * sent it) and pointsAfter, its delay in points.
 */
export function replayWatch(values, labels = null, opts = {}) {
  if (!Array.isArray(values)) throw new Error('values must be an array of numbers.');
  const v = values.map(Number);
  if (v.some((x) => !Number.isFinite(x))) throw new Error('values must all be numbers.');
  const n = v.length;
  if (n < 10) throw new Error(`A replay needs at least 10 points; got ${n}.`);
  const l = (labels && labels.length === n ? labels : v.map((_, i) => i + 1)).map(String);
  const { from: from0, step: step0, budget: budget0, alertHistory: _h, ...rest } = opts;
  const model = rest.model ?? 'mean';
  const settings = { ...WATCH_DEFAULTS, ...rest, model, detector: rest.detector ?? defaultDetector(model) };
  if (!DETECTORS.includes(settings.detector)) throw new Error(`detector takes ${DETECTORS.join(', ')}.`);
  const from = Math.min(n, Math.max(4, Math.round(from0 ?? Math.max(Math.min(20, n), Math.floor(0.2 * n)))));
  const budget = budget0 ?? REPLAY_BUDGET;
  const endsFor = (s) => { const e = []; for (let x = from; x <= n; x += s) e.push(x); if (e[e.length - 1] !== n) e.push(n); return e; };
  const cost = (e) => e.reduce((t, x) => t + Math.min(x, settings.window) ** 2, 0) * (settings.persist > 1 && e.length > 1 && e[1] - e[0] > 1 ? 2 : 1);
  let step = Math.max(1, Math.round(step0 ?? 1));
  while (step < n && cost(endsFor(step)) > budget) step = Math.max(step + 1, Math.ceil(step * 1.25));
  const { confirm, tolerance, holdHistory, persist, ...detOpts } = settings;
  const pol = { confirm, tolerance, holdHistory: !!holdHistory, persist: persist > 1 ? persist : 1 };
  let state = emptyState(), baseline = [], pending = [], checks = 0;
  const alerts = [], held = [];
  const det = (end) => detectChanges(v.slice(0, end), l.slice(0, end), detOpts);
  const check = (end) => {
    checks++;
    const ls = l.slice(0, end);
    // With persist, a check needs the detections one point earlier, as a watch run after every point would have
    // seen them; a coarse or bisected check computes them (one more engine run).
    let st = state;
    if (persist > 1 && state.n && state.n !== end - 1) { checks++; st = { ...state, seen: det(end - 1).map((c) => ({ index: c.index, label: String(c.label) })) }; }
    return advance(st, det(end), end, ls, pol);
  };
  const commit = (r, end) => {
    if (end === from) baseline = r.baseline;
    for (const a of r.alerts) alerts.push({ ...a, reportedAt: end - 1, reportedAtLabel: l[end - 1] });
    for (const a of r.held) held.push({ ...a, reportedAt: end - 1, reportedAtLabel: l[end - 1] });
    pending = r.pending;
    state = r.state;
  };
  let prev = from - 1;
  for (const end of endsFor(step)) {
    for (;;) {
      const r = check(end);
      if (!r.alerts.length || end - prev <= 1) { commit(r, end); break; }
      // Bisect for the first point in (prev, end] whose arrival sends an alert.
      let lo = prev + 1, hi = end, best = r;
      while (lo < hi) { const mid = Math.floor((lo + hi) / 2); const m = check(mid); if (m.alerts.length) { hi = mid; best = m; } else lo = mid + 1; }
      commit(best, hi);
      prev = hi;
      if (hi === end) break;
    }
    prev = end;
  }
  return { n, from, step, checks, settings, baseline, alerts, pending, held };
}

/** Plain sentences for a replay, for the page and an agent's answer. */
export function replayText(res, { column = 'the series', model = 'mean' } = {}) {
  const lines = [];
  const every = res.step > 1 ? `every ${res.step} points, each alert dated back to the point that would have sent it` : 'after each new point';
  lines.push(`Replayed as a watch started at point ${res.from} of ${res.n} and run ${every} (${res.checks} checks).`);
  if (res.baseline.length) lines.push(`Already in the history at the start, recorded and not alerted: ${res.baseline.map((b) => b.label).join(', ')}.`);
  if (res.held && res.held.length) lines.push(`Found later but dated inside that history, so held and not alerted: ${res.held.map((h) => `${h.label} (found on ${h.reportedAtLabel})`).join(', ')}.`);
  if (!res.alerts.length) lines.push('It would have sent no alert.');
  else {
    lines.push(`It would have sent ${res.alerts.length} alert${res.alerts.length > 1 ? 's' : ''}:`);
    const body = alertText({ alerts: res.alerts }, { column, model }).split('\n');
    res.alerts.forEach((a, i) => lines.push(`  on ${a.reportedAtLabel}: ${body[i]}`));
  }
  for (const p of res.pending) lines.push(`Still watching at the end: a possible change from ${p.label}, ${p.pointsAfter} point${p.pointsAfter === 1 ? '' : 's'} after it (reported at ${res.settings.confirm}).`);
  return lines.join('\n');
}

/** The page's three "How eager" settings, quietest first. For the volatility and counts models the quiet default is
 * already `bocpd`, so those models have two settings. */
export function eagerSettings(model = 'mean') {
  const q = defaultDetector(model);
  return [{ key: 'quiet', detector: q }, ...(q === 'bocpd' ? [] : [{ key: 'middle', detector: 'bocpd' }]), { key: 'eager', detector: 'pelt' }];
}

/**
 * Replay the person's own history once per "How eager" setting and report, for each, the alerts it would have sent,
 * the daily checks after the baseline, alerts per 100 of them and the median delay (README "Round 6"). opts: as replayWatch (detector
 * is ignored). Each replay keeps its own work budget, so a long series takes up to three times one replay.
 * suggest: the most eager setting whose rate is at most `budget` alerts per 100 checks (default HINT_BUDGET, 2),
 * else quiet; the rule round 6 pre-registered and passed, narrowly, on TCPD (eval/watch-eagerness.out.txt).
 * Returns { n, from, model, budget, suggest, settings: [{ key, detector, alerts, checks, step, per100, medianDelay }] }.
 */
export function eagernessReplay(values, labels = null, opts = {}) {
  const { detector: _d, budget: b0, ...rest } = opts;
  const budget = b0 ?? HINT_BUDGET;
  const model = rest.model ?? 'mean';
  let n = 0, from = 0;
  const settings = eagerSettings(model).map(({ key, detector }) => {
    const r = replayWatch(values, labels, { ...rest, detector });
    n = r.n; from = r.from;
    const d = r.alerts.map((a) => a.pointsAfter).sort((x, y) => x - y), m = d.length >> 1;
    // Per daily check after the baseline (n - from), as a watch run after every row would count them, not the
    // replay's own coarse and bisection checks.
    const daily = r.n - r.from;
    return { key, detector, alerts: r.alerts.length, checks: daily, step: r.step, per100: daily ? (100 * r.alerts.length) / daily : 0, medianDelay: d.length ? (d.length % 2 ? d[m] : (d[m - 1] + d[m]) / 2) : null };
  });
  return { n, from, model, budget, suggest: suggestFor(settings, budget, n), settings };
}

/**
 * The round 6 rule on settings already replayed: the most eager one whose rate is at most `budget` alerts per 100
 * checks, else quiet. The page uses it to re-pick when the person changes the budget, without replaying again.
 * Given `n`, a history under AUTO_MIN_POINTS keeps quiet, as `--detector auto` does (round 6 skipped those series).
 */
export function suggestFor(settings, budget = HINT_BUDGET, n = Infinity) {
  if (n < AUTO_MIN_POINTS) return 'quiet';
  return [...settings].reverse().find((x) => x.per100 <= budget)?.key ?? 'quiet';
}

/** Round 6's pre-registered alert budget for the eagerness suggestion: alerts per 100 daily checks. */
export const HINT_BUDGET = 2;

const EAGER_NAMES = { quiet: 'Quiet', middle: 'Middle', eager: 'Eager' };
const eagerName = (k) => (Object.hasOwn(EAGER_NAMES, k) ? EAGER_NAMES[k] : String(k));

/** Plain sentences for an eagerness replay, for the page and an agent's answer. */
export function eagernessText(res, { column = 'the series', every = 'day' } = {}) {
  const lines = [`On the history of ${column} (a watch started at point ${res.from} of ${res.n}, then ${res.n - res.from} daily checks):`];
  for (const s of res.settings) lines.push(`  ${eagerName(s.key)} (${s.detector}): ${s.alerts} alert${s.alerts === 1 ? '' : 's'}, ${s.per100.toFixed(1)} per 100 checks${s.medianDelay !== null ? `, median ${s.medianDelay} rows late` : ''}.`);
  const fb = Number(Number(res.budget).toPrecision(3));
  const pick = res.settings.find((s) => s.key === res.suggest);
  lines.push(res.n < AUTO_MIN_POINTS
    ? `Suggested: Quiet. ${res.n} points is under the ${AUTO_MIN_POINTS} the suggestion was tested on, too short a history to choose from.`
    : res.suggest === 'quiet'
    ? (pick.per100 > res.budget
      ? (res.budget < HINT_BUDGET
        ? `Suggested: Quiet, the least eager setting. Even Quiet would have sent ${pick.per100.toFixed(1)} alerts per 100 checks on this history, above your ${fb}.`
        : `Suggested: Quiet. Even Quiet would have sent ${pick.per100.toFixed(1)} alerts per 100 checks, above ${fb}; a level that wanders all the time keeps alerting, so consider watching its daily change instead.`)
      : `Suggested: Quiet. The more eager settings would have sent more than ${fb} alerts per 100 checks on this history.`)
    : `Suggested: ${eagerName(res.suggest)}, the most eager setting that stayed at or under ${fb} alerts per 100 checks on this history.`);
  lines.push(`Budget: ${fb} alert${fb === 1 ? '' : 's'} per 100 checks, ${plainBudgetText(res.budget, every)}.`);
  lines.push('A suggestion from one past, not a promise: on 23 labelled series it reached 17 of 31 later marked changes against the default\'s 16, at 17.5 alerts per 1,000 checks against 15.7 (replayed with the shipped persist 2), and on 6 held-out series it changed nothing.'
    + (Math.abs(res.budget - HINT_BUDGET) > 1e-9 ? ` Those numbers are for the tested budget of ${HINT_BUDGET} per 100 (${plainBudgetText(HINT_BUDGET)}); at about 1 a month the same series reached 19 of 31 at 19.3 per 1,000, at about 1 a week 29 of 31 at 74.0 per 1,000.` : ''));
  return lines.join('\n');
}

// A budget in plain terms (README "The hint in the CLI watch"). Days per period and per check; a month is a twelfth
// of a 365.25-day year, so "1 alert a month at a daily check" is 100 / 30.44 = 3.29 per 100 checks.
const DAYS_PER = { week: 7, month: 365.25 / 12, year: 365.25 };
const DAYS_PER_CHECK = { hour: 1 / 24, day: 1, week: 7 };
const EVERY_WORD = { hour: 'an hourly', day: 'a daily', week: 'a weekly' };
const EVERY_ADJ = { hour: 'hourly', day: 'daily', week: 'weekly' };

/** Alerts per 100 checks from "about `alerts` alerts a `per` (week | month | year), checked every `every` (hour | day | week)". */
export function budgetFromPlain({ alerts, per = 'month', every = 'day' } = {}) {
  const a = Number(alerts);
  if (!(a >= 0) || !Number.isFinite(a)) throw new Error('alerts takes a number of 0 or more.');
  if (!Object.hasOwn(DAYS_PER, per)) throw new Error('per takes week, month or year.');
  if (!Object.hasOwn(DAYS_PER_CHECK, every)) throw new Error('every takes hour, day or week.');
  const checks = DAYS_PER[per] / DAYS_PER_CHECK[every];
  if (checks < 1) throw new Error(`${EVERY_WORD[every][0].toUpperCase()}${EVERY_WORD[every].slice(1)} check runs less than once a ${per}; give a longer period.`);
  if (a > checks) throw new Error(`That is more than one alert per check (${+checks.toPrecision(3)} ${EVERY_ADJ[every]} checks a ${per}); give at most ${Math.floor(checks)}.`);
  return (100 * a) / checks;
}

/** The same budget back in plain words, e.g. "about 0.6 alerts a month at a daily check". */
export function plainBudgetText(budget, every = 'day') {
  if (!Object.hasOwn(DAYS_PER_CHECK, every)) every = 'day';
  const perMonth = (budget / 100) * (DAYS_PER.month / DAYS_PER_CHECK[every]);
  const [x, unit] = perMonth >= 0.95 ? [perMonth, 'a month'] : [perMonth * 12, 'a year'];
  const r = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
  return `about ${r} alert${r === 1 ? '' : 's'} ${unit} at ${EVERY_WORD[every]} check`;
}

/** Below this many points the history is too short to choose from (round 6 skipped series with fewer than 30). */
export const AUTO_MIN_POINTS = 30;

/**
 * `--detector auto`: pick the "How eager" setting at the first check from the history, by the round 6 rule, and
 * return { detector, key, budget, n, per100, reason }. Under AUTO_MIN_POINTS points it keeps the quiet default.
 * opts: the watch options (model, penalty, period, log, rhoCap, confirm, tolerance, window) plus budget.
 */
export function chooseDetector(values, labels = null, opts = {}) {
  const model = opts.model ?? 'mean';
  const budget = opts.budget ?? HINT_BUDGET;
  const fb = Number(Number(budget).toPrecision(3));
  if (values.length < AUTO_MIN_POINTS) {
    return { detector: defaultDetector(model), key: 'quiet', budget, n: values.length, per100: null, reason: `under ${AUTO_MIN_POINTS} points of history, so the quiet default` };
  }
  const { detector: _d, ...rest } = opts;
  const r = eagernessReplay(values, labels, { ...rest, budget });
  const pick = r.settings.find((s) => s.key === r.suggest);
  return { detector: pick.detector, key: pick.key, budget, n: values.length, per100: Math.round(pick.per100 * 100) / 100, reason: r.suggest === 'quiet' && pick.per100 > budget
    ? `even Quiet sent more than ${fb} alerts per 100 checks on the history, so Quiet`
    : `the most eager setting at or under ${fb} alerts per 100 checks on the history`, replay: r };
}
