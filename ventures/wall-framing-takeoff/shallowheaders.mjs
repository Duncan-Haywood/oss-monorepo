// @ts-check
// --shallow-headers: where a header is deeper than the room under the top
// plates (a model door 85-1/2 in tall under an 85-1/2 in plate line, a 2x10
// typed by a placeholder), swap in the deepest listed header that does fit and
// say so. The opening's height and header height are kept: only the member
// changes. A header is a structural member, so every swap is a note to take to
// the engineer or the span table; nothing here sizes a header for load.
import { DEPTH, openingGeometry } from "./engine.mjs";

/**
 * @param {any} plan  a plan object; walls are changed in place
 * @returns {string[]} one note per header swapped or still not fitting
 */
export function shallowHeaders(plan) {
  const notes = [];
  const sizes = new Set((plan.stock || []).map((/** @type {any} */ s) => s.size));
  for (const wall of plan.walls || []) {
    if (!wall || wall.gable) continue;
    for (const op of wall.openings || []) {
      if (!op || typeof op !== "object" || !Object.hasOwn(DEPTH, op.header)) continue;
      const g = openingGeometry(plan, wall, op);
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
