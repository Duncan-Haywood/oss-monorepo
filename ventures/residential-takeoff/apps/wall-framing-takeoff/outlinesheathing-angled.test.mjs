// Roof sheathing in courses on outlines with angled sides (bays, 45-degree corners, a house turned on
// its lot): outlinesheathing.mjs over the faces hipframe.mjs traces on skeleton.mjs's roof lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineRoof } from "./roofoutline.mjs";
import { slopeFactor } from "./roof.mjs";
import { regularize } from "./hiproof.mjs";
import { frameOutlineRoof, planeFaces } from "./hipframe.mjs";
import { sheatheOutlineRoof, outlineSheathingText, faceSection } from "./outlinesheathing.mjs";

const P = (a) => a.map(([x, y]) => ({ x, y }));
const STOCK = ["2x8", "2x10", "2x12"].map((size) => ({ size, length: 2400 }));
const FRAME = { rafter: "2x8", hip: "2x10", valley: "2x10", ridge: "2x10", stock: STOCK };
const BAY = [[0, 24], [192, 24], [216, 0], [264, 0], [288, 24], [480, 24], [480, 312], [0, 312]];
const turn = (pts, deg) => { const r = (deg * Math.PI) / 180; return pts.map(([x, y]) => ({ x: x * Math.cos(r) - y * Math.sin(r) + 1000, y: x * Math.sin(r) + y * Math.cos(r) })); };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** A random square-cornered wall outline on a 24 in grid (as skeleton.test.mjs builds them). */
function randomOutline(/** @type {number} */ seed) {
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


/** Even-odd inside test, written apart from the modules'. */
function within(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a.y > y) !== (b.y > y) && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c; }
  return c;
}
/** Distance from (x, y) to the polygon's boundary. */
function edgeDist(p, x, y) {
  let m = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(a.x + t * dx - x, a.y + t * dy - y));
  }
  return m;
}

test("a 40 x 24 ft house with a 45-degree bay at 6:12: sheathed in courses, every plane's area checked against the eave line's", () => {
  const ro = /** @type {any} */ (outlineRoof(BAY, { pitch: 6, overhang: 12 }));
  assert.ok(ro.ok && ro.angled);
  const s = /** @type {any} */ (sheatheOutlineRoof(ro));
  assert.equal(s.ok, true, s.errors.join(" "));
  // eight eave sides, the two 16 ft walls either side of the bay on one line: one plane above the bay's notch
  assert.equal(s.planes.length, 7);
  assert.ok(Math.abs(s.sheets.area - ro.slopedSqFt) < 1e-9);
  assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6);
  assert.ok(s.sheets.count * 32 >= s.sheets.area);
  assert.ok(s.notes.some((n) => /angled sides: each plane is the face/.test(n)), s.notes.join("\n"));
  assert.ok(s.notes.some((n) => /shallower at an angled one/.test(n)));
  // the bay's two 45-degree sides: 33.94 in at the wall and on the eave line too (the mitre at the inside corner
  // takes off what the outside corner adds, 12 tan 22.5 degrees each), each its own plane
  const bay = s.planes.filter((pl) => Math.abs(pl.eaveIn - Math.hypot(24, 24)) < 1e-6);
  assert.equal(bay.length, 2, s.planes.map((pl) => pl.eaveIn).join(", "));
  for (const pl of bay) assert.ok(pl.courses.length >= 1 && pl.courses.every((c) => c.pieces.length >= 1));
  assert.match(outlineSheathingText(s).join("\n"), /Roof sheathing \(all-hip, from outline\): \d+ sheets/);
  // framed: joints on the angled planes' rafters too
  const f = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch: 6, ...FRAME });
  assert.equal(f.ok, true, (f.errors || []).join(" "));
  const sf = /** @type {any} */ (sheatheOutlineRoof(ro, { frame: f }));
  assert.equal(sf.ok, true);
  assert.ok(sf.sheets.joints.onRafters > sf.sheets.joints.offRafters, JSON.stringify(sf.sheets.joints));
});

