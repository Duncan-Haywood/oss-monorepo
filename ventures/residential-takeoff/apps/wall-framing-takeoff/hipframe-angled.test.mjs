// Rafters on outlines with angled sides (bays, 45-degree corners, a house turned on its lot):
// hipframe.mjs's traced plane faces on skeleton.mjs's roof lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameOutlineRoof, planeFaces, outlineFrameCuts } from "./hipframe.mjs";
import { hipRoofLines, regularize } from "./hiproof.mjs";
import { skeletonRoofLines } from "./skeleton.mjs";
import { readOutline, offsetOutline, offsetAngledOutline, outlineRoof } from "./roofoutline.mjs";
import { THICK } from "./engine.mjs";

const P = (a) => a.map(([x, y]) => ({ x, y }));
const F = 12;
const STOCK = ["2x8", "2x10", "2x12"].map((size) => ({ size, length: 2400 }));
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A random square-cornered wall outline on a 24 in grid (as skeleton.test.mjs builds them). */
function randomOutline(seed) {
  const rand = rng(seed);
  const n = 3 + Math.floor(rand() * 5), m = 3 + Math.floor(rand() * 5);
  const xs = [0], ys = [0];
  for (let i = 0; i < n; i++) xs.push(xs[i] + 24 * (2 + Math.floor(rand() * 8)));
  for (let j = 0; j < m; j++) ys.push(ys[j] + 24 * (2 + Math.floor(rand() * 8)));
  const on = Array.from({ length: m }, () => Array(n).fill(false));
  let ci = Math.floor(rand() * n), cj = Math.floor(rand() * m);
  on[cj][ci] = true;
  const steps = 3 + Math.floor(rand() * 2 * n * m);
  for (let k = 0; k < steps; k++) {
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
    ci = Math.max(0, Math.min(n - 1, ci + d[0])); cj = Math.max(0, Math.min(m - 1, cj + d[1]));
    on[cj][ci] = true;
  }
  const seen = Array.from({ length: m + 2 }, () => Array(n + 2).fill(false));
  const stack = [[0, 0]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (i < 0 || j < 0 || i > n + 1 || j > m + 1 || seen[j][i]) continue;
    if (i >= 1 && j >= 1 && i <= n && j <= m && on[j - 1][i - 1]) continue;
    seen[j][i] = true;
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (!seen[j + 1][i + 1]) on[j][i] = true;
  const loops = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) if (on[j][i]) loops.push(P([[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]]));
  const union = regularize(loops);
  return union.length === 1 ? union[0] : null;
}

/** The same outline with some outside corners cut at 45 degrees (bays and clipped corners). */
function chamfered(seed) {
  const base = randomOutline(seed);
  if (!base) return null;
  const r = rng(seed * 7 + 3), n = base.length, out = [];
  let cut = 0;
  for (let i = 0; i < n; i++) {
    const a = base[(i + n - 1) % n], c = base[i], b = base[(i + 1) % n];
    const convex = (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x) > 0;
    const room = Math.min(Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(b.x - c.x, b.y - c.y)) / 2 - 1;
    if (convex && room > 12 && r() < 0.5) {
      const d = Math.min(room, 12 + Math.floor(r() * 4) * 6);
      const u = { x: Math.sign(a.x - c.x), y: Math.sign(a.y - c.y) }, w = { x: Math.sign(b.x - c.x), y: Math.sign(b.y - c.y) };
      out.push({ x: c.x + d * u.x, y: c.y + d * u.y }, { x: c.x + d * w.x, y: c.y + d * w.y });
      cut++;
    } else out.push({ x: c.x, y: c.y });
  }
  return cut ? out : null;
}

/** Frame an outline with sides at any angle: eave line mitred out `overhang`, skeleton roof lines. */
function frameAny(walls, pitch, o = {}) {
  const eave = offsetAngledOutline(walls, o.overhang ?? 12);
  if (!eave) return null;
  const k = skeletonRoofLines(eave, pitch);
  if (!k.ok) return null;
  return { f: frameOutlineRoof(walls, eave, k.lines, { pitch, stock: STOCK, ridge: "2x10", hip: "2x10", ...o }), eave, lines: k.lines };
}

