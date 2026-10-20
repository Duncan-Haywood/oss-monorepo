// PQL Radar engine: a free or trial signup's first-week product events -> a logistic regression
// trained on YOUR past signups -> "likely to become a paying customer" scores with reasons.
// Pure and browser-safe (no node: imports): the web page and the server run this same file.
export const DAY = 86_400_000;
export const WINDOW_DAYS = 7; // features use only the first 7 days after signup
export const HORIZON_DAYS = 30; // "did it pay within 30 days of signup?"
export const MIN_EACH_CLASS = 20; // fewer converters or non-converters than this: heuristic index, not a model
const ID = /^[\w.:@-]{1,100}$/;
const MAX_EVENTS = 5000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const toMs = (v) => (typeof v === "number" ? v : Date.parse(v));

export function newState() { return { accounts: {}, seen: {}, alerted: {}, model: null, modelAt: 0 }; }

/** Feature definitions. `bad` says which direction lowers conversion; `why` words a conversion-raising value. */
export const FEATURES = [
  { key: "logEvents", up: "high", label: "Events in week 1", value: (w) => Math.log1p(w.events), why: (w) => `${w.events} events in the first week` },
  { key: "activeDays", up: "high", label: "Active days in week 1", value: (w) => w.activeDays, why: (w) => `active on ${w.activeDays} of its first ${w.days} days` },
  { key: "types", up: "high", label: "Distinct features used", value: (w) => w.types, why: (w) => `tried ${w.types} different features` },
  { key: "logMaxDay", up: "high", label: "Busiest day's events", value: (w) => Math.log1p(w.maxDay), why: (w) => `one session of ${w.maxDay} events` },
  { key: "logFirstHours", up: "low", label: "Hours to first event", value: (w) => Math.log1p(w.firstHours), why: (w) => (w.firstHours < 1 ? "used it within the first hour" : `first used it ${Math.round(w.firstHours)} hour${Math.round(w.firstHours) === 1 ? "" : "s"} after signup`) },
  { key: "recent", up: "high", label: "Active in last 2 days of week 1", value: (w) => (w.lateEvents > 0 ? 1 : 0), why: () => "still active at the end of week 1" },
];

/** Summarise events in [signup, signup + WINDOW_DAYS), using only events up to `limit` (no look-ahead). */
export function windowOf(account, limit = account.signupAt + WINDOW_DAYS * DAY) {
  const end = Math.min(limit, account.signupAt + WINDOW_DAYS * DAY), days = new Map(), types = new Set();
  let events = 0, first = Infinity, lateEvents = 0;
  for (const [ts, type] of account.events) {
    if (ts < account.signupAt || ts >= end) continue;
    events++; types.add(type); first = Math.min(first, ts);
    const d = Math.floor((ts - account.signupAt) / DAY); days.set(d, (days.get(d) || 0) + 1);
    if (ts >= account.signupAt + (WINDOW_DAYS - 2) * DAY) lateEvents++;
  }
  return { events, types: types.size, activeDays: days.size, days: Math.min(WINDOW_DAYS, Math.max(1, Math.ceil((end - account.signupAt) / DAY))), maxDay: Math.max(0, ...days.values()), firstHours: first === Infinity ? WINDOW_DAYS * 24 : (first - account.signupAt) / 3_600_000, lateEvents };
}
export const vectorOf = (w) => FEATURES.map((f) => f.value(w));

/** Add an event. Idempotent on `id`. The first event of an unknown account sets its signup time unless `signup` is given. */
export function ingest(state, ev, now) {
  if (!ev || typeof ev !== "object") throw fail("event must be an object");
  if (!ID.test(ev.id || "")) throw fail("id is required (1-100 characters); it makes retries safe");
  if (!ID.test(ev.account || "")) throw fail("account is required (1-100 characters of letters, digits and _ . : @ -); send an id you choose, never an email");
  const type = String(ev.type || "event").slice(0, 60);
  const ts = ev.timestamp == null ? now : toMs(ev.timestamp);
  if (!Number.isFinite(ts)) throw fail("timestamp must be an ISO date or epoch milliseconds");
  if (ts > now + DAY) throw fail("timestamp is in the future");
  if (state.seen[ev.id]) return "duplicate";
  state.seen[ev.id] = ts;
  const a = state.accounts[ev.account] ||= { signupAt: ts, convertedAt: null, events: [] };
  if (ev.signup != null) { const s = toMs(ev.signup); if (Number.isFinite(s)) a.signupAt = s; }
  else if (ts < a.signupAt) a.signupAt = ts;
  const list = a.events, row = [ts, type];
  if (!list.length || list[list.length - 1][0] <= ts) list.push(row);
  else { let i = list.length; while (i > 0 && list[i - 1][0] > ts) i--; list.splice(i, 0, row); }
  if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  return "accepted";
}

