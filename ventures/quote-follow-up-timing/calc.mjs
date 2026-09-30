// Quote follow-up timing. Pure functions, no DOM, no network.
// Model: competing risks on "days since the quote was sent". Each quote ends in a win, a
// loss, or is still open (right-censored at its age). The Aalen-Johansen estimator gives
// the cumulative share won by day d, F(d), without pretending open quotes were losses or
// dropping them. "Eventual win rate" is F at the latest day any quote was ever won, so the
// estimate never extrapolates past what the history shows. For an open quote of age a, the
// chance it still wins is (F(H) - F(a)) / S(a), S = share not yet decided. Uncertainty
// comes from a seeded bootstrap of whole quotes, so a result is reproducible.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_QUOTES = 25;
const MIN_CLASS = 6; // quotes won and quotes lost, each
const MIN_WIN_DAYS = 4; // distinct win times, or there is no timing to learn from
const MIN_AT_RISK = 5;
const BOOT = 300;
const MAX_DAYS = 1000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

const WON = new Set(["1", "won", "win", "accepted", "accept", "signed", "booked", "sold", "closed won", "yes", "y", "true", "hired", "approved"]);
const LOST = new Set(["0", "lost", "loss", "declined", "decline", "rejected", "no", "n", "false", "closed lost", "went elsewhere", "passed", "cancelled", "canceled"]);
const OPEN = new Set(["", "open", "pending", "waiting", "sent", "no answer", "no reply", "undecided", "active", "outstanding"]);
export function parseOutcome(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (WON.has(t)) return "won";
  if (LOST.has(t)) return "lost";
  if (OPEN.has(t)) return "open";
  return null;
}