/** Distance from p to the line through eave side i, inside positive. */
const sideDist = (eave, i, p) => {
  const a = eave[i], b = eave[(i + 1) % eave.length], L = Math.hypot(b.x - a.x, b.y - a.y);
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L;
};
/** Height (z) of the roof line through p, or null when p is on none of `kinds`. */
const zOn = (lines, p, kinds) => {
  for (const l of lines) {
    if (!kinds.includes(l.kind)) continue;
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L2 = dx * dx + dy * dy;
    const t = L2 ? ((p.x - l.x0) * dx + (p.y - l.y0) * dy) / L2 : 0;
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    if (Math.hypot(l.x0 + t * dx - p.x, l.y0 + t * dy - p.y) > 1e-4) continue;
    return l.z0 + t * (l.z1 - l.z0);
  }
  return null;
};

/** Every rafter: square to its own eave side, foot on the eave or a valley, top on a ridge or hip, both ends at the height the roof lines give. */
function checkRafters(f, eave, lines, pitch, what, minGap = 2 * THICK, crossPlane = false) {
  const rise = pitch / 12;
  for (const x of f.rafters) {
    const a = eave[x.plane], b = eave[(x.plane + 1) % eave.length];
    const p0 = { x: x.x0, y: x.y0 }, p1 = { x: x.x1, y: x.y1 };
    const run = Math.hypot(x.x1 - x.x0, x.y1 - x.y0);
    // square to its eave side in plan
    assert.ok(Math.abs((x.x1 - x.x0) * (b.x - a.x) + (x.y1 - x.y0) * (b.y - a.y)) < 1e-6 * run * Math.hypot(b.x - a.x, b.y - a.y), `${what}: square to its side ${JSON.stringify(x)}`);
    assert.ok(Math.abs(sideDist(eave, x.plane, p1) - sideDist(eave, x.plane, p0) - run) < 1e-6, `${what}: rises away from its side`);
    if (x.bottom === "eave") assert.ok(Math.abs(sideDist(eave, x.plane, p0)) < 1e-6, `${what}: foot on its eave`);
    else {
      const z = zOn(lines, p0, ["valley"]);
      assert.ok(z != null, `${what}: foot on a valley ${JSON.stringify(x)}`);
      assert.ok(Math.abs(z - rise * sideDist(eave, x.plane, p0)) < 1e-5, `${what}: foot at the valley's height`);
    }
    const z = zOn(lines, p1, ["ridge", "hip"]);
    assert.ok(z != null, `${what}: top on a ridge or hip ${JSON.stringify(x)}`);
    assert.ok(Math.abs(z - rise * sideDist(eave, x.plane, p1)) < 1e-5, `${what}: top at the line's height ${z} vs ${rise * sideDist(eave, x.plane, p1)}`);
    assert.ok(x.planIn >= THICK && x.length > 0);
  }
  // no two rafters on one plane closer than two thicknesses where their runs overlap
  for (let i = 0; i < f.rafters.length; i++) for (let j = i + 1; j < f.rafters.length; j++) {
    const r = f.rafters[i], q = f.rafters[j];
    if (crossPlane && r.plane === q.plane) continue;
    const dr = { x: r.x1 - r.x0, y: r.y1 - r.y0 }, dq = { x: q.x1 - q.x0, y: q.y1 - q.y0 };
    const L = Math.hypot(dr.x, dr.y), Lq = Math.hypot(dq.x, dq.y);
    if (Math.abs(dr.x * dq.y - dr.y * dq.x) > 1e-6 * L * Lq || dr.x * dq.x + dr.y * dq.y < 0) continue;
    const ux = dr.x / L, uy = dr.y / L;
    const off = Math.abs((q.x0 - r.x0) * uy - (q.y0 - r.y0) * ux);
    const s0 = (q.x0 - r.x0) * ux + (q.y0 - r.y0) * uy, s1 = (q.x1 - r.x0) * ux + (q.y1 - r.y0) * uy;
    const overlap = Math.min(L, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1));
    assert.ok(!(off < minGap - 1e-6 && overlap > 1), `${what}: rafters ${off.toFixed(2)} in apart over ${overlap.toFixed(1)} in: ${JSON.stringify([r, q])}`);
  }
}

