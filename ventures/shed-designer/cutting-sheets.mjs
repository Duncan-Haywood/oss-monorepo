// @ts-check
// The cutting layout plan sheet: every 4x8 sheet the shopping list buys for
// the floor, the roof, a loft or attic deck and the siding above the lower
// panels, with each piece drawn where it comes out of it (cutlayout.mjs).

import { fmtIn } from './lumber.mjs';
import { sheetLayout, sidingUpperLayout } from './cutlayout.mjs';

/** @typedef {import('./drawings.mjs').Item} Item */
/** @typedef {import('./drawings.mjs').Sheet} Sheet */
/** @typedef {[number, number]} P */

const rect = (x0, y0, x1, y1, cls) => /** @type {Item} */ ({ t: 'poly', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, cls });
const text = (at, s, size = 11, anchor = 'middle', cls = 'label') => /** @type {Item} */ ({ t: 'text', at, text: s, size, anchor, cls });

/** Rectangles of one panel kind as { len, w }: len along the sheet's 8 ft. */
const piecesOf = (shed, kind) => shed.panels.filter((p) => p.kind === kind).map((p) => ({ len: p.geom.profile[2][0], w: p.geom.profile[2][1] }));

/** Panel siding types whose upper pieces are cut from 4x8 panels (estimate.mjs prices these by column). */
const PANEL_SIDING = ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16'];

/**
 * The groups of sheets to draw, in order, each with its layout.
 * @param {import('./model.mjs').Shed} shed
 */
export function cuttingGroups(shed) {
  const d = shed.design;
  const floor = d.floorPanel === 'OSB' ? '23/32" T&G OSB' : '3/4" T&G plywood';
  /** @type {{ key: string, title: string, standing: boolean, method: string, sheets: import('./cutlayout.mjs').SheetPlan[], nested?: number }[]} */
  const groups = [];
  for (const [kind, title] of /** @type {[string, string][]} */ ([
    ['floor sheet', `Floor, ${floor}`],
    ['roof sheathing', 'Roof sheathing, 7/16" OSB'],
    ['loft deck', `Loft floor, ${floor}`],
    ['attic deck', `Attic storage deck, ${floor}`],
  ])) {
    const lay = sheetLayout(piecesOf(shed, kind));
    if (lay.sheets.length) groups.push({ key: kind, title, standing: false, ...lay });
  }
  const type = d.sidingType || 'T1-11';
  const lap = Boolean(shed.lap?.length);
  if (d.siding && (PANEL_SIDING.includes(type) || lap)) {
    const up = sidingUpperLayout(shed);
    if (up.sheets.length) groups.push({ key: 'siding upper', title: lap ? 'Wall sheathing above the lower sheets, 7/16" OSB' : `${type} siding above the lower panels`, standing: true, ...up });
  }
  return groups;
}

/**
 * The plan sheet, or null when nothing is cut from a sheet.
 * @param {import('./model.mjs').Shed} shed
 * @returns {Sheet | null}
 */
export function cuttingSheet(shed) {
  const groups = cuttingGroups(shed);
  if (!groups.length) return null;
  const items = /** @type {Item[]} */ ([]);
  const gap = 18;
  const perRow = 5;
  let top = 0; // y of the next group's heading; y runs up, so groups go down the page
  for (const g of groups) {
    const [SW, SH] = g.standing ? [48, 96] : [96, 48];
    const label = `${g.title.toUpperCase()}: ${g.sheets.length} SHEET${g.sheets.length === 1 ? '' : 'S'}, ${g.method}${g.nested ? ` (${g.nested} pair${g.nested === 1 ? '' : 's'})` : ''}`;
    items.push(text([0, top], label, 9, 'start', 'muted'));
    g.sheets.forEach((sh, n) => {
      const col = n % perRow;
      const row = Math.floor(n / perRow);
      const ox = col * (SW + gap);
      const oy = top - 14 - SH - row * (SH + 26);
      items.push(rect(ox, oy, ox + SW, oy + SH, 'hidden'));
      items.push(text([ox + SW / 2, oy + SH + 4], `Sheet ${n + 1}`, 8, 'middle', 'muted'));
      for (const c of sh.cuts) {
        if (c.pts) items.push({ t: 'poly', pts: c.pts.map(([x, y]) => /** @type {P} */ ([ox + x, oy + y])), closed: true, cls: 'sheet' });
        else items.push(rect(ox + c.x, oy + c.y, ox + c.x + c.len, oy + c.y + c.w, 'sheet'));
        const [cx, cy, lw, lh] = c.pts
          // A sloped piece is labelled at its vertices' average, inside it.
          ? [c.pts.reduce((s, q) => s + q[0], 0) / c.pts.length, c.pts.reduce((s, q) => s + q[1], 0) / c.pts.length, 48, c.w]
          : [c.x + c.len / 2, c.y + c.w / 2, c.len, c.w];
        // A piece taller than it is wide is labelled up its length.
        const upright = !c.pts && lh > lw;
        if (Math.max(lw, lh) >= 20 && Math.min(lw, lh) >= 6) items.push({ ...text([ox + cx + (upright ? 2 : 0), oy + cy - (upright ? 0 : 2)], c.pts ? `${fmtIn(lh)} tall` : `${fmtIn(c.len)} x ${fmtIn(c.w)}`, 7), ...(upright ? { rot: 90 } : {}) });
      }
    });
    const rows = Math.ceil(g.sheets.length / perRow);
    top -= 14 + rows * (SH + 26) + 16;
  }
  return {
    id: 'cutting',
    title: 'Cutting layout for the sheet goods',
    note: `Each sheet the shopping list buys, dashed, with the pieces cut from it; the rest is offcut. Floor and roof sheets lie flat, 8 ft across; siding panels stand as on the wall${groups.some((g) => g.nested) ? ', sloped pieces nested head to toe' : ''}. Every cut runs edge to edge.`,
    items,
  };
}
