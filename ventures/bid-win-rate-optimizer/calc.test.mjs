import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, parseOutcome, fitLogit, analyze, sampleText, reportCsv } from "./calc.mjs";

// Deterministic simulated bids: P(win) = sigmoid(a + b * ln(markup)).
function bids({ n = 400, a = 0, b = -8, seed = 5, center = 1.3, spread = 0.15, withCost = true } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, () => {
    const cost = 2000 + rnd() * 20000;
    const markup = Math.exp(Math.log(center) + spread * gauss());
    const p = 1 / (1 + Math.exp(-(a + b * (Math.log(markup) - Math.log(center)))));
    return { price: cost * markup, cost: withCost ? cost : null, won: rnd() < p ? 1 : 0 };
  });
}

test("outcome words map to won and lost, and unknown words are not guessed", () => {
  for (const w of ["1", "Won", "YES", "accepted", "Awarded"]) assert.equal(parseOutcome(w), 1, w);
  for (const w of ["0", "Lost", "no", "declined", "Ghosted"]) assert.equal(parseOutcome(w), 0, w);
  assert.equal(parseOutcome("pending"), null);
  assert.equal(parseOutcome(""), null);
});

test("parseRows reads headers in any order, money formats, and skips unreadable rows", () => {
  const p = parseRows("Result,Cost,Quote\nwon,\"$1,000\",$1300\nlost,2000,2900\nmaybe,1,2\nwon,0,5");
  assert.equal(p.hasCost, false);
  const q = parseRows("Result,Cost,Quote\nwon,\"$1,000\",$1300\nlost,2000,2900\nmaybe,1,2");
  assert.equal(q.hasCost, true);
  assert.deepEqual(q.rows[0], { price: 1300, won: 1, cost: 1000 });
  assert.equal(q.rows.length, 2);
  assert.ok(q.warnings.some((w) => /skipped/.test(w)));
});

test("parseRows without a header reads price, won, optional cost, and tab or semicolon delimiters", () => {
  assert.equal(parseRows("1300,1\n1500,0").hasCost, false);
  assert.equal(parseRows("1300,1,1000\n1500,0,1100").hasCost, true);
  assert.equal(parseRows("1300\t1\t1000").rows[0].cost, 1000);
  assert.equal(parseRows("quote;won\n1300;yes").rows[0].won, 1);
});

test("a partly missing cost column is dropped with a warning instead of half-used", () => {
  const p = parseRows("quote,won,cost\n1300,1,1000\n1500,0,\n1600,1,1100");
  assert.equal(p.hasCost, false);
  assert.ok(p.rows.every((r) => r.cost === null));
  assert.ok(p.warnings.some((w) => /no readable cost/.test(w)));
});

test("empty and one-column input give an error", () => {
  assert.ok(parseRows("").error);
  assert.ok(parseRows("1300\n1500").error);
});

test("logit recovers a known slope and intercept from a large simulated sample", () => {
  const rows = bids({ n: 4000, a: 0.3, b: -8 });
  const xs = rows.map((r) => Math.log(r.price / r.cost) - Math.log(1.3));
  const f = fitLogit(xs, rows.map((r) => r.won));
  assert.ok(f.converged);
  assert.ok(Math.abs(f.b - -8) < 0.9, `slope ${f.b}`);
  assert.ok(Math.abs(f.a - 0.3) < 0.15, `intercept ${f.a}`);
  assert.ok(f.b - 1.96 * f.seB < -8 && -8 < f.b + 1.96 * f.seB, "95% interval covers the truth");
});

test("perfectly separated data stays finite and is flagged", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ price: 1000 * (1 + i * 0.02), cost: 1000, won: i < 20 ? 1 : 0 }));
  const f = fitLogit(rows.map((r) => Math.log(r.price / r.cost)), rows.map((r) => r.won));
  assert.ok(Number.isFinite(f.b));
  const r = analyze(rows);
  assert.ok(r.warnings.some((w) => /perfectly split/.test(w)));
});