/** Record that an account became a paying customer (the label the model learns from). */
export function setConversion(state, account, convertedAt, now) {
  if (!ID.test(account || "")) throw fail("account is required");
  const ts = convertedAt == null ? now : toMs(convertedAt);
  if (!Number.isFinite(ts)) throw fail("convertedAt must be an ISO date or epoch milliseconds");
  const a = state.accounts[account] ||= { signupAt: ts, convertedAt: null, events: [] };
  a.convertedAt = ts;
  return a;
}
/** Undo a conversion recorded by mistake. */
export function clearConversion(state, account) { if (state.accounts[account]) state.accounts[account].convertedAt = null; }

/**
 * One labelled row per account. Excluded, on purpose: accounts that paid inside the feature window
 * (their week-1 usage is partly a result of paying, which would leak the label), accounts whose
 * 30-day outcome is not observable yet, and accounts that paid after the horizon (a late payer is
 * neither a clean yes nor a clean no).
 */
export function buildRows(accounts, now) {
  const rows = [], skipped = { paidEarly: 0, tooYoung: 0, paidLate: 0 };
  for (const [id, a] of Object.entries(accounts)) {
    const winEnd = a.signupAt + WINDOW_DAYS * DAY, horizonEnd = a.signupAt + HORIZON_DAYS * DAY;
    if (a.convertedAt != null && a.convertedAt < winEnd) { skipped.paidEarly++; continue; }
    if (a.convertedAt != null && a.convertedAt > horizonEnd) { skipped.paidLate++; continue; }
    const y = a.convertedAt != null ? 1 : 0;
    if (!y && now < horizonEnd) { skipped.tooYoung++; continue; }
    rows.push({ id, t: a.signupAt, y, x: vectorOf(windowOf(a)) });
  }
  return { rows, skipped };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/** Logistic regression on standardised features: full-batch gradient descent with L2. */
export function fitLogistic(rows, { iterations = 600, rate = 0.3, l2 = 0.01 } = {}) {
  const d = FEATURES.length, n = rows.length;
  const mean = Array(d).fill(0), sd = Array(d).fill(0);
  for (const r of rows) r.x.forEach((v, j) => { mean[j] += v / n; });
  for (const r of rows) r.x.forEach((v, j) => { sd[j] += (v - mean[j]) ** 2 / n; });
  sd.forEach((v, j) => { sd[j] = Math.sqrt(v) || 1; });
  const Z = rows.map((r) => r.x.map((v, j) => (v - mean[j]) / sd[j]));
  const base = rows.reduce((s, r) => s + r.y, 0) / n;
  const w = Array(d).fill(0); let b = Math.log(Math.max(base, 1e-6) / Math.max(1 - base, 1e-6));
  for (let it = 0; it < iterations; it++) {
    const gw = Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const e = sigmoid(b + Z[i].reduce((s, v, j) => s + v * w[j], 0)) - rows[i].y;
      gb += e; for (let j = 0; j < d; j++) gw[j] += e * Z[i][j];
    }
    b -= (rate * gb) / n; for (let j = 0; j < d; j++) w[j] -= rate * (gw[j] / n + l2 * w[j]);
  }
  return { kind: "logistic", features: FEATURES.map((f) => f.key), mean, sd, w, b, baseRate: base, trainedOn: n };
}

export function predict(model, x) {
  const z = x.map((v, j) => (v - model.mean[j]) / model.sd[j]);
  const contrib = z.map((v, j) => v * model.w[j]);
  return { p: sigmoid(model.b + contrib.reduce((s, v) => s + v, 0)), contrib, z };
}

