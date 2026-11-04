// @ts-check
// Electrical rough-in counts from the wall plan: receptacle boxes, switch boxes
// and cable, per wall, so the electrician's walk-through starts from a number.
//
// Receptacles follow the habitable-room wall-space rule of the NEC (210.52(A)):
// a wall space is a stretch of wall 24 in or wider along the floor line, broken
// only by doorways (a window does not break it); no point along it may be more
// than 6 ft from a receptacle, so a space of L inches needs ceil(L / 144),
// placed evenly. Walls shorter than 24 in between doors get none. An exterior
// wall (sheathed) has one room-facing face, an interior wall (`sheathed:
// false`) two. One switch box is counted per door by default (`switchPerDoor`,
// type 0 to count none), the usual light switch at a room entry.
//
// Not counted: kitchen counters, baths, garages, hallways, closets, stairs,
// smoke and CO alarms, fixtures, GFCI and AFCI choices, the panel and feeders,
// and local amendments or the code edition your jurisdiction adopted. The cable
// length is an estimate: `cablePerDevice` feet (default 12) of cable per box,
// a figure to replace with your electrician's own. Boxes sit evenly in the
// space; moving one off a stud is a field decision (the layout does not know
// stud bays yet). This is a counting aid, not a design or a code review.

import { textNumberErrors } from "./numfields.mjs";
/** @typedef {{ skipWalls?: string[], maxSpacing?: number, minSpace?: number, switchPerDoor?: number, cablePerDevice?: number, cableRoll?: number, waste?: number, receptaclePrice?: number, switchPrice?: number, boxPrice?: number, cablePrice?: number }} Electrical */

/** @param {Electrical} d @param {any} [plan] */
export function validateElectrical(d, plan) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Electrical settings are an object."];
  const e = textNumberErrors(d, ["maxSpacing", "minSpace", "switchPerDoor", "cablePerDevice", "cableRoll", "waste", "receptaclePrice", "switchPrice", "boxPrice", "cablePrice"]);
  if (e.length) return e;
  if (d.skipWalls != null && (!Array.isArray(d.skipWalls) || d.skipWalls.some((x) => typeof x !== "string"))) e.push("skipWalls is a list of wall ids.");
  if (d.maxSpacing != null && !(d.maxSpacing >= 24 && d.maxSpacing <= 240)) e.push("maxSpacing must be between 24 and 240 inches (code: 144).");
  if (d.minSpace != null && !(d.minSpace >= 6 && d.minSpace <= 120)) e.push("minSpace must be between 6 and 120 inches (code: 24).");
  if (d.switchPerDoor != null && !(Number.isInteger(d.switchPerDoor) && d.switchPerDoor >= 0 && d.switchPerDoor <= 4)) e.push("switchPerDoor must be a whole number 0 to 4.");
  if (d.cablePerDevice != null && !(d.cablePerDevice >= 1 && d.cablePerDevice <= 200)) e.push("cablePerDevice must be between 1 and 200 feet.");
  if (d.cableRoll != null && !(d.cableRoll >= 25 && d.cableRoll <= 5000)) e.push("cableRoll must be between 25 and 5000 feet.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.5)) e.push("Cable waste must be between 0 and 0.5.");
  if (plan && d.skipWalls) { const ids = new Set((plan.walls || []).map((/** @type {any} */ w) => w.id)); for (const s of d.skipWalls) if (!ids.has(s)) e.push(`skipWalls names "${s}", which is not a wall in the plan.`); }
  return e;
}

/**
 * Wall spaces along one face: the stretches between doors.
 * @param {number} length @param {{ kind: string, offset: number, width: number }[]} ops
 * @returns {{ start: number, end: number }[]}
 */
export function wallSpaces(length, ops) {
  const doors = ops.filter((o) => o.kind === "door").map((o) => [Math.max(0, o.offset), Math.min(length, o.offset + o.width)]).sort((a, b) => a[0] - b[0]);
  /** @type {{ start: number, end: number }[]} */ const out = [];
  let at = 0;
  for (const [s, e] of doors) { if (s > at) out.push({ start: at, end: s }); at = Math.max(at, e); }
  if (at < length) out.push({ start: at, end: length });
  return out;
}

const BOX = 2.25; // a single-gang new-work box is about 2.25 in wide; it nails to the side of a stud

/**
 * Move receptacle positions onto the studs: each box nails to the face of a
 * full-height stud, king or jack, so it goes to the nearest stud side that is
 * inside the wall space, keeping the 6 ft rule. Returns the new positions and
 * the largest gap and end distance left.
 * @param {number[]} ideal @param {number} start @param {number} end @param {{ x: number, w: number }[]} studs @param {number} maxSp
 */
export function snapToStuds(ideal, start, end, studs, maxSp) {
  const lo = start + BOX / 2, hi = end - BOX / 2;
  /** @type {number[]} */ const cands = [];
  for (const s of studs) for (const c of [s.x - BOX / 2, s.x + s.w + BOX / 2]) if (c >= lo - 1e-9 && c <= hi + 1e-9 && !studs.some((t) => c + BOX / 2 > t.x + 1e-9 && c - BOX / 2 < t.x + t.w - 1e-9)) cands.push(+c.toFixed(3));
  if (!cands.length) return { at: ideal, snapped: false, worst: Math.max(...ideal.map((a, i) => i ? a - ideal[i - 1] : 0), start === end ? 0 : ideal[0] - start, end - ideal[ideal.length - 1]) };
  const at = ideal.map((x) => cands.reduce((b, c) => Math.abs(c - x) < Math.abs(b - x) ? c : b, cands[0]));
  const pts = [start, ...at, end];
  let worst = 0;
  for (let i = 1; i < pts.length; i++) worst = Math.max(worst, i === 1 || i === pts.length - 1 ? 2 * (pts[i] - pts[i - 1]) : pts[i] - pts[i - 1]);
  // the rule: no point more than maxSp/2 from a box, so gaps up to maxSp and wall-space ends up to maxSp/2
  return { at, snapped: true, worst };
}

