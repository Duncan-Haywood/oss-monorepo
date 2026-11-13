// Run: node --test drape.test.mjs
// The solver is checked against closed-form answers before any garment test.
import test from "node:test";
import assert from "node:assert/strict";
import { gridMesh, buildCloth, simulate, cylinderBody, bodyModel, girthAt, clearance, triangleStrain, drapeGarment, drapeSvg, strainColour, armContact, armRadiusAt, pairEdges, onPolyline, G } from "./drape.mjs";

test("a strip hanging under its own weight stretches by rho g L^2 / (2 Kt)", () => {
  const W = 0.1, L = 0.5, fab = { gsm: 180, ktNPerM: 5 };
  const m = gridMesh({ x0: 0, x1: W, y0: 0, y1: L, h: 0.0125 });
  const cloth = buildCloth([m], fab);
  const pos = new Float64Array(3 * cloth.n);
  m.uv.forEach(([u, v], i) => { pos[3 * i] = u; pos[3 * i + 1] = -v; });
  const pins = m.grid[0].filter(i => i >= 0);
  const r = simulate(cloth, pos, { pins, settleTime: 4, substeps: 8, iterations: 4, damping: 4 });
  const bottom = m.grid[m.nr].filter(i => i >= 0);
  const y = bottom.reduce((s, i) => s + r.pos[3 * i + 1], 0) / bottom.length;
  const stretch = -y - L, expected = (fab.gsm / 1000) * G * L * L / (2 * fab.ktNPerM);
  assert.ok(Math.abs(stretch / expected - 1) < 0.08, `stretch ${stretch.toFixed(4)} m vs ${expected.toFixed(4)} m`);
});

test("a nearly inextensible strip between two pins sags like a catenary", () => {
  const S = 1.0, D = 0.8, fab = { gsm: 150, ktNPerM: 5000 };
  const m = gridMesh({ x0: 0, x1: 0.02, y0: 0, y1: S, h: 0.01 });
  const cloth = buildCloth([m], fab);
  // start on a circular arc of the right length over the span
  let lo = S / (2 * Math.PI) + 1e-6, hi = 100;
  for (let k = 0; k < 200; k++) { const R = (lo + hi) / 2; if (2 * R * Math.sin(S / (2 * R)) > D) hi = R; else lo = R; }
  const R = (lo + hi) / 2;
  const pos = new Float64Array(3 * cloth.n);
  m.uv.forEach(([u, v], i) => { const th = (v - S / 2) / R; pos[3 * i] = R * Math.sin(th); pos[3 * i + 1] = R * (1 - Math.cos(th)); pos[3 * i + 2] = u; }); // lowest in the middle
  const pins = [...m.grid[0], ...m.grid[m.nr]].filter(i => i >= 0);
  const pinY = pos[3 * pins[0] + 1];
  const r = simulate(cloth, pos, { pins, settleTime: 4, substeps: 32, damping: 4, compressionSoftness: 100 });
  // catenary parameter a from S = 2 a sinh(D / 2a)
  let a0 = 0.01, a1 = 100;
  for (let k = 0; k < 200; k++) { const a = (a0 + a1) / 2; if (2 * a * Math.sinh(D / (2 * a)) > S) a0 = a; else a1 = a; }
  const a = (a0 + a1) / 2, sag = a * (Math.cosh(D / (2 * a)) - 1);
  const mid = m.grid[Math.round(m.nr / 2)].filter(i => i >= 0);
  const yMid = mid.reduce((s, i) => s + r.pos[3 * i + 1], 0) / mid.length;
  const got = pinY - yMid;
  assert.ok(Math.abs(got / sag - 1) < 0.03, `sag ${got.toFixed(4)} m vs catenary ${sag.toFixed(4)} m`);
});

