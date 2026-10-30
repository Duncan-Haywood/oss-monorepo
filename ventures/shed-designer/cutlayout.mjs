// @ts-check
// Where each piece comes out of each 4x8 sheet. The shopping list counts
// sheets with `sheetCount2d` and `sidingUpperSheets` (estimate.mjs), which take
// the fewest of several cuttable packings; this module builds the same
// packings with positions, so the drawn layout uses exactly the sheets the
// list buys, and a builder can cut them the way the count assumes.
//
// Coordinates are inches on a sheet lying flat: x along its 96" length, y
// across its 48" width. Every layout is guillotine (each cut runs edge to edge
// of what is left), so it can be cut with a circular saw.

import { optimizeCuts } from './optimize.mjs';

/** @typedef {{ len: number, w: number }} Piece */
/** @typedef {{ i: number, x: number, y: number, len: number, w: number, pts?: [number, number][] }} Cut */
/** @typedef {{ cuts: Cut[] }} SheetPlan */

const eps = 1e-6;

/** 1D packing along an 8 ft sheet, as `sheetCount` does: groups of piece indices. @param {{ len: number, i: number }[]} items */
function pack1d(items) {
  if (!items.length) return [];
  return optimizeCuts(items.map((p) => ({ len: p.len, i: p.i })), [{ length: 96, price: 1 }], 0)
    .boards.map((b) => b.cuts.map((c) => /** @type {any} */ (c).i));
}

/** Every piece as if full width, end to end along 8 ft sheets. @param {Piece[]} pieces */
function byLength(pieces) {
  return pack1d(pieces.map((p, i) => ({ len: p.len, i }))).map((group) => {
    let x = 0;
    return { cuts: group.map((i) => { const c = { i, x, y: 0, len: Math.min(96, pieces[i].len), w: Math.min(48, pieces[i].w) }; x += c.len; return c; }) };
  });
}

/** Pieces grouped by width, packed into 8 ft strips of that width, strips stacked across sheets. @param {Piece[]} pieces */
function byWidth(pieces) {
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  pieces.forEach((p, i) => {
    const w = Math.round(Math.min(48, p.w) * 16) / 16;
    if (!groups.has(w)) groups.set(w, []);
    /** @type {number[]} */ (groups.get(w)).push(i);
  });
  /** @type {SheetPlan[]} */
  const sheets = [];
  for (const [w, idx] of groups) {
    const strips = pack1d(idx.map((i) => ({ len: pieces[i].len, i })));
    const per = w >= 48 - 1e-9 ? 1 : Math.max(1, Math.floor(48 / w + 1e-9));
    for (let s = 0; s < strips.length; s += per) {
      /** @type {Cut[]} */
      const cuts = [];
      strips.slice(s, s + per).forEach((strip, k) => {
        let x = 0;
        for (const i of strip) { const len = Math.min(96, pieces[i].len); cuts.push({ i, x, y: k * w, len, w: Math.min(48, pieces[i].w) }); x += len; }
      });
      sheets.push({ cuts });
    }
  }
  return sheets;
}

/**
 * Two-stage first-fit decreasing, as `levelPack` in estimate.mjs: sections cut
 * across the sheet ('len') or strips ripped along it ('w').
 * @param {Piece[]} pieces
 * @param {'len'|'w'} by
 */
function levels(pieces, by) {
  const [A, B] = by === 'len' ? [96, 48] : [48, 96];
  const other = by === 'len' ? 'w' : 'len';
  const items = pieces.map((p, i) => ({ i, a: Math.min(A, p[by]), b: Math.min(B, p[other]) }))
    .sort((p, q) => q.a - p.a || q.b - p.b);
  /** @type {{ left: number, levels: { at: number, a: number, left: number, items: { i: number, at: number, a: number, b: number }[] }[] }[]} */
  const sheets = [];
  for (const it of items) {
    const level = sheets.flatMap((sh) => sh.levels).find((lv) => lv.a >= it.a - eps && lv.left >= it.b - eps);
    if (level) { level.items.push({ i: it.i, at: B - level.left, a: it.a, b: it.b }); level.left -= it.b; continue; }
    let sh = sheets.find((x) => x.left >= it.a - eps);
    if (!sh) { sh = { left: A, levels: [] }; sheets.push(sh); }
    sh.levels.push({ at: A - sh.left, a: it.a, left: B - it.b, items: [{ i: it.i, at: 0, a: it.a, b: it.b }] });
    sh.left -= it.a;
  }
  return sheets.map((sh) => ({
    cuts: sh.levels.flatMap((lv) => lv.items.map((p) => (by === 'len'
      ? { i: p.i, x: lv.at, y: p.at, len: p.a, w: p.b }
      : { i: p.i, x: p.at, y: lv.at, len: p.b, w: p.a }))),
  }));
}

/**
 * The cutting layout for rectangular pieces (floor, roof, loft and attic
 * deck), with as many sheets as `sheetCount2d` counts for them.
 * @param {Piece[]} pieces
 * @returns {{ sheets: SheetPlan[], method: string }}
 */