const area = (p) => { let A = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; A += a.x * b.y - b.x * a.y; } return A / 2; };

test("a 45-degree bay on a 40 x 24 ft house is framed: commons, jacks and valley jacks on the bay's planes, each end where the roof says", () => {
  const walls = P([[0, 0], [16, 0], [18, -2], [22, -2], [24, 0], [40, 0], [40, 24], [0, 24]].map(([x, y]) => [x * F, y * F]));
  const r = frameAny(walls, 6);
  assert.ok(r);
  const { f, eave, lines } = r;
  assert.equal(f.ok, true, f.errors?.join(" "));
  checkRafters(f, eave, lines, 6, "bay");
  // the bay's three planes (its front and two 45-degree sides) carry rafters
  for (const side of [1, 2, 3]) assert.ok(f.rafters.some((x) => x.plane === side), `plane ${side} framed`);
  // the bay's 45-degree sides meet the main front plane in valleys: valley jacks above them on the main front
  assert.equal(f.valleys.length, 2);
  assert.ok(f.counts.valleyJacks > 0, JSON.stringify(f.counts));
  // hips and valleys are their lines' slope lengths
  const hl = lines.filter((l) => l.kind === "hip").map((l) => Math.round(Math.hypot(l.x1 - l.x0, l.y1 - l.y0, l.z1 - l.z0) * 16) / 16).sort((a, b) => a - b);
  assert.deepEqual(f.hips.map((x) => x.length).sort((a, b) => a - b), hl);
  // the bay's front rafters end on its two front hips, which bisect the 135-degree corners: 67.5 degrees off the
  // front in plan, so 22.5 degrees off the rafters, and the cut-back is THICK / 2 over sin(22.5 degrees)
  const front = f.rafters.filter((x) => x.plane === 2 && x.top === "hip");
  assert.ok(front.length > 0);
  const k = Math.sqrt(1 + 0.25);
  for (const x of front) {
    const run = Math.hypot(x.x1 - x.x0, x.y1 - x.y0);
    assert.ok(Math.abs(x.planIn - (run - THICK / 2 / Math.sin((22.5 * Math.PI) / 180))) < 1e-9, `${run} ${x.planIn}`);
    assert.equal(x.length, Math.round(x.planIn * k * 16) / 16);
  }
  assert.ok(f.notes.some((x) => /angled sides/.test(x)));
  // every row reaches the lumber order
  assert.equal(outlineFrameCuts(f).reduce((t, c) => t + c.qty, 0), f.rafters.length + f.hips.length + f.valleys.length + f.ridges.length);
});

test("a square-cornered house turned to an angle frames exactly as it does square to the axes", () => {
  let n = 0;
  for (let seed = 1; n < 60 && seed < 500; seed++) {
    const walls = randomOutline(seed);
    if (!walls) continue;
    const r0 = readOutline(walls.map((p) => [p.x, p.y]));
    if (!r0.ok) continue;
    const eave0 = offsetOutline(r0.points, 12);
    if (!eave0) continue;
    const square = frameOutlineRoof(r0.points, eave0, hipRoofLines(eave0, 6).lines, { pitch: 6, stock: STOCK, ridge: "2x10", hip: "2x10" });
    assert.equal(square.ok, true);
    const ang = 0.3 + (seed % 7) * 0.17, c = Math.cos(ang), s = Math.sin(ang);
    const turned = frameAny(r0.points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })), 6);
    assert.ok(turned && turned.f.ok, `seed ${seed}: ${turned?.f.errors?.join(" ")}`);
    const runs = (f) => f.rafters.map((x) => `${x.kind} ${x.plane} ${x.planIn.toFixed(6)}`).sort();
    assert.deepEqual(runs(turned.f), runs(square), `seed ${seed}`);
    assert.deepEqual(turned.f.counts, square.counts, `seed ${seed}`);
    const near16 = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1 / 16 + 1e-9);
    assert.ok(near16(turned.f.hips.map((x) => x.length).sort((a, b) => a - b), square.hips.map((x) => x.length).sort((a, b) => a - b)), `seed ${seed} hips`);
    n++;
  }
  assert.equal(n, 60);
});