test("a tube on a cylinder takes the girth's hoop strain and presses by Laplace's law", () => {
  const Rb = 0.1, thick = 0.002, C0 = 0.9 * 2 * Math.PI * Rb, Hh = 0.2, fab = { gsm: 200, ktNPerM: 80 };
  const m = gridMesh({ x0: 0, x1: C0, y0: 0, y1: Hh, h: 0.02 });
  const cloth = buildCloth([m], fab);
  const pos = new Float64Array(3 * cloth.n), R0 = Rb + 0.02;
  m.uv.forEach(([u, v], i) => { const th = (u / C0) * 2 * Math.PI * 0.97; pos[3 * i] = R0 * Math.sin(th); pos[3 * i + 1] = 1 - v; pos[3 * i + 2] = R0 * Math.cos(th); });
  const seams = m.grid.map(row => [row[0], row[row.length - 1]]).filter(([i, j]) => i >= 0 && j >= 0);
  const body = cylinderBody(Rb, Rb, 0, 2);
  const r = simulate(cloth, pos, { body, seams, gravity: 0, settleTime: 1.5, sewTime: 0.3, substeps: 64, friction: 0, thickness: thick, seamStiffness: 1e5 });
  const st = triangleStrain(cloth, r.pos);
  const hoop = st.reduce((s, x) => s + x.ex * x.area, 0) / st.reduce((s, x) => s + x.area, 0);
  const expected = (2 * Math.PI * (Rb + thick)) / C0 - 1;
  assert.ok(Math.abs(hoop - expected) < 0.01, `hoop strain ${hoop.toFixed(4)} vs ${expected.toFixed(4)}`);
  // pressure the solver feels on the middle rows against T / R. One XPBD iteration
  // softens a constraint by 1 / (1 + k w dt^2), so this cross-check needs a small step
  // (measured: 0.46 of T / R with a 1 cm mesh at 32 substeps, 0.77 with 2 cm at 32, 0.95 with 2 cm at 64).
  let F = 0;
  for (let rIdx = 2; rIdx <= m.nr - 2; rIdx++) for (const i of m.grid[rIdx]) if (i >= 0) F += r.force[i];
  const band = (m.nr - 3) * m.hy, P = F / (2 * Math.PI * (Rb + thick) * band);
  const laplace = fab.ktNPerM * hoop / (Rb + thick);
  assert.ok(Math.abs(P / laplace - 1) < 0.1, `pressure ${P.toFixed(1)} Pa vs Laplace ${laplace.toFixed(1)} Pa`);
  for (let i = 0; i < cloth.n; i++) assert.ok(Math.hypot(r.pos[3 * i], r.pos[3 * i + 2]) >= Rb + thick - 1e-3);
});

test("body model: girths match the tape measurements, missing ones are assumed and named", () => {
  const b = bodyModel({ chest: 100, waist: 86, hip: 98, height: 180 });
  assert.equal(b.ok, true);
  assert.ok(Math.abs(girthAt(b, 0.72 * 1.8) - 1.0) < 0.002);
  assert.ok(Math.abs(girthAt(b, 0.62 * 1.8) - 0.86) < 0.002);
  assert.ok(Math.abs(girthAt(b, 0.53 * 1.8) - 0.98) < 0.002);
  assert.equal(girthAt(b, 2.0), 0);
  assert.ok(clearance(b, 0, 1.3, 0) < 0 && clearance(b, 0.5, 1.3, 0) > 0.2);
  const a = bodyModel({ chest: 100 });
  assert.deepEqual(a.assumed, ["height 175 cm", "waist 90 cm", "hip 98 cm", "upper arm 31 cm", "wrist 16.5 cm"]);
  assert.equal(bodyModel({ chest: 20 }).ok, false);
});

test("arms: the upper arm and wrist girths are the ones entered, the arms hang outward and down, and contact is measured from the surface", () => {
  const b = bodyModel({ chest: 100, height: 180, upperArm: 33, wrist: 17 }, { armAngleDeg: 30 });
  assert.equal(b.arms.length, 2);
  for (const arm of b.arms) {
    assert.ok(Math.abs(2 * Math.PI * armRadiusAt(arm, 0) - 0.33) < 1e-9);
    assert.ok(Math.abs(2 * Math.PI * armRadiusAt(arm, arm.wristAt) - 0.17) < 1e-9);
    assert.ok(Math.sign(arm.d[0]) === arm.side && arm.d[1] < 0);
    assert.ok(Math.abs(Math.atan2(Math.abs(arm.d[0]), -arm.d[1]) * 180 / Math.PI - 30) < 1e-9);
    // a point 1 cm off the arm's surface, straight out from the axis half way to the elbow
    const s = arm.elbowAt / 2, r = armRadiusAt(arm, s);
    const c = armContact(b, arm.p0[0] + s * arm.d[0], arm.p0[1] + s * arm.d[1], r + 0.01);
    assert.ok(Math.abs(c.dist - 0.01) < 1e-4, String(c.dist));
  }
});

test("sewing two edges of unequal spacing joins every vertex on both, at matching fractions", () => {
  const A = [0, 0.25, 0.5, 0.75, 1].map((f, i) => ({ i, f })), B = [0, 0.5, 1].map((f, k) => ({ i: 10 + k, f }));
  const pairs = pairEdges(A, B);
  for (const a of A) assert.ok(pairs.some(([i]) => i === a.i));
  for (const b of B) assert.ok(pairs.some(([, j]) => j === b.i));
  assert.ok(pairs.some(([i, j]) => i === 4 && j === 12) && pairs.some(([i, j]) => i === 0 && j === 10));
  assert.equal(new Set(pairs.map(p => p.join())).size, pairs.length);
  const p = onPolyline([[0, 0], [1, 0], [1, 1]], 1.2, 0.5);
  assert.ok(Math.abs(p.f - 0.75) < 1e-12 && Math.abs(p.d - 0.2) < 1e-12);
});

