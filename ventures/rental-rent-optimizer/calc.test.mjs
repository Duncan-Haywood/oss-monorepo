import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRows, parseLeased, analyze, fitHazard, fitFixedB, netRate, bestPremium, meanVacancyMonths,
  elasticityToSlope, sampleText, reportCsv, mulberry32, DAYS_PER_MONTH, money, pct, num,
} from "./calc.mjs";

const ECON = { market: 1800, leaseMonths: 12, renewal: 0, turnover: 0, carry: 0, problemChance: 0, problemCost: 0, fixed: 0 };

// Simulate listings from a known exponential-hazard model, optionally censored at capDays.
function simulate(n, { a, b, xsd = 0.1, seed = 1, cap = Infinity, market = 1800 }) {
  const rng = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const rows = [];
  for (let i = 0; i < n; i++) {
    const x = xsd * gauss();
    const days = -Math.log(1 - rng()) / Math.exp(a + b * x);
    rows.push({ rent: market * Math.exp(x), days: Math.min(days, cap), leased: days <= cap ? 1 : 0, market: null, x });
  }
  return rows;
}
const obsOf = (rows) => rows.map((r) => ({ x: r.x, t: Math.max(r.days, 0.5), d: r.leased }));

test("intercept-only fit equals the closed-form censored exponential MLE (events / total exposure)", () => {
  const obs = [{ x: 0, t: 10, d: 1 }, { x: 0, t: 30, d: 1 }, { x: 0, t: 60, d: 0 }, { x: 0, t: 20, d: 1 }, { x: 0, t: 45, d: 0 }];
  const f = fitFixedB(obs, -3);
  assert.ok(Math.abs(f.a - Math.log(3 / 165)) < 1e-12);
  const full = fitHazard(obs, { aSd: 1e6 });
  assert.ok(Math.abs(full.a - Math.log(3 / 165)) < 1e-3, `a=${full.a}`);
});

test("censoring: still-vacant rows add exposure but no event, so ignoring them overstates speed", () => {
  const rows = simulate(400, { a: Math.log(1 / 40), b: -5, seed: 2, cap: 60 });
  assert.ok(rows.some((r) => r.leased === 0));
  const right = fitHazard(obsOf(rows), { bMean: -5, priorSd: 5 });
  const leasedOnly = fitHazard(obsOf(rows.filter((r) => r.leased === 1)), { bMean: -5, priorSd: 5 });
  assert.ok(Math.abs(right.a - Math.log(1 / 40)) < 0.15, `censored-aware a=${right.a}`);
  assert.ok(leasedOnly.a > right.a + 0.2, "dropping vacant listings makes the hazard look too high");
  assert.ok(Math.abs(right.b + 5) < 1.2, `b=${right.b}`);
});

test("recovers a known slope with a 95% interval that covers it across seeds", () => {
  let cover = 0;
  const T = 30;
  for (let s = 0; s < T; s++) {
    const rows = simulate(120, { a: Math.log(1 / 30), b: -6, xsd: 0.12, seed: 100 + s, cap: 120 });
    const f = fitHazard(obsOf(rows), { bMean: -4.25, priorSd: 1.5 });
    if (f.b - 1.96 * f.seB <= -6 && -6 <= f.b + 1.96 * f.seB) cover++;
  }
  assert.ok(cover >= 25, `covered ${cover}/${T}`);
});

test("with zero usable spread the slope stays at the prior and the fit is finite", () => {
  const obs = Array.from({ length: 10 }, (_, i) => ({ x: 0.05, t: 10 + i, d: 1 }));
  const f = fitHazard(obs, { bMean: -4.25, priorSd: 1.5 });
  assert.ok(Number.isFinite(f.a) && Number.isFinite(f.b));
  assert.ok(Math.abs(f.b + 4.25) < 0.05, `b=${f.b}`);
});

test("shrinkage: fewer than 6 rows stay on the stated elasticity, more rows move toward the data", () => {
  const few = simulate(4, { a: Math.log(1 / 30), b: -9, xsd: 0.15, seed: 5 });
  const many = simulate(200, { a: Math.log(1 / 30), b: -9, xsd: 0.15, seed: 5 });
  const fFew = fitHazard(obsOf(few), { bMean: -3 });
  const fMany = fitHazard(obsOf(many), { bMean: -3 });
  assert.ok(Math.abs(fFew.b + 3) < 0.6, `few rows b=${fFew.b}`);
  assert.ok(fMany.b < -6, `many rows b=${fMany.b}`);
  assert.ok(fMany.dataWeight > fFew.dataWeight);
  const a = analyze(few.map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null })), { market: 1800, carry: 200, turnover: 500 });
  assert.equal(a.verdict, "assumption");
  assert.ok(a.warnings.some((w) => /fewer than 6/.test(w)));
  assert.equal(a.holdout, null);
});