/** Area under the ROC curve by rank (ties share rank). null when a class is empty. */
export function auc(scores, labels) {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  let pos = 0, neg = 0, rankSum = 0;
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) { if (labels[idx[k]]) { pos++; rankSum += rank; } else neg++; }
    i = j + 1;
  }
  return pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : null;
}

/** Share of all converters found in the highest-scored `frac` of signups (a coin flip finds `frac`). */
export function topCapture(scores, labels, frac = 0.2) {
  const k = Math.max(1, Math.ceil(scores.length * frac)), total = labels.reduce((s, y) => s + y, 0);
  if (!total) return null;
  const top = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, k);
  return top.reduce((s, i) => s + labels[i], 0) / total;
}

/**
 * Train and validate. Validation is out-of-time on signup date: fitted on signups old enough that
 * their whole 30-day outcome had been observed before a cutoff, scored on signups after it. The
 * model that scores today's signups is refitted on every labelled row.
 */
export function train(accounts, now, opts = {}) {
  const { rows, skipped } = buildRows(accounts, now);
  const pos = rows.filter((r) => r.y).length, neg = rows.length - pos;
  const info = { signups: Object.keys(accounts).length, labelled: rows.length, converted: pos, notConverted: neg, skipped };
  if (pos < MIN_EACH_CLASS || neg < MIN_EACH_CLASS) {
    return { mode: "heuristic", model: null, validation: null, info, note: `Only ${pos} converted and ${neg} unconverted signups: fewer than ${MIN_EACH_CLASS} of either, so no model is trained. Showing a rule-based engagement index (events, active days, features tried), which is not a probability.` };
  }
  const times = rows.map((r) => r.t).sort((a, b) => a - b), cutoff = times[Math.floor(times.length * 0.7)];
  const trainSet = rows.filter((r) => r.t + HORIZON_DAYS * DAY <= cutoff), testSet = rows.filter((r) => r.t > cutoff);
  const tp = trainSet.reduce((s, r) => s + r.y, 0), sp = testSet.reduce((s, r) => s + r.y, 0);
  let validation = null;
  if (trainSet.length && tp >= 5 && trainSet.length - tp >= 5 && sp >= 5 && testSet.length - sp >= 5) {
    const m = fitLogistic(trainSet, opts), scores = testSet.map((r) => predict(m, r.x).p), labels = testSet.map((r) => r.y);
    validation = { auc: auc(scores, labels), top20Capture: topCapture(scores, labels, 0.2), testSignups: testSet.length, testConverted: sp, baseRate: sp / testSet.length, cutoff };
  }
  const model = fitLogistic(rows, opts);
  return { mode: "model", model, validation, info, note: validation ? null : "Too few converted or unconverted signups after the cutoff to validate out-of-time: the scores are unvalidated. Treat them as a ranking, not a forecast." };
}

/** Fixed-weight index used until there is enough history to train. 0..1. */
export function heuristicScore(w) {
  return Math.min(1, 0.35 * Math.min(w.activeDays, 5) / 5 + 0.25 * Math.min(w.types, 4) / 4 + 0.25 * Math.min(Math.log1p(w.events) / Math.log1p(40), 1) + 0.15 * (w.lateEvents > 0 ? 1 : 0));
}
const heuristicReasons = (w) => [w.activeDays >= 3 && FEATURES[1].why(w), w.types >= 3 && FEATURES[2].why(w), w.events >= 15 && FEATURES[0].why(w), w.lateEvents > 0 && FEATURES[5].why(w)].filter(Boolean);

/**
 * Score every signup that has finished its first week and has not paid yet, within the last 45 days
 * (older free accounts are a different question), best first, each with up to three reasons.
 */
