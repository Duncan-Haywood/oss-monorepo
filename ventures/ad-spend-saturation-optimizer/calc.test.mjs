import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURVES, curveValue, marginal, fitCurve, fitBest, frontier, allocate, parseSpend, parseDay, dayToIso, weekStart,
  weekly, adstock, fitAdstock, analyze, backtestChannel, reportCsv, simulateSpend, sampleText, percentile, nelderMead, money,
} from "./calc.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg ?? ""} ${a} vs ${b}`);

test("nelderMead finds the minimum of a quadratic", () => {
  const r = nelderMead((x) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2, [0, 0]);
  near(r.x[0], 3, 1e-4); near(r.x[1], -1, 1e-4);
});

test("percentile interpolates", () => {
  near(percentile([1, 2, 3, 4], 0.5), 2.5, 1e-12);
  near(percentile([1, 2, 3, 4], 0), 1, 0);
  near(percentile([1, 2, 3, 4], 1), 4, 0);
});

test("curves: closed-form values and derivatives match finite differences", () => {
  near(CURVES.exp.f([100, 10], 10), 100 * (1 - Math.exp(-1)), 1e-12);
  near(CURVES.hill.f([100, 10, 2], 10), 50, 1e-12);
  near(CURVES.hill.f([100, 10, 1], 30), 75, 1e-12);
  for (const [t, p] of [["exp", [80, 5]], ["hill", [80, 5, 2.2]], ["hill", [80, 5, 0.8]]]) {
    for (const s of [1, 4, 9]) {
      const h = 1e-6;
      const fd = (CURVES[t].f(p, s + h) - CURVES[t].f(p, s - h)) / (2 * h);
      near(CURVES[t].d(p, s), fd, 1e-5, `${t} d at ${s}`);
    }
  }
  assert.equal(CURVES.hill.f([100, 10, 2], 0), 0);
});

test("dates and weeks: Monday start, ISO, US and day-first", () => {
  assert.equal(dayToIso(parseDay("2025-03-09")), "2025-03-09");
  assert.equal(dayToIso(parseDay("3/9/2025")), "2025-03-09");
  assert.equal(dayToIso(parseDay("25/03/2025")), "2025-03-25");
  assert.ok(Number.isNaN(parseDay("soon")));
  assert.equal(dayToIso(weekStart(parseDay("2025-03-09"))), "2025-03-03"); // a Sunday
  assert.equal(dayToIso(weekStart(parseDay("2025-03-03"))), "2025-03-03"); // a Monday
  assert.equal(dayToIso(weekStart(parseDay("1969-12-31"))), "1969-12-29");
});

test("parseSpend finds columns in an ad-platform style export and drops junk", () => {
  const csv = 'Day,Campaign,Cost,Conversion value,Clicks\n2025-01-06,Brand,"$1,200.50","$4,000",300\n2025-01-07,Brand,100,300,20\n2025-01-07,Brand,-5,10,1\nnope,Brand,1,1,1\n2025-01-08,,1,1,1\n2025-01-08,Brand,10,,1\n' + Array.from({ length: 8 }, (_, i) => `2025-02-0${i + 1},Brand,10,20,1`).join("\n");
  const r = parseSpend(csv);
  assert.equal(r.rows.length, 10);
  assert.equal(r.rows[0].spend, 1200.5);
  assert.equal(r.rows[0].revenue, 4000);
  assert.equal(r.skipped, 4);
  assert.equal(r.columns.spend, "cost");
  assert.equal(r.columns.revenue, "conversion value");
  assert.equal(r.columns.channel, "campaign");
});

test("parseSpend works without a channel column and reports missing columns", () => {
  const csv = "date,spend,revenue\n" + Array.from({ length: 10 }, (_, i) => `2025-01-${String(i + 1).padStart(2, "0")},10,25`).join("\n");
  const r = parseSpend(csv);
  assert.equal(r.rows[0].channel, "All spend");
  assert.match(parseSpend("a,b,c\n1,2,3").error, /Could not find the columns/);
  assert.match(parseSpend("date,spend,revenue\n2025-01-01,1,2").error, /Fewer than eight/);
  assert.match(parseSpend("").error, /Paste or upload/);
});

