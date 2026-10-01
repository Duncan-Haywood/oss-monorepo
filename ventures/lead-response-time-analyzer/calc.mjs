// Lead response time analyzer. Pure functions, no DOM, no network.
// Input: one row per inbound lead -- minutes until the first reply (blank = never answered), and
// whether it was won. Output: win rate by response-time band with Wilson intervals, a logistic fit
// of won on ln(1 + minutes) with a seeded bootstrap interval, and a what-if: the extra wins if every
// slower-than-target lead had been answered at the target. The what-if uses the fitted curve, not the
// raw gap between bands, and is labelled an association: fast replies and good leads can travel together.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

export const BANDS = [
  { key: "5", label: "Within 5 min", max: 5 },
  { key: "15", label: "5–15 min", max: 15 },
  { key: "60", label: "15–60 min", max: 60 },
  { key: "240", label: "1–4 hours", max: 240 },
  { key: "1440", label: "4–24 hours", max: 1440 },
  { key: "over", label: "Over 24 hours", max: Infinity },
];
const MIN_LEADS = 40, MIN_CLASS = 8, MIN_SPREAD = 0.3, BOOT = 300;

const WON = new Set(["1", "won", "win", "booked", "sold", "yes", "y", "true", "hired", "closed won", "converted"]);
const LOST = new Set(["0", "lost", "no", "n", "false", "unsold", "not hired", "closed lost", "dead", "no sale"]);
export function parseOutcome(s) {
  const t = String(s).trim().toLowerCase();
  if (WON.has(t)) return 1;
  if (LOST.has(t)) return 0;
  return null;
}

// "12", "12 min", "1h 30m", "1:30" (h:mm), "2 hours", "1 day"; blank/never/none = never answered (Infinity).
export function parseMinutes(s) {
  const t = String(s).trim().toLowerCase();
  if (t === "" || /^(never|none|no reply|no response|unanswered|n\/a|na|-)$/.test(t)) return Infinity;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*d(?:ays?)?)?\s*(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return NaN;
}
const moneyNum = (s) => {
  const t = String(s).trim().replace(/[$€£,\s]/g, "");
  return t === "" ? NaN : /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
};

