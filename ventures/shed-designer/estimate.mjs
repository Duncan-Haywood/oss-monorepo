// @ts-check
// From a framed shed to the three lists a builder takes to the yard and the
// saw: the parts list (every distinct piece with a mark), the cut sheet (which
// board each piece comes out of), and the shopping list with a cost.

import { EXAMPLE_ITEMS, fmtIn } from './lumber.mjs';
import { boardPrice, itemPrice } from './prices.mjs';
import { optimizeCuts } from './optimize.mjs';

/** @typedef {import('./model.mjs').Shed} Shed */
/** @typedef {{ lumber: Record<string, Record<string, number>>, items: Record<string, number> }} Prices */

export const MATERIALS = ['2x4', '2x6', '2x8', '2x10', '2x12', 'PT 2x4', 'PT 2x6', 'PT 2x8', 'PT 2x10', 'PT 2x12', 'PT 4x4', 'PT 4x6'];

/** Starting prices for every material, length and item: listed where a listing was found (prices.mjs). */
export function examplePrices() {
  /** @type {Prices} */
  const p = { lumber: {}, items: {} };
  for (const m of MATERIALS) {
    p.lumber[m] = {};
    for (const ft of [8, 10, 12, 14, 16, 18, 20]) p.lumber[m][ft] = boardPrice(m, ft).price;
  }
  for (const k of Object.keys(EXAMPLE_ITEMS)) p.items[k] = itemPrice(k).price;
  return p;
}

/** Where a price came from: the listing, unless the visitor typed a different number. */
export function sourceOf(price, start) {
  return Math.abs(price - start.price) < 0.005 ? start : { price, note: 'your price', kind: /** @type {const} */ ('yours') };
}

const WHERE = {
  foundation: 'foundation', floor: 'floor', roof: 'roof',
  'wall:front': 'front wall', 'wall:back': 'back wall', 'wall:left': 'left wall', 'wall:right': 'right wall',
  'gable:left': 'left gable', 'gable:right': 'right gable',
};

const MATERIAL_ORDER = ['PT 4x6', 'PT 4x4', 'PT 2x12', 'PT 2x10', 'PT 2x8', 'PT 2x6', 'PT 2x4', '2x12', '2x10', '2x8', '2x6', '2x4'];

/** Area of a polygon, by the shoelace formula. @param {[number, number][]} pts */
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}

