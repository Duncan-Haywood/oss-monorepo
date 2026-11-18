import { test } from "node:test";
import assert from "node:assert/strict";
import { boreIn, waterNu, frictionFactor, pipeFlow, demandDistribution, normInv, sizeSupply, validateSupply, supplyText, EXAMPLE, SIZES, MATERIALS } from "./supplysize.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b} (tol ${tol})`);

// A seeded generator so failures repeat.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("bores are outside diameter less two walls (ASTM B88 copper, SDR tube)", () => {
  assert.equal(boreIn("copper-l", "3/4"), 0.785); // 0.875 - 2 x 0.045
  assert.equal(boreIn("copper-k", "1"), 0.995); // 1.125 - 2 x 0.065
  assert.equal(boreIn("copper-m", "1/2"), 0.569); // 0.625 - 2 x 0.028
  assert.equal(boreIn("pex", "1/2"), 0.485); // OD/9 = 0.069 -> floor 0.070
  assert.equal(boreIn("pex", "1"), 0.875); // 1.125/9 = 0.125
  assert.equal(boreIn("cpvc", "3/4"), 0.715); // 0.875/11 = 0.0795 -> 0.080
  assert.equal(boreIn("cpvc", "1/2"), 0.489); // 0.625/11 = 0.057 -> floor 0.068
  for (const m of Object.keys(MATERIALS)) for (let i = 1; i < SIZES.length; i++) assert.ok(boreIn(m, SIZES[i]) > boreIn(m, SIZES[i - 1]), `${m} bores grow with size`);
  assert.equal(boreIn("copper-l", "5"), null);
});

test("water viscosity is within 2% of the usual table values", () => {
  // Kinematic viscosity, ft^2/s: 1.664e-5 at 40 F, 1.217e-5 at 60 F, 0.739e-5 at 100 F, 0.442e-5 at 160 F.
  for (const [t, v] of [[40, 1.664e-5], [60, 1.217e-5], [100, 0.739e-5], [160, 0.442e-5]]) close(waterNu(t) / v, 1, 0.02, `${t} F`);
});

test("friction factor solves Colebrook, is 64/Re when laminar, and sits near Swamee-Jain", () => {
  for (const re of [3000, 1e4, 5e4, 2e5, 1e6]) for (const rr of [0, 1e-5, 1e-4, 1e-3]) {
    const f = frictionFactor(re, rr);
    const lhs = 1 / Math.sqrt(f), rhs = -2 * Math.log10(rr / 3.7 + 2.51 / (re * Math.sqrt(f)));
    close(lhs, rhs, 1e-9, `Colebrook residual at Re ${re}, e/D ${rr}`);
    const sj = 0.25 / Math.log10(rr / 3.7 + 5.74 / Math.pow(re, 0.9)) ** 2;
    close(f / sj, 1, 0.03, `Swamee-Jain at Re ${re}`);
  }
  assert.equal(frictionFactor(1000, 1e-4), 0.064);
  assert.equal(frictionFactor(0, 1e-4), 0);
});

test("pipe loss: hand velocity, and within 15% of Hazen-Williams C=150 for smooth tube", () => {
  const r = pipeFlow(8, 0.785);
  // 8 gpm = 0.017824 ft^3/s through pi (0.785/12)^2 / 4 = 0.0033610 ft^2.
  close(r.velocityFps, 5.3032, 1e-3);
  for (const [gpm, d] of [[4, 0.545], [8, 0.785], [12, 1.025], [20, 1.265], [30, 1.505]]) {
    const hw = 4.52 * gpm ** 1.852 / (150 ** 1.852 * d ** 4.8704); // psi per ft
    close(pipeFlow(gpm, d).psiPerFt / hw, 1, 0.15, `${gpm} gpm in ${d} in`);
  }
});

test("one fixture type: the quantile is the binomial count times the flow", () => {
  // 10 fixtures at p = 0.1, 2 gpm each. Hand: P(K <= 2) = 0.9298, P(K <= 3) = 0.9872, P(K <= 4) = 0.9984.
  const d = demandDistribution([{ gpm: 2, p: 0.1, count: 10 }]);
  assert.equal(d.quantile(0.99), 8); // 4 running
  assert.equal(d.quantile(0.98), 6); // 3 running
  assert.equal(d.quantile(0.9), 4);
  close(d.mean, 2, 1e-12);
  close(d.variance, 10 * 0.1 * 0.9 * 4, 1e-12);
  close(d.pmf.reduce((a, b) => a + b, 0), 1, 1e-12);
});