// Columns by header name when there is one, else minutes, outcome, value. Date and source columns are ignored.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per lead: minutes until your first reply, and whether you won it." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; } else cur += ch; }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { min: 0, res: 1, val: 2 };
  if (Number.isNaN(parseMinutes(rows[0][0] ?? "")) || (parseOutcome(rows[0][1] ?? "") === null && rows[0].some((c) => /[a-z]/i.test(c)))) {
    const head = rows[0].map((h) => h.toLowerCase());
    const res = head.findIndex((h) => /won|outcome|result|status|booked|hired|closed/.test(h));
    const min = head.findIndex((h, i) => i !== res && /respon|reply|minute|speed|time|wait|first/.test(h) && !/date/.test(h));
    const val = head.findIndex((h, i) => i !== res && i !== min && /value|revenue|job|amount|price|\$/.test(h));
    ci = { min: min >= 0 ? min : 0, res: res >= 0 ? res : 1, val };
    rows = rows.slice(1);
  }
  if ((rows[0]?.length || 0) < 2) return { error: "Each row needs at least two values: minutes until first reply, and won or lost (1/0, won/lost, yes/no)." };
  const leads = [];
  let bad = 0;
  for (const r of rows) {
    const minutes = parseMinutes(r[ci.min] ?? ""), won = parseOutcome(r[ci.res] ?? "");
    if (Number.isNaN(minutes) || won === null || minutes < 0) { bad++; continue; }
    const v = ci.val >= 0 && ci.val !== undefined ? moneyNum(r[ci.val] ?? "") : NaN;
    leads.push({ minutes, won, value: Number.isFinite(v) && v > 0 ? v : null });
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because the reply time or the won/lost result could not be read. Leads still open belong out of this file.`);
  return { leads, warnings };
}

export function wilson(k, n, z = 1.96) {
  if (!n) return { lo: NaN, hi: NaN };
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - w) / d), hi: Math.min(1, (c + w) / d) };
}

const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One-variable logistic regression by Newton steps with a small ridge, predictor standardised.
export function fitLogit(x, y, ridge = 1e-3) {
  const n = x.length, m = mean(x), s = sd(x) || 1, z = x.map((v) => (v - m) / s);
  let a = Math.log((mean(y) + 0.5 / n) / (1 - mean(y) + 0.5 / n)), b = 0;
  const nll = (a_, b_) => { let t = 0; for (let i = 0; i < n; i++) { const e = a_ + b_ * z[i]; t += Math.log1p(Math.exp(-Math.abs(e))) + Math.max(e, 0) - y[i] * e; } return t + 0.5 * ridge * b_ * b_ * n; };
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < n; i++) { const p = sigmoid(a + b * z[i]), w = p * (1 - p); g0 += p - y[i]; g1 += (p - y[i]) * z[i]; h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i]; }
    g1 += ridge * b * n; h11 += ridge * n;
    const det = h00 * h11 - h01 * h01;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
    const d0 = (h11 * g0 - h01 * g1) / det, d1 = (-h01 * g0 + h00 * g1) / det, f0 = nll(a, b);
    let step = 1;
    while (step > 1e-6 && !(nll(a - step * d0, b - step * d1) <= f0 + 1e-12)) step /= 2;
    a -= step * d0; b -= step * d1;
    if (Math.abs(step * d0) < 1e-9 && Math.abs(step * d1) < 1e-9) break;
  }
  return { a: a - (b * m) / s, b: b / s };
}

const xOf = (minutes) => Math.log1p(minutes);
const bandOf = (mins) => BANDS.findIndex((b) => mins <= b.max);

// Answered leads drive the curve. Unanswered leads are reported separately and never enter the fit:
// "never" is not a long time, it is a different event.
export function analyze(leads, opts = {}) {
  const o = { targetMin: 5, leadsPerMonth: undefined, avgValue: undefined, ...opts };
  const warnings = [];
  if (!(o.targetMin > 0)) return { error: "Enter a target reply time greater than zero minutes." };
  if (leads.length < MIN_LEADS) return { error: `Need at least ${MIN_LEADS} leads to say anything about reply time; you gave ${leads.length}. With fewer, one lucky week decides the answer.` };
  const answered = leads.filter((l) => Number.isFinite(l.minutes)), never = leads.filter((l) => !Number.isFinite(l.minutes));
  const wonA = answered.filter((l) => l.won).length, lostA = answered.length - wonA;
  if (answered.length < MIN_LEADS) return { error: `Only ${answered.length} of ${leads.length} leads have a reply time; need ${MIN_LEADS}.` };
  if (wonA < MIN_CLASS || lostA < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} won and ${MIN_CLASS} lost answered leads; found ${wonA} won and ${lostA} lost.` };
  const xs = answered.map((l) => xOf(l.minutes));
  if (sd(xs) < MIN_SPREAD) return { error: "Reply times barely vary (nearly all leads were answered in about the same time), so there is nothing to compare. Come back when the log mixes fast and slow replies." };

  const bands = BANDS.map((b, i) => {
    const ls = answered.filter((l) => bandOf(l.minutes) === i), w = ls.filter((l) => l.won).length, ci = wilson(w, ls.length);
    return { ...b, n: ls.length, won: w, rate: ls.length ? w / ls.length : NaN, lo: ci.lo, hi: ci.hi, thin: ls.length < 10 };
  });
  const nv = { n: never.length, won: never.filter((l) => l.won).length };
  nv.rate = nv.n ? nv.won / nv.n : NaN;

  const y = answered.map((l) => l.won);
  const fit = fitLogit(xs, y);
  const at = (mins, f = fit) => sigmoid(f.a + f.b * xOf(mins));
  const target = o.targetMin;
  const slow = answered.filter((l) => l.minutes > target);
  const lift = (f) => slow.reduce((s, l) => s + Math.max(0, at(target, f) - at(l.minutes, f)), 0);
  const winsGained = lift(fit);

  // Seeded bootstrap of the whole what-if, stratified by outcome so every resample keeps wins and losses.
  const rnd = mulberry32(20260930);
  const W = answered.filter((l) => l.won), L = answered.filter((l) => !l.won), draws = [], slopes = [];
  for (let k = 0; k < BOOT; k++) {
    const s = [];
    for (let i = 0; i < W.length; i++) s.push(W[Math.floor(rnd() * W.length)]);
    for (let i = 0; i < L.length; i++) s.push(L[Math.floor(rnd() * L.length)]);
    const f = fitLogit(s.map((l) => xOf(l.minutes)), s.map((l) => l.won));
    slopes.push(f.b);
    const sl = s.filter((l) => l.minutes > target);
    draws.push(sl.reduce((t, l) => t + Math.max(0, at(target, f) - at(l.minutes, f)), 0) * (answered.length ? leads.length / answered.length : 1));
  }
  draws.sort((p, q) => p - q); slopes.sort((p, q) => p - q);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const scale = leads.length / answered.length;
  const slopeLo = q(slopes, 0.05), slopeHi = q(slopes, 0.95);
  const slopeSignificant = slopeHi < 0 || slopeLo > 0;

  const values = leads.filter((l) => l.won && l.value).map((l) => l.value);
  const avgValue = o.avgValue ?? (values.length >= 3 ? mean(values) : undefined);
  const n = leads.length, monthly = o.leadsPerMonth ?? undefined;
  const perLead = (winsGained * scale) / n;
  const r = {
    n, nAnswered: answered.length, nNever: never.length, wins: leads.filter((l) => l.won).length,
    overallRate: leads.filter((l) => l.won).length / n,
    bands, never: nv, fit, slopeLo, slopeHi, slopeSignificant,
    rateAtTarget: at(target), medianMinutes: [...answered.map((l) => l.minutes)].sort((p, q2) => p - q2)[Math.floor(answered.length / 2)],
    slowShare: slow.length / answered.length, winsGained: winsGained * scale, winsLo: q(draws, 0.05), winsHi: q(draws, 0.95), perLead,
    avgValue, monthly, target, options: o, warnings,
  };
  r.winsPerMonth = monthly ? perLead * monthly : undefined;
  r.revenuePerMonth = monthly && avgValue ? r.winsPerMonth * avgValue : undefined;
  r.revenueLo = monthly && avgValue ? (q(draws, 0.05) / n) * monthly * avgValue : undefined;
  r.revenueHi = monthly && avgValue ? (q(draws, 0.95) / n) * monthly * avgValue : undefined;
  if (!slopeSignificant) warnings.push("The downward trend with reply time is not distinguishable from noise at this sample size (the 90% interval on the slope includes zero). Treat the what-if as a ceiling, not an estimate.");
  if (nv.n >= 5 && nv.rate > 0.5 * (r.overallRate || 0) && nv.rate > 0) warnings.push("Unanswered leads still won at a rate close to answered ones. Check that \"never answered\" here does not mean \"answered by phone without logging it\".");
  if (bands.filter((b) => b.n >= 10).length < 3) warnings.push("Fewer than three reply-time bands have 10 or more leads, so the band table is thin; the fitted curve carries the result.");
  if (answered.length !== n) warnings.push(`${never.length} unanswered lead(s) are reported separately and do not enter the curve.`);
  if (r.fit.b >= 0) warnings.push("In your log, slower replies won as often or more. Fast replies may go to the easy leads and slow ones to the hard ones, or the log may record the reply time after the sale. The what-if shows no gain.");
  return r;
}

