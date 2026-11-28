// @ts-check
// Rafters for an all-hip roof over ANY outline, framed on the ridges, hips and
// valleys hiproof.mjs (square-cornered) or skeleton.mjs (sides at any angle) finds.
//
// roof.mjs frames a rectangle (gable or hip) and a gable with up to two cross wings.
// Every other outline (a Z, a stair-step, an E, a hip roof on an L) got squares and
// line lengths only. This file frames that roof: every roof plane rises from one eave
// side, so its rafters run square to that side, in plan, on the spacing measured from
// the side's wall corner (the plate layout), and each rafter is the part of that line
// that lies on the plane. Which plane a point is on comes from the same rule as the
// roof itself: the height at a point is the L-infinity distance to the eave line, and
// the plane is the eave side that distance is measured to (hiproof.mjs).
//
// Each rafter's two ends say what it is:
//
//   eave to ridge (or to the point where hips meet)   common rafter
//   eave to hip                                        jack rafter (hip jack)
//   valley to ridge                                    valley jack rafter
//   valley to hip                                      cripple jack
//
// A common is also set on every plane at each point where a hip ends at the top (a
// ridge end, or the peak of a pyramid), as framers set the commons that hold a hip
// set, and the king common of each end plane. Lengths follow roof.mjs: a rafter is
// measured from the eave edge (the overhang included) to the ridge board's face (half
// its thickness off the run) or the hip's or valley's face (half its thickness, along
// the 45-degree line, off the run), times sqrt(1 + (pitch/12)^2), to the 1/16 in. Hips
// and valleys are the lines' slope lengths with no deduction, as roof.mjs measures a
// hip. Ridge boards are the ridge lines, split into equal pieces no longer than the
// longest ridge board listed.
//
// Outlines with angled sides (a bay, a 45-degree corner) have no L-infinity rule, so
// the planes are found from the roof lines themselves: the eave sides and the ridges,
// hips and valleys are traced as a planar graph, and the face on the inside of eave
// side i is that side's plane (`planeFaces`). A rafter there is cut back from a hip or
// valley by half the member's thickness divided by the sine of the angle between the
// rafter and that line in plan (the square-cornered (THICK / 2) x sqrt 2 at 45
// degrees), and a hip or valley is its line's plan length and rise put together.
// The faces are used on square-cornered outlines too. They give the same rafters as the
// L-infinity rule on every random outline without two eave sides on one line
// (hipframe-angled.test.mjs); with two such sides (a bump-out or bay on one wall) the
// L-infinity rule called the plane above the bump both sides' and framed it twice,
// rafters 4 in apart, while a shared face is framed once: over each side's own eave by
// that side, over the gap between them on the first side's layout.
//
// Nothing here sizes a member, checks a span or a bearing, or places a ridge joint on
// a rafter; birdsmouth, tail and bevel cuts are made in the lengths given.
import { THICK, DEPTH, formatInches } from "./engine.mjs";
import { slopeFactor } from "./roof.mjs";

const TOL = 1e-6;
/** Grid rafters closer than this (centre to centre) to an added common are dropped: the two would touch. */
const MIN_GAP = 2 * THICK;

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ kind: "hip" | "valley" | "ridge", x0: number, y0: number, z0: number, x1: number, y1: number, z1: number }} Line */
/** @typedef {{ plane: number, u: number, kind: string, bottom: "eave" | "valley", top: "ridge" | "hip", planIn: number, length: number, size: string, x0: number, y0: number, x1: number, y1: number }} Rafter */

const round16 = (/** @type {number} */ v) => Math.round(v * 16) / 16;

/** L-infinity distance from (x, y) to the segment a-b (axis-aligned). @param {Pt} a @param {Pt} b */
function dist(a, b, x, y) {
  const gx = Math.max(0, Math.min(a.x, b.x) - x, x - Math.max(a.x, b.x)), gy = Math.max(0, Math.min(a.y, b.y) - y, y - Math.max(a.y, b.y));
  return Math.max(gx, gy);
}

/** Even-odd inside test against the vertical sides. @param {Pt[]} p */
function inside(p, x, y) {
  let c = false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (Math.abs(a.x - b.x) <= TOL && (a.y > y) !== (b.y > y) && a.x > x) c = !c;
  }
  return c;
}

