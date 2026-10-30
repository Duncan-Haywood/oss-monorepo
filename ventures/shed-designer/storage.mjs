// @ts-check
// How much a shed holds, for any roof shape: the clear space inside the walls
// and under the roof framing, from the model's cross-section (`dims.section`,
// the underside of the rafters or chords across the width). The design search
// and the Pareto audit (designsearch.mjs, paretoaudit.mjs) take a gambrel's
// roof space from roofSpaceCuFt, as their gable triangle does not fit it.
//
// - volume: inside the studs, from the floor to the underside of the roof
//   framing, in cubic feet. Ties and loft joists are left in (they are thin and
//   you store between and on them).
// - roofVolume: the part of that above the top of the walls.
// - standingArea: floor area with at least 6 ft 4 in clear above it.
// - loftArea / loftUsable: the loft floor, and the part of it with at least
//   3 ft clear above, room to slide boxes in.

import { bbox } from './integrity.mjs';

/** Height of the section polyline at y (points in increasing y). @param {number[][]} pts */
function zAt(pts, y) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [y0, z0] = pts[i]; const [y1, z1] = pts[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.max(z0, z1) : z0 + ((y - y0) * (z1 - z0)) / (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

/**
 * @param {import('./model.mjs').Shed} shed
 */
export function clearSpace(shed) {
  const d = shed.design;
  const k = shed.dims;
  const D = k.stud;
  const L = d.length - 2 * D;
  const sec = /** @type {number[][]} */ (k.section);
  // The clear height at y: the roof's underside, or the top of the walls where that is lower.
  const clear = (y) => Math.max(zAt(sec, y), k.plateTop) - k.floorTop;
  const n = 400;
  const y0 = D;
  const dy = (d.width - 2 * D) / n;
  let area = 0; let roof = 0; let standing = 0;
  for (let i = 0; i < n; i++) {
    const h = clear(y0 + (i + 0.5) * dy);
    area += h * dy;
    roof += Math.max(0, h - (k.plateTop - k.floorTop)) * dy;
    if (h >= 76) standing += dy;
  }
  const deck = shed.panels.filter((p) => p.kind === 'loft deck').map((p) => bbox(p.geom));
  let loftArea = 0; let loftUsable = 0;
  for (const b of deck) {
    const len = b.hi[0] - b.lo[0];
    loftArea += len * (b.hi[1] - b.lo[1]);
    for (let i = 0; i < 100; i++) {
      const w = (b.hi[1] - b.lo[1]) / 100;
      if (zAt(sec, b.lo[1] + (i + 0.5) * w) - b.hi[2] >= 36) loftUsable += len * w;
    }
  }
  return {
    floorSqFt: (L * (d.width - 2 * D)) / 144,
    volume: (area * L) / 1728,
    roofVolume: (roof * L) / 1728,
    standingSqFt: (standing * L) / 144,
    loftSqFt: loftArea / 144,
    loftUsableSqFt: loftUsable / 144,
  };
}

/** The space above the top of the walls and under the roof framing, inside the walls, in cubic feet. @param {import('./model.mjs').Shed} shed */
export function roofSpaceCuFt(shed) {
  return clearSpace(shed).roofVolume;
}