export function sheetLayout(pieces) {
  if (!pieces.length) return { sheets: [], method: 'none' };
  const tries = [
    { method: 'sections across the sheet', sheets: levels(pieces, 'len') },
    { method: 'strips ripped along the sheet', sheets: levels(pieces, 'w') },
    { method: 'strips of one width', sheets: byWidth(pieces) },
    { method: 'pieces end to end', sheets: byLength(pieces) },
  ];
  return tries.reduce((best, t) => (t.sheets.length < best.sheets.length ? t : best));
}

/**
 * The cutting layout for the pieces of panel above the lower siding panels
 * (or the lap siding's sheathing), with as many sheets as `sidingUpperSheets`.
 * Here a sheet stands up, as it goes on the wall: x across its 48" width, y up
 * its 96" height, and each piece carries its outline (`pts`) in those
 * coordinates. Two pieces sloping the same way nest head to toe in one strip,
 * so the triangle above one piece's rake is the next piece.
 * @param {import('./model.mjs').Shed} shed
 * @returns {{ sheets: SheetPlan[], nested: number, method: string }}
 */
export function sidingUpperLayout(shed) {
  const heights = shed.sidingUpper || [];
  const shapes = shed.sidingUpperShapes || [];
  if (!heights.length) return { sheets: [], nested: 0, method: 'none' };
  const up = (x) => Math.ceil(x - 1e-9);
  /** Units stacked up a sheet: each a height and the pieces in it. @type {{ h: number, parts: { i: number, pts: [number, number][] }[] }[]} */
  const plainUnits = heights.map((h, i) => ({ h, parts: [{ i, pts: outline(shapes[i], h, 0) }] }));
  /** @type {typeof plainUnits} */
  const units = [];
  let nested = 0;
  if (shapes.length) {
    for (const rising of [true, false]) {
      const group = shapes.map((p, i) => ({ p, i })).filter(({ p }) => !p.peak && p.h0 !== p.h1 && (p.h1 > p.h0) === rising)
        .map(({ p, i }) => ({ i, lo: rising ? p.h0 : p.h1, hi: rising ? p.h1 : p.h0 })).sort((p, q) => q.hi - p.hi);
      for (let k = 0; k < group.length; k += 2) {
        const a = group[k];
        const b = group[k + 1];
        const h = b ? up(Math.max(a.lo + b.hi, a.hi + b.lo)) : Infinity;
        if (b && h <= 96) {
          nested += 1;
          // `a` sits on the bottom edge; `b` is turned end for end, its sloped
          // edge facing a's, so its high side is over a's low side.
          const ya = (x) => a.lo + (a.hi - a.lo) * x / 48;
          const yb = (x) => h - (b.lo + (b.hi - b.lo) * (48 - x) / 48);
          const flip = !rising;
          const fx = (x) => (flip ? 48 - x : x);
          units.push({ h, parts: [
            { i: a.i, pts: [[fx(0), 0], [fx(48), 0], [fx(48), ya(48)], [fx(0), ya(0)]] },
            { i: b.i, pts: [[fx(0), yb(0)], [fx(48), yb(48)], [fx(48), h], [fx(0), h]] },
          ] });
        } else {
          units.push(plainUnits[a.i]);
          if (b) units.push(plainUnits[b.i]);
        }
      }
    }
    for (const [i, p] of shapes.entries()) if (p.peak || p.h0 === p.h1) units.push({ ...plainUnits[i], h: up(Math.max(p.h0, p.h1, ...(p.peak ? [heights[i]] : []))) });
  }
  const stack = (us) => pack1d(us.map((u, i) => ({ len: u.h, i }))).map((group) => {
    let y = 0;
    /** @type {Cut[]} */
    const cuts = [];
    for (const ui of group) {
      const u = us[ui];
      for (const part of u.parts) {
        const pts = /** @type {[number, number][]} */ (part.pts.map(([px, py]) => [px, py + y]));
        const ys = pts.map((q) => q[1]);
        cuts.push({ i: part.i, x: 0, y: Math.min(...ys), len: 48, w: Math.max(...ys) - Math.min(...ys), pts });
      }
      y += u.h;
    }
    return { cuts };
  });
  const plain = stack(plainUnits.map((u) => ({ ...u, h: up(u.h) })));
  if (!units.length) return { sheets: plain, nested: 0, method: 'each piece on its own strip' };
  const packed = stack(units);
  return packed.length <= plain.length
    ? { sheets: packed, nested, method: nested ? 'sloped pieces nested head to toe' : 'pieces stacked up the sheet' }
    : { sheets: plain, nested: 0, method: 'each piece on its own strip' };
}

/**
 * A piece's outline on a 48" wide strip: its sloped top from the shape, or a
 * rectangle of its height when the shape is not known.
 * @param {{ h0: number, h1: number, peak: boolean } | undefined} s
 * @param {number} h
 * @param {number} y0
 * @returns {[number, number][]}
 */
function outline(s, h, y0) {
  if (!s || s.peak) return [[0, y0], [48, y0], [48, y0 + h], [0, y0 + h]];
  return [[0, y0], [48, y0], [48, y0 + s.h1], [0, y0 + s.h0]];
}