test("mixed types: the convolution equals brute-force enumeration of every on/off pattern", () => {
  const r = rng(7);
  for (let trial = 0; trial < 60; trial++) {
    const groups = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ gpm: Math.round((0.5 + r() * 5) * 100) / 100, p: r() * 0.4, count: Math.floor(r() * 4) }));
    const fx = groups.flatMap((g) => Array(g.count).fill(g));
    /** @type {Map<number, number>} */
    const m = new Map();
    for (let mask = 0; mask < 1 << fx.length; mask++) {
      let flow = 0, pr = 1;
      fx.forEach((f, i) => { if (mask >> i & 1) { flow += Math.round(f.gpm * 100); pr *= f.p; } else pr *= 1 - f.p; });
      m.set(flow, (m.get(flow) ?? 0) + pr);
    }
    const keys = [...m.keys()].sort((a, b) => a - b);
    const d = demandDistribution(groups);
    for (const q of [0.5, 0.9, 0.99, 0.999]) {
      let c = 0, want = keys[keys.length - 1];
      for (const k of keys) { c += m.get(k); if (c >= q - 1e-12) { want = k; break; } }
      close(d.quantile(q), want / 100, 1e-9, `trial ${trial} q ${q}`);
    }
  }
});

test("Monte Carlo agrees with the exact distribution on the example house", () => {
  const groups = Object.values(EXAMPLE.fixtureTypes).map((t) => ({ gpm: t.gpm, p: t.minutesPerUse * t.usesPerPeakHour / 60, count: 0 }));
  const ids = Object.keys(EXAMPLE.fixtureTypes);
  for (const s of EXAMPLE.segments) for (const [k, n] of Object.entries(s.fixtures || {})) groups[ids.indexOf(k)].count += n;
  const d = demandDistribution(groups);
  const r = rng(11), N = 200000;
  const draws = new Float64Array(N);
  for (let i = 0; i < N; i++) { let f = 0; for (const g of groups) for (let j = 0; j < g.count; j++) if (r() < g.p) f += g.gpm; draws[i] = f; }
  draws.sort();
  close(draws.reduce((a, b) => a + b, 0) / N, d.mean, 0.03);
  assert.equal(Math.round(draws[Math.floor(0.99 * N)] * 100) / 100, d.quantile(0.99));
});

test("normInv matches known z values", () => {
  close(normInv(0.99), 2.326348, 1e-6);
  close(normInv(0.5), 0, 1e-9);
  close(normInv(0.01), -2.326348, 1e-6);
  close(normInv(0.999), 3.090232, 1e-6);
});

test("worked example: demands, sizes and pressures tie out by an independent walk", () => {
  const r = sizeSupply(EXAMPLE);
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.segments.map((s) => [s.id, s]));
  assert.equal(by.main.fixtures, 11);
  assert.equal(by.main.allOnGpm, 27.2);
  assert.equal(by.main.demandGpm, 12.2);
  assert.equal(by.main.size, "1");
  assert.equal(by.riser.size, "3/4");
  assert.equal(by["bath-1"].size, "1/2");
  assert.equal(by["kitchen-laundry"].demandGpm, 6.2);
  assert.equal(r.passes, true);
  assert.equal(r.lowest.id, "bath-2");
  // Walk each path again from the typed numbers.
  const seg = Object.fromEntries(EXAMPLE.segments.map((s) => [s.id, s]));
  for (const s of r.segments) {
    let psi = EXAMPLE.staticPsi - EXAMPLE.meterLossPsi;
    const path = [];
    for (let c = s.id; c; c = seg[c].parent) path.unshift(c);
    for (const id of path) {
      const row = by[id], t = seg[id];
      psi -= pipeFlow(row.demandGpm, boreIn("copper-l", row.size)).psiPerFt * (t.lengthFt + (t.fittingsFt ?? 0)) + (t.riseFt ?? 0) * 62.37 / 144;
      assert.ok(row.velocityFps <= 8 + 1e-9);
    }
    close(s.endPsi, psi, 0.006, s.id);
  }
  // Parents never carry less than a child, and never more than all-on.
  for (const s of r.segments) {
    assert.ok(s.demandGpm <= s.allOnGpm + 1e-9 && s.demandGpm >= s.meanGpm - 1e-9);
    if (s.parent) assert.ok(by[s.parent].demandGpm >= s.demandGpm - 1e-9);
  }
  const text = supplyText(r).join("\n");
  assert.match(text, /main: 1 in, 11 fixtures fed, design 12\.2 gpm \(all on at once 27\.2\)/);
});

test("a high pressure need upsizes the runs that buy the most pressure, and an impossible one says so", () => {
  const r = sizeSupply({ ...EXAMPLE, minPsi: 44 });
  assert.equal(r.passes, true);
  assert.ok(r.segments.some((s) => s.sizedBy === "pressure"));
  assert.ok(r.lowest.psi >= 44);
  const base = sizeSupply(EXAMPLE);
  for (const s of r.segments) assert.ok(SIZES.indexOf(s.size) >= SIZES.indexOf(base.segments.find((b) => b.id === s.id).size));
  const no = sizeSupply({ ...EXAMPLE, minPsi: 50 });
  assert.equal(no.passes, false);
  assert.match(no.warnings.join(" "), /below 50 psi/);
});

