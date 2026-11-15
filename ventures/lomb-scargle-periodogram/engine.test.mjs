import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, prepare, powerAt, periodogram, baluevFap, fitSinusoid, spectralWindow, parseCsv, readSeries, toDays, toNumber, lgamma, toCsv, report, csvCell, PAPERS } from "./engine.mjs";

const file = (p) => readFileSync(new URL(`./${p}`, import.meta.url), "utf8");
const REF = JSON.parse(file("eval/reference.json"));
const CSV = file("data/hd164922-rv.csv");

// A small seeded generator so every test is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-300)) * Math.cos(2 * Math.PI * r());

function instrumentJ() {
  const rows = CSV.trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r[3] === "j");
  return { t: rows.map((r) => +r[0]), y: rows.map((r) => +r[1]), e: rows.map((r) => +r[2]) };
}

test("power matches astropy's LombScargle (floating mean, standard normalisation) to 1e-9", () => {
  const { t, y, e } = instrumentJ();
  assert.equal(t.length, 276);
  for (const [name, P] of [["weighted", prepare(t, y, { e })], ["unweighted", prepare(t, y)]]) {
    const c = REF.cases[name];
    c.freqs.forEach((f, i) => assert.ok(Math.abs(powerAt(P, f) - c.power[i]) < 1e-9, `${name} f=${f}: ${powerAt(P, f)} vs ${c.power[i]}`));
  }
  const s = REF.cases.synthetic;
  const P = prepare(s.t, s.y);
  s.freqs.forEach((f, i) => assert.ok(Math.abs(powerAt(P, f) - s.power[i]) < 1e-9, `synthetic f=${f}`));
});

test("Baluev false alarm probability matches astropy's to 1e-8 relative", () => {
  const { t, y, e } = instrumentJ();
  for (const [name, P] of [["weighted", prepare(t, y, { e })], ["unweighted", prepare(t, y)]]) {
    const c = REF.cases[name];
    c.fap_z.forEach((z, i) => {
      const got = baluevFap(z, { n: P.n, groups: 1, fmax: c.fap_fmax, varT: P.varT }).fap;
      assert.ok(Math.abs(got - c.fap_baluev[i]) <= 1e-8 * c.fap_baluev[i], `${name} z=${z}: ${got} vs ${c.fap_baluev[i]}`);
    });
  }
  assert.equal(REF.versions.astropy, "6.1.4");
});

test("the best period on one instrument agrees with astropy's autopower grid", () => {
  const { t, y, e } = instrumentJ();
  const r = analyze({ t, y, e, minPeriod: 2, maxPeriod: 7000, signals: 1 });
  const ref = REF.cases.weighted.best_period;
  // astropy reports its grid point; the engine refines between grid points.
  const df = 1 / (5 * r.baseline);
  assert.ok(Math.abs(1 / r.found[0].period - 1 / ref) < df, `${r.found[0].period} vs ${ref}`);
});

test("with group offsets, power is exactly the chi-square a sinusoid removes (brute-force least squares)", () => {
  const r = rng(11);
  const n = 90;
  const t = Array.from({ length: n }, () => r() * 300);
  const g = t.map((_, i) => ["A", "B", "C"][i % 3]);
  const off = { A: 5, B: -20, C: 40 };
  const e = t.map(() => 0.5 + r());
  const y = t.map((ti, i) => 3 * Math.sin((2 * Math.PI * ti) / 17) + off[g[i]] + e[i] * gauss(r));
  const P = prepare(t, y, { e, g });
  const chi0 = (() => {
    let s = 0;
    for (let i = 0; i < n; i++) s += P.w[i] * (y[i] - P.Yg[P.idx[i]]) ** 2;
    return s;
  })();
  for (const f of [1 / 17, 0.013, 0.11, 0.3, 1 / 250]) {
    const fit = fitSinusoid(P, f, y);
    let chi = 0;
    for (let i = 0; i < n; i++) chi += P.w[i] * (y[i] - fit.model[i]) ** 2;
    assert.ok(Math.abs(powerAt(P, f) - (chi0 - chi) / chi0) < 1e-10, `f=${f}`);
  }
});

