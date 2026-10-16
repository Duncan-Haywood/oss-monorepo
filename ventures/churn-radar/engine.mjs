// Churn Radar engine: product-usage events -> per-account features -> a logistic
// regression trained on YOUR accounts' history -> a ranked at-risk list with reasons.
// Pure and browser-safe (no node: imports): the web page and the server run this same file.
export const DAY = 86_400_000;
export const HORIZON_DAYS = 30; // "will this account cancel within 30 days?"
export const MIN_EACH_CLASS = 20; // fewer churned or retained snapshots than this: heuristic index, not a model
const ID = /^[\w.:@-]{1,100}$/;
const MAX_EVENTS = 5000; // per account, newest kept
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function newState() { return { accounts: {}, seen: {}, alerted: {}, model: null, modelAt: 0 }; }

/** Feature definitions. `value` reads a window summary; `why` words a risk-raising value for a human. */
export const FEATURES = [
  { key: "logEvents7", bad: "low", label: "Activity, last 7 days", value: (w) => Math.log1p(w.e7), why: (w) => (w.e7 === 0 ? "no activity in the last 7 days" : `only ${w.e7} event${w.e7 === 1 ? "" : "s"} in the last 7 days`) },
  { key: "trend", bad: "low", label: "Week-over-week change", value: (w) => Math.log1p(w.e7) - Math.log1p(w.ePrev7), why: (w) => `activity fell from ${w.ePrev7} to ${w.e7} events week over week` },
  { key: "daysSilent", bad: "high", label: "Days since last event", value: (w) => Math.min(w.daysSilent, 60), why: (w) => `last seen ${Math.floor(w.daysSilent)} days ago` },
  { key: "activeDays14", bad: "low", label: "Active days, last 14", value: (w) => w.activeDays14, why: (w) => `active on only ${w.activeDays14} of the last 14 days` },
  { key: "types28", bad: "low", label: "Distinct features used, 28 days", value: (w) => w.types28, why: (w) => `uses ${w.types28} feature${w.types28 === 1 ? "" : "s"}, so little to lose by leaving` },
  { key: "logTenure", bad: "low", label: "Account age", value: (w) => Math.log1p(w.tenureDays), why: (w) => `a young account (${Math.floor(w.tenureDays)} days old)` },
];

/** Summarise one account's events as of time `t` (events after `t` are ignored: no look-ahead). */
export function windowAt(account, t) {
  const ev = account.events; // sorted by ts ascending
  let e7 = 0, ePrev7 = 0, e28 = 0, last = -Infinity;
  const days14 = new Set(), types = new Set();
  for (let i = ev.length - 1; i >= 0; i--) {
    const [ts, type] = ev[i];
    if (ts > t) continue;
    if (last === -Infinity) last = ts;
    const age = t - ts;
    if (age > 28 * DAY) break;
    e28++; types.add(type);
    if (age <= 7 * DAY) e7++; else if (age <= 14 * DAY) ePrev7++;
    if (age <= 14 * DAY) days14.add(Math.floor(ts / DAY));
  }
  const ref = last === -Infinity ? account.signupAt : last;
  return { e7, ePrev7, e28, daysSilent: Math.max(0, (t - ref) / DAY), activeDays14: days14.size, types28: types.size, tenureDays: Math.max(0, (t - account.signupAt) / DAY) };
}
export const vectorOf = (w) => FEATURES.map((f) => f.value(w));

/**
 * Add an event. Idempotent on `id`. The first event of an unknown account sets its signup time
 * unless `signup` is given. Returns "accepted" or "duplicate".
 */
