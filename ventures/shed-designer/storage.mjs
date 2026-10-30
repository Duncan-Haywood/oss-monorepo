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
//
// storageOf below is the one storage definition, used by the design search
// (designsearch.mjs) and the detail panel and compare table (designfacts.mjs),
// so the two never quote different cubic feet for the same shed.
//
// Everything is measured inside the wall framing, from the top of the subfloor:
// - floorSqFt: inside length x inside width.
// - wallHeightIn: floor to the top of the wall plates, where the rafters (and
//   any ties or truss chords) start. The plates take up the wall, not the room,
//   so the room's box runs to this height.
// - clearHeightIn: floor to the underside of the top plates, the tallest shelf
//   unit that stands against a wall.
// - wallVolumeCuFt: floor area x wall height.
// - overheadCuFt: the triangle under the roof, over the inside width (its
//   rise is the inside half-width at the pitch), the whole inside length;
//   for a gambrel, roofSpaceCuFt from its cross-section. Under a ridge beam it is open; over rafter ties or truss chords it is loft
//   space that needs decking first, which `notes` says.
// - volumeCuFt: wallVolumeCuFt + overheadCuFt.
// - shelfFt: inside wall length with no door or window in it (each opening
//   takes its rough width), the run you can hang shelves or tools on.
// - headroom: standing height in the middle, to the underside of a ridge beam,
//   or to the top of the plates where ties or chords cross the room.
// - widestDoor: the widest door's rough opening.
// Unrounded; round for display.

import { bbox } from './integrity.mjs';
import { WALLS } from './model.mjs';

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


/**
 * @param {any} shed a built shed (model.mjs buildShed)
 */
export function storageOf(shed) {
  const d = shed.design;
  const k = shed.dims;
  const inL = d.length - 2 * k.stud;
  const inW = d.width - 2 * k.stud;
  const floorSqFt = (inL * inW) / 144;
  const wallHeightIn = k.plateTop - k.floorTop;
  const clearHeightIn = wallHeightIn - 3;
  const wallVolumeCuFt = (inL * inW * wallHeightIn) / 1728;
  const rise = (inW / 2) * (d.pitch / 12);
  // A gambrel's roof is no triangle: measure its cross-section.
  const overheadCuFt = d.style === 'gambrel' ? roofSpaceCuFt(shed) : (0.5 * inW * rise * inL) / 1728;
  const open = d.roofType === 'ridgeBeam';
  let shelfIn = 0;
  for (const w of WALLS) {
    const run = w === 'front' || w === 'back' ? inL : inW;
    const cut = d.openings.filter((o) => o.wall === w).reduce((t, o) => t + o.width, 0);
    shelfIn += Math.max(0, run - cut);
  }
  const headroom = open ? k.ridgeTop - k.ridgeD - k.floorTop : wallHeightIn;
  const widestDoor = d.openings.filter((o) => o.kind === 'door').reduce((m, o) => Math.max(m, o.width), 0);
  const notes = [];
  if (d.style === 'gambrel') notes.push(d.loft !== 'none' ? 'The gambrel\'s loft is decked and sized for 20 psf of stored things; the rest of the roof space is over the truss ties.' : 'The space over the gambrel\'s truss ties counts as loft storage; add the loft to deck it.');
  else if (!open) notes.push(d.roofType === 'truss'
    ? (d.atticStorage ? 'The space over the truss bottom chords counts as loft storage: the chords are sized for 20 psf; deck them before loading it.' : 'The space over the truss bottom chords counts as loft storage; the chords are sized for a 10 psf attic, so tick attic storage before loading it.')
    : 'The space over the rafter ties counts as loft storage; deck the ties before loading it, and keep it to light things.');
  return {
    floorSqFt, wallHeightIn, clearHeightIn, wallVolumeCuFt, overheadCuFt, volumeCuFt: wallVolumeCuFt + overheadCuFt,
    shelfFt: shelfIn / 12, headroom, open, overheadOpen: open, widestDoor, notes,
  };
}
