// Run: node --test drape.test.mjs
// The solver is checked against closed-form answers before any garment test.
import test from "node:test";
import assert from "node:assert/strict";
import { gridMesh, buildCloth, simulate, cylinderBody, bodyModel, girthAt, clearance, triangleStrain, drapeGarment, drapeSvg, strainColour, G } from "./drape.mjs";

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
  assert.deepEqual(a.assumed, ["height 175 cm", "waist 90 cm", "hip 98 cm"]);
  assert.equal(bodyModel({ chest: 20 }).ok, false);
});

test("garment drape: a regular tee hangs free, a slim size down pulls tight, and nothing goes through the body", () => {
  const me = { chest: 100, waist: 88, hip: 98, height: 178 };
  const loose = drapeGarment(me, { size: "M", fit: "regular" });
  const tight = drapeGarment(me, { size: "XS", fit: "slim" });
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
  const stiff = drapeGarment(me, { size: "XS", fit: "slim", fabric: { gsm: 160, ktNPerM: 120 } });
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
