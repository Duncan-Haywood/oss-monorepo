import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep, stepLengthUnit, stepPrimitives, boxInFrame, roundEnvelopes, readPart, parseStl, stlPrimitives, stockOptions, materialCost, bsplineBounds, deBoor } from "./part-geometry.mjs";

const FX = new URL("./fixtures/geometry/", import.meta.url);
const truth = JSON.parse(readFileSync(new URL("truth.json", FX), "utf8"));
const WORLD = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// Parts whose faces are planes, cylinders, cones, spheres or edge-bounded: the box must be exact.
const EXACT = ["plate-holes-pocket", "block-fillets", "shaft-ball-end", "scallop-concave-arc", "bracket-rotated", "all-edges-filleted", "plate-inch", "flange-bolt-circle"];

for (const [name, t] of Object.entries(truth)) {
  test(`${name}: STEP box never smaller than the kernel's box${EXACT.includes(name) ? ", and equal to it" : ""}`, () => {
    const prims = stepPrimitives(readFileSync(new URL(`${name}.step`, FX), "utf8"));
    const b = boxInFrame(prims, WORLD);
    for (let i = 0; i < 3; i++) {
      assert.ok(b.min[i] <= t.min[i] + 1e-5, `${name} min[${i}] ${b.min[i]} > ${t.min[i]}`);
      assert.ok(b.max[i] >= t.max[i] - 1e-5, `${name} max[${i}] ${b.max[i]} < ${t.max[i]}`);
      if (EXACT.includes(name)) {
        assert.ok(Math.abs(b.min[i] - t.min[i]) < 1e-5 && Math.abs(b.max[i] - t.max[i]) < 1e-5, `${name} axis ${i} not exact`);
      }
      // the edge box only holds points on the part, so it is never larger than the true box
      assert.ok(b.edgeMin[i] >= t.min[i] - 1e-5 && b.edgeMax[i] <= t.max[i] + 1e-5, `${name} edge box past the part on axis ${i}`);
    }
  });

  test(`${name}: round envelope is never below the mesh measurement`, () => {
    const prims = stepPrimitives(readFileSync(new URL(`${name}.step`, FX), "utf8"));
    const b = boxInFrame(prims, WORLD);
    const env = roundEnvelopes(prims, WORLD, b);
    env.forEach((d, i) => {
      assert.ok(d >= t.envelopeMeshLowerBound[i] - 1e-6, `${name} axis ${i}: ${d} < ${t.envelopeMeshLowerBound[i]}`);
      if (EXACT.includes(name)) assert.ok(d - t.envelopeMeshLowerBound[i] < 0.01, `${name} axis ${i} envelope ${d} vs ${t.envelopeMeshLowerBound[i]}`);
    });
  });
}

test("units: an inch file is read as inches and converted to millimetres", () => {
  const ents = parseStep(readFileSync(new URL("plate-inch.step", FX), "utf8"));
  const u = stepLengthUnit(ents);
  assert.equal(u.name, "in");
  assert.equal(u.mm, 25.4);
  const r = readPart(readFileSync(new URL("plate-inch.step", FX)), "plate-inch.step");
  assert.deepEqual(r.size.map((x) => +x.toFixed(4)), [101.6, 50.8, 19.05]);
});

test("a concave arc whose full circle would poke out adds nothing it does not reach", () => {
  const r = readPart(readFileSync(new URL("scallop-concave-arc.step", FX)), "x.step");
  assert.ok(Math.abs(r.size[2] - 20) < 1e-6, `height ${r.size[2]}`);
  assert.equal(r.exact, true);
});

test("a part modelled at 30 degrees is boxed square to its own faces", () => {
  const r = readPart(readFileSync(new URL("bracket-rotated.step", FX)), "x.step");
  assert.equal(r.rotated, true);
  assert.deepEqual([...r.size].sort((a, b) => a - b).map((x) => +x.toFixed(6)), [35, 40, 50]);
  assert.ok(r.worldBox.size[0] > 60, "world box is the larger, unrotated one");
});

test("turned part: the round bar is the shaft's largest diameter", () => {
  const r = readPart(readFileSync(new URL("shaft-ball-end.step", FX)), "x.step");
  const axis = r.size.indexOf(Math.max(...r.size));
  assert.ok(Math.abs(r.envelopes[axis] - 25) < 1e-6);
  const best = stockOptions(r, { allowance: 0, lengthExtra: 0, increment: 0 })[0];
  assert.equal(best.shape, "round");
});