export function ingest(state, ev, now) {
  if (!ev || typeof ev !== "object") throw fail("event must be an object");
  if (!ID.test(ev.id || "")) throw fail("id is required (1-100 characters); it makes retries safe");
  if (!ID.test(ev.account || "")) throw fail("account is required (1-100 characters of letters, digits and _ . : @ -); send an id you choose, never an email");
  const type = String(ev.type || "event").slice(0, 60);
  const ts = ev.timestamp == null ? now : typeof ev.timestamp === "number" ? ev.timestamp : Date.parse(ev.timestamp);
  if (!Number.isFinite(ts)) throw fail("timestamp must be an ISO date or epoch milliseconds");
  if (ts > now + DAY) throw fail("timestamp is in the future");
  if (state.seen[ev.id]) return "duplicate";
  state.seen[ev.id] = ts;
  const a = state.accounts[ev.account] ||= { signupAt: ts, churnedAt: null, events: [] };
  if (ev.signup != null) { const s = typeof ev.signup === "number" ? ev.signup : Date.parse(ev.signup); if (Number.isFinite(s)) a.signupAt = s; }
  else if (ts < a.signupAt) a.signupAt = ts;
  const ev2 = a.events, row = [ts, type];
  if (!ev2.length || ev2[ev2.length - 1][0] <= ts) ev2.push(row);
  else { let i = ev2.length; while (i > 0 && ev2[i - 1][0] > ts) i--; ev2.splice(i, 0, row); }
  if (ev2.length > MAX_EVENTS) ev2.splice(0, ev2.length - MAX_EVENTS);
  return "accepted";
}

/** Record that an account cancelled (the label the model learns from). */
export function setOutcome(state, account, churnedAt, now) {
  if (!ID.test(account || "")) throw fail("account is required");
  const ts = churnedAt == null ? now : typeof churnedAt === "number" ? churnedAt : Date.parse(churnedAt);
  if (!Number.isFinite(ts)) throw fail("churnedAt must be an ISO date or epoch milliseconds");
  const a = state.accounts[account] ||= { signupAt: ts, churnedAt: null, events: [] };
  a.churnedAt = ts;
  return a;
}
/** An account that came back (reactivated) is no longer churned. */
export function clearOutcome(state, account) { if (state.accounts[account]) state.accounts[account].churnedAt = null; }

/** Weekly snapshots of every account, each labelled "churned within HORIZON_DAYS of T?" using only what was observable by `now`. */
export function buildSnapshots(accounts, now, horizonDays = HORIZON_DAYS, stepDays = 7) {
  const H = horizonDays * DAY, out = [];
  for (const [id, a] of Object.entries(accounts)) {
    for (let t = a.signupAt + 14 * DAY; t <= now; t += stepDays * DAY) {
      if (a.churnedAt != null && t >= a.churnedAt) break;
      const label = a.churnedAt != null && a.churnedAt <= t + H ? 1 : 0;
      if (!label && t + H > now) break; // outcome not yet observable
      out.push({ id, t, y: label, x: vectorOf(windowAt(a, t)) });
    }
  }
  return out;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/** Logistic regression on standardised features: full-batch gradient descent with L2. Returns a plain-object model. */
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
      const p = sigmoid(b + Z[i].reduce((s, v, j) => s + v * w[j], 0)), e = p - rows[i].y;
      gb += e; for (let j = 0; j < d; j++) gw[j] += e * Z[i][j];
    }
    b -= (rate * gb) / n; for (let j = 0; j < d; j++) w[j] -= rate * (gw[j] / n + l2 * w[j]);
  }
  return { kind: "logistic", features: FEATURES.map((f) => f.key), mean, sd, w, b, baseRate: base, trainedOn: n };
}

export function predict(model, x) {
  const z = x.map((v, j) => (v - model.mean[j]) / model.sd[j]);
  const contrib = z.map((v, j) => v * model.w[j]);
  return { p: sigmoid(model.b + contrib.reduce((s, v) => s + v, 0)), contrib };
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

/** Share of churners found in the highest-scored 10%, against the 10% a coin flip finds. */
export function topDecileCapture(scores, labels) {
  const k = Math.max(1, Math.ceil(scores.length / 10)), total = labels.reduce((s, y) => s + y, 0);
  if (!total) return null;
  const top = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, k);
  return top.reduce((s, i) => s + labels[i], 0) / total;
}

