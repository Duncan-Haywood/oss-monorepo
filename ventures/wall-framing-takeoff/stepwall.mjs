// Stepped walls: a wall whose studs change height part-way along (a split-level
// tie-in, a clerestory, a garage wall that meets a taller house wall).
// `wall.steps = [{ at, studLength }]` (at: inches from the wall start) splits the wall into
// segments, each framed as its own level wall with that stud length, so every segment gets its
// own end studs (a doubled stud at the step), plates and sheathing. Not a structural check:
// how the two heights are tied together at the step is the framer's and engineer's call.
// Pure and standalone; the CLI applies it right after the plan is read.

const EPS = 1e-6;
const THICK = 1.5;

/**
 * @param {any} plan a normalised plan (lengths in inches)
 * @returns {{ ok: true, plan: any, notes: string[] } | { ok: false, errors: string[] }}
 */
export function expandSteppedWalls(plan) {
  if (!plan || !Array.isArray(plan.walls) || !plan.walls.some((w) => w && w.steps !== undefined)) return { ok: true, plan, notes: [] };
  const errors = [];
  const notes = [];
  /** @type {Map<string, {id:string, from:number, to:number}[]>} */
  const segMap = new Map();
  const walls = [];
  for (const w of plan.walls) {
    if (!w || w.steps === undefined) { walls.push(w); continue; }
    const id = w.id;
    const steps = w.steps;
    if (!Array.isArray(steps) || !steps.length) { errors.push(`Wall ${id}: "steps" must be a list of { at, studLength }.`); continue; }
    if (w.gable) { errors.push(`Wall ${id}: a gable wall cannot also have steps.`); continue; }
    let bad = false;
    let prev = 0;
    for (const s of steps) {
      if (!s || !Number.isFinite(s.at) || !Number.isFinite(s.studLength)) { errors.push(`Wall ${id}: each step needs a number "at" and a number "studLength", in inches.`); bad = true; break; }
      if (!(s.studLength >= 24 && s.studLength <= 240)) { errors.push(`Wall ${id}: step stud length must be between 24 and 240 inches.`); bad = true; break; }
      if (!(s.at > prev + 4 * THICK && s.at < w.length - 4 * THICK)) { errors.push(`Wall ${id}: steps must rise in order, each at least ${4 * THICK} in from the last one and from both wall ends.`); bad = true; break; }
      prev = s.at;
    }
    if (bad) continue;
    const cuts = [0, ...steps.map((s) => s.at), w.length];
    const heights = [w.studLength ?? plan.studLength, ...steps.map((s) => s.studLength)];
    const segs = [];
    for (let i = 0; i < heights.length; i++) segs.push({ id: `${id} (${String.fromCharCode(97 + i)})`, from: cuts[i], to: cuts[i + 1], studLength: heights[i] });
    segMap.set(id, segs.map(({ id: sid, from, to }) => ({ id: sid, from, to })));
    for (const o of w.openings || []) {
      const s = segs.find((g) => o.offset >= g.from - EPS && o.offset + o.width <= g.to + EPS);
      if (!s || o.offset < s.from + 2 * THICK - EPS && s.from > 0 || o.offset + o.width > s.to - 2 * THICK + EPS && s.to < w.length) errors.push(`Wall ${id}: ${o.label || o.kind} at ${o.offset} in crosses a step; keep openings inside one segment with room for kings and jacks.`);
    }
    for (const [i, s] of segs.entries()) {
      const { steps: _s, ...rest } = w;
      const seg = {
        ...rest, id: s.id, length: s.to - s.from, studLength: s.studLength,
        openings: (w.openings || []).filter((o) => o.offset >= s.from - EPS && o.offset + o.width <= s.to + EPS).map((o) => ({ ...o, offset: o.offset - s.from })),
        tees: (w.tees || []).filter((t) => t >= s.from - EPS && (t < s.to - EPS || (i === segs.length - 1))).map((t) => t - s.from),
      };
      // Corner backing belongs to the wall's own start; this wall's tee into a host stays on the first segment.
      if (i > 0) { seg.corner = false; delete seg.tee; }
      walls.push(seg);
    }
    notes.push(`Wall ${id} is stepped: ${segs.map((s) => `${s.id} ${s.to - s.from} in with ${s.studLength} in studs`).join(", ")}. Each segment has its own end studs, so there is a doubled stud at every step; tie the two heights together by hand.`);
  }
  if (errors.length) return { ok: false, errors };
  // A tee that lands on a stepped host wall goes to the segment under it.
  for (const w of walls) {
    if (w && w.tee && segMap.has(w.tee.wall)) {
      const seg = segMap.get(w.tee.wall).find((g) => w.tee.at >= g.from - EPS && w.tee.at <= g.to + EPS);
      if (seg) w.tee = { ...w.tee, wall: seg.id, at: w.tee.at - seg.from };
    }
  }
  return { ok: true, plan: { ...plan, walls }, notes };
}