test("weekly sums daily rows into Monday weeks per channel", () => {
  const rows = [
    { channel: "A", day: parseDay("2025-03-03"), spend: 1, revenue: 2 },
    { channel: "A", day: parseDay("2025-03-09"), spend: 3, revenue: 4 },
    { channel: "A", day: parseDay("2025-03-10"), spend: 5, revenue: 6 },
    { channel: "B", day: parseDay("2025-03-04"), spend: 7, revenue: 8 },
  ];
  const w = weekly(rows);
  assert.deepEqual(w.get("A").map((p) => [p.s, p.r]), [[4, 6], [5, 6]]);
  assert.deepEqual(w.get("B").map((p) => [p.s, p.r]), [[7, 8]]);
});

// ---- parameter recovery on simulated data with known truth ----

test("fitCurve recovers a saturating-exponential channel: marginal return at three spend levels", () => {
  const truth = [20000, 8000];
  const rows = simulateSpend({ channels: [{ name: "X", type: "exp", p: truth, mean: 7000, cv: 0.45, noise: 0.04 }], weeks: 104, seed: 3 });
  const pts = [...weekly(rows).get("X")];
  const fit = fitCurve(pts, "exp");
  for (const s of [2000, 6000, 12000]) rel(marginal(fit, s), CURVES.exp.d(truth, s), 0.12, `marginal at ${s}`);
  rel(fit.p[0], truth[0], 0.25); rel(fit.p[1], truth[1], 0.25);
  assert.ok(fit.r2 > 0.9, `r2 ${fit.r2}`);
});

test("fitBest picks the S-shaped curve for S-shaped truth and the exponential for concave truth", () => {
  const s = weekly(simulateSpend({ channels: [{ name: "S", type: "hill", p: [50000, 9000, 2.4], mean: 9000, cv: 0.5, noise: 0.03 }], weeks: 104, seed: 4 })).get("S");
  assert.equal(fitBest(s).type, "hill");
  const c = weekly(simulateSpend({ channels: [{ name: "C", type: "exp", p: [30000, 7000], mean: 7000, cv: 0.5, noise: 0.03 }], weeks: 104, seed: 4 })).get("C");
  assert.equal(fitBest(c).type, "exp");
  const f = fitBest(s);
  rel(curveValue(f, 9000), CURVES.hill.f([50000, 9000, 2.4], 9000), 0.08);
});

test("noise-free data is fitted essentially exactly", () => {
  const pts = [500, 1000, 2000, 3000, 4500, 6000, 8000, 10000, 12000].map((s) => ({ s, r: CURVES.exp.f([9000, 4000], s) }));
  const fit = fitCurve(pts, "exp");
  rel(fit.p[0], 9000, 1e-3); rel(fit.p[1], 4000, 1e-3);
  assert.ok(fit.r2 > 0.999999);
});

// ---- allocation ----

test("allocate matches the analytic equal-marginal-return optimum for two exponential channels", () => {
  const c = [{ a: 100, k: 10 }, { a: 60, k: 5 }];
  const curves = c.map((x) => ({ f: (s) => x.a * (1 - Math.exp(-s / x.k)), lo: 0, hi: 1000 }));
  // 10 e^{-s1/10} = 12 e^{-s2/5}, s1 + s2 = 20: solve by bisection on s1.
  let lo = 0, hi = 20;
  for (let i = 0; i < 100; i++) {
    const s1 = (lo + hi) / 2, s2 = 20 - s1;
    const g = 10 * Math.exp(-s1 / 10) - 12 * Math.exp(-s2 / 5);
    if (g > 0) lo = s1; else hi = s1;
  }
  const s1 = (lo + hi) / 2;
  const best = c[0].a * (1 - Math.exp(-s1 / c[0].k)) + c[1].a * (1 - Math.exp(-(20 - s1) / c[1].k));
  const r = allocate(curves, 20, { steps: 800 });
  near(r.spend[0], s1, 0.1, "channel 1 spend");
  rel(r.revenue, best, 1e-4, "revenue");
  near(r.spend[0] + r.spend[1], 20, 1e-9);
});

test("allocate handles S-shaped curves, where splitting evenly is the wrong answer", () => {
  // Two identical S-curves (h = 3). At a budget of 10 the even split stays on the flat start of
  // both curves (22.2); putting everything into one earns 50. Brute force over the grid agrees.
  const f = (s) => CURVES.hill.f([100, 10, 3], s);
  const curves = [{ f, lo: 0, hi: 10 }, { f, lo: 0, hi: 10 }];
  const r = allocate(curves, 10, { steps: 100 });
  let bestBrute = -1;
  for (let u = 0; u <= 100; u++) bestBrute = Math.max(bestBrute, f(u / 10) + f((100 - u) / 10));
  near(r.revenue, bestBrute, 1e-9);
  near(r.revenue, 50, 1e-9);
  assert.ok(r.spend[0] === 0 || r.spend[1] === 0, `spend ${r.spend}`);
  assert.ok(r.revenue > 2 * f(5) * 2, "beats the even split");
});