/** Even-odd inside test against any polygon. @param {Pt[]} p */
function insideAny(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > y) !== (b.y > y) && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) c = !c;
  }
  return c;
}

/**
 * The plane of each eave side as a polygon: the eave sides and the roof lines traced as a
 * planar graph (every segment split where another one's end lies on it, ends welded), and
 * the face on the left of eave side i (the inside, counter-clockwise) taken as plane i.
 * @param {Pt[]} eave counter-clockwise @param {Line[]} lines
 * Two eave sides on one line with a notch between them share one plane above the notch; the face
 * is then traced from both, and `sides` lists every eave side on its boundary.
 * @returns {{ poly: Pt[], sides: number[] }[] | null} null when a side's face does not close (the lines do not tile the outline)
 */
export function planeFaces(eave, lines) {
  const n = eave.length;
  const xs = eave.map((p) => p.x), ys = eave.map((p) => p.y);
  const tol = 1e-6 * Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  /** @type {Pt[]} */
  const nodes = [];
  const node = (/** @type {Pt} */ p) => {
    for (let k = 0; k < nodes.length; k++) if (Math.hypot(nodes[k].x - p.x, nodes[k].y - p.y) <= tol) return k;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };
  /** @type {[Pt, Pt, number][]} segment ends and the eave side it is (-1 for a roof line) */
  const segs = [];
  for (let i = 0; i < n; i++) segs.push([eave[i], eave[(i + 1) % n], i]);
  for (const l of lines) segs.push([{ x: l.x0, y: l.y0 }, { x: l.x1, y: l.y1 }, -1]);
  for (const [a, b] of segs) { node(a); node(b); }
  /** @type {Map<string, number>} directed edge "u,v" to its eave side, or -1 */
  const edges = new Map();
  for (const [a, b, side] of segs) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    if (L2 <= tol * tol) continue;
    // the nodes on this segment, in order along it
    const on = nodes.map((p, k) => ({ k, t: ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, p }))
      .filter(({ t, p }) => t > -1e-9 && t < 1 + 1e-9 && Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= tol)
      .sort((m, q) => m.t - q.t);
    for (let j = 0; j + 1 < on.length; j++) {
      const u = on[j].k, v = on[j + 1].k;
      if (u === v) continue;
      if (!edges.has(`${u},${v}`) || side >= 0) edges.set(`${u},${v}`, side);
      if (!edges.has(`${v},${u}`)) edges.set(`${v},${u}`, -1);
    }
  }
  /** @type {Map<number, number[]>} outgoing neighbours of each node, by angle */
  const out = new Map();
  for (const key of edges.keys()) { const [u, v] = key.split(",").map(Number); if (!out.has(u)) out.set(u, []); /** @type {number[]} */ (out.get(u)).push(v); }
  const ang = (/** @type {number} */ u, /** @type {number} */ v) => Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x);
  for (const [u, vs] of out) vs.sort((p, q) => ang(u, p) - ang(u, q));
  // the face on the left of u -> v continues at v along the edge just clockwise of v -> u
  const next = (/** @type {number} */ u, /** @type {number} */ v) => {
    const vs = /** @type {number[]} */ (out.get(v)), back = ang(v, u);
    let best = -1, bestD = Infinity;
    for (const w of vs) {
      if (w === u && vs.length > 1) continue;
      let d = back - ang(v, w);
      while (d <= 1e-12) d += 2 * Math.PI;
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  };
  /** @type {{ poly: Pt[], sides: number[] }[]} */
  const faces = [];
  for (const [key, side] of edges) {
    if (side < 0) continue;
    const [u0, v0] = key.split(",").map(Number);
    // the first piece of eave side `side` (from its corner) starts the face
    if (Math.hypot(nodes[u0].x - eave[side].x, nodes[u0].y - eave[side].y) > tol) continue;
    const poly = [nodes[u0]], sides = new Set([side]);
    let u = u0, v = v0, steps = 0;
    while (v !== u0) {
      if (++steps > 4 * edges.size) return null;
      poly.push(nodes[v]);
      const w = next(u, v);
      if (w < 0) return null;
      const e = /** @type {number} */ (edges.get(`${v},${w}`));
      if (e >= 0) sides.add(e);
      u = v; v = w;
    }
    faces[side] = { poly, sides: [...sides].sort((m, q) => m - q) };
  }
  for (let i = 0; i < n; i++) {
    const f = faces[i]?.poly;
    if (!f || f.length < 3) return null;
    let A = 0;
    for (let j = 0; j < f.length; j++) { const p = f[j], q = f[(j + 1) % f.length]; A += p.x * q.y - q.x * p.y; }
    if (!(A > 0)) return null;
  }
  return faces;
}