test("elasticity conversion: +10% rent = 100% longer vacancy is slope ln(0.5)/ln(1.1)", () => {
  assert.ok(Math.abs(elasticityToSlope(100) + Math.log(2) / Math.log(1.1)) < 1e-12);
  assert.ok(Math.abs(elasticityToSlope(0)) < 1e-12);
  assert.ok(Number.isNaN(elasticityToSlope(-95)));
  // and the slope it gives really does multiply mean wait by (1+p) for a 10% rent rise
  const b = elasticityToSlope(40);
  assert.ok(Math.abs(Math.exp(-b * Math.log(1.1)) - 1.4) < 1e-12);
});

test("netRate matches a hand-computed cycle", () => {
  // hazard 1/30 per day at x=0 -> vacancy 30/30.4375 months; lease 12 months, no renewal.
  const fit = { a: Math.log(1 / 30), b: -4 };
  const mu = 30 / DAYS_PER_MONTH;
  assert.ok(Math.abs(meanVacancyMonths(fit, 0) - mu) < 1e-12);
  const e = { ...ECON, turnover: 900, carry: 400, problemChance: 0.1, problemCost: 2000 };
  const expected = (1800 * 12 - 900 - 400 * mu - 200) / (mu + 12);
  assert.ok(Math.abs(netRate(e, fit, 0) - expected) < 1e-9);
  assert.ok(Math.abs(netRate({ ...e, fixed: 1000 }, fit, 0) - (expected - 1000)) < 1e-9);
});

test("closed form: with no vacancy or turnover cost the best rent leaves a mean vacancy of L / (|b| - 1) months", () => {
  for (const [b, leaseMonths, renewal] of [[-4, 12, 0], [-7, 12, 0.5], [-3, 6, 0]]) {
    const fit = { a: Math.log(1 / 25), b };
    const e = { ...ECON, leaseMonths, renewal };
    const L = leaseMonths / (1 - renewal);
    const best = bestPremium(e, fit, -0.6, 1.5);
    assert.ok(Math.abs(meanVacancyMonths(fit, best.x) - L / (-b - 1)) < 1e-4, `b=${b}`);
  }
});

test("bestPremium agrees with a brute-force scan, with turnover, carry and risk in play", () => {
  const fit = { a: Math.log(1 / 28), b: -5 };
  const e = { ...ECON, turnover: 1100, carry: 700, renewal: 0.4, problemChance: 0.08, problemCost: 3000 };
  const lo = -0.1, hi = 0.3;
  let bv = -Infinity, bx = 0;
  for (let i = 0; i <= 200000; i++) { const x = lo + ((hi - lo) * i) / 200000, v = netRate(e, fit, x); if (v > bv) { bv = v; bx = x; } }
  const got = bestPremium(e, fit, lo, hi);
  assert.ok(Math.abs(got.x - bx) < 2e-4, `${got.x} vs ${bx}`);
  assert.ok(got.value >= bv - 1e-6);
});

test("fixed costs change the level of net income but never the best rent", () => {
  const rows = simulate(60, { a: Math.log(1 / 30), b: -6, xsd: 0.12, seed: 9, cap: 90 }).map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null }));
  const base = analyze(rows, { market: 1800, turnover: 900, carry: 300 });
  const loaded = analyze(rows, { market: 1800, turnover: 900, carry: 300, fixed: 1400 });
  assert.ok(Math.abs(base.optimum.rent - loaded.optimum.rent) < 1e-6);
  assert.ok(Math.abs(base.optimum.monthly - loaded.optimum.monthly - 1400) < 1e-6);
});

test("higher vacancy cost and turnover cost pull the best rent down; a long lease pushes it up", () => {
  const rows = simulate(80, { a: Math.log(1 / 30), b: -6, xsd: 0.14, seed: 4, cap: 100 }).map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null }));
  const at = (o) => analyze(rows, { market: 1800, turnover: 500, carry: 100, ...o }).optimum.rent;
  assert.ok(at({ carry: 1500 }) < at({ carry: 100 }));
  assert.ok(at({ renewal: 0.75 }) > at({ renewal: 0 }));
});

test("analysis on simulated history lands near the known optimum and is deterministic", () => {
  const truth = { a: Math.log(1 / 26), b: -7 };
  const rows = simulate(150, { ...truth, xsd: 0.12, seed: 21, cap: 90 }).map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null }));
  const opts = { market: 1800, turnover: 1200, carry: 350, renewal: 0.3, leaseMonths: 12 };
  const r1 = analyze(rows, opts), r2 = analyze(rows, opts);
  assert.deepEqual(r1.optimum, r2.optimum);
  const trueBest = bestPremium({ ...ECON, turnover: 1200, carry: 350, renewal: 0.3, market: 1800 }, truth, r1.range.loX, r1.range.hiX);
  assert.ok(Math.abs(r1.optimum.x - trueBest.x) < 0.06, `${r1.optimum.x} vs ${trueBest.x}`);
  assert.ok(r1.optimum.rentRange80[0] <= r1.optimum.rent && r1.optimum.rent <= r1.optimum.rentRange80[1] + 1e-9);
  assert.ok(r1.optimum.pGain > 0.5);
  assert.equal(r1.verdict, "usable");
});