/**
 * Train and validate. Validation is out-of-time: the model is fitted only on snapshots whose whole
 * outcome window ended before a cutoff, then scored on snapshots after it. The model that scores
 * today's accounts is refitted on everything labelled.
 */
export function train(accounts, now, opts = {}) {
  const snaps = buildSnapshots(accounts, now);
  const pos = snaps.filter((s) => s.y).length, neg = snaps.length - pos;
  const info = { snapshots: snaps.length, churnedSnapshots: pos, retainedSnapshots: neg, accounts: Object.keys(accounts).length, churned: Object.values(accounts).filter((a) => a.churnedAt != null).length };
  if (pos < MIN_EACH_CLASS || neg < MIN_EACH_CLASS) {
    return { mode: "heuristic", model: null, validation: null, info, note: `Only ${pos} churned and ${neg} retained account-weeks: fewer than ${MIN_EACH_CLASS} of either, so no model is trained. Showing a rule-based risk index (silence and falling activity), which is not a probability.` };
  }
  const times = snaps.map((s) => s.t).sort((a, b) => a - b), cutoff = times[Math.floor(times.length * 0.7)];
  const trainSet = snaps.filter((s) => s.t + HORIZON_DAYS * DAY <= cutoff), testSet = snaps.filter((s) => s.t > cutoff);
  let validation = null;
  const tp = trainSet.reduce((s, r) => s + r.y, 0), sp = testSet.reduce((s, r) => s + r.y, 0);
  if (trainSet.length && tp >= 5 && trainSet.length - tp >= 5 && sp >= 5 && testSet.length - sp >= 5) {
    const m = fitLogistic(trainSet, opts), scores = testSet.map((r) => predict(m, r.x).p), labels = testSet.map((r) => r.y);
    validation = { auc: auc(scores, labels), topDecileCapture: topDecileCapture(scores, labels), testSnapshots: testSet.length, testChurned: sp, baseRate: sp / testSet.length, cutoff };
  }
  const model = fitLogistic(snaps, opts);
  return { mode: "model", model, validation, info, note: validation ? null : "Too few churned or retained account-weeks after the cutoff to validate out-of-time: the scores are unvalidated. Treat them as a ranking, not a forecast." };
}

/** Fixed-weight index used until there is enough history to train: silence and falling activity. 0..1. */
export function heuristicRisk(w) {
  const silence = Math.min(w.daysSilent, 30) / 30, drop = w.ePrev7 > 0 ? Math.max(0, 1 - w.e7 / w.ePrev7) : w.e7 === 0 ? 0.5 : 0;
  const thin = w.activeDays14 <= 2 ? 1 : w.activeDays14 <= 5 ? 0.4 : 0;
  return Math.min(1, 0.5 * silence + 0.3 * drop + 0.2 * thin);
}
const heuristicReasons = (w) => FEATURES.filter((f) => ["daysSilent", "trend", "activeDays14"].includes(f.key)).filter((f) => (f.key === "daysSilent" ? w.daysSilent >= 7 : f.key === "trend" ? w.ePrev7 > w.e7 : w.activeDays14 <= 5)).map((f) => f.why(w));

/** Score every active (not churned) account as of `now`, highest risk first, each with up to three reasons. */
export function score(accounts, trained, now) {
  const rows = [];
  for (const [id, a] of Object.entries(accounts)) {
    if (a.churnedAt != null || now - a.signupAt < 14 * DAY) continue;
    const w = windowAt(a, now), x = vectorOf(w);
    if (trained.mode === "model") {
      const { p, contrib } = predict(trained.model, x), z = x.map((v, j) => (v - trained.model.mean[j]) / trained.model.sd[j]);
      const reasons = contrib.map((c, j) => ({ c, j })).filter((r) => r.c > 0.15 && (FEATURES[r.j].bad === "low" ? z[r.j] < 0 : z[r.j] > 0)).sort((a2, b2) => b2.c - a2.c).slice(0, 3).map((r) => FEATURES[r.j].why(w));
      rows.push({ id, risk: p, calibrated: true, reasons, lastSeenDaysAgo: Math.floor(w.daysSilent) });
    } else rows.push({ id, risk: heuristicRisk(w), calibrated: false, reasons: heuristicReasons(w).slice(0, 3), lastSeenDaysAgo: Math.floor(w.daysSilent) });
  }
  return rows.sort((a, b) => b.risk - a.risk);
}

