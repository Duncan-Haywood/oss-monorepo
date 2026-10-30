// @ts-check
// Opening placement as a cost lever: slide a door or window along its wall so
// the framing around it shrinks. Two moves, each kept by the search
// (simplify.mjs) only if the shed is cheaper and still passes every check:
//
// - a window that fits inside one stud bay moves into the nearest bay, where
//   it needs no king, jack or header (model.mjs frames it with a flat block
//   above and below);
// - otherwise a door or window slides so a king stud lands on a layout line
//   and takes that stud's place, rather than standing beside it.
//
// Offered as moves with their saving, never applied silently: where a door or
// window goes is the owner's choice.

import { wallFaceLength, axisStart } from './model.mjs';

/** Offset (from the wall's own reference corner) that puts the opening's left edge at face position a. */
function offsetFor(d, op, a) {
  return op.wall === 'front' || op.wall === 'right' ? a : wallFaceLength(d, op.wall) - a - op.width;
}

/**
 * @param {any} d a normalized design
 * @param {(label: string, change: object, group?: string) => void} set
 */
export function openingMoves(d, set) {
  const sp = d.studSpacing;
  for (const op of d.openings) {
    const face = wallFaceLength(d, op.wall);
    const a = axisStart(d, op);
    const lines = [];
    for (let c = sp; c < face; c += sp) lines.push(c);
    const move = (to, why) => {
      const off = Math.round(offsetFor(d, op, to) * 16) / 16;
      if (Math.abs(to - a) < 1 / 16 || Math.abs(to - a) > sp || off < 0 || off + op.width > face) return;
      const by = to - a;
      set(`${op.kind} ${op.id} ${Math.abs(by) < 1 ? `${Math.round(Math.abs(by) * 16)}/16"` : `${Math.round(Math.abs(by) * 8) / 8}"`} ${(op.wall === 'back' || op.wall === 'left') === by > 0 ? 'left' : 'right'} (${why})`,
        { openings: d.openings.map((o) => (o.id === op.id ? { ...o, offset: off } : o)) }, `place ${op.kind} ${op.id}`);
    };
    const bay = sp - 1.5;
    if (op.kind === 'window' && !op.header && op.width <= bay && bay - op.width < 1.5) {
      // Centre it in the nearest bay.
      let best = null;
      for (let i = 0; i + 1 < lines.length; i++) {
        const to = lines[i] + 0.75 + (bay - op.width) / 2;
        if (!best || Math.abs(to - a) < Math.abs(best - a)) best = to;
      }
      if (best !== null) move(best, 'into a stud bay: no king, jack or header');
      continue;
    }
    // A king stud on a layout line: left king centre a - 2.25, right king centre a + w + 2.25.
    const near = (x) => lines.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), lines[0]);
    if (!lines.length) continue;
    for (const to of new Set([near(a - 2.25) + 2.25, near(a + op.width + 2.25) - op.width - 2.25])) move(to, 'a king stud on a layout line');
  }
}