test("power is unchanged by shifting time, scaling values or adding a constant to one group", () => {
  const r = rng(3);
  const t = Array.from({ length: 70 }, () => r() * 50);
  const g = t.map((_, i) => (i % 2 ? "x" : "y"));
  const y = t.map((ti) => Math.cos(ti * 1.3) + 0.4 * gauss(r));
  const base = prepare(t, y, { g });
  const moved = prepare(
    t.map((v) => v + 2450000),
    y.map((v, i) => 7 * v + (g[i] === "x" ? 100 : 0)),
    { g },
  );
  for (const f of [0.05, 0.2, 1.3 / (2 * Math.PI), 0.9]) assert.ok(Math.abs(powerAt(base, f) - powerAt(moved, f)) < 1e-9, `f=${f}`);
});

test("the rotated grid agrees with direct evaluation at every point", () => {
  const r = rng(5);
  const t = Array.from({ length: 40 }, () => r() * 1000);
  const y = t.map(() => gauss(r));
  const P = prepare(t, y);
  const f0 = 0.001;
  const df = 0.0007;
  const pw = periodogram(P, f0, df, 1500);
  for (const k of [0, 1, 255, 256, 257, 900, 1499]) assert.ok(Math.abs(pw[k] - powerAt(P, f0 + k * df)) < 1e-10, `k=${k}`);
});

test("pre-whitening recovers two sinusoids and per-group offsets from uneven, gappy data", () => {
  const r = rng(21);
  const t = [];
  for (let night = 0; night < 900; night++) if (r() < 0.25 && night % 365 < 250) t.push(night + 0.3 * r());
  const g = t.map(() => (r() < 0.6 ? "old" : "new"));
  const y = t.map((ti, i) => 6 * Math.cos((2 * Math.PI * ti) / 123 + 1) + 2 * Math.sin((2 * Math.PI * ti) / 9.7) + (g[i] === "new" ? 30 : 0) + gauss(r));
  const res = analyze({ t, y, g, minPeriod: 1.5, signals: 3 });
  assert.ok(res.found.length >= 2);
  assert.ok(Math.abs(res.found[0].period - 123) < 3 * res.found[0].periodError + 0.5, `${res.found[0].period}`);
  assert.ok(Math.abs(res.found[1].period - 9.7) < 3 * res.found[1].periodError + 0.02, `${res.found[1].period}`);
  assert.ok(Math.abs(res.found[0].amplitude - 6) < 0.4);
  assert.ok(Math.abs(res.found[1].amplitude - 2) < 0.4);
  assert.ok(Math.abs(res.found[0].offsets.new - res.found[0].offsets.old - 30) < 0.5);
  assert.ok(res.found[1].fap.fap < 1e-6);
});

test("pure noise gives a high false alarm probability and stops", () => {
  const r = rng(99);
  const t = Array.from({ length: 120 }, () => r() * 400);
  const y = t.map(() => gauss(r));
  const res = analyze({ t, y, minPeriod: 2, signals: 3 });
  assert.ok(res.found[0].fap.fap > 0.05, `${res.found[0].fap.fap}`);
  assert.ok(res.signals.length <= 2);
});

test("the spectral window of nightly sampling peaks at one day, and a 0.8-day signal is flagged as aliased", () => {
  const r = rng(8);
  const t = [];
  for (let d = 0; d < 200; d++) if (r() < 0.7) t.push(d + 0.05 * r());
  const P = prepare(t, t.map(() => 0));
  const w = spectralWindow(P, 1, 0, 1)[0];
  assert.ok(w > 0.9, `window at 1/day ${w}`);
  const y = t.map((ti) => Math.sin((2 * Math.PI * ti) / 0.8) + 0.3 * gauss(r));
  const res = analyze({ t, y, minPeriod: 0.5, maxPeriod: 50, signals: 1 });
  assert.ok(res.windowPeaks.some((p) => Math.abs(p.period - 1) < 0.01));
  const s = res.found[0];
  // 1/0.8 - 1 = 0.25/day: the alias at 4 days carries nearly all the power
  assert.ok(s.ambiguous, JSON.stringify(s.aliases));
  assert.ok([s.period, ...s.aliases.map((a) => a.period)].some((p) => Math.abs(p - 0.8) < 0.01));
  assert.ok([s.period, ...s.aliases.map((a) => a.period)].some((p) => Math.abs(p - 4) < 0.05));
});