test("allocate respects limits and never beats the unconstrained optimum", () => {
  const curves = [
    { f: (s) => 100 * (1 - Math.exp(-s / 10)), lo: 5, hi: 8 },
    { f: (s) => 60 * (1 - Math.exp(-s / 5)), lo: 0, hi: 100 },
  ];
  const r = allocate(curves, 20, { steps: 400 });
  assert.ok(r.spend[0] >= 5 - 1e-9 && r.spend[0] <= 8 + 0.06);
  assert.equal(r.atHigh[0], true);
  const free = allocate([{ ...curves[0], lo: 0, hi: 100 }, curves[1]], 20, { steps: 400 });
  assert.ok(free.revenue >= r.revenue - 1e-9);
});

test("allocate reports an infeasible split", () => {
  const r = allocate([{ f: (s) => s, lo: 30, hi: 40 }], 20, { steps: 100 });
  assert.match(r.error, /no feasible split/);
});

test("frontier revenue rises with budget for increasing curves", () => {
  const fr = frontier([{ f: (s) => 10 * Math.sqrt(s), lo: 0, hi: 50 }, { f: (s) => 5 * Math.sqrt(s), lo: 0, hi: 50 }], 1);
  let last = -1;
  for (let b = fr.minUnits; b <= fr.maxUnits; b++) { assert.ok(fr.revenueAt(b) >= last); last = fr.revenueAt(b); }
});

// ---- back-test ----

test("back-test: with the true curve and mild noise the holdout is predicted within a few percent", () => {
  const pts = weekly(simulateSpend({ channels: [{ name: "X", type: "exp", p: [25000, 9000], mean: 8000, cv: 0.4, noise: 0.04 }], weeks: 90, seed: 9 })).get("X");
  const r = backtestChannel(pts, 12);
  assert.ok(Math.abs(r.curve - r.actual) / r.actual < 0.05, `total ${r.curve} vs ${r.actual}`);
  assert.ok(r.wapeCurve < 0.08, `wape ${r.wapeCurve}`);
});

test("back-test: when spend moves above anything seen, the curve beats a flat ROAS line", () => {
  const truth = [10000, 4000];
  const spends = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 2200, 1800, 2700, 3200, 2900, 3800, 1200, 2600, 3300];
  const test = [8000, 9000, 10000, 11000, 9500];
  const pts = [...spends, ...test].map((s, i) => ({ week: i, s, r: CURVES.exp.f(truth, s) }));
  const r = backtestChannel(pts, 5);
  assert.ok(r.wapeCurve < 0.02, `curve ${r.wapeCurve}`);
  assert.ok(r.wapeLinear > 0.2, `linear ${r.wapeLinear}`);
});

test("back-test returns null when there is too little history", () => {
  const pts = Array.from({ length: 9 }, (_, i) => ({ week: i, s: 100 + i, r: 200 + i }));
  assert.equal(backtestChannel(pts, 4), null);
});

// ---- whole analysis ----

const SAMPLE = parseSpend(sampleText());

test("analyze on the sample: finds the channels, ordering of marginal returns, and a positive gain", () => {
  const r = analyze(SAMPLE.rows);
  assert.equal(r.modelled.length, 4);
  const m = Object.fromEntries(r.modelled.map((c) => [c.name, c]));
  // Truth: Google Search has the most headroom per dollar, TikTok is nearly saturated.
  assert.ok(m["Google Search"].mroas > m["TikTok"].mroas * 1.5);
  assert.equal(m["Meta Prospecting"].fit.type, "hill");
  assert.ok(r.summary.gain > 0);
  assert.ok(r.summary.pGain > 0.9);
  near(r.modelled.reduce((a, c) => a + c.recommended, 0), r.summary.budget, 1e-6, "same total budget");
  assert.ok(r.summary.gainLo <= r.summary.gainMid && r.summary.gainMid <= r.summary.gainHi);
  for (const c of r.modelled) assert.ok(c.mroasLo <= c.mroas * 1.05 && c.mroasHi >= c.mroas * 0.95, `${c.name} interval`);
});

