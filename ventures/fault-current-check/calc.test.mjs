import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, sampleInput, labelText, reportCsv, rdcPerMetre, racPerMetre, skinFactor, kappa, SIZES, DEFAULT_X_PER_1000FT, MAGNETIC_X_FACTOR } from "./calc.mjs";

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b} (tol ${tol})`);
const base = { phase: "3", volts: "480", sourceMode: "transformer", kva: "1500", pctZ: "3.5", txXR: "6", tolerancePct: "0", utilityMva: "", motorFla: "", tempC: "25", lengthUnit: "ft", serviceRatingKa: "", segments: [] };

test("transformer on an infinite bus: FLA / %Z by hand", () => {
  const a = analyze(base);
  const fla = 1500000 / (Math.sqrt(3) * 480);
  close(a.nodes[0].amps, fla / 0.035, 0.01);
  close(a.nodes[0].amps, 51549, 1);
  close(a.nodes[0].xr, 6, 1e-9);
});

test("a 10 % impedance allowance divides by 0.9, and motors add multiplier x FLA at the service", () => {
  const a = analyze({ ...base, tolerancePct: "10", motorFla: "1804", motorMult: "4" });
  const fla = 1500000 / (Math.sqrt(3) * 480);
  close(a.nodes[0].amps, fla / 0.0315 + 4 * 1804, 0.01);
  close(a.nodes[0].ampsP2P, a.nodes[0].amps, 1e-6);
});

test("single-phase 120/240: line-to-line fault through a loop of two conductors", () => {
  const seg = { size: "2/0", material: "cu", sets: "1", length: "100", conduit: "nonmagnetic" };
  const a = analyze({ ...base, phase: "1", volts: "240", kva: "50", pctZ: "2", txXR: "", segments: [seg] });
  close(a.nodes[0].amps, 50000 / 240 / 0.02, 0.01);
  const area = SIZES.find((s) => s.id === "2/0").areaMm2;
  const r = racPerMetre(area, "cu", 25, 60), xm = DEFAULT_X_PER_1000FT / 304.8;
  const zt = (0.02 * 240 * 240) / 50000, rt = zt / Math.sqrt(37), xt = rt * 6;
  const L = 2 * 100 * 0.3048;
  close(a.nodes[1].amps, 240 / Math.hypot(rt + r * L, xt + xm * L), 0.01);
  assert.ok(a.findings.some((f) => /X\/R was not entered; 6/.test(f.detail)));
});

test("the magnitude sum is the point-to-point method's f and M, feeder and transformer", () => {
  const segs = [
    { size: "400", material: "cu", sets: "6", length: "25", conduit: "magnetic" },
    { from: 1, size: "1", material: "cu", sets: "1", length: "40", conduit: "magnetic", txKva: "75", txPctZ: "4.5", txXR: "2", txVolts: "208" },
  ];
  const a = analyze({ ...base, segments: segs });
  const I0 = a.nodes[0].ampsP2P;
  const area = SIZES.find((s) => s.id === "400").areaMm2;
  const zft = Math.hypot(racPerMetre(area, "cu", 25, 60) * 0.3048, (DEFAULT_X_PER_1000FT * MAGNETIC_X_FACTOR) / 1000);
  const Cval = 1 / zft;
  const f1 = (Math.sqrt(3) * 25 * I0) / (Cval * 6 * 480);
  const I1 = I0 / (1 + f1);
  close(a.nodes[1].ampsP2P, I1, 0.01);
  const a1 = SIZES.find((s) => s.id === "1").areaMm2;
  const z1 = Math.hypot(racPerMetre(a1, "cu", 25, 60) * 0.3048, (DEFAULT_X_PER_1000FT * MAGNETIC_X_FACTOR) / 1000);
  const f2 = (Math.sqrt(3) * 40 * I1 * z1) / (1 * 480);
  const Ip = I1 / (1 + f2);
  const ft = (Ip * 480 * Math.sqrt(3) * 4.5) / (100000 * 75);
  close(a.nodes[2].ampsP2P, (480 / 208) * Ip / (1 + ft), 0.01);
});

test("the complex sum is never below the magnitude sum", () => {
  const a = analyze(sampleInput());
  for (const n of a.nodes) assert.ok(n.amps >= n.ampsP2P - 1e-6, n.name);
  assert.ok(a.nodes[2].p2pLowPct > 4);
  assert.ok(a.findings.some((f) => f.severity === "medium" && /reads .* low/.test(f.title)));
});

test("the example flags the 10 kA panel and labels round up to 100 A", () => {
  const a = analyze(sampleInput());
  assert.equal(a.over, 1);
  assert.equal(a.nodes[2].ok, false);
  assert.match(a.findings[0].title, /above its 10 kA rating/);
  for (const n of a.nodes) { assert.equal(n.labelA % 100, 0); assert.ok(n.labelA >= n.amps && n.labelA - n.amps < 100); }
  const t = labelText(a.nodes[0], "2026-11-20");
  assert.match(t, /Maximum available fault current: 64,500 A/);
  assert.match(t, /Date of calculation: 2026-11-20/);
  assert.match(labelText(a.nodes[0], ""), /____/);
});

test("a known utility figure is the source; utility MVA adds impedance ahead of the transformer", () => {
  const a = analyze({ ...base, sourceMode: "known", knownA: "42000", knownXR: "8" });
  close(a.nodes[0].amps, 42000, 1e-6);
  const inf = analyze(base).nodes[0].amps;
  const fin = analyze({ ...base, utilityMva: "500", utilityXR: "10" }).nodes[0].amps;
  assert.ok(fin < inf);
  const zt = (0.035 * 480 ** 2) / 1.5e6, zu = 480 ** 2 / 500e6;
  const rt = zt / Math.sqrt(37), ru = zu / Math.sqrt(101);
  close(fin, 480 / (Math.sqrt(3) * Math.hypot(rt + ru, 6 * rt + 10 * ru)), 0.01);
});

test("resistance by hand, skin effect and kappa", () => {
  const area = SIZES.find((s) => s.id === "12").areaMm2;
  close(rdcPerMetre(area, "cu", 25), (1.7241e-8 * (1 + 0.00393 * 5) * 1.02) / (area * 1e-6), 1e-15);
  assert.ok(skinFactor(rdcPerMetre(area, "cu", 25), 60) < 1e-4);
  const big = SIZES.find((s) => s.id === "1000").areaMm2;
  const ys = skinFactor(rdcPerMetre(big, "cu", 25), 60);
  assert.ok(ys > 0.05 && ys < 0.15, String(ys));
  close(kappa(6), 1.02 + 0.98 * Math.exp(-0.5), 1e-12);
  close(kappa(1e9), 2, 1e-6);
});

test("a feeder may branch from any earlier panel, and metres work", () => {
  const segs = [{ size: "500", sets: "2", length: "10", conduit: "nonmagnetic" }, { from: 0, size: "4", length: "30" }, { from: 1, size: "4", length: "30" }];
  const a = analyze({ ...base, lengthUnit: "m", segments: segs });
  assert.ok(a.nodes[2].amps > a.nodes[3].amps);
  assert.equal(a.nodes[3].from, 1);
});

test("errors", () => {
  assert.match(analyze({ ...base, volts: "" }).error, /voltage/);
  assert.match(analyze({ ...base, kva: "0" }).error, /kVA/);
  assert.match(analyze({ ...base, pctZ: "60" }).error, /%Z/);
  assert.match(analyze({ ...base, sourceMode: "known", knownA: "" }).error, /utility gave/);
  assert.match(analyze({ ...base, segments: [{ size: "zz", length: "10" }] }).error, /conductor size/);
  assert.match(analyze({ ...base, segments: [{ size: "4", length: "10", from: 3 }] }).error, /fed from/);
  assert.match(analyze({ ...base, segments: [{ size: "4", length: "0" }] }).error, /length, or a transformer/);
  assert.match(analyze({ ...base, freq: "55" }).error, /50 or 60/);
});

test("CSV has a row per node and guards formula cells", () => {
  const a = analyze({ ...sampleInput(), serviceName: "=cmd()" });
  const csv = reportCsv(a);
  assert.equal(csv.trim().split("\n").length, 1 + a.nodes.length);
  assert.match(csv, /\n0,'=cmd\(\)/);
});