// Rows: days, outcome, optional value. `days` is days from sending to the decision, or to
// today for a quote still open. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per quote: days since it was sent, the outcome (won, lost or open), and optionally its value." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { days: 0, res: 1, val: 2 };
  const first = rows[0];
  if (first.some((c) => /[a-z]/i.test(c)) && !Number.isFinite(Number(first[0]))) {
    const head = first.map((h) => h.toLowerCase());
    const find = (re, skip = []) => head.findIndex((h, i) => !skip.includes(i) && re.test(h));
    const days = find(/day|age|wait|elapsed|time/);
    const res = find(/outcome|result|status|won|lost|state/, [days]);
    const val = find(/value|amount|price|total|\$|quote/, [days, res]);
    ci = { days: days >= 0 ? days : 0, res: res >= 0 ? res : 1, val };
    rows = rows.slice(1);
  }
  const out = [];
  let skipped = 0;
  rows.forEach((c) => {
    const days = Number(String(c[ci.days] ?? "").trim());
    const outcome = parseOutcome(c[ci.res]);
    const v = ci.val >= 0 && c[ci.val] !== undefined && c[ci.val] !== "" ? moneyNum(c[ci.val]) : NaN;
    if (!Number.isFinite(days) || days < 0 || days > MAX_DAYS || outcome === null || String(c[ci.days] ?? "").trim() === "") { skipped++; return; }
    out.push({ days, outcome, value: Number.isFinite(v) && v >= 0 ? v : null });
  });
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped: days must be 0 to ${MAX_DAYS} and the outcome one of won, lost or open.`);
  if (!out.length) return { error: "No readable rows. Each row needs days since sent and won, lost or open." };
  return { rows: out, warnings };
}

// Aalen-Johansen cumulative incidence of winning. Open quotes leave the risk set at their age.
function incidence(rows) {
  const times = [...new Set(rows.filter((r) => r.outcome !== "open").map((r) => r.days))].sort((a, b) => a - b);
  let S = 1, F = 0;
  const steps = [];
  for (const t of times) {
    const atRisk = rows.filter((r) => r.days >= t).length;
    let w = 0, l = 0;
    for (const r of rows) if (r.days === t) { if (r.outcome === "won") w++; else if (r.outcome === "lost") l++; }
    if (atRisk > 0) { F += (S * w) / atRisk; S *= 1 - (w + l) / atRisk; }
    steps.push({ t, F, S, atRisk, won: w, lost: l });
  }
  return steps;
}
const at = (steps, d, key, init) => {
  let v = init;
  for (const s of steps) { if (s.t <= d) v = s[key]; else break; }
  return v;
};

function summarize(rows) {
  const steps = incidence(rows);
  const winTimes = rows.filter((r) => r.outcome === "won").map((r) => r.days);
  const H = winTimes.length ? Math.max(...winTimes) : 0;
  const plateau = at(steps, H, "F", 0);
  const dayFor = (q) => {
    if (!(plateau > 0)) return null;
    for (const s of steps) if (s.F / plateau >= q - 1e-12) return s.t;
    return H;
  };
  return { steps, H, plateau, day50: dayFor(0.5), day80: dayFor(0.8), day90: dayFor(0.9) };
}

const remaining = (sm, a) => {
  if (a >= sm.H) return { p: 0, atRisk: rowsAtRisk(sm, a), S: at(sm.steps, a, "S", 1) };
  const S = at(sm.steps, a, "S", 1);
  const p = S > 0 ? Math.max(0, (sm.plateau - at(sm.steps, a, "F", 0)) / S) : 0;
  return { p: Math.min(1, p), atRisk: rowsAtRisk(sm, a), S };
};
function rowsAtRisk(sm, a) {
  let n = null;
  for (const s of sm.steps) { if (s.t <= a) n = s.atRisk; else break; }
  // before the first event everyone is at risk
  return n === null ? (sm.steps[0]?.atRisk ?? 0) : n;
}

const quantile = (xs, q) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};

export function analyze(rowsIn, opts = {}) {
  const warnings = [];
  let rows = rowsIn.map((r) => ({ ...r }));
  const give = Number(opts.giveUpDays);
  let gaveUp = 0;
  if (Number.isFinite(give) && give > 0) {
    rows = rows.map((r) => {
      if (r.outcome === "open" && r.days >= give) { gaveUp++; return { ...r, outcome: "lost" }; }
      return r;
    });
    if (gaveUp) warnings.push(`${gaveUp} open quote${gaveUp === 1 ? "" : "s"} older than ${give} days counted as lost, as you asked.`);
  }
  const n = rows.length;
  const won = rows.filter((r) => r.outcome === "won").length;
  const lost = rows.filter((r) => r.outcome === "lost").length;
  const open = rows.filter((r) => r.outcome === "open");
  if (n < MIN_QUOTES) return { error: `Need at least ${MIN_QUOTES} quotes; you gave ${n}. Pool every quote you can, including old ones.` };
  if (won < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} won quotes to learn when wins arrive; you gave ${won}.` };
  if (lost < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} quotes recorded as lost; you gave ${lost}. If dead quotes stay "open" forever, mark them lost, or set "treat open quotes older than ... days as lost".` };
  const sm = summarize(rows);
  const distinctWin = new Set(rows.filter((r) => r.outcome === "won").map((r) => r.days)).size;
  if (distinctWin < MIN_WIN_DAYS) return { error: `Won quotes need at least ${MIN_WIN_DAYS} different decision times to show a pattern; yours have ${distinctWin}. If every win is recorded as day 0 or the same day, there is no timing to learn from.` };

  const decided = won + lost;
  const naive = won / decided;
  const ghosts = open.filter((r) => r.days > sm.H).length;
  if (open.length && ghosts / open.length > 0.3) warnings.push(`${ghosts} of ${open.length} open quotes are older than any quote you have ever won (${sm.H} days). They are shown at 0% and do not move the win rate, but they are probably dead: mark them lost. Dead quotes younger than that do bias the win rate upward, which is what the "treat open quotes older than ... days as lost" box is for.`);

  // Bootstrap whole quotes.
  const rand = mulberry32(20260930 + n * 31 + won);
  const plateaus = [], d80s = [], d50s = [], expWins = [];
  for (let b = 0; b < BOOT; b++) {
    const s = Array.from({ length: n }, () => rows[Math.floor(rand() * n)]);
    if (s.filter((r) => r.outcome === "won").length < 2) continue;
    const m = summarize(s);
    plateaus.push(m.plateau); d80s.push(m.day80); d50s.push(m.day50);
    expWins.push(s.filter((r) => r.outcome === "open").reduce((t, r) => t + remaining(m, r.days).p, 0) * (open.length / Math.max(1, s.filter((r) => r.outcome === "open").length)));
  }
  const range = (xs) => [quantile(xs, 0.1), quantile(xs, 0.9)];

  const hasValue = open.some((r) => r.value !== null);
  const openList = open.map((r) => {
    const m = remaining(sm, r.days);
    const thin = m.atRisk < MIN_AT_RISK || m.S < 0.05;
    return { days: r.days, value: r.value, chance: m.p, atRisk: m.atRisk, thin, expected: r.value !== null ? m.p * r.value : null, past: r.days >= sm.H };
  }).sort((a, b) => (hasValue ? (b.expected ?? -1) - (a.expected ?? -1) : b.chance - a.chance) || a.days - b.days);
  const expectedWins = openList.reduce((t, q) => t + q.chance, 0);
  const expectedValue = hasValue ? openList.reduce((t, q) => t + (q.expected ?? 0), 0) : null;

  // Cold day: first age with enough quotes at risk where a still-open quote has under 5% left.
  let coldDay = null;
  for (const s of sm.steps) {
    if (s.t >= sm.H) break;
    const m = remaining(sm, s.t);
    if (m.atRisk >= MIN_AT_RISK && m.S >= 0.05 && m.p < 0.05) { coldDay = s.t; break; }
  }

  const grid = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180].filter((d) => d <= Math.max(sm.H, 7));
  const curve = grid.map((d) => {
    const F = at(sm.steps, d, "F", 0);
    const m = remaining(sm, d);
    return { day: d, wonBy: F, shareOfWins: sm.plateau > 0 ? Math.min(1, F / sm.plateau) : 0, stillWins: d >= sm.H ? 0 : m.p, atRisk: m.atRisk };
  });

  const width = quantile(plateaus, 0.9) - quantile(plateaus, 0.1);
  const verdict = won >= 10 && lost >= 10 && width <= 0.3 && Number.isFinite(width) ? "usable" : "weak";
  if (verdict === "weak") warnings.push("Few wins or losses, or a wide range on the win rate: read the numbers as rough.");

  return {
    n, won, lost, open: open.length, naiveWinRate: naive, winRate: sm.plateau, winRange80: range(plateaus),
    horizon: sm.H, day50: sm.day50, day80: sm.day80, day90: sm.day90,
    day50Range80: range(d50s), day80Range80: range(d80s), coldDay,
    expectedWins, expectedWinsRange80: range(expWins), expectedValue, hasValue,
    openQuotes: openList, curve, gaveUp, ghosts, verdict, warnings,
  };
}

export function reportCsv(r) {
  const head = "days_open,chance_still_won,value,expected_value,note\n";
  return head + r.openQuotes.map((q) => [q.days, q.chance.toFixed(3), q.value ?? "", q.expected === null ? "" : q.expected.toFixed(2), q.past ? "older than any win" : q.thin ? "thin data" : ""].join(",")).join("\n") + "\n";
}

// Invented data for the "Load an example" button: 35% of quotes are eventually won, wins
// arrive around a week after sending, losses take about two weeks to be recorded.
export function sampleText() {
  const rand = mulberry32(7);
  const logn = (med, sd) => {
    const u = Math.max(1e-9, rand()), v = rand();
    return Math.max(0, Math.round(med * Math.exp(sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))));
  };
  const lines = ["days,outcome,value"];
  for (let i = 0; i < 120; i++) {
    const age = Math.floor(rand() * 90);
    const win = rand() < 0.35;
    const t = win ? logn(6, 0.7) : logn(14, 0.6);
    const value = 800 + Math.round(rand() * 6200 / 50) * 50;
    lines.push(`${t <= age ? t : age},${t <= age ? (win ? "won" : "lost") : "open"},${value}`);
  }
  return lines.join("\n");
}