/**
 * @param {Electrical} d
 * @param {{ walls: { id: string, length: number, sheathed?: boolean, openings?: { kind: string, offset: number, width: number }[] }[] }} plan
 * @param {Record<string, { members: { kind: string, orient: string, x: number, w: number }[] }>} [layouts] wall layouts by id; with them, boxes snap to studs
 */
export function layoutElectrical(d, plan, layouts) {
  const errors = validateElectrical(d, plan);
  if (errors.length) return { ok: false, errors };
  const maxSp = d.maxSpacing ?? 144, minSp = d.minSpace ?? 24, perDoor = d.switchPerDoor ?? 1;
  const skip = new Set(d.skipWalls || []);
  /** @type {{ wall: string, face: number, receptacles: number[], space: number, snapped: boolean, overRule: boolean }[]} */ const spaces = [];
  /** @type {string[]} */ const notes = [];
  const perWall = [];
  let receptacles = 0, switches = 0;
  for (const w of plan.walls) {
    if (skip.has(w.id)) continue;
    const faces = w.sheathed === false ? 2 : 1;
    const ops = w.openings || [];
    let r = 0;
    for (const sp of wallSpaces(w.length, ops)) {
      const len = sp.end - sp.start;
      if (len < minSp - 1e-9) continue;
      const n = Math.ceil(len / maxSp - 1e-9);
      let at = Array.from({ length: n }, (_, i) => +(sp.start + (i + 0.5) * len / n).toFixed(2));
      let snapped = false, overRule = false;
      const lay = layouts && layouts[w.id];
      if (lay) {
        const studs = lay.members.filter((m) => m.orient === "v" && (m.kind === "stud" || m.kind === "king" || m.kind === "jack")).map((m) => ({ x: m.x, w: m.w }));
        const sn = snapToStuds(at, sp.start, sp.end, studs, maxSp);
        at = sn.at; snapped = sn.snapped; overRule = sn.snapped && sn.worst > maxSp + 1e-9;
        if (overRule) notes.push(`${w.id}: the stud-side positions leave a point more than ${maxSp / 24} ft from a box in the wall space starting at ${sp.start.toFixed(0)} in; add a box or set the box by hand.`);
      }
      for (let f = 1; f <= faces; f++) spaces.push({ wall: w.id, face: f, receptacles: at, space: len, snapped, overRule });
      r += n * faces;
    }
    const doors = ops.filter((o) => o.kind === "door").length;
    const sw = doors * perDoor;
    receptacles += r; switches += sw;
    perWall.push({ id: w.id, receptacles: r, switches: sw });
  }
  const boxes = receptacles + switches;
  const cableFt = boxes * (d.cablePerDevice ?? 12), waste = d.waste ?? 0.1, roll = d.cableRoll ?? 250;
  const cableRolls = boxes ? Math.ceil(cableFt * (1 + waste) / roll - 1e-9) : 0;
  const priced = ["receptaclePrice", "switchPrice", "boxPrice", "cablePrice"].some((k) => /** @type {any} */ (d)[k] != null);
  const cost = priced ? receptacles * (d.receptaclePrice ?? 0) + switches * (d.switchPrice ?? 0) + boxes * (d.boxPrice ?? 0) + cableRolls * (d.cablePrice ?? 0) : null;
  return { ok: true, errors: [], maxSpacing: maxSp, minSpace: minSp, receptacles, switches, boxes, cableFt, waste, cableRoll: roll, cableRolls, perWall, spaces, notes, cost, prices: { receptacle: d.receptaclePrice ?? null, switch: d.switchPrice ?? null, box: d.boxPrice ?? null, cableRoll: d.cablePrice ?? null } };
}

/** @param {any} t */
export function electricalText(t) {
  const l = [];
  l.push(`  ${t.receptacles} receptacle boxes (no point on a wall space of ${t.minSpace} in or more is over ${t.maxSpacing / 2 / 12} ft from one), ${t.switches} switch boxes: ${t.boxes} boxes in all.`);
  for (const w of t.perWall) if (w.receptacles || w.switches) l.push(`    ${w.id}: ${w.receptacles} receptacles, ${w.switches} switches`);
  l.push(`  Cable estimate: ${t.cableFt.toFixed(0)} ft plus ${(100 * t.waste).toFixed(0)}% waste -> ${t.cableRolls} rolls of ${t.cableRoll} ft${t.cost != null ? `; cost ${t.cost.toFixed(2)}` : ""}.`);
  if (t.spaces.some((/** @type {any} */ s) => s.snapped)) l.push("  Receptacle positions are the nearest stud side (boxes nail to a full-height stud, king or jack); inches from the wall start are in the JSON result.");
  for (const n of t.notes || []) l.push(`  Note: ${n}`);
  l.push("  Kitchens, baths, garages, hallways, closets, stairs, alarms, fixtures, the panel and local code amendments are not counted; the cable length per box is a typed estimate.");
  return l;
}