/** Letters A..Z, then AA, AB, ... */
export function markName(i) {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/**
 * Pack sheet pieces (lengths along an 8 ft sheet) into whole sheets.
 * @param {number[]} lengths
 */
function sheetCount(lengths) {
  if (!lengths.length) return 0;
  return optimizeCuts(lengths.map((len) => ({ len })), [{ length: 96, price: 1 }], 0).boards.length;
}

/**
 * @param {Shed} shed
 * @param {Prices} [prices]
 */
export function estimate(shed, prices = examplePrices()) {
  const d = shed.design;
  const dims = shed.dims;
  // Parts list with marks.
  /** @type {Map<string, any>} */
  const byKey = new Map();
  for (const m of shed.members) {
    const key = `${m.material}|${m.length}|${m.kind}|${m.note || ''}`;
    if (!byKey.has(key)) byKey.set(key, { material: m.material, length: m.length, kind: m.kind, note: m.note || '', qty: 0, where: {}, ids: [] });
    const p = byKey.get(key);
    p.qty += 1;
    p.ids.push(m.id);
    const w = WHERE[m.group] || m.group;
    p.where[w] = (p.where[w] || 0) + 1;
  }
  const parts = [...byKey.values()].sort((a, b) =>
    MATERIAL_ORDER.indexOf(a.material) - MATERIAL_ORDER.indexOf(b.material) || b.length - a.length || a.kind.localeCompare(b.kind));
  parts.forEach((p, i) => { p.mark = markName(i); });
  /** @type {Map<string, string>} */
  const markOf = new Map();
  for (const p of parts) for (const id of p.ids) markOf.set(id, p.mark);

  // Cut sheet per material.
  const materials = [...new Set(parts.map((p) => p.material))].sort((a, b) => MATERIAL_ORDER.indexOf(a) - MATERIAL_ORDER.indexOf(b));
  const lumber = materials.map((material) => {
    const pieces = shed.members.filter((m) => m.material === material).map((m) => ({ len: m.length, mark: markOf.get(m.id), id: m.id, kind: m.kind }));
    const stocks = d.lengths.map((ft) => ({ length: ft * 12, price: Number(prices.lumber?.[material]?.[ft] ?? boardPrice(material, ft).price) }));
    const result = optimizeCuts(pieces, stocks, d.kerf);
    return { material, pieces: pieces.length, result };
  });
  /** @type {string[]} */
  const problems = [];
  for (const l of lumber) {
    for (const p of l.result.tooLong) problems.push(`${l.material} ${p.kind} ${fmtIn(p.len)} (mark ${p.mark}) is longer than your longest board; allow a longer length.`);
  }

  // Shopping list.
  /** @type {{ section: string, name: string, qty: number, unit: string, price: number, total: number, source?: any }[]} */
  const shopping = [];
  const line = (section, name, qty, unit, price, source) => {
    if (qty > 0) shopping.push({ section, name, qty, unit, price, total: Math.round(qty * price * 100) / 100, source });
  };
  for (const l of lumber) {
    const counts = new Map();
    for (const b of l.result.boards) counts.set(b.stock, (counts.get(b.stock) || 0) + 1);
    for (const [len, qty] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      const ft = len / 12;
      const p = Number(prices.lumber?.[l.material]?.[ft] ?? boardPrice(l.material, ft).price);
      line('Lumber', `${l.material} x ${ft}'`, qty, 'board', p, sourceOf(p, boardPrice(l.material, ft)));
    }
  }
  const item = (k) => Number(prices.items?.[k] ?? itemPrice(k).price);
  const src = (k) => sourceOf(item(k), itemPrice(k));
  const label = (k) => /** @type {any} */ (EXAMPLE_ITEMS)[k].name;
  const floorSheets = sheetCount(shed.floorPieces);
  const roofSheets = sheetCount(shed.roofPieces);
  line('Sheet goods', label('floorSheet'), floorSheets, 'sheet', item('floorSheet'), src('floorSheet'));
  line('Sheet goods', label('roofSheet'), roofSheets, 'sheet', item('roofSheet'), src('roofSheet'));
  if (d.siding) {
    const by = { 96: 0, 108: 0, 120: 0 };
    for (const s of shed.sidingFull) by[s.length] += 1;
    by[96] += sheetCount(shed.sidingUpper);
    line('Sheet goods', label('siding8'), by[96], 'sheet', item('siding8'), src('siding8'));
    line('Sheet goods', label('siding9'), by[108], 'sheet', item('siding9'), src('siding9'));
    line('Sheet goods', label('siding10'), by[120], 'sheet', item('siding10'), src('siding10'));
  }
  if (d.siding && d.sidingColor !== 'natural') {
    // Two coats at 350 sq ft per gallon, the usual coverage printed on exterior paint.
    const sqft = shed.panels.filter((p) => p.kind === 'siding').reduce((t, p) => t + Math.abs(polyArea(p.geom.profile)), 0) / 144;
    line('Paint', `${label('paint')} (${d.sidingColor})`, Math.ceil((sqft * 2) / 350), 'gallon', item('paint'), src('paint'));
    if (d.glitter) line('Paint', label('glitter'), Math.ceil((sqft * 2) / 350), 'packet', item('glitter'), src('glitter'));
    if (d.polkaDots) line('Paint', `${label('accentPaint')} (purple, for the polka dots)`, 1, 'quart', item('accentPaint'), src('accentPaint'));
  }
  if (shed.trim) {
    const t = shed.trim;
    line('Roof trim', label('fasciaTrim'), Math.ceil(t.fasciaFt / 12), 'piece', item('fasciaTrim'), src('fasciaTrim'));
    line('Roof trim', label('soffitPanel'), Math.ceil((t.soffitSqFt * 1.1) / 12.75), 'panel', item('soffitPanel'), src('soffitPanel'));
    line('Roof trim', label('rakeTrim'), Math.ceil((t.rakeFt * 1.1) / 12), 'piece', item('rakeTrim'), src('rakeTrim'));
  }
  if (shed.interior) {
    line('Interior', label('interiorPanel'), shed.interior.panels, 'sheet', item('interiorPanel'), src('interiorPanel'));
    line('Interior', `${label('interiorPaint')} (${shed.interior.paint})`, Math.ceil((shed.interior.sqft * 2) / 350), 'gallon', item('interiorPaint'), src('interiorPaint'));
  }
  if (d.roofing) {
    const area = dims.roofAreaSqFt * 1.1;
    line('Roofing', label('shingleBundle'), Math.ceil(area / 32.8), 'bundle', item('shingleBundle'), src('shingleBundle'));
    line('Roofing', label('underlayment'), Math.ceil(area / 1000), 'roll', item('underlayment'), src('underlayment'));
    const dripFt = (2 * d.length + 4 * dims.slopeLen) / 12;
    line('Roofing', label('dripEdge'), Math.ceil(dripFt / 10), 'piece', item('dripEdge'), src('dripEdge'));
  }
  line('Foundation and hardware', label('gravelTon'), Math.ceil(dims.gravelCuYd * 1.4 * 10) / 10, 'ton', item('gravelTon'), src('gravelTon'));
  line('Foundation and hardware', label('concreteBlock'), dims.blockCount, 'each', item('concreteBlock'), src('concreteBlock'));
  const vents = Object.values(shed.vents || {}).reduce((t, v) => t + v.length, 0);
  line('Foundation and hardware', `${label('gableVent')}, ${d.ventWidth}" x ${d.ventHeight}"`, vents, 'each', item('gableVent'), src('gableVent'));
  if (d.roofType === 'ridgeBeam') line('Foundation and hardware', label('rafterHanger'), shed.members.filter((m) => m.kind === 'rafter').length, 'each', item('rafterHanger'), src('rafterHanger'));
  line('Foundation and hardware', label('hurricaneTie'), dims.rafterCenters.length * 2, 'each', item('hurricaneTie'), src('hurricaneTie'));

  const sum = (rows) => Math.round(rows.reduce((t, r) => t + r.total, 0) * 100) / 100;
  const lumberCost = sum(shopping.filter((r) => r.section === 'Lumber'));
  const total = sum(shopping);
  const boards = lumber.reduce((t, l) => t + l.result.boards.length, 0);
  const lowerBound = Math.round(lumber.reduce((t, l) => t + l.result.lowerBound, 0) * 100) / 100;
  return {
    parts, lumber, shopping, problems, total, lumberCost, lowerBound, boards,
    pieces: shed.members.length, floorSheets, roofSheets,
    footprintSqFt: (d.length * d.width) / 144,
  };
}

/** @typedef {ReturnType<typeof estimate>} Estimate */

/** CSV of the cut sheet: one row per board, its cuts and its offcut. */
export function cutSheetCsv(est) {
  const rows = [['board', 'material', 'stock length', 'cuts (mark: length)', 'offcut']];
  let n = 0;
  for (const l of est.lumber) {
    for (const b of l.result.boards) {
      n += 1;
      rows.push([String(n), l.material, `${b.stock / 12}'`, b.cuts.map((c) => `${c.mark}: ${fmtIn(c.len)}`).join('; '), fmtIn(b.offcut)]);
    }
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

/** CSV of the shopping list. */
export function shoppingCsv(est) {
  const rows = [['section', 'item', 'qty', 'unit', 'unit price', 'total']];
  for (const r of est.shopping) rows.push([r.section, r.name, String(r.qty), r.unit, r.price.toFixed(2), r.total.toFixed(2)]);
  rows.push(['', 'Total', '', '', '', est.total.toFixed(2)]);
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}