test("analyze: the recommended split really is better under the TRUE curves", () => {
  const r = analyze(SAMPLE.rows);
  const truth = Object.fromEntries(["Google Search", "Meta Prospecting", "TikTok", "Influencer"].map((n, i) => [n, [["exp", [42000, 9000]], ["hill", [60000, 14000, 1.6]], ["exp", [14000, 3000]], ["exp", [30000, 20000]]][i]]));
  const rev = (key) => r.modelled.reduce((a, c) => { const [t, p] = truth[c.name]; return a + CURVES[t].f(p, c[key]); }, 0);
  assert.ok(rev("recommended") > rev("current") * 1.03, `${rev("recommended")} vs ${rev("current")}`);
});

test("analyze is deterministic for a fixed seed", () => {
  const a = analyze(SAMPLE.rows, { boots: 20 }), b = analyze(SAMPLE.rows, { boots: 20 });
  assert.equal(a.summary.gainLo, b.summary.gainLo);
  assert.equal(reportCsv(a), reportCsv(b));
});

test("analyze: a channel with too few weeks or constant spend is left alone, not modelled", () => {
  const rows = [
    ...SAMPLE.rows.filter((r) => r.channel === "Google Search"),
    ...SAMPLE.rows.filter((r) => r.channel === "TikTok"),
    ...Array.from({ length: 5 }, (_, i) => ({ channel: "Short", day: SAMPLE.rows[0].day + 7 * i, spend: 100 + i, revenue: 300 })),
    ...Array.from({ length: 30 }, (_, i) => ({ channel: "Flat", day: SAMPLE.rows[0].day + 7 * i, spend: 500, revenue: 1000 + i })),
  ];
  const r = analyze(rows, { boots: 20 });
  assert.deepEqual(r.modelled.map((c) => c.name).sort(), ["Google Search", "TikTok"]);
  const short = r.channels.find((c) => c.name === "Short"), flat = r.channels.find((c) => c.name === "Flat");
  assert.match(short.reason, /only 5 weeks/);
  assert.match(flat.reason, /barely changed/);
  assert.ok(r.summary.fixedSpend > 0);
  assert.match(r.findings.map((f) => f.title).join("|"), /Not modelled: Flat, Short/);
  near(r.summary.budget, r.modelled.reduce((a, c) => a + c.current, 0), 1e-9);
});

test("analyze: a single channel still gets a curve and a total-spend answer", () => {
  const rows = simulateSpend({ channels: [{ name: "Only", type: "exp", p: [20000, 6000], mean: 6000, cv: 0.4, noise: 0.05 }], weeks: 60, seed: 2 });
  const r = analyze(rows, { boots: 20 });
  assert.equal(r.modelled.length, 1);
  assert.ok(Math.abs(r.summary.gain) < 1, "one channel cannot be reallocated");
  assert.ok(r.optimum.weeklySpend > 0);
});

test("analyze: when marginal return is far above break-even, the profit optimum is at the upper limit", () => {
  const rows = simulateSpend({ channels: [{ name: "Big", type: "exp", p: [500000, 300000], mean: 3000, cv: 0.4, noise: 0.03 }], weeks: 60, seed: 2 });
  const r = analyze(rows, { boots: 10, margin: 0.9 });
  assert.equal(r.optimum.atUpperLimit, true);
  assert.match(r.findings.find((f) => f.title === "How much to spend in total").detail, /edge of what the limits allow/);
});

test("analyze: a channel past break-even is called out, using the margin the user gave", () => {
  const rows = simulateSpend({ channels: [{ name: "Sat", type: "exp", p: [10000, 1500], mean: 4000, cv: 0.4, noise: 0.03 }, { name: "Grow", type: "exp", p: [80000, 30000], mean: 4000, cv: 0.4, noise: 0.03 }], weeks: 60, seed: 6 });
  const r = analyze(rows, { boots: 30, margin: 0.5 });
  assert.match(r.findings.map((f) => f.title).join("|"), /Sat: the next dollar loses money/);
  assert.doesNotMatch(r.findings.map((f) => f.title).join("|"), /Grow: the next dollar loses money/);
});