test("HD 164922: four signals at the published periods of its four planets", () => {
  // Keck/HIRES and APF velocities from Fulton et al. (2016), as shipped in radvel.
  // Published periods: b 1206.3 (radvel's example prior), c 75.765 (Fulton et al. 2016),
  // d 12.458 (Benatti et al. 2020), e 41.763 (Rosenthal et al. 2021).
  const r = analyze({ csv: CSV, jitter: 2.6, signals: 6 });
  assert.equal(r.n, 401);
  assert.deepEqual(r.groups.map((g) => [g.name, g.count]), [["k", 52], ["j", 276], ["a", 73]]);
  const periods = r.found.map((s) => s.period);
  for (const [want, tol] of [[1206.3, 0.012], [75.765, 0.002], [12.458, 0.002], [41.763, 0.002]]) {
    assert.ok(periods.slice(0, 4).some((p) => Math.abs(p - want) / want < tol), `${want} not in ${periods}`);
  }
  for (const s of r.found.slice(0, 4)) assert.ok(s.fap.fap < 1e-4);
  assert.ok(r.found[0].amplitude > 6 && r.found[0].amplitude < 8.5);
  assert.match(r.summary, /strongest period is 1,19\d/);
});

test("baluevFap is monotone, finite in log for tiny values, and 1 at zero power", () => {
  const opts = { n: 200, groups: 1, fmax: 1, varT: 1e4 };
  let prev = 2;
  for (const z of [0, 0.01, 0.05, 0.1, 0.2, 0.5, 0.9]) {
    const f = baluevFap(z, opts).fap;
    assert.ok(f <= prev + 1e-15);
    prev = f;
  }
  assert.equal(baluevFap(0, opts).fap, 1);
  const tiny = baluevFap(0.95, opts);
  assert.ok(tiny.fap < 1e-100);
  assert.ok(Number.isFinite(tiny.log10) && tiny.log10 < -100);
  assert.ok(Math.abs(lgamma(10) - Math.log(362880)) < 1e-12);
});

test("input: CSV and whitespace tables, ISO dates, error and group columns found by name", () => {
  const ws = parseCsv("time mnvel errvel tel\n1 2 0.5 k\n2 3 0.5 j\n");
  assert.deepEqual(ws.header, ["time", "mnvel", "errvel", "tel"]);
  const s = readSeries(ws);
  assert.equal(s.columns.error, "errvel");
  assert.equal(s.columns.group, "tel");
  assert.equal(toDays("1970-01-02"), 1);
  assert.equal(toDays("1970-01-01T12:00"), 0.5);
  assert.equal(toDays("1970-01-01T12:00+02:00"), 0.5 - 2 / 24);
  assert.ok(Number.isNaN(toDays("2023-02-30")));
  assert.equal(toNumber("1,234.5"), 1234.5);
  assert.ok(Number.isNaN(toNumber("12,34")));
  const d = readSeries(parseCsv("date,energy\n2024-01-01,3\n2024-01-03,4\n" + "2024-02-01,1\n".repeat(9) + "bad,5\n"));
  assert.equal(d.columns.timeKind, "date");
  assert.equal(d.columns.value, "energy");
  assert.equal(d.columns.error, null);
  assert.equal(d.skipped, 1);
  assert.equal(d.t[1] - d.t[0], 2);
  assert.throws(() => analyze({ csv: "t,y\n1,2\n2,3\n" }), /at least 8/);
  assert.throws(() => analyze({ csv: CSV, valueColumn: "nope" }), /No column named "nope"/);
});

test("outputs: the periodogram CSV, the text report, formula-safe cells, and cited papers", () => {
  const r = analyze({ csv: CSV, signals: 2 });
  const lines = toCsv(r).trim().split("\n");
  assert.equal(lines.length, r.grid.nf + 1);
  assert.match(lines[0], /^frequency,period,power,window_power,power_after_first_signal$/);
  assert.match(report(r), /Signal 1: period 1,19\d/);
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("-3.5"), "-3.5");
  assert.equal(csvCell("-1.5e-7"), "-1.5e-7");
  assert.equal(csvCell("-1+CMD|' /C calc'!A0"), "'-1+CMD|' /C calc'!A0");
  assert.ok(PAPERS.length >= 5 && PAPERS.every((p) => p.implemented && p.deviations && p.url));
});
