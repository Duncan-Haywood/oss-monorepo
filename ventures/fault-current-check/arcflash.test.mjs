import { test } from "node:test";
import assert from "node:assert/strict";
import { arcFlash, arcFlashWorstEnclosed, arcLabelText, EQUIPMENT } from "./arcflash.mjs";

const near = (got, want, places, what) =>
  assert.ok(Math.abs(got - want) < 0.5 * 10 ** -places + 1e-12, `${what}: got ${got}, want ${want} to ${places} places`);

// IEEE 1584-2018 Annex D.1 (4.16 kV VCB switchgear), figures as asserted in the
// arcflash library's tests (equation numbers D.9 ... D.72).
test("Annex D.1: 4160 V VCB, 15 kA, 197 / 223 ms", () => {
  const r = arcFlash({ volts: 4160, config: "VCB", ibfKa: 15, gapMm: 104, distMm: 914.4, heightMm: 1143, widthMm: 762, depthMm: 508, clearMs: 197, clearMinMs: 223 });
  assert.ok(!r.error, r.error);
  const [a600, a2700, a14300] = r.full.inter.iarcKa;
  near(a600, 11.117, 3, "D.9"); near(a2700, 12.816, 3, "D.11"); near(a14300, 14.116, 3, "D.13");
  near(r.full.iarcKa, 12.979, 3, "D.17");
  near(r.width1, 27.632, 3, "D.19"); near(r.height1, 45, 3, "D.20"); near(r.ees, 36.316, 3, "D.21"); near(r.cf, 1.284, 3, "D.22");
  const [e600, e2700, e14300] = r.full.inter.eJ;
  near(e600, 8.652, 3, "D.24"); near(e2700, 11.977, 3, "D.26"); near(e14300, 13.367, 3, "D.28");
  near(r.full.eJ, 12.152, 3, "D.32");
  const [b600, b2700, b14300] = r.full.inter.afbMm;
  near(b600, 1285, 0, "D.34"); near(b2700, 1591, 0, "D.36"); near(b14300, 1707, 0, "D.38");
  near(r.full.afbMm, 1606, 0, "D.42");
  near(r.varCf, 0.047, 3, "D.43");
  const [m600, m2700, m14300] = r.reduced.inter.iarcKa;
  near(m600, 10.856, 3, "D.45"); near(m2700, 12.515, 3, "D.46"); near(m14300, 13.786, 3, "D.47");
  near(r.reduced.iarcKa, 12.675, 3, "D.51");
  const [n600, n2700, n14300] = r.reduced.inter.eJ;
  near(n600, 8.980, 3, "D.54"); near(n2700, 13.018, 3, "D.56"); near(n14300, 15.602, 3, "D.58");
  near(r.reduced.eJ, 13.343, 3, "D.62");
  const [c600, c2700, c14300] = r.reduced.inter.afbMm;
  near(c600, 1316, 0, "D.64"); near(c2700, 1678, 0, "D.66"); near(c14300, 1884, 0, "D.68");
  near(r.reduced.afbMm, 1704, 0, "D.72");
  assert.equal(r.worst, "reduced");
  near(r.eCal, r.reduced.eJ / 4.184, 9, "worst in cal/cm²");
  near(r.eCal, 3.189, 3, "13.343 J/cm² in cal/cm²");
  assert.equal(r.warnings.length, 0);
});

// Annex D.2 (480 V VCB switchgear).
test("Annex D.2: 480 V VCB, 45 kA, 61.3 / 319 ms", () => {
  const r = arcFlash({ volts: 480, config: "VCB", ibfKa: 45, gapMm: 32, distMm: 609.6, heightMm: 610, widthMm: 610, depthMm: 254, clearMs: 61.3, clearMinMs: 319 });
  assert.ok(!r.error, r.error);
  near(r.full.iarcKa, 28.793, 3, "D.84");
  near(r.width1, 24.016, 3, "D.86"); near(r.height1, 24.016, 3, "D.87"); near(r.ees, 24.016, 3, "D.88"); near(r.cf, 1.085, 3, "D.89");
  near(r.full.eJ, 11.585, 3, "D.91");
  near(r.full.afbMm, 1029, 0, "D.95");
  near(r.varCf, 0.247, 3, "D.96");
  near(r.reduced.iarcKa, 25.244, 3, "D.99");
  near(r.reduced.eJ, 53.156, 3, "D.103");
  near(r.reduced.afbMm, 2669, 0, "D.106");
  assert.equal(r.worst, "reduced");
  assert.equal(r.box, "Typical");
});