test("a square-cornered house turned on its lot sheathes exactly as it does square to the axes, framed or not", () => {
  const shapes = {
    rectangle: [[0, 0], [480, 0], [480, 336], [0, 336]],
    L: [[0, 0], [480, 0], [480, 240], [240, 240], [240, 420], [0, 420]],
    Z: [[0, 0], [300, 0], [300, 200], [500, 200], [500, 400], [200, 400], [200, 200], [0, 200]],
  };
  for (const [name, pts] of Object.entries(shapes)) {
    for (const pitch of [4, 6, 9]) {
      const sq = /** @type {any} */ (outlineRoof(pts, { pitch, overhang: 12 }));
      const a = /** @type {any} */ (sheatheOutlineRoof(sq));
      const fa = frameOutlineRoof(sq.points, sq.eaveLine, sq.lines, { pitch, ...FRAME });
      const af = /** @type {any} */ (sheatheOutlineRoof(sq, { frame: fa }));
      for (const deg of [17, 30, 45]) {
        const ro = /** @type {any} */ (outlineRoof(turn(pts, deg), { pitch, overhang: 12 }));
        assert.ok(ro.ok && ro.angled, `${name} ${deg}`);
        const b = /** @type {any} */ (sheatheOutlineRoof(ro));
        assert.equal(b.ok, true, `${name} ${deg}: ${b.errors.join(" ")}`);
        const what = `${name} at ${pitch}:12 turned ${deg} degrees`;
        for (const k of ["count", "withoutHipStarts", "valleyFills", "hipStarts", "hipOffcuts", "cutDown"]) assert.equal(b.sheets[k], a.sheets[k], `${what}: ${k}`);
        assert.equal(b.planes.length, a.planes.length, what);
        // the same pieces course by course (each side keeps its index: the turn moves no corner's place in the loop)
        a.planes.forEach((pl, i) => pl.courses.forEach((c, ci) => assert.deepEqual(b.planes[i].courses[ci].pieces.map((q) => q.length), c.pieces.map((q) => q.length), `${what}: plane ${pl.side} course ${ci}`)));
        const fb = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch, ...FRAME });
        const bf = /** @type {any} */ (sheatheOutlineRoof(ro, { frame: fb }));
        assert.equal(bf.sheets.count, af.sheets.count, `${what}, framed`);
        assert.deepEqual(bf.sheets.joints, af.sheets.joints, `${what}, framed`);
        assert.equal(bf.sheets.blocks.length, af.sheets.blocks.length, `${what}, framed`);
      }
    }
  }
});

/** A rectangle with a 45-degree bay on its front wall: the bay's sides lean, both ends of their courses moving the same way. */
function bayHouse(/** @type {number} */ seed) {
  const r = rng(seed * 13 + 5);
  const L = 24 * (12 + Math.floor(r() * 10)), W = 24 * (8 + Math.floor(r() * 6));
  const deep = 12 * (1 + Math.floor(r() * 4)), front = 24 * (1 + Math.floor(r() * 4)), at = 24 + Math.floor(r() * (L - 2 * deep - front - 48));
  return P([[0, deep], [at, deep], [at + deep, 0], [at + deep + front, 0], [at + 2 * deep + front, deep], [L, deep], [L, W + deep], [0, W + deep]]);
}