test("cost of asking 5% too high is the net lost over the horizon and is never negative at the optimum", () => {
  const rows = parseRows(sampleText()).rows;
  const r = analyze(rows, { market: 1800, turnover: 1200, carry: 350, renewal: 0.3, leaseMonths: 12, horizonMonths: 24 });
  assert.ok(r.costTooHigh5 > 0);
  const high = r.offBest.find((o) => o.change === 0.05), low = r.offBest.find((o) => o.change === -0.05);
  assert.ok(Math.abs(high.cost - (r.optimum.monthly - r.netAt(r.optimum.rent * 1.05)) * 24) < 1e-6);
  assert.ok(low.cost >= 0 && high.cost >= 0);
  assert.ok(Math.abs(r.optimum.overHorizon - r.optimum.monthly * 24) < 1e-9);
});

test("hold-out back-test scores the last quarter and says when rent helped", () => {
  const rows = simulate(80, { a: Math.log(1 / 30), b: -7, xsd: 0.14, seed: 33, cap: 100 }).map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null }));
  const r = analyze(rows, { market: 1800, turnover: 800, carry: 300 });
  assert.equal(r.holdout.train + r.holdout.test, 80);
  assert.equal(r.holdout.test, 20);
  assert.equal(r.holdout.helps, true);
  assert.ok(r.holdout.nllModel < r.holdout.nllBase);
  // rent unrelated to speed: the back-test must not claim it helped
  const rng = mulberry32(77);
  const noise = Array.from({ length: 80 }, () => ({ rent: 1800 * Math.exp(0.12 * (rng() - 0.5)), days: -Math.log(1 - rng()) * 30, leased: 1, market: null }));
  const flat = analyze(noise, { market: 1800, turnover: 800, carry: 300 });
  assert.notEqual(flat.verdict, "usable");
});

test("a history where rent does not vary is flagged as unidentified and keeps the prior slope", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ rent: 1800 + (i % 2), days: 20 + i, leased: 1, market: null }));
  const r = analyze(rows, { market: 1800, turnover: 500, carry: 200 });
  assert.equal(r.verdict, "unidentified");
  assert.equal(r.identified, false);
  assert.ok(r.warnings.some((w) => /barely differed/.test(w)));
  assert.ok(r.range.hi / 1800 < 1.2 && r.range.lo / 1800 > 0.8);
});

test("a positive slope is refused as a pricing signal", () => {
  const rows = simulate(60, { a: Math.log(1 / 30), b: 6, xsd: 0.15, seed: 8, cap: 200 }).map((r) => ({ rent: r.rent, days: r.days, leased: r.leased, market: null }));
  const r = analyze(rows, { market: 1800, turnover: 500, carry: 200 });
  if (r.slope >= 0) { assert.equal(r.verdict, "unidentified"); assert.ok(r.warnings.some((w) => /easier to rent/.test(w))); }
  else assert.ok(r.slope > -2);
});

test("edge cases: empty, no market rent, all still vacant, same-day leases", () => {
  assert.ok(analyze([], { market: 1800 }).error);
  assert.match(analyze([{ rent: 1800, days: 10, leased: 1, market: null }], {}).error, /market rent/);
  const vacant = Array.from({ length: 8 }, (_, i) => ({ rent: 1800 + i * 40, days: 40 + i, leased: 0, market: null }));
  const v = analyze(vacant, { market: 1800, turnover: 500, carry: 200 });
  assert.ok(!v.error);
  assert.ok(v.warnings.some((w) => /None of your listings has leased/.test(w)));
  assert.ok(Number.isFinite(v.optimum.rent) && Number.isFinite(v.fit.b));
  const same = Array.from({ length: 10 }, (_, i) => ({ rent: 1700 + i * 30, days: 0, leased: 1, market: null }));
  const s = analyze(same, { market: 1800, turnover: 500, carry: 200 });
  assert.ok(Number.isFinite(s.optimum.rent));
  assert.match(analyze([{ rent: 1, days: 1, leased: 1, market: null }], { market: 1800, priorElasticity: -95 }).error, /elasticity/);
});