export function score(accounts, trained, now) {
  const rows = [];
  for (const [id, a] of Object.entries(accounts)) {
    const age = now - a.signupAt;
    if (a.convertedAt != null || age < WINDOW_DAYS * DAY || age > 45 * DAY) continue;
    const w = windowOf(a), x = vectorOf(w);
    if (trained.mode === "model") {
      const { p, contrib, z } = predict(trained.model, x);
      const reasons = contrib.map((c, j) => ({ c, j })).filter((r) => r.c > 0.15 && (FEATURES[r.j].up === "high" ? z[r.j] > 0 : z[r.j] < 0)).sort((a2, b2) => b2.c - a2.c).slice(0, 3).map((r) => FEATURES[r.j].why(w));
      rows.push({ id, score: p, calibrated: true, reasons, signedUpDaysAgo: Math.floor(age / DAY) });
    } else rows.push({ id, score: heuristicScore(w), calibrated: false, reasons: heuristicReasons(w).slice(0, 3), signedUpDaysAgo: Math.floor(age / DAY) });
  }
  return rows.sort((a, b) => b.score - a.score);
}

/** The score at which a signup is called "hot" (for alerts and the summary count). */
export const threshold = (trained) => (trained.mode === "model" ? Math.max(0.2, Math.min(0.6, trained.model.baseRate * 2)) : 0.65);

export function prune(state, now) {
  for (const [id, ts] of Object.entries(state.seen)) if (now - ts > 60 * DAY) delete state.seen[id];
  for (const [id, ts] of Object.entries(state.alerted)) if (now - ts > 60 * DAY) delete state.alerted[id];
}

export function summarize(rows, trained) {
  const th = threshold(trained);
  return { hot: rows.filter((r) => r.score >= th).length, scored: rows.length, threshold: th };
}

// ---- demo data: synthetic, seeded, clearly labelled wherever it is shown ----
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Synthetic signups whose conversion follows early engagement; used for the page demo and tests. */
export function syntheticAccounts(now, { n = 600, seed = 11 } = {}) {
  const rnd = mulberry32(seed), accounts = {};
  const types = ["login", "create_project", "invite", "import", "api_call", "report"];
  for (let i = 0; i < n; i++) {
    const signupAt = now - Math.floor(rnd() * 150 + 8) * DAY, intent = rnd(), events = [];
    const rate = 0.2 + intent * 3.2, breadth = 1 + Math.floor(intent * 5);
    for (let d = 0; d < WINDOW_DAYS; d++) {
      if (rnd() > 0.25 + intent * 0.7) continue;
      let k = rate * (0.5 + rnd());
      while (k > 0) { if (rnd() < Math.min(1, k)) events.push([signupAt + d * DAY + Math.floor(rnd() * DAY), types[Math.floor(rnd() * breadth)]]); k -= 1; }
    }
    events.sort((a, b) => a[0] - b[0]);
    const pays = rnd() < 0.04 + 0.5 * intent * intent;
    const convertedAt = pays ? signupAt + (WINDOW_DAYS + 0.5 + rnd() * 20) * DAY : null;
    accounts[`user_${i}`] = { signupAt, convertedAt, events };
  }
  return accounts;
}

/** Parse a pasted CSV export: `account,date[,event_type]` rows, plus a second list of `account,paid_date`. */
export function parseCsv(eventsText, paidText) {
  const accounts = {}, errors = [];
  const rows = (t) => String(t || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^account\b/i.test(l)).map((l) => l.split(",").map((s) => s.trim()));
  rows(eventsText).forEach((r, i) => {
    const ts = Date.parse(r[1]);
    if (!ID.test(r[0] || "") || !Number.isFinite(ts)) { if (errors.length < 5) errors.push(`event line ${i + 1}: "${r.join(",")}" needs account,date[,type]`); return; }
    const a = accounts[r[0]] ||= { signupAt: ts, convertedAt: null, events: [] };
    a.events.push([ts, (r[2] || "event").slice(0, 60)]); if (ts < a.signupAt) a.signupAt = ts;
  });
  for (const a of Object.values(accounts)) a.events.sort((x, y) => x[0] - y[0]);
  rows(paidText).forEach((r, i) => {
    const ts = Date.parse(r[1]);
    if (!accounts[r[0]] || !Number.isFinite(ts)) { if (errors.length < 5) errors.push(`paid line ${i + 1}: "${r.join(",")}" must name an account that has events, then a date`); return; }
    accounts[r[0]].convertedAt = ts;
  });
  return { accounts, errors };
}
