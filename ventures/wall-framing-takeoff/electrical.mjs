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

/**
 * @param {Electrical} d
 * @param {{ walls: { id: string, length: number, sheathed?: boolean, openings?: { kind: string, offset: number, width: number }[] }[] }} plan
 */
export function layoutElectrical(d, plan) {
  const errors = validateElectrical(d, plan);
  if (errors.length) return { ok: false, errors };
  const maxSp = d.maxSpacing ?? 144, minSp = d.minSpace ?? 24, perDoor = d.switchPerDoor ?? 1;
  const skip = new Set(d.skipWalls || []);
  /** @type {{ wall: string, face: number, receptacles: number[], space: number }[]} */ const spaces = [];
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
      const at = Array.from({ length: n }, (_, i) => +(sp.start + (i + 0.5) * len / n).toFixed(2));
      for (let f = 1; f <= faces; f++) spaces.push({ wall: w.id, face: f, receptacles: at, space: len });
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
  return { ok: true, errors: [], maxSpacing: maxSp, minSpace: minSp, receptacles, switches, boxes, cableFt, waste, cableRoll: roll, cableRolls, perWall, spaces, cost, prices: { receptacle: d.receptaclePrice ?? null, switch: d.switchPrice ?? null, box: d.boxPrice ?? null, cableRoll: d.cablePrice ?? null } };
}

/** @param {any} t */
export function electricalText(t) {
  const l = [];
  l.push(`  ${t.receptacles} receptacle boxes (no point on a wall space of ${t.minSpace} in or more is over ${t.maxSpacing / 2 / 12} ft from one), ${t.switches} switch boxes: ${t.boxes} boxes in all.`);
  for (const w of t.perWall) if (w.receptacles || w.switches) l.push(`    ${w.id}: ${w.receptacles} receptacles, ${w.switches} switches`);
  l.push(`  Cable estimate: ${t.cableFt.toFixed(0)} ft plus ${(100 * t.waste).toFixed(0)}% waste -> ${t.cableRolls} rolls of ${t.cableRoll} ft${t.cost != null ? `; cost ${t.cost.toFixed(2)}` : ""}.`);
  l.push("  Kitchens, baths, garages, hallways, closets, stairs, alarms, fixtures, the panel and local code amendments are not counted; the cable length per box is a typed estimate.");
  return l;
}