test("a per-listing market column is used for the premium", () => {
  const rows = [];
  const rng = mulberry32(3);
  for (let i = 0; i < 40; i++) {
    const market = 1200 + i * 25;
    const x = 0.1 * (rng() - 0.5) * 2;
    rows.push({ rent: market * Math.exp(x), days: -Math.log(1 - rng()) / Math.exp(Math.log(1 / 25) - 6 * x), leased: 1, market });
  }
  const withMarket = analyze(rows, { market: 2000 });
  const without = analyze(rows.map((r) => ({ ...r, market: null })), { market: 2000 });
  assert.equal(withMarket.hasMarket, true);
  assert.ok(withMarket.spread < without.spread, "market-relative premium has a tighter spread than comparing drifting rents with one number");
  assert.ok(withMarket.slope < -2);
});

test("sensitivity rows move the right way and include the as-entered row first", () => {
  const rows = parseRows(sampleText()).rows;
  const r = analyze(rows, { market: 1800, turnover: 1200, carry: 350, renewal: 0.3 });
  assert.equal(r.sens[0].label, "As entered");
  assert.ok(Math.abs(r.sens[0].rent - r.optimum.rent) < 1e-6);
  const get = (re) => r.sens.find((s) => re.test(s.label)).rent;
  assert.ok(get(/x2/) <= r.optimum.rent + 1e-6);
  assert.ok(get(/No vacant/) >= r.optimum.rent - 1e-6);
  assert.ok(get(/matters more/) <= r.optimum.rent + 1e-6);
  assert.ok(get(/matters less/) >= r.optimum.rent - 1e-6);
});

test("parseRows: headerless, header with reordered columns, vacant words, dollars and market column", () => {
  const a = parseRows("1800,22\n1900,35,1\n2000,60,vacant");
  assert.deepEqual(a.rows.map((r) => [r.rent, r.days, r.leased, r.market]), [[1800, 22, 1, null], [1900, 35, 1, null], [2000, 60, 0, null]]);
  const b = parseRows("market_rent,days_on_market,status,asking_rent\n$1,850,20,leased,\"$1,900\"\n1850,45,still vacant,1950".replace("$1,850", "1850"));
  assert.deepEqual(b.rows.map((r) => [r.rent, r.days, r.leased, r.market]), [[1900, 20, 1, 1850], [1950, 45, 0, 1850]]);
  assert.equal(b.hasMarket, true);
  const c = parseRows("1800,20,1800\n1900,30,1850");
  assert.equal(c.hasMarket, true);
  assert.equal(c.rows[0].market, 1800);
  assert.match(parseRows("").error, /Paste/);
  assert.match(parseRows("abc,def\nxyz,1").error ?? "No readable", /No readable|Paste/);
  const bad = parseRows("1800,20\nfoo,bar\n-5,3\n1700,30,maybe");
  assert.equal(bad.rows.length, 2);
  assert.match(bad.warnings[0], /2 row/);
  assert.equal(parseLeased("Rented"), 1);
  assert.equal(parseLeased("On market"), 0);
  assert.equal(parseLeased("huh"), null);
});

test("the sample parses, analyses as usable, and exports CSV with a summary and a curve", () => {
  const p = parseRows(sampleText());
  assert.equal(p.rows.length, 60);
  assert.ok(p.rows.some((r) => r.leased === 0));
  const r = analyze(p.rows, { market: 1800, turnover: 1200, carry: 350, renewal: 0.3 });
  assert.equal(r.verdict, "usable");
  const csv = reportCsv(r);
  assert.match(csv, /^metric,value/);
  assert.match(csv, /best_asking_rent,/);
  assert.match(csv, /cost_of_asking_5pct_too_high_over_horizon,/);
  assert.match(csv, /asking_rent,premium_over_market,expected_days_to_lease/);
  assert.ok(csv.split("\n").length > 60);
  assert.equal(sampleText(), sampleText());
});

test("formatters", () => {
  assert.equal(money(1234.6), "$1,235");
  assert.equal(money(-50), "-$50");
  assert.equal(money(NaN), "n/a");
  assert.equal(pct(0.1234, 1), "12.3%");
  assert.equal(num(1234.5, 1), "1,234.5");
});

test("no network: a full analysis and export run with fetch, XHR and WebSocket booby-trapped", () => {
  const trap = () => { throw new Error("network call attempted"); };
  const saved = { fetch: globalThis.fetch, XMLHttpRequest: globalThis.XMLHttpRequest, WebSocket: globalThis.WebSocket };
  globalThis.fetch = trap; globalThis.XMLHttpRequest = trap; globalThis.WebSocket = trap;
  try {
    const r = analyze(parseRows(sampleText()).rows, { market: 1800, turnover: 1200, carry: 350 });
    assert.ok(reportCsv(r).length > 100);
  } finally {
    Object.assign(globalThis, saved);
  }
});