export function reportCsv(r) {
  const rows = [["band", "leads", "won", "win_rate", "low_95", "high_95"]];
  for (const b of r.bands) rows.push([b.label, b.n, b.won, Number.isFinite(b.rate) ? b.rate.toFixed(4) : "", Number.isFinite(b.lo) ? b.lo.toFixed(4) : "", Number.isFinite(b.hi) ? b.hi.toFixed(4) : ""]);
  rows.push(["Never answered", r.never.n, r.never.won, Number.isFinite(r.never.rate) ? r.never.rate.toFixed(4) : "", "", ""]);
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}

// Invented demonstration data: 240 leads, win chance falling with reply time, some never answered.
export function sampleText() {
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const out = ["minutes to first reply,won,job value"];
  for (let i = 0; i < 240; i++) {
    const u = rnd();
    if (u < 0.08) { out.push(`never,${rnd() < 0.04 ? 1 : 0},`); continue; }
    const mins = Math.round(Math.exp(Math.log(2) + rnd() * Math.log(1500)));
    const p = 1 / (1 + Math.exp(-(0.2 - 0.3 * Math.log1p(mins) + 0.9)));
    const won = rnd() < p ? 1 : 0;
    out.push(`${mins},${won},${won ? Math.round(900 + rnd() * 1800) : ""}`);
  }
  return out.join("\n");
}