test("a B-spline part is flagged as an upper bound, not exact", () => {
  const r = readPart(readFileSync(new URL("spline-revolve.step", FX)), "x.step");
  assert.equal(r.exact, false);
  assert.ok(r.maxOverstatement > 0);
});

test("STL: binary and ASCII meshes give the kernel's box and volume", () => {
  for (const name of ["scallop-concave-arc", "plate-inch", "bracket-rotated"]) {
    const t = truth[name];
    const r = readPart(readFileSync(new URL(`${name}.stl`, FX)), `${name}.stl`);
    assert.ok(Math.abs(r.volume - t.volume) / t.volume < 0.002, `${name} volume ${r.volume} vs ${t.volume}`);
    assert.equal(r.closed, true);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.worldBox.size[i] - (t.max[i] - t.min[i])) < 0.02, `${name} axis ${i}`);
  }
  const ascii = "solid t\n" + [[0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1, 1, 0, 0], [0, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 1, 0]]
    .map((v) => `facet normal 0 0 0\nouter loop\nvertex ${v.slice(0, 3).join(" ")}\nvertex ${v.slice(3, 6).join(" ")}\nvertex ${v.slice(6).join(" ")}\nendloop\nendfacet`).join("\n") + "\nendsolid t\n";
  const m = stlPrimitives(parseStl(ascii), 25.4);
  assert.ok(Math.abs(m.volume - 25.4 ** 3 / 6) < 1e-6, "unit tetrahedron in inches");
  assert.equal(m.closed, true);
});

test("STL: each shared vertex is kept once, and the box and envelopes match every-corner points", () => {
  const tris = parseStl(readFileSync(new URL("bracket-rotated.stl", FX)));
  const m = stlPrimitives(tris, 25.4);
  const distinct = new Set();
  for (let o = 0; o < tris.length; o += 3) distinct.add(`${tris[o]},${tris[o + 1]},${tris[o + 2]}`);
  assert.equal(m.points.length, distinct.size);
  assert.ok(m.points.length < tris.length / 3, "a closed mesh shares its vertices");
  // the reading before deduplication: three points per triangle
  const every = { ...m, points: [] };
  for (let o = 0; o < tris.length; o += 3) every.points.push({ p: [tris[o] * 25.4, tris[o + 1] * 25.4, tris[o + 2] * 25.4], exact: true });
  const frame = [[0.6, 0.8, 0], [-0.8, 0.6, 0], [0, 0, 1]];
  for (const f of [WORLD, frame]) {
    const a = boxInFrame(m, f), b = boxInFrame(every, f);
    assert.deepEqual(a, b);
    assert.deepEqual(roundEnvelopes(m, f, a), roundEnvelopes(every, f, b));
  }
});

test("an open mesh is reported", () => {
  const ascii = "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n";
  const m = stlPrimitives(parseStl(ascii));
  assert.equal(m.closed, false);
  assert.match(m.warnings.join(" "), /not closed/);
});

test("STEP reader: comments, escaped quotes, semicolons in strings and complex entities", () => {
  const step = `ISO-10303-21;\nHEADER;\nFILE_NAME('a;b','',(''),(''),'','','');\nENDSEC;\nDATA;\n/* a comment with #9=LINE(); inside */\n#1=CARTESIAN_POINT('it''s; here',(1.,2.,3.E0));\n#2=( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );\n#3=( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#2)) REPRESENTATION_CONTEXT('',''));\nENDSEC;\nEND-ISO-10303-21;\n`;
  const e = parseStep(step);
  assert.equal(e.get(1).args[0].s, "it's; here");
  assert.deepEqual(e.get(1).args[1], [1, 2, 3]);
  assert.ok(e.get(2).parts.SI_UNIT);
  assert.ok(!e.has(9));
  assert.equal(stepLengthUnit(e).name, "mm");
  assert.throws(() => parseStep("not a step file"), /DATA section/);
});

