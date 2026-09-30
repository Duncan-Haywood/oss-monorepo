import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, normalize, waterfallAt, breakpoints, sampleTerms, reportCsv, money, pct } from "./calc.mjs";

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const base = (over = {}) => ({
  exit: "10000000", debt: "0", feePct: "0", carvePct: "0",
  common: [{ name: "Founders", shares: "1000000" }], options: [],
  preferred: [{ name: "A", invested: "1000000", shares: "250000", multiple: "1", participation: "none", rank: "1" }],
  ...over,
});
const pay = (w, name) => w.rows.find((r) => r.name === name).payout;

test("non-participating preferred takes its preference when the exit is small", () => {
  const w = waterfallAt(normalize(base()), 500000);
  near(pay(w, "A"), 500000);
  near(pay(w, "Founders"), 0);
});

test("non-participating preferred converts once its share beats the preference", () => {
  const m = normalize(base());
  const low = waterfallAt(m, 4000000); // 20% of 4M = 800k < 1M preference
  assert.equal(low.converts[0], false);
  near(pay(low, "A"), 1000000);
  near(pay(low, "Founders"), 3000000);
  const high = waterfallAt(m, 10000000);
  assert.equal(high.converts[0], true);
  near(pay(high, "A"), 2000000);
  near(pay(high, "Founders"), 8000000);
});

test("the conversion breakpoint is the price at which the shares equal the preference", () => {
  const points = breakpoints(normalize(base()));
  near(points.find((p) => p.kind === "convert").exit, 5000000, 5);
  near(points.find((p) => p.kind === "common").exit, 1000000, 5);
});

test("full participation collects the preference and then its share of the rest", () => {
  const w = waterfallAt(normalize(base({ preferred: [{ name: "A", invested: "1000000", shares: "250000", participation: "full", rank: "1" }] })), 10000000);
  near(pay(w, "A"), 1000000 + 0.2 * 9000000);
  near(pay(w, "Founders"), 0.8 * 9000000);
});

test("capped participation stops at the cap and converts once conversion is worth more", () => {
  const m = normalize(base({ preferred: [{ name: "A", invested: "1000000", shares: "250000", participation: "capped", cap: "2", rank: "1" }] }));
  const mid = waterfallAt(m, 8000000); // 1M + 20% of 7M = 2.4M, capped at 2M
  near(pay(mid, "A"), 2000000);
  near(pay(mid, "Founders"), 6000000);
  const high = waterfallAt(m, 20000000); // 20% of 20M = 4M beats the 2M cap
  assert.equal(high.converts[0], true);
  near(pay(high, "A"), 4000000);
});

test("a liquidation multiple scales the preference", () => {
  const w = waterfallAt(normalize(base({ preferred: [{ name: "A", invested: "1000000", shares: "250000", multiple: "2", participation: "none", rank: "1" }] })), 1500000);
  near(pay(w, "A"), 1500000);
});

test("cumulative dividends add to the preference", () => {
  const w = waterfallAt(normalize(base({ preferred: [{ name: "A", invested: "1000000", shares: "250000", participation: "none", rank: "1", dividend: "10", years: "3" }] })), 1200000);
  near(pay(w, "A"), 1200000); // claim is 1.3M, exit is 1.2M
  const w2 = waterfallAt(normalize(base({ preferred: [{ name: "A", invested: "1000000", shares: "250000", participation: "none", rank: "1", dividend: "10", years: "3" }] })), 1500000);
  near(pay(w2, "A"), 1300000);
  near(pay(w2, "Founders"), 200000);
});

test("senior series are paid before junior ones", () => {
  const m = normalize(base({ preferred: [
    { name: "Junior", invested: "3000000", shares: "100000", participation: "none", rank: "2" },
    { name: "Senior", invested: "2000000", shares: "100000", participation: "none", rank: "1" },
  ] }));
  const w = waterfallAt(m, 3000000);
  near(pay(w, "Senior"), 2000000);
  near(pay(w, "Junior"), 1000000);
});

test("equal seniority shares a shortfall in proportion to the claims", () => {
  const m = normalize(base({ preferred: [
    { name: "X", invested: "3000000", shares: "100000", participation: "none", rank: "1" },
    { name: "Y", invested: "1000000", shares: "100000", participation: "none", rank: "1" },
  ] }));
  const w = waterfallAt(m, 2000000);
  near(pay(w, "X"), 1500000);
  near(pay(w, "Y"), 500000);
});

test("options are paid the spread over the strike and nothing when underwater", () => {
  const m = normalize(base({ preferred: [], options: [{ name: "Opts", shares: "1000000", strike: "1" }] }));
  // 2M shares in all: (10M + 1M strike) / 2M = 5.5 a share, options net 4.5.
  const w = waterfallAt(m, 10000000);
  near(pay(w, "Opts"), 4500000);
  near(pay(w, "Founders"), 5500000);
  const dead = waterfallAt(m, 900000); // 0.45 a share, below the $1 strike
  near(pay(dead, "Opts"), 0);
  near(pay(dead, "Founders"), 900000);
});

test("debt, fees and the carve-out come off before shareholders are paid", () => {
  const m = normalize(base({ debt: "2000000", feePct: "5", carvePct: "10", preferred: [] }));
  const w = waterfallAt(m);
  near(w.fees, 500000);
  near(w.carve, 750000);
  near(w.net, 6750000);
  near(pay(w, "Founders"), 6750000);
});

test("payouts always add up to the net proceeds, at every point of the sweep", () => {
  const r = analyze(sampleTerms());
  for (const s of r.sweep) near(s.rows.reduce((t, x) => t + x.payout, 0), s.net, 0.5);
});

test("common stock is never paid less when the exit price rises", () => {
  const m = normalize(sampleTerms());
  let last = -1;
  for (let e = 0; e <= 400e6; e += 4e6) {
    const w = waterfallAt(m, e);
    const c = w.rows.filter((r) => r.group === "common").reduce((s, r) => s + r.payout, 0);
    assert.ok(c + 1e-3 >= last, `common fell at ${e}`);
    last = c;
  }
});

test("sample terms give sensible findings and breakpoints", () => {
  const r = analyze(sampleTerms());
  assert.ok(r.findings.length >= 3);
  assert.ok(r.points.length >= 2);
  assert.ok(r.points.every((p, i, a) => i === 0 || a[i - 1].exit <= p.exit));
  assert.match(reportCsv(r), /Net to shareholders/);
});

test("bad input is refused with a message", () => {
  assert.match(analyze(base({ exit: "abc" })).error, /numbers/);
  assert.match(analyze(base({ common: [], options: [] })).error, /at least one common/);
  assert.match(analyze(base({ preferred: [{ name: "A", invested: "100", shares: "", rank: "1" }] })).error, /shares/);
  assert.match(analyze(base({ preferred: [{ name: "A", invested: "100", shares: "10", participation: "capped", cap: "", rank: "1" }] })).error, /cap/);
  assert.match(analyze(base({ feePct: "80" })).error, /between 0% and 50%/);
});

test("formatters", () => {
  assert.equal(money(1234567), "$1,234,567");
  assert.equal(pct(0.1234), "12.3%");
  assert.equal(money(null), "n/a");
});
