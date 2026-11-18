// @ts-check
// Geometry checks that keep the model honest: nothing floats, and no two
// boards occupy the same wood.
//
// Floating: starting from the ground (the gravel pad, or blocks set on the soil), follow every piece that touches a
// piece already reached (boxes within 1/16"). Anything never reached is not
// held up by anything. Clashes: two members whose shapes are plain rectangles
// lined up with the axes, overlapping by more than 1/16" in all three
// directions. Angled pieces (rafters, gable studs) are left out of the clash
// test because their bounding boxes overlap where the wood does not.

const TOL = 1 / 16;

/** World-space bounding box of a geometry. @param {import('./model.mjs').Geom} g */
export function bbox(g) {
  // Plain loops: this runs for every member of every design the searches
  // price (gallery, designsearch), and the map/spread form dominated them.
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const o = g.origin, u = g.u, v = g.v, w = g.w, th = g.thickness;
  for (let k = 0; k < g.profile.length; k++) {
    const p = g.profile[k][0], q = g.profile[k][1];
    for (let t = 0; t < 2; t++) {
      const tt = t === 0 ? 0 : th;
      for (let i = 0; i < 3; i++) {
        const x = o[i] + p * u[i] + q * v[i] + tt * w[i];
        if (x < lo[i]) lo[i] = x;
        if (x > hi[i]) hi[i] = x;
      }
    }
  }
  return { lo, hi };
}

const touches = (a, b) => a.lo[0] <= b.hi[0] + TOL && b.lo[0] <= a.hi[0] + TOL && a.lo[1] <= b.hi[1] + TOL && b.lo[1] <= a.hi[1] + TOL && a.lo[2] <= b.hi[2] + TOL && b.lo[2] <= a.hi[2] + TOL;
const overlap = (a, b) => Math.min(a.hi[0], b.hi[0]) - Math.max(a.lo[0], b.lo[0]) > TOL && Math.min(a.hi[1], b.hi[1]) - Math.max(a.lo[1], b.lo[1]) > TOL && Math.min(a.hi[2], b.hi[2]) - Math.max(a.lo[2], b.lo[2]) > TOL;
// A four-point profile is only a box when every edge runs along p or q: a
// rafter with no tail or notch, or a stud with its top cut to the roof, has
// four points too, and its bounding box holds wood it does not have.
const squareProfile = (pts) => pts.every(([p, q], i) => { const [p1, q1] = pts[(i + 1) % pts.length]; return Math.abs(p1 - p) < 1e-9 || Math.abs(q1 - q) < 1e-9; });
const axisRect = (g) => g.profile.length === 4 && squareProfile(g.profile) && [g.u, g.v, g.w].every((v) => v.filter((c) => Math.abs(c) > 1e-9).length === 1);

/** @param {import('./model.mjs').Shed} shed */
export function integrity(shed) {
  const items = [
    ...shed.members.map((m) => ({ id: m.id, kind: m.kind, member: true, rect: axisRect(m.geom), b: bbox(m.geom) })),
    ...shed.panels.map((p) => ({ id: p.id, kind: p.kind, member: false, rect: false, b: bbox(p.geom) })),
    ...shed.fixtures.map((f, i) => ({ id: `fixture-${i}`, kind: f.kind, member: false, rect: false, b: bbox(f.geom) })),
  ];
  // Grounded: the gravel, and anything whose underside is on the ground itself (blocks on tamped soil).
  const reached = new Set(items.filter((x) => x.kind === 'gravel' || Math.abs(x.b.lo[2]) < 0.01));
  const queue = [...reached];
  // Only unreached items need testing; the list shrinks as the flood spreads.
  let rest = items.filter((x) => !reached.has(x));
  for (let qi = 0; qi < queue.length && rest.length; qi++) {
    const a = /** @type {any} */ (queue[qi]);
    const next = [];
    for (const b of rest) { if (touches(a.b, b.b)) { reached.add(b); queue.push(b); } else next.push(b); }
    rest = next;
  }
  const floating = items.filter((x) => !reached.has(x)).map((x) => `${x.kind} ${x.id}`);
  const rects = items.filter((x) => x.member && x.rect);
  const clashes = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i].b, rects[j].b)) clashes.push(`${rects[i].kind} ${rects[i].id} / ${rects[j].kind} ${rects[j].id}`);
  return { floating, clashes };
}
