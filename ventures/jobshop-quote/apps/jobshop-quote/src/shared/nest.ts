// Parts per sheet from a rectangular nest: how many copies of a flat pattern's bounding rectangle
// fit on one stock sheet, so a sheet material priced per sheet can be quoted from a DXF without the
// estimator counting by hand (ROADMAP item 5, "a per-sheet material priced by nest yield").
//
// The model, kept deliberately simple and conservative:
// - each part is its flat pattern's bounding rectangle (true-shape nesting of an L or a ring can
//   fit more; this count never fits more than the rectangles allow);
// - one gap, set by the shop on the material row, separates parts from each other and from the
//   sheet edge (kerf, web and edge trim in one number);
// - parts may turn 90 degrees (a sheet with a grain or a brushed finish is the shop's to override);
// - the layout is a guillotine pattern: a homogeneous block, or a block of one orientation beside
//   the best of up to two more such splits. Every pattern counted is a real layout, so the count is
//   a lower bound on what a nesting program would find, and the price errs high, never low.
//
// Lengths are inches. Work is in integer thousandths of an inch so that 6 × 8.000 fits in 48.000.

import type { FlatBlankMeasures } from "./costing";

/** One stock sheet as the shop entered it on the material row (inches). */
export interface SheetStock {
  widthIn: number;
  lengthIn: number;
  /** Gap between parts and from the sheet edge; 0 is allowed (shear-cut blanks). */
  gapIn: number;
}

/** A rectangular block of parts in the layout, all in one orientation (inches from the corner). */
export interface NestBlock {
  /** Parts across the sheet's width × along its length. */
  across: number;
  along: number;
  /** True when the part's longer side runs across the sheet's width. */
  turned: boolean;
}

export interface NestResult {
  partsPerSheet: number;
  /** The blocks the count is made of, largest first (one block for a homogeneous layout). */
  blocks: NestBlock[];
  /** Share of the sheet's area covered by parts (the flat rectangles, gap excluded), 0..1. */
  utilisation: number;
  /** floor(usable area ÷ pitched part area): no rectangular layout can beat it. */
  upperBound: number;
}

const MIL = 1000;
/** Search depth for nested splits: 2 keeps the worst case (tiny parts) to about a million steps. */
const MAX_DEPTH = 2;
/** Pieces along one edge beyond which the split search is skipped (a homogeneous fill is exact enough). */
const MAX_SPLIT_STEPS = 400;

const mils = (v: number) => Math.round(v * MIL);

interface Fill {
  count: number;
  blocks: NestBlock[];
}

/**
 * Parts per sheet for a part of `partWidthIn` × `partLengthIn` (either order) on `sheet`, or null
 * when an input is missing or not positive (the gap may be 0) or not even one part fits.
 */
export function nestYield(
  partWidthIn: number,
  partLengthIn: number,
  sheet: SheetStock,
): NestResult | null {
  const finite = (v: number) => Number.isFinite(v);
  if (![partWidthIn, partLengthIn, sheet.widthIn, sheet.lengthIn, sheet.gapIn].every(finite))
    return null;
  if (!(partWidthIn > 0 && partLengthIn > 0 && sheet.widthIn > 0 && sheet.lengthIn > 0))
    return null;
  if (!(sheet.gapIn >= 0)) return null;
  const g = mils(sheet.gapIn);
  // A part plus one trailing gap is its pitch; the sheet less one gap holds whole pitches (the
  // leading edge gap plus each part's trailing gap), so the pure packing problem has no gaps left.
  const short = Math.min(mils(partWidthIn), mils(partLengthIn)) + g;
  const long = Math.max(mils(partWidthIn), mils(partLengthIn)) + g;
  const W = mils(sheet.widthIn) - g;
  const L = mils(sheet.lengthIn) - g;
  if (W <= 0 || L <= 0) return null;

  // Orientation "plain": the part's short side across the width; "turned": its long side across.
  const homog = (w: number, l: number, turned: boolean): Fill => {
    const pw = turned ? long : short;
    const pl = turned ? short : long;
    const across = Math.floor(w / pw);
    const along = Math.floor(l / pl);
    const count = across * along;
    return { count, blocks: count > 0 ? [{ across, along, turned }] : [] };
  };

  const best = (w: number, l: number, depth: number): Fill => {
    let top = homog(w, l, false);
    const alt = homog(w, l, true);
    if (alt.count > top.count) top = alt;
    if (depth === 0 || w <= 0 || l <= 0) return top;
    for (const turned of [false, true]) {
      const pw = turned ? long : short;
      const pl = turned ? short : long;
      // A block of `i` columns across the width, the strip beside it filled recursively.
      const cols = Math.floor(w / pw);
      if (cols <= MAX_SPLIT_STEPS) {
        for (let i = 1; i < cols; i++) {
          const block = homog(i * pw, l, turned);
          if (block.count === 0) continue;
          const rest = best(w - i * pw, l, depth - 1);
          if (block.count + rest.count > top.count) {
            top = { count: block.count + rest.count, blocks: [...block.blocks, ...rest.blocks] };
          }
        }
      }
      // A block of `j` rows along the length, the strip after it filled recursively.
      const rows = Math.floor(l / pl);
      if (rows <= MAX_SPLIT_STEPS) {
        for (let j = 1; j < rows; j++) {
          const block = homog(w, j * pl, turned);
          if (block.count === 0) continue;
          const rest = best(w, l - j * pl, depth - 1);
          if (block.count + rest.count > top.count) {
            top = { count: block.count + rest.count, blocks: [...block.blocks, ...rest.blocks] };
          }
        }
      }
    }
    return top;
  };

  const fill = best(W, L, MAX_DEPTH);
  if (fill.count === 0) return null;
  const partArea = partWidthIn * partLengthIn;
  const sheetArea = sheet.widthIn * sheet.lengthIn;
  return {
    partsPerSheet: fill.count,
    blocks: [...fill.blocks].sort((a, b) => b.across * b.along - a.across * a.along),
    utilisation: Math.min(1, (fill.count * partArea) / sheetArea),
    upperBound: Math.floor((W * L) / (short * long)),
  };
}

/** A material row's sheet stock, or null unless width, length and gap are all set. */
export function sheetStockOf(m: {
  sheetWidthIn: number | null;
  sheetLengthIn: number | null;
  nestGapIn: number | null;
}): SheetStock | null {
  if (m.sheetWidthIn === null || m.sheetLengthIn === null || m.nestGapIn === null) return null;
  return { widthIn: m.sheetWidthIn, lengthIn: m.sheetLengthIn, gapIn: m.nestGapIn };
}

/**
 * Parts per sheet for a DXF flat pattern on a per-sheet material: the nest count, or null when the
 * material has no sheet size and gap, the file is not a flat pattern, or its size was read with low
 * confidence (an STL-like guess must not set a price). The estimator can change it on the line.
 */
export function partsPerSheetFromNest(
  flat: FlatBlankMeasures | null,
  stock: SheetStock | null | undefined,
): number | null {
  if (!flat || !stock || flat.confidence === "low") return null;
  return nestYield(flat.widthIn, flat.heightIn, stock)?.partsPerSheet ?? null;
}
