// @ts-check
// --shallow-headers: where a header is deeper than the room under the top
// plates (a model door 85-1/2 in tall under an 85-1/2 in plate line, a 2x10
// typed by a placeholder), swap in the deepest listed header that does fit and
// say so. The opening's height and header height are kept: only the member
// changes. A header is a structural member, so every swap is a note to take to
// the engineer or the span table; nothing here sizes a header for load.
import { DEPTH, THICK, openingGeometry } from "./engine.mjs";

/**
 * @param {any} plan  a plan object; walls are changed in place
 * @returns {string[]} one note per header swapped or still not fitting
 */
export function shallowHeaders(plan) {
  const notes = [];
  if (plan == null || typeof plan !== "object") return notes;
  const sizes = new Set(stockSizes(plan));
  for (const wall of plan.walls || []) {
    if (!wall || wall.gable) continue;
    for (const op of wall.openings || []) {
      if (!op || typeof op !== "object" || !Object.hasOwn(DEPTH, op.header)) continue;
      const g = openingGeometry(plan, wall, op);
      if (op.kind === "door" && g.roBottom > THICK + 1e-9 && g.roBottom <= THICK + DOOR_THRESHOLD_MAX) {
        // A door whose bottom sits a threshold's height above the plate (Revit sill 1-5/8 in): extend it down to the floor.
        const drop = g.roBottom - THICK;
        op.height += drop;
        notes.push(`Wall ${wall.id}, ${op.label || op.kind}: the door bottom is ${drop.toFixed(2)} in above the floor in the model (a threshold or finish floor), so it was framed ${drop.toFixed(2)} in taller to reach the floor.`);
      }
      if (!(g.topCripple < -1e-9)) continue;
      const room = DEPTH[op.header] + g.topCripple;
      const fit = Object.entries(DEPTH).filter(([k, d]) => d <= room + 1e-9 && sizes.has(k)).sort((a, b) => b[1] - a[1])[0];
      const name = `Wall ${wall.id}, ${op.label || op.kind}`;
      if (!fit) { notes.push(`${name}: the ${op.header} header is ${(-g.topCripple).toFixed(2)} in too deep and nothing on the lumber list fits the ${room.toFixed(2)} in of room; left as is, so the plan check will refuse it.`); continue; }
      notes.push(`${name}: ${op.header} header is ${(-g.topCripple).toFixed(2)} in too deep under the top plates, so ${fit[0]} (${fit[1]} in) was used. Check it against the span table or your engineer; the opening is ${op.width} in wide.`);
      op.header = fit[0];
    }
  }
  return notes;
}

/** Sizes on the lumber list; a missing, non-list or hostile (null entry) list gives none instead of throwing. */
function stockSizes(/** @type {any} */ plan) {
  return Array.isArray(plan.stock) ? plan.stock.filter((/** @type {any} */ s) => s && typeof s === "object").map((/** @type {any} */ s) => s.size) : [];
}

const DOOR_THRESHOLD_MAX = 2; // in: a door bottom this far above the plate is a threshold, not a raised opening

/**
 * --trim-openings: where no listed header fits under the plates even after a
 * swap (a model door taller than the room), lower the opening's top to the
 * shallowest listed header and shorten the opening by the same amount, keeping
 * its bottom where it was. The door or window as modelled does not fit the wall
 * as modelled; this frames the wall as if the opening were cut down and says by
 * how much, so the takeoff of the rest of the floor is not held up. It is a
 * placeholder for a decision on the source model, not a design.
 * @param {any} plan  a plan object; walls are changed in place
 * @returns {string[]} one note per opening trimmed
 */
export function trimOpenings(plan) {
  const notes = [];
  if (plan == null || typeof plan !== "object") return notes;
  const sizes = stockSizes(plan).filter((/** @type {string} */ k) => Object.hasOwn(DEPTH, k));
  if (!sizes.length) return notes;
  const minSize = sizes.sort((a, b) => DEPTH[a] - DEPTH[b])[0];
  for (const wall of plan.walls || []) {
    if (!wall || wall.gable) continue;
    for (const op of wall.openings || []) {
      if (!op || typeof op !== "object" || !Object.hasOwn(DEPTH, op.header)) continue;
      const g = openingGeometry(plan, wall, op);
      if (!(g.topCripple < -1e-9)) continue;
      const room = DEPTH[op.header] + g.topCripple;
      if (room >= DEPTH[minSize] - 1e-9) continue; // a header fits: --shallow-headers' job
      const trim = DEPTH[minSize] - room;
      if (!(op.height - trim > 0)) continue;
      const name = `Wall ${wall.id}, ${op.label || op.kind}`;
      op.headerHeight = g.headerHeight - trim;
      op.height -= trim;
      op.header = minSize;
      notes.push(`${name}: the opening is ${trim.toFixed(2)} in taller than the room under the top plates leaves for even a ${minSize}, so it was framed ${trim.toFixed(2)} in shorter (${op.height} in tall, ${minSize} header). The door or window as modelled does not fit; fix the height in the source model or cut the unit down.`);
    }
  }
  return notes;
}

/**
 * --doors-to-floor: a door whose bottom is more than a threshold above the
 * plate (a Revit sill of 39 in on a French door whose leaf is 79.5 in) is
 * almost always a modelling error, not a raised door. Frame it with the leaf
 * height kept and the bottom on the floor, header lowered with it, and say by
 * how much. A placeholder for fixing the sill in the source model.
 * @param {any} plan  a plan object; walls are changed in place
 * @returns {string[]} one note per door lowered
 */
export function doorsToFloor(plan) {
  const notes = [];
  if (plan == null || typeof plan !== "object") return notes;
  for (const wall of plan.walls || []) {
    if (!wall || wall.gable) continue;
    for (const op of wall.openings || []) {
      if (!op || typeof op !== "object" || op.kind !== "door") continue;
      const g = openingGeometry(plan, wall, op);
      const raise = g.roBottom - THICK;
      if (!(raise > DOOR_THRESHOLD_MAX + 1e-9)) continue;
      op.headerHeight = g.headerHeight - raise;
      notes.push(`Wall ${wall.id}, ${op.label || op.kind}: the door bottom is ${raise.toFixed(2)} in above the floor in the model, so it was framed ${raise.toFixed(2)} in lower, leaf kept at ${op.height} in, to reach the floor. Check the sill in the source model.`);
    }
  }
  return notes;
}