test("rational B-spline: refined hull contains the curve and the sampled points lie on it", () => {
  // quarter circle of radius 10 as a rational quadratic
  const w = Math.SQRT1_2;
  const ctrl = [[10, 0, 0], [10, 10, 0], [0, 10, 0]];
  const U = [0, 0, 0, 1, 1, 1];
  const { bound, on } = bsplineBounds(2, ctrl, [1, w, 1], U);
  for (const p of on) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 10) < 1e-9);
  const maxX = Math.max(...bound.map((p) => p[0])), maxY = Math.max(...bound.map((p) => p[1]));
  assert.ok(maxX >= 10 - 1e-9 && maxY >= 10 - 1e-9);
  // and tighter than the raw hull: no refined control point beyond 10.1 from the centre
  assert.ok(Math.max(...bound.map((p) => Math.hypot(p[0], p[1]))) < 10.1);
  // trimmed to an edge from 0 to 45 degrees: nothing past 45 degrees counts
  const half = bsplineBounds(2, ctrl, [1, w, 1], U, { from: [10, 0, 0], to: [10 * w, 10 * w, 0] });
  assert.ok(Math.max(...half.on.map((p) => p[1])) <= 10 * w + 1e-9);
  assert.ok(Math.max(...half.bound.map((p) => p[1])) < 10 * w + 0.1);
  const H = ctrl.map((q, i) => [...q.map((x) => x * [1, w, 1][i]), [1, w, 1][i]]);
  const mid = deBoor(2, H, U, 0.5);
  assert.ok(Math.abs(Math.hypot(mid[0], mid[1]) - 10) < 1e-12);
});

test("stock: allowance on each side, rounded up to the increment, plus length extra", () => {
  const reading = { size: [20, 50, 100], envelopes: [53.9, 101.98, 111.8] };
  const opts = stockOptions(reading, { allowance: 1, lengthExtra: 5, increment: 3.175 });
  const rect = opts.find((o) => o.shape === "rect");
  assert.deepEqual(rect.cross.map((x) => +x.toFixed(3)), [22.225, 53.975]);
  assert.equal(rect.length, 105);
  const round = opts.find((o) => o.shape === "round" && o.axis === 2);
  assert.equal(+round.cross[0].toFixed(3), 114.3);
  for (let i = 1; i < opts.length; i++) assert.ok(opts[i].volume >= opts[i - 1].volume);
  // exact multiples are not bumped up a size by float noise
  const flat = stockOptions({ size: [25.4, 50.8, 100], envelopes: [1, 1, 1] }, { increment: 25.4 / 8 });
  assert.deepEqual(flat.find((o) => o.shape === "rect").cross.map((x) => +x.toFixed(4)), [25.4, 50.8]);
});

test("material cost uses only the user's density and price", () => {
  const o = { volume: 1e6, length: 304.8 }; // 1,000 cm3
  assert.equal(materialCost(o, { density: 2.7, price: 10, per: "kg" }).cost, 27);
  assert.ok(Math.abs(materialCost(o, { density: 2.7, price: 10, per: "lb" }).cost - 2.7 / 0.45359237 * 10) < 1e-9);
  assert.equal(materialCost(o, { density: 2.7, price: 12, per: "ft" }).cost, 12);
  assert.equal(materialCost(o, {}).cost, 0);
});

