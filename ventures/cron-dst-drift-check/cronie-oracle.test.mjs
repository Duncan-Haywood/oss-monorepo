// Differential test: nextRuns() in UTC against an independent, brute-force
// oracle written from cronie's matching rule (src/cron.c, find_jobs; star
// flags from src/entry.c, set when a day field's first character is "*").
// The oracle shares no code with engine.mjs: its own field parser, and a
// minute-by-minute walk instead of the engine's day-then-hour/minute walk.
// In UTC there are no gaps or overlaps, so any difference is a matching bug.
import test from "node:test";
import assert from "node:assert/strict";
import { nextRuns, dayRuleNote } from "./engine.mjs";

const NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function bits(field, lo, hi) {
  const on = new Array(hi + 1).fill(false);
  for (const item of field.toLowerCase().split(",")) {
    const [range, stepText] = item.split("/");
    const step = stepText === undefined ? 1 : Number(stepText);
    const num = (t) => (t in NAMES ? NAMES[t] : Number(t));
    let a, b;
    if (range === "*") [a, b] = [lo, hi];
    else if (range.includes("-")) [a, b] = range.split("-").map(num);
    else a = b = num(range);
    for (let v = a; v <= b; v += step) on[v] = true;
  }
  return on;
}

function oracle(expr, fromMs, count) {
  const [mi, h, dom, mon, dow] = expr.split(" ");
  const M = bits(mi, 0, 59), H = bits(h, 0, 23), D = bits(dom, 1, 31), N = bits(mon, 1, 12), W = bits(dow, 0, 7);
  W[0] = W[0] || W[7]; // 7 is Sunday too
  const star = dom.startsWith("*") || dow.startsWith("*");
  const out = [];
  for (let t = fromMs; out.length < count && t < fromMs + 800 * 86400e3; t += 60e3) {
    const d = new Date(t);
    const dayOk = star
      ? D[d.getUTCDate()] && W[d.getUTCDay()]
      : D[d.getUTCDate()] || W[d.getUTCDay()];
    if (M[d.getUTCMinutes()] && H[d.getUTCHours()] && N[d.getUTCMonth() + 1] && dayOk) out.push(t);
  }
  return out;
}

// Deterministic PRNG (mulberry32), so a failure names a reproducible case.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomField(r, lo, hi, names) {
  const n = (k) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = r();
  if (pick < 0.25) return "*";
  if (pick < 0.4) return `*/${2 + Math.floor(r() * 4)}`;
  if (pick < 0.55) { const a = n(); const b = Math.min(hi, a + Math.floor(r() * 6)); return `${a}-${b}`; }
  if (pick < 0.65) { const a = n(); const b = Math.min(hi, a + 2 + Math.floor(r() * 8)); return `${a}-${b}/${2 + Math.floor(r() * 3)}`; }
  if (pick < 0.75 && names) return names[Math.floor(r() * names.length)];
  if (pick < 0.88) return [n(), n(), n()].join(",");
  return String(n());
}

test("nextRuns matches the cronie-rule oracle on 400 seeded random expressions (UTC)", () => {
  const r = rng(20261119);
  const from = Date.UTC(2027, 0, 1, 0, 0);
  let compared = 0;
  for (let i = 0; i < 400; i += 1) {
    // Keep minute/hour narrow so the minute-by-minute oracle stays fast.
    const expr = [
      String(Math.floor(r() * 60)),
      r() < 0.5 ? String(Math.floor(r() * 24)) : `${Math.floor(r() * 12)},${12 + Math.floor(r() * 12)}`,
      randomField(r, 1, 31),
      randomField(r, 1, 12, ["JAN", "MAR-JUN", "nov,dec"]),
      randomField(r, 0, 7, ["MON-FRI", "SUN", "sat,sun", "7"]),
    ].join(" ");
    const want = oracle(expr, from, 6);
    // The engine scans at least 800 real days (a skipped month counts as one
    // scanned day, so it can see further); compare inside the oracle's window.
    const got = nextRuns(expr, "UTC", { from: new Date(from), count: 6 }).occurrences
      .map((o) => o.utc).filter((t) => t < from + 800 * 86400e3);
    assert.deepEqual(got, want, `expression "${expr}"`);
    compared += want.length;
  }
  assert.ok(compared > 1000, `compared ${compared} run times`);
});

test("a stepped star day-of-month ANDs with a restricted weekday, as cronie does", () => {
  const got = nextRuns("0 0 */2 * MON", "UTC", { from: new Date(Date.UTC(2027, 0, 1)), count: 4 })
    .occurrences.map((o) => new Date(o.utc).toISOString().slice(0, 10));
  // Odd days of January/February 2027 that are Mondays; Jan 4 and 18 are even Mondays.
  assert.deepEqual(got, ["2027-01-11", "2027-01-25", "2027-02-01", "2027-02-15"]);
});

test("a stepped star day-of-week ANDs with a restricted day-of-month", () => {
  // */2 on 0-7 is Sun, Tue, Thu, Sat; the 13th of 2027 months falling on one of those.
  const got = nextRuns("0 9 13 * */2", "UTC", { from: new Date(Date.UTC(2027, 0, 1)), count: 3 })
    .occurrences.map((o) => new Date(o.utc).toISOString().slice(0, 10));
  assert.deepEqual(got, ["2027-02-13", "2027-03-13", "2027-04-13"]);
});

test("dayRuleNote speaks only when implementations disagree", () => {
  assert.equal(dayRuleNote("0 0 * * MON"), null);
  assert.equal(dayRuleNote("0 0 15 * MON"), null);
  assert.equal(dayRuleNote("0 0 */2 * *"), null);
  assert.equal(dayRuleNote("not a cron"), null);
  assert.match(dayRuleNote("0 0 */2 * MON"), /day-of-month "\*\/2" starts with "\*"/);
  assert.match(dayRuleNote("0 9 13 * */2"), /day-of-week "\*\/2"/);
});