test("on 150 seeded outlines with clipped corners and bays every rafter lies on its plane, none doubles another, and run x spacing is close to the plan area", () => {
  let n = 0, framed = 0;
  for (let seed = 1; n < 150 && seed < 3000; seed++) {
    const walls = chamfered(seed);
    if (!walls) continue;
    const r = frameAny(walls, 6 + (seed % 5));
    if (!r) continue;
    n++;
    const { f, eave, lines } = r;
    assert.equal(f.ok, true, `seed ${seed}: ${f.errors?.join(" ")}`);
    framed++;
    checkRafters(f, eave, lines, 6 + (seed % 5), `seed ${seed}`);
    const run = f.rafters.reduce((t, x) => t + Math.hypot(x.x1 - x.x0, x.y1 - x.y0), 0);
    const ratio = (run * 16) / area(eave);
    assert.ok(ratio > 0.75 && ratio < 1.4, `seed ${seed}: ${ratio}`);
    assert.equal(f.hips.length + f.valleys.length, lines.filter((l) => l.kind !== "ridge").length);
  }
  assert.equal(n, 150);
  assert.equal(framed, 150);
});

test("planeFaces: one face per eave side that tiles the eave line; two sides on one line share the face over a bump-out between them", () => {
  const walls = P([[0, 0], [16, 0], [18, -2], [22, -2], [24, 0], [40, 0], [40, 24], [0, 24]].map(([x, y]) => [x * F, y * F]));
  const eave = offsetAngledOutline(walls, 12);
  const faces = planeFaces(eave, skeletonRoofLines(eave, 6).lines);
  assert.ok(faces);
  assert.equal(faces.length, 8);
  // a shared face is listed under each of its sides; counted once, the faces tile the eave line
  assert.ok(Math.abs(faces.reduce((t, f, i) => t + (f.sides[0] === i ? area(f.poly) : 0), 0) - area(eave)) < 1e-6);
  // the two front walls either side of the bay are on one line: they share the main front plane above the bay
  assert.ok(faces.every((f, i) => (i === 0 || i === 4 ? f.sides.join() === "0,4" : f.sides.length === 1 && f.sides[0] === i)));
  // a notch in the back wall: its bottom stays between the two back sides' planes, so each keeps its own
  const notch = P([[0, 0], [40, 0], [40, 24], [22, 24], [22, 20], [18, 20], [18, 24], [0, 24]].map(([x, y]) => [x * F, y * F]));
  const e2 = offsetOutline(notch, 12);
  const f2 = planeFaces(e2, hipRoofLines(e2, 6).lines);
  assert.ok(f2 && f2.every((f, i) => f.sides.join() === String(i)));
  // a 10 ft wide, 2 ft deep bump-out on the back wall: its planes close below the ridge, and the two back sides share the plane above it
  const bump = P([[0, 0], [40, 0], [40, 24], [25, 24], [25, 26], [15, 26], [15, 24], [0, 24]].map(([x, y]) => [x * F, y * F]));
  const e3 = offsetOutline(bump, 12);
  const f3 = planeFaces(e3, hipRoofLines(e3, 6).lines);
  assert.ok(f3);
  assert.equal(f3[2].sides.join(), "2,6");
  assert.equal(f3[6].sides.join(), "2,6");
});

