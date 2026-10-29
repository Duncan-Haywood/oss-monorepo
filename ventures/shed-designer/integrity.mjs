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
  const pts = [];
  for (const [p, q] of g.profile) for (const t of [0, g.thickness]) pts.push([0, 1, 2].map((i) => g.origin[i] + p * g.u[i] + q * g.v[i] + t * g.w[i]));
  return { lo: [0, 1, 2].map((i) => Math.min(...pts.map((x) => x[i]))), hi: [0, 1, 2].map((i) => Math.max(...pts.map((x) => x[i]))) };
}

const touches = (a, b) => [0, 1, 2].every((i) => a.lo[i] <= b.hi[i] + TOL && b.lo[i] <= a.hi[i] + TOL);
const overlap = (a, b) => [0, 1, 2].every((i) => Math.min(a.hi[i], b.hi[i]) - Math.max(a.lo[i], b.lo[i]) > TOL);
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
  while (queue.length) {
    const a = /** @type {any} */ (queue.shift());
    for (const b of items) if (!reached.has(b) && touches(a.b, b.b)) { reached.add(b); queue.push(b); }
  }
  const floating = items.filter((x) => !reached.has(x)).map((x) => `${x.kind} ${x.id}`);
  const rects = items.filter((x) => x.member && x.rect);
  const clashes = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i].b, rects[j].b)) clashes.push(`${rects[i].kind} ${rects[i].id} / ${rects[j].kind} ${rects[j].id}`);
  return { floating, clashes };
}