test("sleeves: sewn into the armholes they skim the arm, and the old half-width sleeve is caught stretched round it", () => {
  const me = { chest: 100, waist: 88, hip: 98, height: 178 };
  const r = drapeGarment(me, { garment: "tee", size: "M" });
  assert.equal(r.ok, true);
  assert.equal(r.sleeves.length, 2);
  assert.equal(r.checks.verticesInsideBody, 0);
  assert.ok(r.checks.seamGapCm < 1, `seam gap ${r.checks.seamGapCm}`);
  assert.equal(r.checks.settled, true);
  for (const s of r.sleeves) {
    const bicep = s.levels.find(l => l.where === "bicep");
    assert.ok(bicep.hoopStrainPct < 3, JSON.stringify(bicep));
    // a 22 cm tee sleeve (shoulder point to cuff) ends well above the elbow
    assert.ok(s.cuffAboveElbowCm > 5, String(s.cuffAboveElbowCm));
  }
  // the pre-2026-11-13 sleeve: the flat bicep (about 12 cm at M) drawn as the full width
  const old = drapeGarment(me, { garment: "tee", size: "M", pattern: { bicepCm: 12 } });
  const oldBicep = old.sleeves[0].levels.find(l => l.where === "bicep");
  assert.ok(oldBicep.hoopStrainPct > 15 && oldBicep.touchingPct === 100, JSON.stringify(oldBicep));
  assert.match(old.notes.join(" "), /sleeve is stretched more than 8% round the bicep/);
  // a tight tee with the arms held out pulls harder across the chest than the bare panels did
  const xs = drapeGarment(me, { garment: "tee", size: "XS", fit: "slim" });
  assert.equal(xs.checks.settled, true);
  assert.equal(xs.checks.verticesInsideBody, 0);
  assert.ok(xs.levels.find(l => l.where === "chest").hoopStrainPct > 8);
  assert.ok(xs.sleeves[0].levels.find(l => l.where === "bicep").hoopStrainPct > 8);
  // body panels only, as before sleeves: no arms, no sleeve numbers
  const bare = drapeGarment(me, { garment: "tee", size: "M", sleeves: false, gridCm: 3.5 });
  assert.equal(bare.sleeves.length, 0);
  assert.equal(bare.body.arms, null);
});

test("garment drape: a regular tee hangs free, a slim size down pulls tight, and nothing goes through the body", () => {
  const me = { chest: 100, waist: 88, hip: 98, height: 178 };
  // body panels only: the tape arithmetic (garment chest against body chest) holds without arms
  const loose = drapeGarment(me, { size: "M", fit: "regular", sleeves: false });
  const tight = drapeGarment(me, { size: "XS", fit: "slim", sleeves: false });
  for (const r of [loose, tight]) {
    assert.equal(r.ok, true);
    assert.equal(r.checks.verticesInsideBody, 0);
    assert.ok(r.checks.seamGapCm < 1, `seam gap ${r.checks.seamGapCm}`);
    assert.equal(r.checks.settled, true);
  }
  const chest = r => r.levels.find(l => l.where === "chest");
  assert.ok(chest(loose).hoopStrainPct < 1.5, JSON.stringify(chest(loose)));
  assert.ok(chest(loose).clearanceCm > chest(tight).clearanceCm);
  // XS slim: garment chest 90 cm on a 100 cm chest is about 11% short, which the cloth must take up
  assert.ok(chest(tight).hoopStrainPct > 8 && chest(tight).hoopStrainPct < 16, JSON.stringify(chest(tight)));
  assert.ok(chest(tight).pressurePa > 0 && chest(tight).touchingPct === 100);
  assert.ok(Math.abs(chest(tight).simPressurePa / chest(tight).pressurePa - 1) < 0.35, "solver contact force near Laplace");
  assert.match(tight.notes.join(" "), /Stretched more than 8% round the chest/);
  // a stiffer stretch-free fabric presses harder for the same strain
  const stiff = drapeGarment(me, { size: "XS", fit: "slim", fabric: { gsm: 160, ktNPerM: 120 }, sleeves: false });
  assert.ok(chest(stiff).pressurePa > 1.5 * chest(tight).pressurePa);
});

test("garment drape: bad input is refused", () => {
  assert.equal(drapeGarment({ chest: 100 }, { garment: "dress" }).ok, false);
  assert.equal(drapeGarment({ chest: 10 }).ok, false);
  assert.equal(drapeGarment({ chest: 100 }, { fabric: { gsm: 5, ktNPerM: 50 } }).ok, false);
  assert.equal(drapeGarment({ chest: 100 }, { size: "XXXXL" }).ok, false);
});

test("drawing: front and side SVGs are finite and escaped-safe", () => {
  const r = drapeGarment({ chest: 96 }, { size: "S", gridCm: 4 });
  for (const v of ["front", "side", "back"]) {
    const svg = drapeSvg(r, v);
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
  }
  assert.equal(strainColour(0), "rgb(120,150,190)");
  assert.equal(strainColour(0.12), "rgb(240,40,30)");
});
