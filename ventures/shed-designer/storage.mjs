// @ts-check
// How much a shed holds: one definition, used by the design search
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
//   rise is the inside half-width at the pitch), the whole inside length.
//   Under a ridge beam it is open; over rafter ties or truss chords it is loft
//   space that needs decking first, which `notes` says.
// - volumeCuFt: wallVolumeCuFt + overheadCuFt.
// - shelfFt: inside wall length with no door or window in it (each opening
//   takes its rough width), the run you can hang shelves or tools on.
// - headroom: standing height in the middle, to the underside of a ridge beam,
//   or to the top of the plates where ties or chords cross the room.
// - widestDoor: the widest door's rough opening.
// Unrounded; round for display.

import { WALLS } from './model.mjs';

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
  const overheadCuFt = (0.5 * inW * rise * inL) / 1728;
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
  if (!open) notes.push(d.roofType === 'truss'
    ? (d.atticStorage ? 'The space over the truss bottom chords counts as loft storage: the chords are sized for 20 psf; deck them before loading it.' : 'The space over the truss bottom chords counts as loft storage; the chords are sized for a 10 psf attic, so tick attic storage before loading it.')
    : 'The space over the rafter ties counts as loft storage; deck the ties before loading it, and keep it to light things.');
  return {
    floorSqFt, wallHeightIn, clearHeightIn, wallVolumeCuFt, overheadCuFt, volumeCuFt: wallVolumeCuFt + overheadCuFt,
    shelfFt: shelfIn / 12, headroom, open, overheadOpen: open, widestDoor, notes,
  };
}