test("PEX at a higher quantile needs bigger pipe than copper L at 0.99", () => {
  const a = sizeSupply(EXAMPLE), b = sizeSupply({ ...EXAMPLE, material: "pex", quantile: 0.999 });
  const idx = (r, id) => SIZES.indexOf(r.segments.find((s) => s.id === id).size);
  for (const s of a.segments) assert.ok(idx(b, s.id) >= idx(a, s.id), s.id);
  assert.ok(b.segments.find((s) => s.id === "main").demandGpm > a.segments.find((s) => s.id === "main").demandGpm);
});

test("refuses bad plans with a reason", () => {
  const bad = [
    [null, /object/],
    [{ ...EXAMPLE, fixtureTypes: {} }, /fixtureTypes/],
    [{ ...EXAMPLE, segments: [] }, /segments/],
    [{ ...EXAMPLE, material: "lead" }, /material/],
    [{ ...EXAMPLE, staticPsi: -1 }, /staticPsi/],
    [{ ...EXAMPLE, minPsi: undefined }, /minPsi/],
    [{ ...EXAMPLE, quantile: 1 }, /quantile/],
    [{ ...EXAMPLE, fixtureTypes: { a: { gpm: 2.345, p: 0.1 } }, segments: [{ id: "m", lengthFt: 1, fixtures: { a: 1 } }] }, /hundredth/],
    [{ ...EXAMPLE, fixtureTypes: { a: { gpm: 2, minutesPerUse: 30, usesPerPeakHour: 3 } }, segments: [{ id: "m", lengthFt: 1, fixtures: { a: 1 } }] }, /more than 60 minutes/],
    [{ ...EXAMPLE, segments: [{ id: "a", lengthFt: 1, fixtures: { lav: 1 } }, { id: "b", lengthFt: 1 }] }, /Exactly one segment/],
    [{ ...EXAMPLE, segments: [{ id: "a", lengthFt: 1, fixtures: { lav: 1 } }, { id: "b", parent: "c", lengthFt: 1 }, { id: "c", parent: "b", lengthFt: 1 }] }, /loop/],
    [{ ...EXAMPLE, segments: [{ id: "a", lengthFt: 1, fixtures: { tub: 1 } }] }, /not in fixtureTypes/],
    [{ ...EXAMPLE, segments: [{ id: "a", lengthFt: 1 }] }, /No segment feeds/],
    [{ ...EXAMPLE, segments: [{ id: "a", lengthFt: 1, fixtures: { lav: 1.5 } }] }, /whole number/],
    [{ ...EXAMPLE, customBores: { "3/4": 5 } }, /customBores/],
  ];
  for (const [plan, re] of bad) {
    const e = validateSupply(plan);
    assert.ok(e.length > 0 && e.some((x) => re.test(x)), `${re}: ${e.join(" | ")}`);
    assert.equal(sizeSupply(plan).ok, false);
  }
  assert.deepEqual(validateSupply(EXAMPLE), []);
});

test("fuzz: random trees are refused with a reason or tie out", () => {
  const r = rng(2026);
  for (let t = 0; t < 150; t++) {
    const n = 1 + Math.floor(r() * 8);
    const segs = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, ...(i ? { parent: `s${Math.floor(r() * i)}` } : {}), lengthFt: Math.round(r() * 80), riseFt: Math.round((r() - 0.3) * 12), fittingsFt: Math.round(r() * 15), fixtures: r() < 0.7 ? { lav: Math.floor(r() * 3), shower: Math.floor(r() * 2), hose: Math.floor(r() * 2) } : {} }));
    const plan = { ...EXAMPLE, material: Object.keys(MATERIALS)[Math.floor(r() * 5)], minPsi: Math.round(r() * 40), segments: segs };
    const out = sizeSupply(plan);
    if (!out.ok) { assert.ok(out.errors.length > 0); continue; }
    for (const s of out.segments) {
      for (const v of [s.demandGpm, s.velocityFps, s.lossPsi, s.endPsi]) assert.ok(Number.isFinite(v), JSON.stringify(s));
      assert.ok(s.demandGpm <= s.allOnGpm + 1e-9);
      if (s.size !== "2") assert.ok(s.velocityFps <= 8 + 1e-9);
    }
    const low = out.segments.filter((s) => s.feedsFixturesHere && s.endPsi < plan.minPsi - 0.006);
    assert.equal(out.passes, low.length === 0);
  }
});