/** Is (x, y) on the segment of line l (in plan)? @param {Line} l */
function onLine(l, x, y, tol = 1e-4) {
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L2 = dx * dx + dy * dy;
  if (L2 <= TOL) return Math.hypot(x - l.x0, y - l.y0) <= tol;
  const t = ((x - l.x0) * dx + (y - l.y0) * dy) / L2;
  if (t < -tol || t > 1 + tol) return false;
  return Math.hypot(l.x0 + t * dx - x, l.y0 + t * dy - y) <= tol;
}

/**
 * Frame the all-hip roof over an outline.
 * @param {Pt[]} walls counter-clockwise wall corners (readOutline)
 * @param {Pt[]} eave the eave line, corner i offset from wall corner i (offsetOutline)
 * @param {Line[]} lines hipRoofLines(eave, pitch).lines
 * @param {{ id?: string, pitch: number, spacing?: number, rafter?: string, hip?: string, valley?: string, ridge?: string | null, stock: { size: string, length: number }[], faces?: boolean }} o
 *   `faces: false` uses the L-infinity rule on a square-cornered outline instead of the traced faces (the tests' oracle)
 */
export function frameOutlineRoof(walls, eave, lines, o) {
  const id = o.id || "Roof";
  const spacing = o.spacing ?? 16;
  const size = o.rafter ?? "2x8", hipSize = o.hip ?? size, valleySize = o.valley ?? hipSize;
  const ridge = o.ridge || null;
  const errors = [];
  if (!(spacing >= 8 && spacing <= 48)) errors.push("Rafter spacing must be between 8 and 48 inches.");
  for (const [what, sz] of /** @type {[string, string | null][]} */ ([["rafter", size], ["hip", hipSize], ["valley", valleySize], ["ridge", ridge]])) {
    if (sz == null) continue;
    if (!Object.hasOwn(DEPTH, sz)) errors.push(`Unknown ${what} size ${sz}.`);
    else if (!o.stock.some((s) => s.size === sz)) errors.push(`No ${sz} boards listed in the stock (needed for the ${what}s).`);
  }
  if (walls.length !== eave.length || walls.length < 3) errors.push("The wall outline and the eave line do not match corner for corner.");
  if (errors.length) return { ok: false, errors };
  const angled = eave.some((a, i) => { const b = eave[(i + 1) % eave.length]; return a.x !== b.x && a.y !== b.y; });
  // the traced faces by default; a square-cornered outline whose lines do not trace falls back to the L-infinity rule
  const faces = angled || o.faces !== false ? planeFaces(eave, lines) : null;
  if (angled && !faces) return { ok: false, errors: ["The roof lines do not split this outline into one plane per eave side, so its rafters are not laid out (the roof lines and squares are still given); please report the outline."] };
  const k = slopeFactor(o.pitch);
  const n = eave.length;
  const ridgeT = ridge ? THICK : 0;
  const hipOff = (THICK / 2) * Math.SQRT2;
  /** Plan setback of a rafter end from the hip or valley it meets, along the rafter: THICK / 2 over the sine of the angle between them. @param {Pt} p @param {Pt} dir */
  const offAt = (p, dir) => {
    if (!faces) return hipOff;
    const l = lines.find((m) => m.kind !== "ridge" && onLine(m, p.x, p.y));
    if (!l) return hipOff;
    const L = Math.hypot(l.x1 - l.x0, l.y1 - l.y0), sin = Math.abs(((l.x1 - l.x0) * dir.y - (l.y1 - l.y0) * dir.x) / L);
    return sin > 1e-3 ? THICK / 2 / sin : hipOff;
  };
  const tops = lines.filter((l) => l.kind === "hip").map((l) => (l.z1 >= l.z0 ? { x: l.x1, y: l.y1 } : { x: l.x0, y: l.y0 }));
  const span = Math.max(...eave.map((p) => p.x)) - Math.min(...eave.map((p) => p.x)) + Math.max(...eave.map((p) => p.y)) - Math.min(...eave.map((p) => p.y));

  /** @type {Rafter[]} */
  const rafters = [];
  for (let i = 0; i < n; i++) {
    const a = eave[i], b = eave[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = faces ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }, nrm = { x: -t.y, y: t.x }; // counter-clockwise: inside is on the left
    const along = (/** @type {Pt} */ p) => p.x * t.x + p.y * t.y, across = (/** @type {Pt} */ p) => p.x * nrm.x + p.y * nrm.y;
    const w0 = along(walls[i]), w1 = along(walls[(i + 1) % n]), wLo = Math.min(w0, w1), wHi = Math.max(w0, w1);
    const eaveAt = across(a);
    // is p on this plane: inside the eave line, and this side is (one of) the nearest
    const face = faces ? faces[i].poly : null, sharing = faces ? faces[i].sides.filter((j) => j !== i) : [];
    // a plane two sides on one line share: the stretch square to a side's own eave is that side's (its rafters
    // bear on its plate); the stretch over the gap between them is framed on one layout, the first side's
    const group = faces ? faces[i].sides : [];
    const owner = (/** @type {Pt} */ p) => {
      const u = along(p);
      for (const j of group) { const c = along(eave[j]), d = along(eave[(j + 1) % n]); if (u >= Math.min(c, d) - 1e-9 && u <= Math.max(c, d) + 1e-9) return j; }
      return group[0];
    };
    const onPlane = (/** @type {Pt} */ p) => {
      if (face) return insideAny(face, p.x, p.y) && (!sharing.length || owner(p) === i);
      if (!inside(eave, p.x, p.y)) return false;
      const s = across(p) - eaveAt, d = dist(a, b, p.x, p.y);
      if (s < -TOL || Math.abs(d - s) > 1e-6) return false;
      for (let j = 0; j < n; j++) if (j !== i && dist(eave[j], eave[(j + 1) % n], p.x, p.y) < s - 1e-6) return false;
      return true;
    };
    /** Rafters on the line square to this side at `u` along it. @param {number} u @param {boolean} added */
    const frameAt = (u, added) => {
      const base = { x: a.x + (u - along(a)) * t.x, y: a.y + (u - along(a)) * t.y };
      const at = (/** @type {number} */ s) => ({ x: base.x + s * nrm.x, y: base.y + s * nrm.y });
      // where the line crosses a roof line or an eave side: the only places a plane can start or stop
      const cuts = [0, span];
      const cross = (/** @type {{ x0: number, y0: number, x1: number, y1: number }} */ l) => {
        const p0 = { x: l.x0, y: l.y0 }, p1 = { x: l.x1, y: l.y1 };
        const u0 = along(p0), u1 = along(p1);
        if (Math.abs(u1 - u0) <= TOL) { if (Math.abs(u0 - u) <= TOL) cuts.push(across(p0) - eaveAt, across(p1) - eaveAt); return; }
        const f = (u - u0) / (u1 - u0);
        if (f < -TOL || f > 1 + TOL) return;
        cuts.push(across(p0) + f * (across(p1) - across(p0)) - eaveAt);
      };
      for (const l of lines) cross(l);
      for (let j = 0; j < n; j++) { const p = eave[j], q = eave[(j + 1) % n]; cross({ x0: p.x, y0: p.y, x1: q.x, y1: q.y }); }
      const ss = [...new Set(cuts.filter((s) => s >= -TOL && s <= span + TOL).map((s) => Math.max(0, s)))].sort((m, q) => m - q);
      /** @type {[number, number][]} */
      const runs = [];
      for (let j = 0; j + 1 < ss.length; j++) {
        if (ss[j + 1] - ss[j] <= 1e-7) continue;
        if (!onPlane(at((ss[j] + ss[j + 1]) / 2))) continue;
        const last = runs[runs.length - 1];
        if (last && Math.abs(last[1] - ss[j]) <= 1e-7) last[1] = ss[j + 1]; else runs.push([ss[j], ss[j + 1]]);
      }
      for (const [s0, s1] of runs) {
        const bottom = s0 <= 1e-6 ? "eave" : "valley";
        // a rafter that bears on the plate stands inside the wall's own length, clear of the hip or valley over its corner
        if (bottom === "eave" && !added && (u <= wLo + THICK - TOL || u >= wHi - THICK + TOL)) continue;
        const p0 = at(s0), p1 = at(s1);
        const top = lines.some((l) => l.kind === "ridge" && onLine(l, p1.x, p1.y)) || tops.some((q) => Math.hypot(q.x - p1.x, q.y - p1.y) <= 1e-4) ? "ridge" : "hip";
        const atRidge = lines.some((l) => l.kind === "ridge" && onLine(l, p1.x, p1.y));
        const planIn = s1 - s0 - (top === "ridge" ? (atRidge ? ridgeT / 2 : THICK / 2) : offAt(p1, nrm)) - (bottom === "valley" ? offAt(p0, nrm) : 0);
        if (planIn < THICK) continue; // too short to be a rafter: the hip or valley fills it
        const kind = bottom === "eave" ? (top === "ridge" ? "rafter" : "jack rafter") : top === "ridge" ? "valley jack rafter" : "cripple jack";
        rafters.push({ plane: i, u: (u - w0) * Math.sign(w1 - w0), kind, bottom, top, planIn, length: round16(planIn * k), size, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
      }
    };
    // added commons: at every hip top this plane reaches
    const onFace = (/** @type {Pt} */ q) => !!face && face.some((v) => Math.hypot(v.x - q.x, v.y - q.y) <= 1e-4);
    // one common per position: hips computed apart can end a rounding error from each other, and two hip tops
    // closer than two thicknesses (a short ridge on a clipped corner's plane) share one common, as grid rafters do
    const extra = [];
    for (const u of tops.filter((q) => (face ? onFace(q) : onPlane({ x: q.x - nrm.x * 1e-5, y: q.y - nrm.y * 1e-5 }) || onPlane(q))).map((q) => along(q)).sort((m, q) => m - q)) {
      if (!extra.length || u - extra[extra.length - 1] >= MIN_GAP) extra.push(u);
    }
    for (const u of extra) frameAt(u, true);
    // the plate layout: every `spacing` from this side's first wall corner, across the plane's whole reach
    const lo = Math.min(...eave.map(along)), hi = Math.max(...eave.map(along));
    for (let j = Math.ceil((lo - w0) / spacing - TOL); w0 + j * spacing <= hi + TOL; j++) {
      const u = w0 + j * spacing;
      if (extra.some((e) => Math.abs(e - u) < MIN_GAP)) continue;
      frameAt(u, false);
    }
  }

  const slope45 = Math.sqrt(2 + (o.pitch / 12) ** 2);
  // square-cornered: a 45-degree line rising pitch/12 per unit of run; angled: the line's plan length and rise
  const slopeLen = (/** @type {Line} */ l) => (angled ? Math.hypot(l.x1 - l.x0, l.y1 - l.y0, l.z1 - l.z0) : Math.abs(l.x1 - l.x0) * slope45);
  const hips = lines.filter((l) => l.kind === "hip").map((l) => ({ length: round16(slopeLen(l)), size: hipSize }));
  const valleys = lines.filter((l) => l.kind === "valley").map((l) => ({ length: round16(slopeLen(l)), size: valleySize, kind: "valley rafter" }));
  /** @type {{ length: number, size: string }[]} */
  const ridges = [];
  const notes = [];
  const longest = (/** @type {string} */ sz) => Math.max(...o.stock.filter((s) => s.size === sz).map((s) => s.length));
  if (ridge) {
    const rl = longest(ridge);
    let joints = 0;
    for (const l of lines.filter((x) => x.kind === "ridge")) {
      const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0), pieces = Math.ceil(len / rl - 1e-9);
      joints += pieces - 1;
      for (let j = 0; j < pieces; j++) ridges.push({ length: round16(len / pieces), size: ridge });
    }
    if (joints) notes.push(`${joints} ridge joint${joints === 1 ? "" : "s"}: each ridge is split into equal pieces no longer than the longest ${ridge}; move a joint onto a rafter pair when you lay it out.`);
  }
  for (const [what, list, sz] of /** @type {[string, { length: number }[], string][]} */ ([["rafter", rafters, size], ["hip", hips, hipSize], ["valley", valleys, valleySize]])) {
    const max = list.length ? Math.max(...list.map((x) => x.length)) : 0;
    if (max > longest(sz) + TOL) errors.push(`A ${formatInches(max)} ${what} is longer than the longest ${sz} listed (${formatInches(longest(sz))}). List longer boards, shorten the overhang, or lower the pitch.`);
  }
  if (errors.length) return { ok: false, errors };
  if (o.hip == null) notes.push(`Hips and valleys are ${hipSize}, as the rafters; they are normally one size deeper so the jack cuts bear (set \`hip\` and \`valley\`).`);
  const count = (/** @type {string} */ kd) => rafters.filter((x) => x.kind === kd).length;
  const counts = { commons: count("rafter"), jacks: count("jack rafter"), valleyJacks: count("valley jack rafter"), cripples: count("cripple jack"), hips: hips.length, valleys: valleys.length, ridgeBoards: ridges.length };
  if (angled) notes.push("The outline has angled sides: each plane's rafters run square to its own eave side, and each end is cut back from a hip or valley by the angle it meets it at in plan (45 degrees only at square corners). Hip and valley lengths are measured on their lines, which bisect each corner.");
  notes.push(`Framed as an all-hip roof on the outline: rafters square to each eave at ${spacing} in from each wall corner, a common at every hip top. Sizes and spacing are your inputs and are not checked against a span table; hip and valley bevels, backing, ties and bracing are not in the takeoff.`);
  return { ok: true, errors: [], id, pitch: o.pitch, spacing, rafterSize: size, hipSize, valleySize, ridgeSize: ridge, rafters, hips, valleys, ridges, counts, notes };
}

/** Cut rows for takeoff(plan, cuts), in roofCuts' shape. @param {ReturnType<typeof frameOutlineRoof>} f */
export function outlineFrameCuts(f) {
  if (!f.ok) return [];
  const map = new Map();
  const add = (/** @type {string} */ sz, /** @type {number} */ length, /** @type {string} */ kind) => {
    const key = `${sz}|${length}|${kind}`;
    const row = map.get(key) || { size: sz, length, kind, qty: 0, walls: [f.id] };
    row.qty++;
    map.set(key, row);
  };
  for (const x of f.rafters) add(x.size, x.length, x.kind);
  for (const x of f.hips) add(x.size, x.length, "hip rafter");
  for (const x of f.valleys) add(x.size, x.length, "valley rafter");
  for (const x of f.ridges) add(x.size, x.length, "ridge board");
  return [...map.values()];
}

/** One line of text per member kind. @param {ReturnType<typeof frameOutlineRoof>} f */
export function outlineFrameText(f) {
  if (!f.ok) return f.errors.map((e) => `  - ${e}`);
  const range = (/** @type {string} */ kd) => {
    const ls = f.rafters.filter((x) => x.kind === kd).map((x) => x.length);
    return ls.length ? `${ls.length} (${formatInches(Math.min(...ls))} to ${formatInches(Math.max(...ls))})` : "0";
  };
  const out = [`${f.id}, framed from the outline (all-hip, ${f.pitch}:12, ${f.spacing} in o.c.): ${range("rafter")} common rafters, ${range("jack rafter")} jack rafters, ${range("valley jack rafter")} valley jacks, ${range("cripple jack")} cripple jacks, all ${f.rafterSize}`];
  out.push(`  ${f.hips.length} ${f.hipSize} hip rafters, ${f.valleys.length} ${f.valleySize} valley rafters${f.ridgeSize ? `, ${f.ridges.length} ${f.ridgeSize} ridge board pieces` : ", no ridge board (set `ridge`)"}`);
  return out;
}