test("STL welding: 0 and -0 are one vertex, and a big mesh reads the same box", () => {
  // the unit tetrahedron again, with some zeros written as -0: still one closed mesh
  const tri = [[0, 0, 0, 1, 0, 0, 0, 1, 0], [-0, 0, 0, 0, 0, 1, 1, 0, -0], [0, -0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 1, 0]];
  const ascii = "solid t\n" + tri.map((v) => `facet normal 0 0 0\nouter loop\n${[0, 3, 6].map((i) => `vertex ${v.slice(i, i + 3).map((x) => (Object.is(x, -0) ? "-0" : x)).join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n") + "\nendsolid t\n";
  const m = stlPrimitives(parseStl(ascii));
  assert.equal(m.closed, true);
  assert.ok(m.points.length >= 4 && m.points.length < 12, "corners shared by triangles are welded into one point each");
  // a closed 60x60 torus grid: every edge used twice, box from welded vertices
  const N = 60, R = 40, r = 12, out = [];
  const P = (i, j) => { const a = ((i % N) / N) * 2 * Math.PI, b = ((j % N) / N) * 2 * Math.PI; return [(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a), r * Math.sin(b)]; };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) out.push(...P(i, j), ...P(i + 1, j), ...P(i + 1, j + 1), ...P(i, j), ...P(i + 1, j + 1), ...P(i, j + 1));
  const t = stlPrimitives(Float64Array.from(out));
  assert.equal(t.closed, true);
  assert.equal(t.points.length, N * N);
  const b = boxInFrame(t);
  assert.ok(Math.abs(b.max[0] - b.min[0] - 104) < 1e-9 && Math.abs(b.max[2] - b.min[2] - 24) < 1e-9);
});

// ---------- hand-built STEP faces with a known answer ----------
// No OCP fixture holds a torus or a circle revolved by SURFACE_OF_REVOLUTION, so
// these build the smallest files that do and compare with the closed-form box.
function stepFile(lines) {
  return `ISO-10303-21;\nHEADER;\nFILE_NAME('t','',(''),(''),'','','');\nENDSEC;\nDATA;\n${lines.map((l, i) => `#${i + 1}=${l};`).join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
function stepWriter() {
  const lines = [];
  const add = (s) => { lines.push(s); return `#${lines.length}`; };
  const f = (x) => (Math.abs(x) < 1e-15 ? 0 : x).toFixed(12);
  const pt = (p) => add(`CARTESIAN_POINT('',(${p.map(f).join(",")}))`);
  const dir = (d) => add(`DIRECTION('',(${d.map(f).join(",")}))`);
  const ax2 = (c, n, x) => add(`AXIS2_PLACEMENT_3D('',${pt(c)},${dir(n)},${dir(x)})`);
  return { lines, add, pt, dir, ax2 };
}

/** One face of a torus (axis z, centre 0): spine angle th0..th1, tube angle ph0..ph1. */
function torusFaceStep(R, r, th0, th1, ph0, ph1) {
  const w = stepWriter();
  const P = (th, ph) => [(R + r * Math.cos(ph)) * Math.cos(th), (R + r * Math.cos(ph)) * Math.sin(th), r * Math.sin(ph)];
  const surf = w.add(`TOROIDAL_SURFACE('',${w.ax2([0, 0, 0], [0, 0, 1], [1, 0, 0])},${R},${r})`);
  const vtx = new Map();
  const V = (th, ph) => { const key = `${th},${ph}`; if (!vtx.has(key)) vtx.set(key, w.add(`VERTEX_POINT('',${w.pt(P(th, ph))})`)); return vtx.get(key); };
  // a parallel (constant tube angle) runs anticlockwise about z from th0 to th1
  const parallel = (ph) => w.add(`EDGE_CURVE('',${V(th0, ph)},${V(th1, ph)},${w.add(`CIRCLE('',${w.ax2([0, 0, r * Math.sin(ph)], [0, 0, 1], [1, 0, 0])},${R + r * Math.cos(ph)})`)},.T.)`);
  // a tube circle (constant spine angle) runs from ph0 to ph1 in the plane of e_r and z
  const tube = (th) => {
    const er = [Math.cos(th), Math.sin(th), 0];
    const n = [Math.sin(th), -Math.cos(th), 0]; // n x e_r = z
    return w.add(`EDGE_CURVE('',${V(th, ph0)},${V(th, ph1)},${w.add(`CIRCLE('',${w.ax2([R * er[0], R * er[1], 0], n, er)},${r})`)},.T.)`);
  };
  const edges = [parallel(ph0), tube(th1), parallel(ph1), tube(th0)];
  const loop = w.add(`EDGE_LOOP('',(${edges.map((e, i) => w.add(`ORIENTED_EDGE('',*,*,${e},${i < 2 ? ".T." : ".F."})`)).join(",")}))`);
  w.add(`ADVANCED_FACE('',(${w.add(`FACE_OUTER_BOUND('',${loop},.T.)`)}),${surf},.T.)`);
  return stepFile(w.lines);
}

/** Exact range of d . p over that torus face, by dense sampling (an exact max on a fine grid). */
function torusFaceRange(R, r, th0, th1, ph0, ph1, d) {
  let lo = Infinity, hi = -Infinity;
  const N = 2000;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= 200; j++) {
    const th = th0 + ((th1 - th0) * i) / N, ph = ph0 + ((ph1 - ph0) * j) / 200;
    const v = d[0] * (R + r * Math.cos(ph)) * Math.cos(th) + d[1] * (R + r * Math.cos(ph)) * Math.sin(th) + d[2] * r * Math.sin(ph);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  return [lo, hi];
}

const frameAt = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

test("torus fillet face: the box reaches the face's interior extremes and stops near its own stretch of ring", () => {
  const R = 20, r = 5, H = Math.PI / 2;
  // [th0, th1] from 0 to 90 degrees (the spine samples do not wrap past 0), and from
  // -45 to 45 degrees (they do); frames turned so the extreme is inside the face, not on an edge
  const cases = [
    { th: [0, H], frames: [Math.PI / 4, Math.PI + Math.PI / 4, Math.PI / 8] },
    { th: [-Math.PI / 4, Math.PI / 4], frames: [Math.PI / 8, -Math.PI / 8, 0] },
  ];
  for (const { th, frames } of cases) {
    const prims = stepPrimitives(torusFaceStep(R, r, th[0], th[1], -H, H));
    for (const a of frames) {
      const fr = frameAt(a);
      const b = boxInFrame(prims, fr);
      for (let i = 0; i < 3; i++) {
        const [lo, hi] = torusFaceRange(R, r, th[0], th[1], -H, H, fr[i]);
        const tag = `th ${th.map((x) => +x.toFixed(3))} frame ${a.toFixed(3)} axis ${i}`;
        assert.ok(b.min[i] <= lo + 1e-6 && b.max[i] >= hi - 1e-6, `${tag}: box [${b.min[i]}, ${b.max[i]}] misses [${lo}, ${hi}]`);
        // the bound is the face's own arc (widened by a sample step) plus the tube radius,
        // so it can overstate by up to r on the inside of a bend, but not reach round the ring
        assert.ok(b.min[i] >= lo - r - 1 && b.max[i] <= hi + r + 1, `${tag}: box [${b.min[i]}, ${b.max[i]}] far past [${lo}, ${hi}]`);
      }
    }
  }
});

test("a circle revolved about an axis is boxed by its own radius and height, not past them", () => {
  // profile circle radius 5 centred 20 from the z axis, in the xz plane: a 50 x 50 x 10 ring
  const w = stepWriter();
  const circle = w.add(`CIRCLE('',${w.ax2([20, 0, 0], [0, -1, 0], [1, 0, 0])},5)`);
  const axis = w.add(`AXIS1_PLACEMENT('',${w.pt([0, 0, 0])},${w.dir([0, 0, 1])})`);
  const surf = w.add(`SURFACE_OF_REVOLUTION('',${circle},${axis})`);
  w.add(`ADVANCED_FACE('',(),${surf},.T.)`);
  const b = boxInFrame(stepPrimitives(stepFile(w.lines)));
  for (let i = 0; i < 3; i++) {
    const want = i < 2 ? 25 : 5;
    assert.ok(Math.abs(b.min[i] + want) < 1e-9 && Math.abs(b.max[i] - want) < 1e-9, `axis ${i}: [${b.min[i]}, ${b.max[i]}] vs ±${want}`);
  }
});

test("a file with no triangles or non-finite coordinates is refused, not read as a NaN size", () => {
  const enc = (s) => new TextEncoder().encode(s);
  const bin = (n, set) => { const b = new Uint8Array(84 + 50 * n); const dv = new DataView(b.buffer); dv.setUint32(80, n, true); if (set) set(dv); return b; };
  // binary STL whose count is 0 (or any 84-byte file whose bytes 80-83 are zero)
  assert.throws(() => readPart(bin(0), "a.stl"), /no triangles/);
  // a NaN or infinite corner was dropped by the min/max or turned the size into NaN
  for (const v of [NaN, Infinity, -Infinity]) {
    assert.throws(() => readPart(bin(1, (dv) => { dv.setFloat32(84 + 12 + 4 * 3, 1, true); dv.setFloat32(84 + 12 + 4 * 7, 1, true); dv.setFloat32(84 + 12 + 4 * 4, v, true); }), "a.stl"), /not a finite number/, `binary ${v}`);
  }
  assert.throws(() => readPart(enc("solid x\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1e400 0 0\nvertex 0 1 1\nendloop\nendfacet\nendsolid x\n"), "a.stl"), /not a finite number/);
  // a STEP coordinate past the double range reads as Infinity
  const step = "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=CARTESIAN_POINT('',(1.,2.,3.));\n#2=CARTESIAN_POINT('',(1.E400,2.,3.));\nENDSEC;\nEND-ISO-10303-21;\n";
  assert.throws(() => readPart(enc(step), "a.step"), /not a finite number/);
});