test("analyze warns when spend barely varied, and says the interval is wide for that reason", () => {
  const base = simulateSpend({ channels: [{ name: "Other", type: "exp", p: [20000, 6000], mean: 6000, cv: 0.4, noise: 0.05 }], weeks: 60, seed: 2 });
  const steady = Array.from({ length: 60 }, (_, i) => {
    const s = 6000 + ((i * 37) % 11 - 5) * 40; // within about +/-3%
    return { channel: "Steady", day: base[0].day + 7 * i, spend: s, revenue: Math.round(CURVES.exp.f([20000, 6000], s) * (1 + 0.03 * Math.sin(i * 1.7))) };
  });
  const r = analyze([...base, ...steady], { boots: 20 });
  const st = r.modelled.find((c) => c.name === "Steady");
  assert.ok(st.lowSpread);
  assert.match(r.findings.map((f) => f.title).join("|"), /Steady: spend barely varied/);
  assert.ok(!r.modelled.find((c) => c.name === "Other").lowSpread);
});

test("analyze fails clearly when nothing can be modelled", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ channel: "A", day: 20000 + i, spend: 10, revenue: 20 }));
  assert.match(analyze(rows).error, /No channel has enough data/);
});

test("reportCsv is spreadsheet-injection safe and lists every channel", () => {
  const rows = simulateSpend({ channels: [{ name: "=HYPERLINK(\"x\")", type: "exp", p: [20000, 6000], mean: 6000, cv: 0.4, noise: 0.05 }, { name: "Plain", type: "exp", p: [20000, 6000], mean: 6000, cv: 0.4, noise: 0.05 }], weeks: 40, seed: 2 });
  const r = analyze(rows, { boots: 10 });
  const csv = reportCsv(r);
  assert.match(csv, /^channel,weeks,/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.equal(csv.trim().split("\n").length, 3);
  assert.doesNotMatch(csv, /(^|,)=HYPERLINK/m);
});

test("money formats negatives and small values", () => {
  assert.equal(money(-1234.5), "-$1,235");
  assert.equal(money(4.5), "$4.50");
  assert.equal(money(NaN), "n/a");
});

test("the calculation is offline: no network or dynamic import in the source", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\(|^\s*import\s/m);
  const realFetch = globalThis.fetch; let called = 0;
  globalThis.fetch = () => { called++; throw new Error("network"); };
  try { analyze(SAMPLE.rows, { boots: 5 }); } finally { globalThis.fetch = realFetch; }
  assert.equal(called, 0);
});

test("adstock: constant spend is unchanged in steady state, a gap decays, lambda 0 is the identity", () => {
  const pts = [0, 1, 2, 3, 6].map((i) => ({ week: 7 * i, s: 100, r: 1 }));
  near(adstock(pts, 0.5)[3].s, 100 * (1 - 0.5 ** 4), 1e-9, "warms up from zero");
  const gap = adstock(pts, 0.5);
  assert.ok(gap[4].s < gap[3].s * 0.7, "two empty weeks pull the carried spend down");
  assert.deepEqual(adstock(pts, 0).map((p) => p.s), pts.map((p) => p.s));
});

test("fitAdstock recovers carry-over from simulated data and leaves memoryless channels alone", () => {
  const ch = (lambda) => [{ name: "A", type: "exp", p: [40000, 8000], mean: 6000, cv: 0.45, noise: 0.03, lambda }];
  const withLag = analyze(simulateSpend({ channels: ch(0.6), weeks: 104, seed: 3 }));
  const lag = withLag.modelled[0].lambda;
  assert.ok(lag >= 0.4 && lag <= 0.8, `carry-over found: ${lag}`);
  assert.ok(withLag.findings.some((f) => /keeps working into later weeks/.test(f.title)));
  const none = analyze(simulateSpend({ channels: ch(0), weeks: 104, seed: 3 }));
  assert.equal(none.modelled[0].lambda, 0);
  assert.ok(!none.findings.some((f) => /later weeks/.test(f.title)));
});

test("carry-over model fits lagged data better than the memoryless one, and can be switched off", () => {
  const rows = simulateSpend({ channels: [{ name: "A", type: "exp", p: [40000, 8000], mean: 6000, cv: 0.45, noise: 0.03, lambda: 0.6 }], weeks: 104, seed: 3 });
  const on = analyze(rows), off = analyze(rows, { adstock: false });
  assert.equal(off.modelled[0].lambda, 0);
  assert.ok(on.modelled[0].fit.rmse < off.modelled[0].fit.rmse * 0.8, `${on.modelled[0].fit.rmse} vs ${off.modelled[0].fit.rmse}`);
});