test("shallow low-voltage box takes 1/x and open air takes CF 1", () => {
  const p = EQUIPMENT.find((e) => e.id === "lv-panel-shallow");
  const s = arcFlash({ volts: 208, config: "VCB", ibfKa: 10, gapMm: p.gap, distMm: p.dist, heightMm: p.h, widthMm: p.w, depthMm: p.d, clearMs: 20, clearMinMs: 30 });
  assert.equal(s.box, "Shallow");
  const o = arcFlash({ volts: 480, config: "VOA", ibfKa: 20, gapMm: 32, distMm: 610, clearMs: 50, clearMinMs: 60 });
  assert.equal(o.cf, 1);
  assert.equal(o.box, null);
});

test("out-of-range inputs are refused, not extrapolated", () => {
  const base = { volts: 480, config: "VCB", ibfKa: 30, gapMm: 32, distMm: 610, heightMm: 508, widthMm: 508, depthMm: 508, clearMs: 50 };
  assert.ok(arcFlash({ ...base, volts: 120 }).error);
  assert.ok(arcFlash({ ...base, volts: 34500 }).error);
  assert.ok(arcFlash({ ...base, ibfKa: 0.3 }).error);
  assert.ok(arcFlash({ ...base, ibfKa: 120 }).error);
  assert.ok(arcFlash({ ...base, gapMm: 100 }).error);
  assert.ok(arcFlash({ ...base, distMm: 200 }).error);
  assert.ok(arcFlash({ ...base, widthMm: 100 }).error);
  assert.ok(arcFlash({ ...base, clearMs: "" }).error);
  assert.ok(arcFlash({ ...base, volts: 4160, gapMm: 104, ibfKa: 70, widthMm: 762, heightMm: 1143 }).error);
  assert.ok(arcFlash({ ...base, config: "XYZ" }).error);
});

test("one clearing time and long times are flagged; a cap applies to both cases", () => {
  const base = { volts: 480, config: "VCB", ibfKa: 30, gapMm: 32, distMm: 610, heightMm: 508, widthMm: 508, depthMm: 508 };
  const one = arcFlash({ ...base, clearMs: 100 });
  assert.match(one.warnings.join(" "), /same time/);
  const long = arcFlash({ ...base, clearMs: 100, clearMinMs: 5000 });
  assert.match(long.warnings.join(" "), /over 2 seconds/);
  const capped = arcFlash({ ...base, clearMs: 100, clearMinMs: 5000, capMs: 2000 });
  assert.equal(capped.reduced.tMs, 2000);
  assert.ok(capped.eJ < long.eJ);
  // Energy is linear in time.
  const a = arcFlash({ ...base, clearMs: 50, clearMinMs: 50 }), b = arcFlash({ ...base, clearMs: 100, clearMinMs: 100 });
  near(b.full.eJ / a.full.eJ, 2, 9, "linear in T");
});

test("worst enclosed configuration and the label", () => {
  const r = arcFlashWorstEnclosed({ volts: 480, ibfKa: 30, gapMm: 32, distMm: 610, heightMm: 508, widthMm: 508, depthMm: 508, clearMs: 50, clearMinMs: 80 });
  assert.equal(r.compared.length, 3);
  assert.equal(r.eCal, Math.max(...r.compared.map((c) => c.eCal)));
  const t = arcLabelText("MDP", r, "2026-11-20");
  assert.match(t, /cal\/cm² at 24 in/);
  assert.match(t, /2026-11-20/);
  assert.match(t, new RegExp(r.config));
});