test("on 120 seeded outlines with clipped corners and 60 with bays every point of the roof is under a piece of its own plane's course", () => {
  let n = 0, points = 0, angledEnds = 0, bays = 0, framed = 0;
  const rnd = rng(41);
  for (let seed = 1; n < 180 && seed < 3000; seed++) {
    const walls = n < 120 ? chamfered(seed) : bayHouse(seed);
    if (!walls) continue;
    if (n >= 120) bays++;
    const pitch = 4 + (seed % 7), overhang = [0, 12, 18][seed % 3];
    const ro = /** @type {any} */ (outlineRoof(walls, { pitch, overhang }));
    if (!ro.ok || !ro.angled) continue;
    n++;
    const s = /** @type {any} */ (sheatheOutlineRoof(ro));
    assert.equal(s.ok, true, `seed ${seed}: ${s.errors.join(" ")}`);
    assert.ok(s.sheets.coveredSqFt >= s.sheets.area - 1e-6, `seed ${seed}`);
    assert.ok(s.sheets.valleyFills + s.sheets.hipStarts <= s.sheets.hipOffcuts, `seed ${seed}`);
    for (const pl of s.planes) for (const c of pl.courses) for (const q of c.pieces) assert.ok(q.length > 0 && q.length <= 96, `seed ${seed}: ${q.length}`);
    const e = ro.eaveLine, faces = /** @type {any[]} */ (planeFaces(e, ro.lines));
    const k = slopeFactor(pitch), band = 48 / k;
    const xs = e.map((q) => q.x), ys = e.map((q) => q.y);
    for (let m = 0; m < 200; m++) {
      const x = Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), y = Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys));
      if (!within(e, x, y)) continue;
      // the face holding the point, well away from its edges (roof lines and eave)
      const fi = faces.findIndex((f) => within(f.poly, x, y));
      if (fi < 0 || edgeDist(faces[fi].poly, x, y) < 0.05) continue;
      const side = Math.min(...faces[fi].sides);
      const a = e[side], b = e[(side + 1) % e.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      const t = (x - a.x) * ux + (y - a.y) * uy, d = (x - a.x) * -uy + (y - a.y) * ux;
      if (d % band < 0.01 || band - (d % band) < 0.01) continue;
      const pl = s.planes.find((q) => q.side === side + 1);
      assert.ok(pl, `seed ${seed}: side ${side + 1} has no plane`);
      const c = pl.courses[Math.floor(d / band)];
      assert.ok(c, `seed ${seed}: side ${side + 1} depth ${d}`);
      const u = d - Math.floor(d / band) * band;
      const under = (q) => q.offcut === "left"
        ? (q.hip ? t >= q.x + u - 0.07 : t >= q.x + q.length - u - 0.07) && t <= q.x + q.length + 0.07
        : q.offcut === "right" ? t >= q.x - 0.07 && (q.hip ? t <= q.x + q.length - u + 0.07 : t <= q.x + u + 0.07) : t >= q.x - 0.07 && t <= q.x + q.length + 0.07;
      assert.ok(c.pieces.some(under), `seed ${seed}: side ${side + 1} at t ${t}, depth ${d}`);
      points++;
    }
    // framed: every piece still has length, and every joint said to be on a rafter has one there
    const fr = frameOutlineRoof(ro.points, ro.eaveLine, ro.lines, { pitch, ...FRAME });
    if (fr.ok) {
      const sf = /** @type {any} */ (sheatheOutlineRoof(ro, { frame: fr }));
      assert.equal(sf.ok, true, `seed ${seed} framed: ${sf.errors.join(" ")}`);
      for (const pl of sf.planes) for (const c of pl.courses) for (const q of c.pieces) assert.ok(q.length > 0 && q.length <= 96, `seed ${seed} framed: ${q.length}`);
      framed++;
    }
    // some run ends meet a hip off a clipped (135-degree) corner: those give no offcut to reuse
    for (const pl of s.planes) if (Math.abs(pl.eaveIn - Math.round(pl.eaveIn)) > 1e-6) angledEnds++;
  }
  assert.equal(n, 180);
  assert.equal(bays, 60);
  assert.ok(framed > 150, `${framed} framed`);
  assert.ok(points > 15000, `${points} points`);
  assert.ok(angledEnds > 50, `${angledEnds} angled planes`);
});

test("faceSection: a 45-degree side's plane at a depth is where that depth's line crosses its face", () => {
  // a square with one corner clipped: the clipped side's plane at depth d runs between its two hips, each
  // bisecting a 135-degree corner, so each end moves in d / tan(67.5 degrees)
  const walls = P([[0, 0], [240, 0], [240, 192], [192, 240], [0, 240]]);
  const ro = /** @type {any} */ (outlineRoof(walls, { pitch: 6, overhang: 0 }));
  const faces = /** @type {any[]} */ (planeFaces(ro.eaveLine, ro.lines));
  const i = ro.eaveLine.findIndex((q, j) => { const r = ro.eaveLine[(j + 1) % ro.eaveLine.length]; return q.x !== r.x && q.y !== r.y; });
  assert.ok(i >= 0);
  const len = Math.hypot(48, 48);
  for (const d of [1, 5, 10, 20]) {
    const sec = faceSection(ro.eaveLine, i, faces[i].poly, d);
    assert.equal(sec.length, 1);
    // each end of the clipped side is a 135-degree corner: its hip leans in by d / tan(67.5 degrees) per side
    assert.ok(Math.abs(sec[0][1] - sec[0][0] - (len - 2 * d / Math.tan((67.5 * Math.PI) / 180))) < 1e-6, `${d}: ${sec[0]}`);
  }
  assert.deepEqual(faceSection(ro.eaveLine, i, faces[i].poly, 1000), []);
});