test("analyze: a real curve is usable, the best markup is inside the tested range and near the analytic optimum", () => {
  const rows = bids({ n: 600, a: 0, b: -8 });
  const r = analyze(rows);
  assert.equal(r.verdict, "usable");
  assert.ok(r.slope < -6 && r.slope > -10, `slope ${r.slope}`);
  // analytic optimum of (m-1)*sigmoid(-8*ln(m/1.3)) by brute force
  let best = 0, bm = 1;
  for (let m = 1.01; m < 2; m += 0.001) { const v = (m - 1) / (1 + Math.exp(8 * Math.log(m / 1.3))); if (v > best) { best = v; bm = m; } }
  assert.ok(Math.abs(r.optimum.markup + 1 - bm) < 0.06, `got ${r.optimum.markup + 1} want ${bm}`);
  assert.ok(r.optimum.markup + 1 >= 1 + r.range.lo - 1e-9 && r.optimum.markup + 1 <= 1 + r.range.hi + 1e-9);
  assert.ok(r.optimum.priceRange80[0] <= r.optimum.price && r.optimum.price <= r.optimum.priceRange80[1]);
  assert.ok(r.optimum.gain >= 0 && r.optimum.pGain > 0.5);
});

test("the result is reproducible: the bootstrap is seeded", () => {
  const rows = bids({ n: 200 });
  const a = analyze(rows), b = analyze(rows);
  assert.deepEqual(a.optimum.priceRange80, b.optimum.priceRange80);
  assert.equal(a.optimum.pGain, b.optimum.pGain);
});

test("a flat curve (price does not matter) is not called usable", () => {
  const r = analyze(bids({ n: 300, b: 0, seed: 9 }));
  assert.notEqual(r.verdict, "usable");
});

test("a positive slope is unidentified and says why", () => {
  const r = analyze(bids({ n: 300, b: 6, seed: 4 }));
  assert.equal(r.verdict, "unidentified");
  assert.ok(r.warnings.some((w) => /easier to win/.test(w)));
});

test("refusals: too few bids, too few wins, flat quotes, too few levels", () => {
  assert.match(analyze(bids({ n: 20 })).error, /at least 30 bids/);
  const few = bids({ n: 60 }).map((r, i) => ({ ...r, won: i < 4 ? 1 : 0 }));
  assert.match(analyze(few).error, /wins and 8 losses/);
  const flat = bids({ n: 60, spread: 0 });
  assert.match(analyze(flat).error, /barely varied/);
  const two = bids({ n: 60 }).map((r, i) => ({ ...r, price: r.cost * (i % 2 ? 1.2 : 1.3) }));
  assert.match(analyze(two).error, /distinct/);
});

test("without a cost column the optimum needs a job cost, and a wide size range is warned about", () => {
  const rows = bids({ n: 200, withCost: false });
  const r = analyze(rows.map((x) => ({ ...x, price: x.price })), { hasCost: false });
  assert.equal(r.optimum, null);
  assert.ok(r.warnings.some((w) => /span/.test(w)));
  const r2 = analyze(rows, { hasCost: false, jobCost: 5000 });
  assert.ok(r2.optimum && Number.isFinite(r2.optimum.price));
});

test("scenarios are ordered, win chance falls as price rises, and untested ones are marked", () => {
  const r = analyze(bids({ n: 300 }));
  for (let i = 1; i < r.scenarios.length; i++) assert.ok(r.scenarios[i].winChance < r.scenarios[i - 1].winChance);
  assert.equal(r.scenarios[2].change, 0);
  assert.ok(r.scenarios.every((s) => typeof s.tested === "boolean"));
  assert.ok(r.sens.drop10 > 0);
});

test("bands cover every bid and the fitted rate tracks the observed rate on a real curve", () => {
  const r = analyze(bids({ n: 800 }));
  assert.equal(r.bands.reduce((s, b) => s + b.n, 0), 800);
  for (const b of r.bands) assert.ok(Math.abs(b.observed - b.fitted) < 0.12, JSON.stringify(b));
});