/** The risk level at which an account is called "at risk" (for alerts and the summary count). */
export const threshold = (trained) => (trained.mode === "model" ? Math.max(0.3, Math.min(0.9, trained.model.baseRate * 3)) : 0.6);

export function prune(state, now) {
  for (const [id, ts] of Object.entries(state.seen)) if (now - ts > 60 * DAY) delete state.seen[id];
  for (const [id, ts] of Object.entries(state.alerted)) if (now - ts > 60 * DAY) delete state.alerted[id];
}

/** How many active accounts sit at or above the at-risk threshold. */
export function summarize(rows, trained) {
  const th = threshold(trained);
  return { atRisk: rows.filter((r) => r.risk >= th).length, active: rows.length, threshold: th };
}

// ---- demo data: synthetic, seeded, clearly labelled wherever it is shown ----
export function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Synthetic accounts whose churn is driven by fading activity; used for the page demo and tests. */
export function syntheticAccounts(now, { n = 400, seed = 7 } = {}) {
  const rnd = mulberry32(seed), accounts = {};
  const types = ["login", "create_project", "invite", "export", "api_call", "report"];
  for (let i = 0; i < n; i++) {
    const signupAt = now - Math.floor(rnd() * 240 + 20) * DAY, will = rnd() < 0.35;
    const fadeStart = signupAt + (20 + rnd() * 80) * DAY, base = 0.4 + rnd() * 2.2, events = [];
    let churnedAt = null;
    for (let d = signupAt; d < now; d += DAY) {
      let rate = base; if (will && d > fadeStart) rate *= Math.max(0, 1 - (d - fadeStart) / (25 * DAY));
      if (will && churnedAt == null && d > fadeStart + (22 + rnd() * 18) * DAY) { churnedAt = d; break; }
      let k = rate; while (k > 0) { if (rnd() < Math.min(1, k)) events.push([d + Math.floor(rnd() * DAY), types[Math.floor(rnd() * Math.min(types.length, 1 + base * 2))]]); k -= 1; }
    }
    events.sort((a, b) => a[0] - b[0]);
    accounts[`acct_${i}`] = { signupAt, churnedAt, events };
  }
  return accounts;
}

/** Parse a pasted CSV export: `account,date[,event_type]` rows, plus a second list of `account,churn_date`. */
export function parseCsv(eventsText, churnText) {
  const accounts = {}, errors = [];
  const rows = (t) => String(t || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^account\b/i.test(l)).map((l) => l.split(",").map((s) => s.trim()));
  rows(eventsText).forEach((r, i) => {
    const ts = Date.parse(r[1]);
    if (!ID.test(r[0] || "") || !Number.isFinite(ts)) { if (errors.length < 5) errors.push(`event line ${i + 1}: "${r.join(",")}" needs account,date[,type]`); return; }
    const a = accounts[r[0]] ||= { signupAt: ts, churnedAt: null, events: [] };
    a.events.push([ts, (r[2] || "event").slice(0, 60)]); if (ts < a.signupAt) a.signupAt = ts;
  });
  for (const a of Object.values(accounts)) a.events.sort((x, y) => x[0] - y[0]);
  rows(churnText).forEach((r, i) => {
    const ts = Date.parse(r[1]);
    if (!accounts[r[0]] || !Number.isFinite(ts)) { if (errors.length < 5) errors.push(`churn line ${i + 1}: "${r.join(",")}" must name an account that has events, then a date`); return; }
    accounts[r[0]].churnedAt = ts;
  });
  return { accounts, errors };
}
