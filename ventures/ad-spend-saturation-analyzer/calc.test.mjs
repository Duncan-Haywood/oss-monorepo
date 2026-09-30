import { test } from "node:test";
import assert from "node:assert/strict";
import { parseData, analyze, fitLinear, fitSaturating, chooseModel, revenueAt, marginalAt, mulberry32, quantile, toNumber, parseDate, resultCsv, sampleText, num, MIN_OBS } from "./calc.mjs";

function synth({ c = 0, a = 5000, k = 1500, lo = 200, hi = 3000, n = 90, noise = 0.08, seed = 7 }) {
  const rng = mulberry32(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  return Array.from({ length: n }, (_, i) => {
    const s = lo + rng() * (hi - lo);
    return { t: i, s, r: (c + a * (1 - Math.exp(-s / k))) * (1 + noise * g()) };
  });
}

test("toNumber reads currency, thousands separators and brackets", () => {
  assert.equal(toNumber("$1,234.50"), 1234.5);
  assert.equal(toNumber("(200)"), -200);
  assert.equal(toNumber("-5"), -5);
  assert.equal(toNumber("abc"), null);
  assert.equal(toNumber(""), null);
});

test("parseDate accepts ISO, US slash and month-name forms and rejects impossible dates", () => {
  assert.equal(parseDate("2026-03-05"), Date.UTC(2026, 2, 5));
  assert.equal(parseDate("3/5/2026"), Date.UTC(2026, 2, 5));
  assert.equal(parseDate("Mar 5, 2026"), Date.UTC(2026, 2, 5));
  assert.equal(parseDate("2026-02-31"), null);
  assert.equal(parseDate("nonsense"), null);
});

test("parseData handles a header, channels, tabs and a headerless four-column file", () => {
  const a = parseData("date,channel,spend,revenue\n2026-01-01,Search,100,400\n2026-01-01,Meta,50,90\n2026-01-02,Search,120,450");
  assert.equal(a.channels.length, 2);
  assert.equal(a.channels.find((c) => c.name === "Search").points.length, 2);
  const b = parseData("Date\tCost\tConversion value\n2026-01-01\t10\t30\n2026-01-02\t20\t50");
  assert.equal(b.channels[0].name, "All spend");
  assert.equal(b.channels[0].points[1].r, 50);
  const c = parseData("2026-01-01,Search,100,400\n2026-01-02,Search,110,420");
  assert.equal(c.channels[0].points.length, 2);
  const d = parseData("100,400\n110,420");
  assert.equal(d.period, "row");
});

test("parseData sums duplicate day rows, groups by week, and reports skipped and negative rows", () => {
  const rows = ["date,channel,spend,revenue", "2026-01-05,S,10,20", "2026-01-05,S,10,20", "2026-01-06,S,5,10", "2026-01-13,S,7,9", "bad,S,1,1", "2026-01-14,S,-5,1"].join("\n");
  const day = parseData(rows);
  assert.equal(day.channels[0].points.find((p) => p.s === 20).r, 40);
  assert.match(day.warnings.join(" "), /1 row\(s\) skipped/);
  assert.match(day.warnings.join(" "), /negative spend/);
  const wk = parseData(rows, { period: "weekly" });
  assert.equal(wk.channels[0].points.length, 2);
  assert.equal(wk.channels[0].points[0].s, 25);
});

test("parseData errors are specific", () => {
  assert.match(parseData("").error, /Paste or upload/);
  assert.match(parseData("date,channel,notes\n2026-01-01,a,b").error, /spend column/);
  assert.match(parseData("spend,revenue\nx,y").error, /No usable rows/);
});

test("the saturating fit recovers a known curve within noise", () => {
  const pts = synth({ a: 5000, k: 1500, n: 200, noise: 0.05 });
  const m = fitSaturating(pts);
  assert.ok(m.k > 1500 * 0.6 && m.k < 1500 * 1.5, `k=${m.k}`);
  assert.ok(m.a > 5000 * 0.8 && m.a < 5000 * 1.3, `a=${m.a}`);
});

test("model choice picks saturation for a curved response and linear for a straight one", () => {
  assert.equal(chooseModel(synth({ a: 5000, k: 800, hi: 4000, n: 150 })).model.type, "saturating");
  const rng = mulberry32(3);
  const straight = Array.from({ length: 120 }, (_, i) => { const s = 100 + rng() * 2000; return { t: i, s, r: 50 + 2.5 * s * (1 + 0.05 * (rng() - 0.5)) }; });
  const c = chooseModel(straight);
  assert.equal(c.model.type, "linear");
  assert.ok(Math.abs(c.model.a - 2.5) < 0.2);
});

test("marginal return is the derivative of the curve", () => {
  const m = { type: "saturating", c: 100, a: 4000, k: 1000 };
  const h = 0.01;
  for (const s of [0, 500, 2000]) assert.ok(Math.abs((revenueAt(m, s + h) - revenueAt(m, s)) / h - marginalAt(m, s)) < 1e-2);
  assert.equal(marginalAt({ type: "linear", c: 0, a: 3 }, 99), 3);
});

test("analysis finds the true break-even spend of a saturating channel", () => {
  // marginal = a/k * exp(-s/k) = be  ->  s* = k ln(a/(k be))
  const pts = synth({ a: 7000, k: 1400, lo: 300, hi: 3000, n: 200, noise: 0.06 });
  const r = analyze({ channels: [{ name: "X", points: pts }], period: "day" }, { margin: 70 });
  const truth = 1400 * Math.log(7000 / (1400 * (1 / 0.7)));
  const row = r.rows[0];
  assert.equal(row.status, "fitted");
  assert.ok(Math.abs(row.breakevenSpend - truth) / truth < 0.2, `${row.breakevenSpend} vs ${truth}`);
});

test("reallocation moves money from the saturated channel to the one with headroom, inside the trust region", () => {
  const a = synth({ a: 3000, k: 400, lo: 100, hi: 2500, n: 120, seed: 1 });
  const b = synth({ a: 12000, k: 6000, lo: 100, hi: 2500, n: 120, seed: 2 });
  const r = analyze({ channels: [{ name: "Saturated", points: a }, { name: "Headroom", points: b }], period: "day" }, { margin: 100 });
  const sat = r.rows.find((x) => x.name === "Saturated"), head = r.rows.find((x) => x.name === "Headroom");
  assert.ok(sat.recommendedSpend < sat.currentSpend, "cuts the saturated channel");
  assert.ok(head.recommendedSpend > head.currentSpend, "adds to the channel with headroom");
  assert.ok(sat.recommendedSpend >= sat.currentSpend * 0.5 - 1e-6, "never cuts more than half");
  assert.ok(head.recommendedSpend <= Math.max(head.currentSpend, head.observedMax * 1.25) + 1e-6, "stays near tested spend");
  assert.ok(Math.abs(sat.recommendedSpend + head.recommendedSpend + r.unspent - r.budget) < 1e-6, "budget is conserved");
  assert.ok(r.uplift.profit > 0);
  assert.ok(r.uplift.probPositive >= 0.8);
});

test("a margin makes the break-even marginal ROAS 1/margin and money is held back below it", () => {
  const pts = synth({ a: 2000, k: 500, lo: 100, hi: 2000, n: 100 });
  const r = analyze({ channels: [{ name: "Weak", points: pts }], period: "day" }, { margin: 20 });
  assert.equal(r.breakevenRoas, 5);
  assert.ok(r.unspent > 0, "unspent budget is reported, not forced into a losing channel");
  assert.equal(r.rows[0].verdict, "pull back");
});

test("a user-set budget is honoured", () => {
  const a = synth({ a: 9000, k: 5000, lo: 100, hi: 2500, n: 100, seed: 4 });
  const r = analyze({ channels: [{ name: "A", points: a }], period: "day" }, { margin: 100, budget: 3000 });
  assert.ok(r.rows[0].recommendedSpend <= 3000 + 1e-6);
});

test("too little data and flat spend are refused a curve and held at current spend", () => {
  const few = synth({ n: MIN_OBS - 1 });
  const flat = Array.from({ length: 40 }, (_, i) => ({ t: i, s: 100, r: 300 + (i % 3) }));
  const r = analyze({ channels: [{ name: "Few", points: few }, { name: "Flat", points: flat }], period: "day" });
  assert.equal(r.rows[0].status, "too-few");
  assert.equal(r.rows[1].status, "flat-spend");
  assert.equal(r.rows[1].marginalNow, null);
  assert.equal(r.rows[1].recommendedSpend, r.rows[1].currentSpend);
  assert.equal(r.uplift, null);
  assert.match(r.warnings.join(" "), /almost constant/);
});

test("spend that moves together across channels is flagged", () => {
  const base = synth({ n: 60, seed: 9 });
  const other = base.map((p) => ({ t: p.t, s: p.s * 1.1 + 5, r: p.r * 0.5 }));
  const r = analyze({ channels: [{ name: "A", points: base }, { name: "B", points: other }], period: "day" });
  assert.match(r.warnings.join(" "), /moves together/);
});

test("bootstrap ranges bracket the point estimate and shrink with more data", () => {
  const width = (n) => {
    const r = analyze({ channels: [{ name: "X", points: synth({ n, a: 6000, k: 1200, seed: 11 }) }], period: "day" }, { margin: 100 });
    const x = r.rows[0];
    assert.ok(x.marginalLo <= x.marginalHi);
    return x.marginalHi - x.marginalLo;
  };
  assert.ok(width(400) < width(40));
});

test("the 80% range covers the true marginal ROAS in most simulated datasets", () => {
  let hit = 0, total = 0;
  const truth = marginalAt({ type: "saturating", c: 0, a: 6000, k: 1200 }, 1500);
  for (let seed = 100; seed < 130; seed++) {
    const pts = synth({ a: 6000, k: 1200, lo: 300, hi: 3000, n: 90, noise: 0.1, seed });
    const cur = pts.slice(-Math.ceil(pts.length * 0.25)).reduce((a, p) => a + p.s, 0) / Math.ceil(pts.length * 0.25);
    const t = marginalAt({ type: "saturating", c: 0, a: 6000, k: 1200 }, cur);
    const r = analyze({ channels: [{ name: "X", points: pts }], period: "day" }, { margin: 100 }).rows[0];
    total++;
    if (r.marginalLo <= t && t <= r.marginalHi) hit++;
  }
  assert.ok(truth > 0);
  assert.ok(hit / total >= 0.6, `coverage ${hit}/${total}`);
});

test("analysis is deterministic", () => {
  const p = parseData(sampleText());
  assert.deepEqual(analyze(p, { margin: 70 }), analyze(p, { margin: 70 }));
});

test("the sample data gives one scale-up, one pull-back and a positive result", () => {
  const r = analyze(parseData(sampleText()), { margin: 70 });
  const v = Object.fromEntries(r.rows.map((x) => [x.name, x.verdict]));
  assert.equal(v["Google Search"], "scale up");
  assert.equal(v["Display"], "pull back");
  assert.ok(r.uplift.profit > 0);
});

test("CSV export has a row per channel and quotes names", () => {
  const r = analyze(parseData(sampleText()), { margin: 70 });
  const lines = resultCsv(r).trim().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^"Google Search",/);
});

test("quantile and num behave", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([], 0.5), null);
  assert.equal(num(1234.5), "1,235");
  assert.equal(num(null), "n/a");
  assert.equal(fitLinear([{ s: 1, r: 2 }, { s: 2, r: 4 }, { s: 3, r: 6 }]).a.toFixed(3), "2.000");
});