test("hold-out: knowing the price helps on a real curve", () => {
  const r = analyze(bids({ n: 400 }));
  assert.ok(r.holdout.helps);
  assert.ok(r.holdout.logLossModel < r.holdout.logLossBase);
});

test("the built-in example parses, analyses and is usable", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 90);
  const r = analyze(p.rows, { hasCost: p.hasCost });
  assert.equal(r.verdict, "usable");
  assert.ok(reportCsv(r).split("\n").length === 8);
});

// ---- job types ----
import { analyzeSegments, chi2Sf, fitGrouped } from "./calc.mjs";

function typed({ n = 600, seed = 11 } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  // repeat jobs are easy to win (a = +1.2), tenders hard (a = -1.2); same slope
  const types = [["repeat", 1.2], ["tender", -1.2], ["walk-in", 0]];
  return Array.from({ length: n }, (_, i) => {
    const [segment, a] = types[i % 3];
    const cost = 2000 + rnd() * 20000, markup = Math.exp(Math.log(1.3) + 0.15 * gauss());
    const p = 1 / (1 + Math.exp(-(a - 8 * (Math.log(markup) - Math.log(1.3)))));
    return { price: cost * markup, cost, won: rnd() < p ? 1 : 0, segment };
  });
}

test("chi-square survival matches known values", () => {
  assert.ok(Math.abs(chi2Sf(3.841, 1) - 0.05) < 1e-3);
  assert.ok(Math.abs(chi2Sf(5.991, 2) - 0.05) < 1e-3);
  assert.equal(chi2Sf(0, 3), 1);
});

test("parseRows reads a job-type column only when a header names one", () => {
  const p = parseRows("type,quote,won,cost\nrepeat,1300,1,1000\ntender,1500,0,1100");
  assert.equal(p.rows[0].segment, "repeat");
  assert.equal(p.rows[0].price, 1300);
  assert.equal(p.hasSegments, true);
  assert.equal("segment" in parseRows("quote,won,cost\n1300,1,1000").rows[0], false);
});

test("grouped fit recovers per-type intercepts and the shared slope", () => {
  const rows = typed({ n: 3000 });
  const g = rows.map((r) => ["repeat", "tender", "walk-in"].indexOf(r.segment));
  const f = fitGrouped(rows.map((r) => Math.log(r.price / r.cost)), rows.map((r) => r.won), g, 3);
  assert.ok(Math.abs(f.b - -8) < 1.2, `slope ${f.b}`);
  assert.ok(f.a[0] > f.a[2] && f.a[2] > f.a[1], "ordering of intercepts");
});

test("segments: types that differ are detected, and easy types can carry a higher markup", () => {
  const r = analyzeSegments(typed());
  assert.equal(r.differ, true);
  assert.ok(r.pValue < 0.001);
  const by = Object.fromEntries(r.segments.map((s) => [s.name, s]));
  assert.ok(by.repeat.winRate > by.tender.winRate);
  assert.ok(by.repeat.bestMarkup >= by.tender.bestMarkup);
  assert.ok(r.segments.every((s) => s.markupRange80[0] <= s.markupRange80[1]));
});

test("segments: identical types are not declared different, and thin data is refused", () => {
  const rows = typed({ n: 300, seed: 3 }).map((r, i) => ({ ...r, segment: ["a", "b", "c"][Math.floor(i / 100) % 3] }));
  const r = analyzeSegments(rows);
  assert.equal(r.differ, false);
  assert.ok(r.warnings.some((w) => /do not differ/.test(w)));
  assert.ok(analyzeSegments(typed({ n: 20 })).error);
  assert.ok(analyzeSegments(rows.map((x) => ({ ...x, cost: null }))).error);
  const small = typed({ n: 60 }).map((x, i) => ({ ...x, segment: i < 30 ? "big" : i < 55 ? "mid" : "t" + i }));
  const rs = analyzeSegments(small);
  assert.ok(rs.segments.some((s) => s.name === "Other (small groups)"));
});