test("a bump-out on one wall: the plane over it is framed once (the L-infinity rule framed it from both sides, 4 in apart)", () => {
  const walls = [[0, 0], [552, 0], [552, 312], [460, 312], [460, 264], [368, 264], [368, 216], [184, 216], [184, 240], [92, 240], [92, 216], [0, 216]];
  const r = readOutline(walls);
  const eave = offsetOutline(r.points, 12), lines = hipRoofLines(eave, 8).lines;
  const o = { pitch: 8, ridge: "2x10", stock: STOCK };
  const faces = frameOutlineRoof(r.points, eave, lines, o), linf = frameOutlineRoof(r.points, eave, lines, { ...o, faces: false });
  assert.equal(faces.ok && linf.ok, true);
  // rafters from the two back sides never stand side by side (a hip-top common 4 in off a layout rafter of its own plane is expected)
  checkRafters(faces, eave, lines, 8, "notch", 6, true);
  assert.throws(() => checkRafters(linf, eave, lines, 8, "notch, L-infinity", 6, true), /4\.00 in apart/);
  assert.ok(faces.rafters.length < linf.rafters.length);
});

test("outlineRoof's angled note and the CLI: a bay house's rafters reach the lumber order", async () => {
  const outline = [[0, "2'"], ["16'", "2'"], ["18'", 0], ["22'", 0], ["24'", "2'"], ["40'", "2'"], ["40'", "26'"], [0, "26'"]];
  const ro = /** @type {any} */ (outlineRoof(outline, { pitch: 6, overhang: 12 }));
  assert.ok(ro.ok && ro.angled);
  assert.ok(ro.notes.some((x) => /rafters are laid out/.test(x)), ro.notes.join("\n"));
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const p = samplePlan();
  p.stock.push({ size: "2x10", length: 240, price: 30 }, { size: "2x8", length: 240, price: 24 });
  p.roof = { outline, pitch: 6, overhang: 12, rafter: "2x8", hip: "2x10", ridge: "2x10" };
  const out = main(["p.json", "--material-list", "--json"], () => JSON.stringify(p));
  assert.equal(out.code, 0, out.out.slice(0, 400));
  const j = JSON.parse(out.out);
  const members = j.rows.filter((x) => x.section === "Members cut from those boards").map((x) => x.item);
  for (const m of ["2x8 rafter", "2x8 jack rafter", "2x8 valley jack rafter", "2x10 hip rafter", "2x10 valley rafter", "2x10 ridge board"]) assert.ok(members.includes(m), m);
  assert.ok(j.notes.some((x) => /Framed instead as the all-hip roof/.test(x)));
  // and since 2026-11-28 its sheathing courses too (outlinesheathing-angled.test.mjs)
  assert.ok(!j.notes.some((x) => /Roof sheathing not laid out/.test(x)), j.notes.join("\n"));
  assert.ok(j.notes.some((x) => /angled sides: each plane is the face/.test(x)), j.notes.join("\n"));
});

test("on 300 seeded square-cornered outlines the traced faces frame exactly as the L-infinity rule, except where two eave sides share a plane", () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let same = 0, shared = 0;
  for (let n = 0; n < 300; n++) {
    const cols = 1 + Math.floor(rnd() * 6), w = 60 + Math.floor(rnd() * 120);
    const hs = Array.from({ length: cols }, () => 120 + 24 * Math.floor(rnd() * 10));
    const pts = [[0, 0], [cols * w, 0]];
    for (let c = cols - 1; c >= 0; c--) { pts.push([(c + 1) * w, hs[c]]); pts.push([c * w, hs[c]]); }
    const r = readOutline(pts);
    const eave = offsetOutline(r.points, 12);
    if (!eave) continue;
    const lines = hipRoofLines(eave, 8).lines;
    const o = { pitch: 8, ridge: "2x10", stock: STOCK };
    const a = frameOutlineRoof(r.points, eave, lines, o), b = frameOutlineRoof(r.points, eave, lines, { ...o, faces: false });
    assert.equal(a.ok && b.ok, true);
    const key = (f) => JSON.stringify([f.rafters.map((x) => [x.kind, x.plane, x.u, x.length]), f.hips, f.valleys, f.ridges]);
    if (/** @type {any[]} */ (planeFaces(eave, lines)).some((f) => f.sides.length > 1)) { shared++; checkRafters(a, eave, lines, 8, JSON.stringify(pts), 6, true); continue; }
    assert.equal(key(a), key(b), JSON.stringify(pts));
    same++;
  }
  assert.ok(same > 250 && shared > 5, `${same} same, ${shared} shared`);
});
