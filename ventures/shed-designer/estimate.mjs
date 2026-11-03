// @ts-check
// From a framed shed to the three lists a builder takes to the yard and the
// saw: the parts list (every distinct piece with a mark), the cut sheet (which
// board each piece comes out of), and the shopping list with a cost.

import { EXAMPLE_ITEMS, fmtIn, fmtFtIn } from './lumber.mjs';
import { boardPrice, itemPrice } from './prices.mjs';
import { catalogueRange, productById } from './products.mjs';
import { optimizeCuts } from './optimize.mjs';
import { heelJoint, groundAnchors } from './checks.mjs';
import { trussChecks } from './truss.mjs';
import { LAP_PRODUCTS, lapStocks } from './lap.mjs';
import { finishName, SIDING_FINISHES, TRIM_FINISHES } from './looks.mjs';

/** @typedef {import('./model.mjs').Shed} Shed */
/** @typedef {{ lumber: Record<string, Record<string, number>>, items: Record<string, number>, delivery?: Record<string, number> }} Prices */

export const MATERIALS = ['2x4', '2x6', '2x8', '2x10', '2x12', 'PT 2x4', 'PT 2x6', 'PT 2x8', 'PT 2x10', 'PT 2x12', 'PT 4x4', 'PT 4x6'];

/** Starting prices for every material, length and item: listed where a listing was found (prices.mjs). */
export function examplePrices() {
  /** @type {Prices} */
  const p = { lumber: {}, items: {}, delivery: {} };
  for (const m of MATERIALS) {
    p.lumber[m] = {};
    for (const ft of [8, 10, 12, 14, 16, 18, 20]) p.lumber[m][ft] = boardPrice(m, ft).price;
  }
  for (const k of Object.keys(EXAMPLE_ITEMS)) p.items[k] = itemPrice(k).price;
  for (const [k, v] of Object.entries(DELIVERY)) if (v.fee !== null) p.delivery[k] = v.fee;
  return p;
}

/**
 * A typed price, or the starting one when what was typed (or saved, or carried
 * in a link) is blank, not a number or below zero. Zero stays: you may have the part.
 */
export function priceOr(typed, start) {
  if (typed === '' || typed === null || typed === undefined) return start;
  const n = Number(typed);
  return Number.isFinite(n) && n >= 0 ? n : start;
}

/** Price of one board: the visitor's, else the listing's (or its per-foot scaling). */
const boardCost = (prices, material, ft) => priceOr(prices.lumber?.[material]?.[ft], boardPrice(material, ft).price);

/** Where a price came from: the listing, unless the visitor typed a different number. */
export function sourceOf(price, start) {
  return Math.abs(price - start.price) < 0.005 ? start : { price, note: 'your price', kind: /** @type {const} */ ('yours') };
}

const WHERE = {
  foundation: 'foundation', floor: 'floor', roof: 'roof',
  'wall:front': 'front wall', 'wall:back': 'back wall', 'wall:left': 'left wall', 'wall:right': 'right wall',
  'gable:left': 'left gable', 'gable:right': 'right gable', door: 'door',
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
 * Whole 4x8 sheets for a layout of rectangular pieces, each { len, w } with len
 * along the sheet's 8 ft and w across its 4 ft. Full-width pieces are packed
 * along 8 ft sheets. A narrower row (the last row of a floor that is not a
 * multiple of 4 ft wide, the course at the ridge) is packed into 8 ft strips
 * of its width, and as many of those strips as fit across a sheet come from
 * one sheet. Rips are counted without a kerf: two 24" strips from a 48" sheet
 * leave the second a saw cut narrow, which the rim or the gap at the ridge
 * takes up (tongue-and-groove sheets cover about 47-1/2" anyway). The count is
 * the lowest of that, packing lengths alone, and the two-stage layouts of
 * levelPack below, any of which a builder can cut.
 * @param {{ len: number, w: number }[]} pieces
 */
export function sheetCount2d(pieces) {
  /** @type {Map<number, number[]>} */
  const byWidth = new Map();
  for (const p of pieces) {
    const w = Math.round(Math.min(48, p.w) * 16) / 16;
    if (!byWidth.has(w)) byWidth.set(w, []);
    /** @type {number[]} */ (byWidth.get(w)).push(p.len);
  }
  let sheets = 0;
  for (const [w, lens] of byWidth) {
    const strips = sheetCount(lens);
    sheets += w >= 48 - 1e-9 ? strips : Math.ceil(strips / Math.max(1, Math.floor(48 / w + 1e-9)));
  }
  // Packing lengths alone, every piece as if full width, is always cuttable too, and
  // wins when a narrow piece can share a sheet's length with a full-width one.
  // Two-stage guillotine layouts mix widths and rip strips from a sheet's offcut.
  return Math.min(sheets, sheetCount(pieces.map((p) => p.len)), levelPack(pieces, 'len'), levelPack(pieces, 'w'));
}

/**
 * Whole 48 x 96 sheets for pieces cut in two stages, first-fit decreasing: a
 * sheet is cut across into sections (by: 'len', each as long as its longest
 * piece, the pieces side by side across the 48") or ripped into strips (by:
 * 'w', each as wide as its widest piece, the pieces end to end along the 96").
 * Pieces keep their direction (a sheet's strength axis stays across the
 * framing), so pieces of different widths and lengths can share a sheet, and a
 * full-width piece's offcut can be ripped into strips.
 * @param {{ len: number, w: number }[]} pieces
 * @param {'len'|'w'} by
 */
function levelPack(pieces, by) {
  const [A, B] = by === 'len' ? [96, 48] : [48, 96];
  const other = by === 'len' ? 'w' : 'len';
  const items = pieces.map((p) => ({ a: Math.min(A, p[by]), b: Math.min(B, p[other]) }))
    .sort((p, q) => q.a - p.a || q.b - p.b);
  /** @type {{ left: number, levels: { a: number, left: number }[] }[]} */
  const sheets = [];
  const eps = 1e-6;
  for (const it of items) {
    const level = sheets.flatMap((sh) => sh.levels).find((lv) => lv.a >= it.a - eps && lv.left >= it.b - eps);
    if (level) { level.left -= it.b; continue; }
    let sh = sheets.find((x) => x.left >= it.a - eps);
    if (!sh) { sh = { left: A, levels: [] }; sheets.push(sh); }
    sh.left -= it.a;
    sh.levels.push({ a: it.a, left: B - it.b });
  }
  return sheets.length;
}

/**
 * 4x8 panels for the gable pieces that go above the lower siding panels. A
 * piece under one roof slope has a sloped top; two pieces sloping the same way
 * nest head to toe on one 4 ft wide strip of panel (the second turned end for
 * end, grooves still vertical), taking the sum of a low and a high edge
 * rather than two high edges. Pieces and nested pairs are then packed along
 * 8 ft panels; the count is never more than packing each piece's height alone.
 * @param {Shed} shed
 * @param {boolean} [nest] false: each piece's height alone, no nesting
 */
export function sidingUpperSheets(shed, nest = true) {
  const shapes = shed.sidingUpperShapes;
  const plain = sheetCount(shed.sidingUpper || []);
  if (!nest || !shapes || !shapes.length) return plain;
  const up = (x) => Math.ceil(x - 1e-9);
  /** @type {number[]} */
  const units = [];
  for (const rising of [true, false]) {
    const group = shapes.filter((p) => !p.peak && p.h0 !== p.h1 && (p.h1 > p.h0) === rising)
      .map((p) => (rising ? [p.h0, p.h1] : [p.h1, p.h0])).sort((p, q) => q[1] - p[1]);
    // Pair the tallest with the next tallest: low end of each against the other's high end.
    for (let i = 0; i < group.length; i += 2) {
      const [a0, a1] = group[i];
      const b = group[i + 1];
      const nested = b ? up(Math.max(a0 + b[1], a1 + b[0])) : Infinity;
      if (b && nested <= 96) units.push(nested);
      else { units.push(up(a1)); if (b) units.push(up(b[1])); }
    }
  }
  for (const p of shapes) if (p.peak || p.h0 === p.h1) units.push(up(Math.max(p.h0, p.h1, ...(p.peak ? [shed.sidingUpper[shapes.indexOf(p)]] : []))));
  return Math.min(plain, sheetCount(units));
}

/**
 * Sheets for small pieces of mixed sizes (truss gussets): shelf packing.
 * Pieces, widest first, go into 8 ft strips as tall as the first piece in
 * them; the strips then stack across 4 ft sheets, tallest first.
 * @param {{ len: number, w: number }[]} pieces
 */
export function shelfSheets(pieces, kerf = 0.125) {
  /** @type {{ h: number, used: number }[]} */
  const strips = [];
  for (const p of [...pieces].sort((a, b) => b.w - a.w || b.len - a.len)) {
    const s = strips.find((x) => x.h >= p.w - 1e-9 && x.used + p.len <= 96 + 1e-9);
    if (s) s.used += p.len + kerf;
    else strips.push({ h: p.w, used: p.len + kerf });
  }
  /** @type {number[]} */
  const sheets = [];
  for (const st of strips.sort((a, b) => b.h - a.h)) {
    const i = sheets.findIndex((u) => u + st.h <= 48 + 1e-9);
    if (i >= 0) sheets[i] += st.h + kerf;
    else sheets.push(st.h + kerf);
  }
  return sheets.length;
}

/** The { len, w } of each panel of one kind, from its rectangle. @param {any[]} panels @param {string} kind */
const panelPieces = (panels, kind) => panels.filter((p) => p.kind === kind).map((p) => ({ len: p.geom.profile[2][0], w: p.geom.profile[2][1] }));

/**
 * The cut plan within the longest board you can haul: boards no longer than
 * the limit, and a longer board only for a piece longer than every board
 * within it (each such board says which piece needs it). Splittable members
 * are already spliced at the limit by the model, so what is left here are
 * pieces like a one-piece ridge beam or a long joist.
 * @param {import('./optimize.mjs').Piece[]} pieces
 * @param {import('./optimize.mjs').Stock[]} stocks
 * @param {number} kerf
 * @param {number} haulFt the longest board you can carry, 0 for no limit
 */
export function cutWithinHaul(pieces, stocks, kerf, haulFt) {
  const short = haulFt > 0 ? stocks.filter((x) => x.length <= haulFt * 12) : stocks;
  if (!short.length || short.length === stocks.length) return optimizeCuts(pieces, stocks, kerf);
  const reach = Math.max(...short.map((x) => x.length));
  const long = pieces.filter((p) => p.len > reach + 1e-9);
  const rest = pieces.filter((p) => p.len <= reach + 1e-9);
  const a = rest.length ? optimizeCuts(rest, short, kerf) : null;
  const b = long.length ? optimizeCuts(long, stocks.filter((x) => x.length > reach), kerf) : null;
  for (const bd of b ? b.boards : []) {
    const need = bd.cuts.reduce((m, c) => (c.len > m.len ? c : m));
    /** @type {any} */ (bd).why = `${need.mark ? `${need.mark} ` : ''}${need.kind || 'piece'} ${fmtIn(need.len)} needs it`;
  }
  const parts = [a, b].filter(Boolean);
  const boards = parts.flatMap((r) => /** @type {any} */ (r).boards);
  const cost = Math.round(parts.reduce((t, r) => t + /** @type {any} */ (r).cost, 0) * 100) / 100;
  const lowerBound = Math.round(parts.reduce((t, r) => t + /** @type {any} */ (r).lowerBound, 0) * 100) / 100;
  const bought = boards.reduce((t, x) => t + x.stock, 0);
  const cut = pieces.filter((p) => !parts.some((r) => /** @type {any} */ (r).tooLong.includes(p))).reduce((t, p) => t + p.len, 0);
  return {
    boards, cost, lowerBound,
    gap: lowerBound > 0 ? Math.max(0, cost / lowerBound - 1) : 0,
    waste: bought > 0 ? 1 - cut / bought : 0,
    tooLong: parts.flatMap((r) => /** @type {any} */ (r).tooLong),
  };
}

/**
 * Lap siding cut plan: every course piece packed into the plank lengths sold
 * (the ones in your board lengths where there is a choice), plus whole planks
 * ripped lengthwise into the starter strip.
 * @param {import('./model.mjs').Shed} shed @param {any} d @param {(k: string) => number} item
 */
export function lapPlan(shed, d, item) {
  const spec = LAP_PRODUCTS[d.sidingType];
  const stocks = lapStocks(d).map((x) => ({ ...x, price: item(x.key) }));
  const pieces = shed.lap.flatMap((f) => f.pieces.map((p) => ({ len: p.len, kind: `${f.wall} course ${p.course + 1}${p.rake ? ', rake cut' : ''}${p.notched ? ', notched' : ''}` })));
  const r = optimizeCuts(pieces, stocks, d.kerf);
  // Starter: strips ripped from whole planks, laid end to end.
  const starterIn = shed.lap.reduce((t, f) => t + f.starter, 0);
  const longest = stocks.reduce((a, b) => (b.price / b.length < a.price / a.length - 1e-9 ? b : a));
  const perPlank = Math.floor((spec.width + d.kerf) / (spec.starterWidth + d.kerf));
  const starterPlanks = Math.ceil(starterIn / (longest.length * perPlank));
  return {
    stocks, starterStock: longest.length, starterPlanks, starterIn, perPlank, tooLong: r.tooLong,
    boards: r.boards.map((b) => ({ stock: b.stock, cuts: b.cuts.map((c) => c.len), offcut: b.offcut })),
    pieces: pieces.length, joints: shed.lap.reduce((t, f) => t + f.joints.length, 0), nails: shed.lap.reduce((t, f) => t + f.nails, 0),
  };
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
  const all = [...shed.members, ...(shed.doorParts || [])];
  for (const m of all) {
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
    const pieces = all.filter((m) => m.material === material).map((m) => ({ len: m.length, mark: markOf.get(m.id), id: m.id, kind: m.kind }));
    const stocks = d.lengths.map((ft) => ({ length: ft * 12, price: boardCost(prices, material, ft) }));
    const result = cutWithinHaul(pieces, stocks, d.kerf, d.maxHaulFt);
    return { material, pieces: pieces.length, result };
  });
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const notes = [];
  for (const l of lumber) {
    for (const p of l.result.tooLong) problems.push(`${l.material} ${p.kind} ${fmtIn(p.len)} (mark ${p.mark}) is longer than your longest board; allow a longer length.`);
  }

  // Shopping list.
  /** @type {{ section: string, name: string, qty: number, unit: string, price: number, total: number, source?: any }[]} */
  const shopping = [];
  const line = (section, name, qty, unit, price, source) => {
    if (!(qty > 0)) return;
    // A listing's bulk price applies once the quantity reaches it (not to a price you typed).
    if (source?.kind === 'listed' && source.bulk && qty >= source.bulk.min) {
      price = source.bulk.price;
      source = { ...source, note: `${source.note || ''}; bulk price for ${source.bulk.min} or more` };
    }
    shopping.push({ section, name, qty, unit, price, total: Math.round(qty * price * 100) / 100, source });
  };
  for (const l of lumber) {
    const counts = new Map();
    for (const b of l.result.boards) counts.set(b.stock, (counts.get(b.stock) || 0) + 1);
    for (const [len, qty] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      const ft = len / 12;
      const p = boardCost(prices, l.material, ft);
      line('Lumber', `${l.material} x ${ft}'`, qty, 'board', p, { ...sourceOf(p, boardPrice(l.material, ft)), key: `lumber:${l.material}:${ft}` });
    }
  }
  // Spare boards: real orders carry a few extra for warped, split or mis-cut
  // boards. A share of each material's boards, rounded up, in its commonest length.
  if (d.spares > 0) {
    for (const l of lumber) {
      if (!l.result.boards.length) continue;
      const counts = new Map();
      for (const b of l.result.boards) counts.set(b.stock, (counts.get(b.stock) || 0) + 1);
      const [len] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      const ft = len / 12;
      const qty = Math.ceil((l.result.boards.length * d.spares) / 100);
      const p = boardCost(prices, l.material, ft);
      line('Lumber', `${l.material} x ${ft}' spares (${d.spares}% for culls and mis-cuts)`, qty, 'board', p, { ...sourceOf(p, boardPrice(l.material, ft)), key: `lumber:${l.material}:${ft}` });
    }
  }
  const item = (k) => priceOr(prices.items?.[k], itemPrice(k).price);
  const src = (k) => ({ ...sourceOf(item(k), itemPrice(k)), key: k });
  const label = (k) => /** @type {any} */ (EXAMPLE_ITEMS)[k].name;
  const floorSheets = sheetCount2d(panelPieces(shed.panels, 'floor sheet'));
  const roofSheets = sheetCount2d(panelPieces(shed.panels, 'roof sheathing'));
  const floorKey = d.floorPanel === 'OSB' ? 'floorOSB' : 'floorSheet';
  line('Sheet goods', label(floorKey), floorSheets, 'sheet', item(floorKey), src(floorKey));
  line('Sheet goods', label('roofSheet'), roofSheets, 'sheet', item('roofSheet'), src('roofSheet'));
  // A gambrel's loft floor, and its truss gussets cut from 15/32" plywood sheathing
  // (by area, with a quarter for the waste between the odd shapes).
  const loftSheets = sheetCount2d(panelPieces(shed.panels, 'loft deck'));
  if (loftSheets) line('Sheet goods', `${label(floorKey)} (loft floor)`, loftSheets, 'sheet', item(floorKey), src(floorKey));
  const gussetSqIn = shed.panels.filter((p) => p.kind === 'gambrel gusset').reduce((t, p) => t + Math.abs(polyArea(p.geom.profile)), 0);
  const gambrelGussetSheets = gussetSqIn ? Math.ceil((gussetSqIn * 1.25) / (48 * 96)) : 0;
  if (gambrelGussetSheets) line('Sheet goods', '15/32" plywood sheathing, 4x8, cut into truss gussets', gambrelGussetSheets, 'sheet', item('plywoodLining'), src('plywoodLining'));
  // Truss gussets come out of their own sheets of the same OSB: each piece is
  // packed as the rectangle round it, long side along the sheet.
  const gussetPieces = shed.panels.filter((p) => p.kind === 'truss gusset').map((p) => {
    const ys = p.geom.profile.map((q) => q[0]);
    const zs = p.geom.profile.map((q) => q[1]);
    const a = Math.max(...ys) - Math.min(...ys);
    const b = Math.max(...zs) - Math.min(...zs);
    return { len: Math.max(a, b), w: Math.min(a, b) };
  });
  const gussetSheets = gussetPieces.length ? Math.min(shelfSheets(gussetPieces, d.kerf), sheetCount2d(gussetPieces)) : 0;
  if (gussetSheets) line('Sheet goods', `${label('roofSheet')}, for truss gussets`, gussetSheets, 'sheet', item('roofSheet'), src('roofSheet'));
  // Attic storage deck on the truss bottom chords, of the floor's panel.
  const deckSheets = sheetCount2d(panelPieces(shed.panels, 'attic deck'));
  if (deckSheets) line('Sheet goods', `${label(floorKey)}, attic storage deck`, deckSheets, 'sheet', item(floorKey), src(floorKey));
  /** @type {ReturnType<typeof lapPlan> | null} */
  let lapCuts = null;
  if (d.siding) {
    const area = shed.sidingArea ?? 0;
    const type = d.sidingType || 'T1-11';
    if (type === 'T1-11' || type === 'LP SmartSide' || type === 'LP SmartSide 7/16') {
      // Panel siding is its own sheathing: one panel per 4 ft column, the length that reaches.
      const by = { 96: 0, 108: 0, 120: 0 };
      if (d.sidingRun === 'horizontal') {
        // Panels on their side: a whole 4x8 per full piece; the short top row and the gable
        // pieces packed by their bounding boxes (so a gable triangle is never under-counted).
        by[96] = sheetCount2d(shed.sidingFull.map((x) => x.piece));
      } else {
        for (const x of shed.sidingFull) by[x.length] += 1;
        by[96] += sidingUpperSheets(shed);
      }
      const keys = type === 'T1-11' ? [d.sidingPrimed ? 'siding8primed' : 'siding8', 'siding9', 'siding10'] : type === 'LP SmartSide' ? ['lpPanel', 'lpPanel9', 'lpPanel10'] : ['lpPanel76', 'lpPanel76x9', 'lpPanel76x10'];
      [96, 108, 120].forEach((len, i) => line('Siding', label(keys[i]), by[len], 'sheet', item(keys[i]), src(keys[i])));
      // The panel rule makes the price jump about as the walls rise: a column that
      // outgrows a 10 ft panel switches to a 4x8 with a strip above it, which can
      // be cheaper. Price the next few wall steps the same way (every column rises
      // with the walls; strips counted unnested, an upper bound) and say so
      // only when one of them makes the siding cheaper, with the numbers.
      const tall = shed.sidingFull.filter((x) => x.length > 96).length;
      const strips = shed.sidingUpper.length;
      const needs = shed.sidingFull.map((x) => x.need).filter((x) => Number.isFinite(x));
      const [p8, p9, p10] = keys.map((k) => Number(item(k)));
      const sidingAt = (dz) => {
        let t = 0;
        const up = [];
        for (const h of needs) {
          const n = h + dz;
          if (n <= 96 + 1e-9) t += p8; else if (n <= 108 + 1e-9) t += p9; else if (n <= 120 + 1e-9) t += p10; else { t += p8; up.push(Math.ceil(n - 96)); }
        }
        return t + sheetCount(up) * p8;
      };
      const steps = [...new Set(needs.flatMap((h) => [96, 108, 120].map((s) => Math.ceil((s - h + 0.01) * 2) / 2)).filter((dz) => dz > 0 && dz <= 12))].sort((a, b) => a - b);
      // Now: the panels as bought (strips nested where they nest), so a claimed saving is never flattered.
      const now = [96, 108, 120].reduce((t, len, i) => t + by[len] * [p8, p9, p10][i], 0);
      const best = steps.map((dz) => ({ dz, cost: sidingAt(dz) })).reduce((a, b) => (b.cost < a.cost - 0.005 ? b : a), { dz: 0, cost: now });
      if ((tall || strips) && needs.length === shed.sidingFull.length && best.dz > 0 && now - best.cost >= 1) {
        const fmt = (x) => `$${x.toFixed(2)}`;
        notes.push(`Siding: each 4 ft column takes the shortest panel that reaches its top (4x8 ${fmt(p8)}, 4x9 ${fmt(p9)}, 4x10 ${fmt(p10)}); `
          + `a column taller than 10 ft takes a 4x8 with a strip cut from another 4x8 above it, Z-flashed at the joint. `
          + `Here ${[tall && `${tall} use a 9 or 10 ft panel`, strips && `${strips} use a strip`].filter(Boolean).join(' and ')} (of ${shed.sidingFull.length} columns). `
          + `Walls ${fmtIn(best.dz)} taller would tip columns into the 4x8-and-strip layout and make the siding panels about ${fmt(now - best.cost)} cheaper (the framing, trim and paint cost a little more), so a dip in price as the walls rise is not a bug.`);
      }
    } else {
      // Lap and board-and-batten siding go over OSB sheathing.
      line('Siding', label('wallSheathing'), Math.ceil((area * 1.1) / 32), 'sheet', item('wallSheathing'), src('wallSheathing'));
      if (type === 'board and batten') {
        // Exterior-rated LP SmartSide 440 boards (5-1/2" face) with a 3-1/2" batten over
        // every joint, both 16 ft (the lengths sold); 10% for cutting round openings and gables.
        const boards = Math.ceil((area * 144 * 1.1) / (5.5 * 192));
        line('Siding', label('bbBoard'), boards, 'piece', item('bbBoard'), src('bbBoard'));
        line('Siding', label('bbBatten'), boards, 'piece', item('bbBatten'), src('bbBatten'));
      } else if (type === 'vinyl') {
        line('Siding', label('vinylBox'), Math.ceil((area * 1.1) / 200), 'box', item('vinylBox'), src('vinylBox'));
        // Vinyl's own trim: starter along the bottom of every wall, J-channel round
        // each opening and under the eaves and rakes, a corner post at each corner.
        const perimFt = (2 * (d.length + d.width)) / 12;
        const openFt = d.openings.reduce((t, o) => t + (2 * (o.width + o.height)) / 12, 0);
        // Up both rakes on each gable: on a saltbox the steep front's and the long back's.
        const rakesIn = d.style === 'saltbox' ? 2 * (dims.ridgeY / dims.slopes.front.cos + (d.width - dims.ridgeY) / dims.slopes.back.cos) : 4 * (d.width / 2 / Math.cos(Math.atan(d.pitch / 12)));
        const jFt = openFt + (2 * d.length + rakesIn) / 12;
        line('Siding', label('vinylStarter'), Math.ceil((perimFt * 1.05) / 12), 'piece', item('vinylStarter'), src('vinylStarter'));
        line('Siding', label('vinylJ'), Math.ceil((jFt * 1.1) / 12.6), 'piece', item('vinylJ'), src('vinylJ'));
        line('Siding', label('vinylCorner'), 4 * Math.ceil(((dims.highPlateTop ?? dims.plateTop) - (dims.sidingBottom ?? dims.skidTop)) / 120), 'piece', item('vinylCorner'), src('vinylCorner'));
      } else if (shed.lap?.length) {
        lapCuts = lapPlan(shed, d, item);
        // Sheathing: one 4x8 per 4 ft column, strips above packed from whole sheets.
        const sheets = shed.sidingFull.length + sidingUpperSheets(shed);
        // OSB laid out above was counted by area; lap siding counts its real columns.
        shopping.pop();
        line('Siding', label('wallSheathing'), sheets, 'sheet', item('wallSheathing'), src('wallSheathing'));
        // House wrap: the wall area plus 6" laps on 3 ft rolls (about 20% more).
        line('Siding', label('houseWrap'), Math.ceil((area * 1.2) / 300), 'roll', item('houseWrap'), src('houseWrap'));
        line('Siding', label('wrapTape'), 1, 'roll', item('wrapTape'), src('wrapTape'));
        line('Siding', label('capNails'), 1, 'box', item('capNails'), src('capNails'));
        for (const st of lapCuts.stocks) {
          const n = lapCuts.boards.filter((b) => b.stock === st.length).length + (st.length === lapCuts.starterStock ? lapCuts.starterPlanks : 0);
          line('Siding', label(st.key), n, 'piece', item(st.key), src(st.key));
        }
        if (lapCuts.joints) line('Siding', label('jointFlashing'), Math.ceil((lapCuts.joints * 6) / 600), 'roll', item('jointFlashing'), src('jointFlashing'));
      }
    }
    if (type !== 'vinyl' && d.sidingColor !== 'unfinished') {
      // Two coats: 350 sq ft per gallon for paint, 300 for solid stain (typical label coverage).
      const stain = d.sidingColor === 'natural';
      line('Paint', stain ? label('stain') : `${label('paint')} (${finishName(d.sidingColor, SIDING_FINISHES)})`, Math.ceil((area * 2) / (stain ? 300 : 350)), 'gallon', item(stain ? 'stain' : 'paint'), src(stain ? 'stain' : 'paint'));
      if (d.glitter) line('Paint', label('glitter'), Math.ceil((area * 2) / 350), 'packet', item('glitter'), src('glitter'));
      if (d.polkaDots) line('Paint', `${label('accentPaint')} (purple, for the polka dots)`, 1, 'quart', item('accentPaint'), src('accentPaint'));
    }
  }
  let roofNailBoxes = 0;
  if (shed.trim) {
    const t = shed.trim;
    line('Roof trim', label('fasciaTrim'), Math.ceil(t.fasciaFt / 12), 'piece', item('fasciaTrim'), src('fasciaTrim'));
    line('Roof trim', label('soffitPanel'), Math.ceil((t.soffitSqFt * 1.1) / 12.75), 'panel', item('soffitPanel'), src('soffitPanel'));
    line('Roof trim', label('rakeTrim'), Math.ceil((t.rakeFt * 1.1) / 12), 'piece', item('rakeTrim'), src('rakeTrim'));
  }
  // Wall trim: the 1x4 corner boards and casings, cut from whichever mix of
  // 8, 12 and 16 ft boards costs least (the same optimizer as the framing).
  /** @type {{ boards: { stock: number, cuts: number[], offcut: number }[], pieces: { where: string, length: number }[] } | null} */
  let trimCuts = null;
  if (shed.wallTrim && shed.wallTrim.length) {
    // 5/4 trim comes in one length per maker: HardieTrim 12 ft with fiber cement, LP 540 16 ft otherwise.
    const keys = d.wallTrim === '5/4' ? (d.sidingType === 'fiber cement' ? { 144: 'trim54Hardie' } : { 192: 'trim54LP' }) : { 96: 'trim1x4x8', 144: 'trim1x4x12', 192: 'trim1x4x16' };
    const stocks = Object.entries(keys).map(([len, k]) => ({ length: Number(len), price: item(k) }));
    const r = cutWithinHaul(shed.wallTrim.map((t) => ({ len: t.length, kind: t.where })), stocks, d.kerf, d.maxHaulFt);
    trimCuts = { boards: r.boards.map((b) => ({ stock: b.stock, cuts: b.cuts.map((c) => c.len), offcut: b.offcut })), pieces: shed.wallTrim };
    for (const [len, k] of Object.entries(keys)) {
      const n = r.boards.filter((b) => b.stock === Number(len)).length;
      if (n) line('Wall trim', label(k), n, 'piece', item(k), src(k));
    }
    // With one stock length there is nothing shorter to fall back on, so say when it is longer than the haul limit.
    const longest = Math.max(...r.boards.map((b) => b.stock));
    if (d.maxHaulFt > 0 && longest > d.maxHaulFt * 12) {
      notes.push(`Wall trim: ${d.wallTrim} trim comes in ${longest / 12} ft lengths only, longer than your ${d.maxHaulFt} ft haul limit. Have it delivered or cut to length where you buy it, or choose 1x4 trim.`);
    }
  }
  // Trim paint: the face of every primed trim board (1x6 fascia, 1x4 or 5/4 rake,
  // corner boards and casings), two coats at the same 350 sq ft a gallon as the
  // siding paint. The boards are factory primed and the paint is a paint-and-primer,
  // so no separate primer: cut ends take the paint. Quarts until a gallon is cheaper.
  const trimFaceSqFt = ((shed.trim ? shed.trim.fasciaFt * 12 * 5.5 + shed.trim.rakeFt * 12 * 3.5 : 0)
    + (shed.wallTrim || []).reduce((t, x) => t + x.length * 3.5, 0)) / 144;
  if (trimFaceSqFt > 0 && d.siding && d.sidingColor !== 'unfinished') {
    const quarts = Math.ceil((trimFaceSqFt * 2) / (350 / 4));
    const gallons = Math.ceil(quarts / 4);
    const qt = quarts * Number(item('trimPaintQt')) <= gallons * Number(item('trimPaintGal'));
    const name = `${label(qt ? 'trimPaintQt' : 'trimPaintGal')} (${finishName(d.trimColor, TRIM_FINISHES)}, ${Math.round(trimFaceSqFt)} sq ft of trim face)`;
    if (qt) line('Paint', name, quarts, 'quart', item('trimPaintQt'), src('trimPaintQt'));
    else line('Paint', name, gallons, 'gallon', item('trimPaintGal'), src('trimPaintGal'));
    // Keep it with the siding paint so each section stays in one run.
    const last = shopping.map((r) => r.section).lastIndexOf('Paint', shopping.length - 2);
    if (last >= 0) shopping.splice(last + 1, 0, /** @type {any} */ (shopping.pop()));
  }
  if (shed.interior) {
    const it = shed.interior;
    const key = { OSB: 'osbLining', plywood: 'plywoodLining', drywall: 'drywall', beadboard: 'beadboard', pegboard: 'pegboard', 'teen bedroom': 'beadboard' }[it.type] || 'interiorPanel';
    line('Interior', label(key), it.panels, 'sheet', item(key), src(key));
    if (it.type === 'drywall') {
      line('Interior', label('jointCompound'), Math.max(1, Math.ceil(it.sqft / 400)), 'bucket', item('jointCompound'), src('jointCompound'));
      line('Interior', label('drywallTape'), Math.max(1, Math.ceil((it.sqft * 0.4) / 500)), 'roll', item('drywallTape'), src('drywallTape'));
    }
    if (['plywood', 'drywall', 'beadboard', 'teen bedroom'].includes(it.type)) {
      line('Interior', `${label('interiorPaint')} (${it.paint})`, Math.ceil((it.sqft * 2) / 350), 'gallon', item('interiorPaint'), src('interiorPaint'));
    }
  }
  if (d.insulation) {
    // Batts fill the bays between studs: about 90% of the wall area.
    // A lean-to's front wall is taller than the rest by its rise.
    const wallSqFt = (2 * (d.length + d.width) * shed.design.wallHeight + d.length * (dims.rise || 0)) / 144;
    line('Interior', label('insulation'), Math.ceil((wallSqFt * 0.9) / 125.94), 'bag', item('insulation'), src('insulation'));
  }
  if (d.roofing) {
    const area = dims.roofAreaSqFt * 1.1;
    // Each slope's length, eave tail to ridge: a saltbox's two differ.
    const slopeLens = dims.saltbox ? [dims.slopes.front.len, dims.slopes.back.len] : dims.lean ? [dims.slopeLen] : [dims.slopeLen, dims.slopeLen];
    const rakesIn = 2 * slopeLens.reduce((t, x) => t + x, 0);
    if (d.roofCover === 'metal') {
      // 8 ft panels with 6" end laps, about 21-1/2" of cover each, two slopes (one on a lean-to); ridge cap with 6" laps
      // (on a lean-to it closes the high edge; a high-side flashing made for the panel is the better part where the store has one).
      const cols = Math.ceil(d.length / 21.5);
      line('Roofing', label('metalPanel'), slopeLens.reduce((t, x) => t + cols * Math.ceil(x / 90), 0), 'piece', item('metalPanel'), src('metalPanel'));
      line('Roofing', label('metalRidge'), Math.ceil(d.length / 120), 'piece', item('metalRidge'), src('metalRidge'));
    } else {
      line('Roofing', label('shingleBundle'), Math.ceil(area / 32.8), 'bundle', item('shingleBundle'), src('shingleBundle'));
      // A starter course along both eaves and up the four rakes; cap shingles along the ridge.
      // A lean-to has one eave and two rakes; its cap shingles fold over the high edge.
      const starterIn = (dims.lean ? d.length : 2 * d.length) + rakesIn;
      line('Roofing', label('starterShingle'), Math.ceil(starterIn / 12 / 120), 'bundle', item('starterShingle'), src('starterShingle'));
      line('Roofing', label('ridgeCapShingle'), Math.ceil(d.length / 12 / 25), 'bundle', item('ridgeCapShingle'), src('ridgeCapShingle'));
      // Four nails a shingle, about 2-1/2 lb of 1-1/4" nails a square (100 sq ft) with starter and cap.
      roofNailBoxes = Math.ceil(((area / 100) * 2.5) / 5);
    }
    line('Roofing', label('underlayment'), Math.ceil(area / 1000), 'roll', item('underlayment'), src('underlayment'));
    // Both eaves and every rake (a lean-to's slope runs tail to tail, so two rakes).
    const dripFt = (2 * d.length + rakesIn) / 12;
    line('Roofing', label('dripEdge'), Math.ceil(dripFt / 10), 'piece', item('dripEdge'), src('dripEdge'));
  }
  // Doors and windows the visitor picked from the catalogue.
  const picked = new Map();
  for (const op of shed.framedOpenings) { const pr = productById(op.product); if (pr) picked.set(pr.id, { pr, qty: (picked.get(pr.id)?.qty || 0) + 1 }); }
  for (const { pr, qty } of picked.values()) {
    const p = priceOr(prices.items?.[`product:${pr.id}`], pr.price);
    line('Doors and windows', pr.name, qty, 'each', p, { ...sourceOf(p, { price: pr.price, url: pr.url, store: pr.store, seen: '2026-10-29', note: pr.note, kind: 'listed' }), key: `product:${pr.id}` });
  }
  // A custom-size opening is framed but has no unit to buy: say so, rather than
  // leave it silently out of the total.
  /** @type {string[]} */
  const unpriced = [];
  // Each gets a typical range from the catalogue, which goes into the total (at
  // the range's median, marked as an estimate) only if you ask for it.
  for (const op of d.openings) {
    if (op.product === 'site-built' || productById(op.product)) continue;
    const what = `${op.kind === 'door' ? 'Door' : 'Window'} ${fmtIn(op.width)} x ${fmtIn(op.height)} on the ${WHERE[`wall:${op.wall}`] || op.wall}`;
    const r = catalogueRange(op.kind, op.width, op.height);
    const range = r ? `typical range $${r.lo.toFixed(2)} to $${r.hi.toFixed(2)} across the ${r.n} ${r.group} in our catalogue` : '';
    if (r && d.customRange && shed.framedOpenings.some((f) => f.id === op.id)) {
      line('Doors and windows', `${what}, custom size: ${range}, counted at the median`, 1, 'each', r.median,
        { kind: 'estimate', price: r.median, note: `a range from our catalogue, not a listing for this size: median of the ${r.n} ${r.group}` });
      continue;
    }
    unpriced.push(`${what} (custom size${range ? `; ${range}` : ''})`);
  }
  if (dims.padSqFt) line('Site prep', label('landscapeFabric'), Math.ceil((dims.padSqFt * 1.15) / 150), 'roll', item('landscapeFabric'), src('landscapeFabric'));
  if (dims.baseBags) line('Site prep', label('paverBase'), dims.baseBags, 'bag', item('paverBase'), src('paverBase'));
  // Compact the pad in 2" lifts: a hand tamper does a shed pad; a rented plate compactor is faster on a big one.
  if (d.compaction === 'plate compactor') line('Site prep', label('plateCompactor'), 1, 'day', item('plateCompactor'), src('plateCompactor'));
  else line('Site prep', label('handTamper'), 1, 'each', item('handTamper'), src('handTamper'));
  if (dims.gravelCuYd) line('Site prep', label('gravelTon'), Math.ceil(dims.gravelCuYd * 1.4 * 10) / 10, 'ton', item('gravelTon'), src('gravelTon'));
  // Piers under the skids, or under the ridge-beam posts of a shed with no floor.
  if (dims.block?.pier || dims.pierCount) {
    line('Foundation and hardware', label('formTube'), dims.pierTubes, 'each', item('formTube'), src('formTube'));
    line('Foundation and hardware', label('concreteBag'), dims.pierBags, 'bag', item('concreteBag'), src('concreteBag'));
  } else if (dims.block) line('Foundation and hardware', label(dims.block.item), dims.blockCount, 'each', item(dims.block.item), src(dims.block.item));
  const vents = Object.values(shed.vents || {}).reduce((t, v) => t + v.length, 0);
  line('Foundation and hardware', `${label('gableVent')}, ${d.ventWidth}" x ${d.ventHeight}"`, vents, 'each', item('gableVent'), src('gableVent'));
  // Hangers are for rafters meeting a ridge beam; a lean-to's rafters meet none.
  // The rafter arrives at the roof's slope, so the hanger is a slope-adjustable one sized to the rafter.
  if (d.roofType === 'ridgeBeam' && !dims.lean) {
    const hk = { '2x8': 'rafterHanger28', '2x10': 'rafterHanger210' }[d.rafterSize] || 'rafterHanger';
    line('Foundation and hardware', label(hk), shed.members.filter((m) => m.kind === 'rafter').length, 'each', item(hk), src(hk));
  }
  // A variable-pitch connector both seats and fastens the rafter at the wall; a notched rafter gets a tie.
  if (dims.connector) line('Foundation and hardware', label('pitchConnector'), dims.rafterCenters.length * 2, 'each', item('pitchConnector'), src('pitchConnector'));
  else line('Foundation and hardware', label('hurricaneTie'), dims.rafterCenters.length * 2, 'each', item('hurricaneTie'), src('hurricaneTie'));
  // Ground anchors at the corners, and the ties that hold the floor frame to the skid there (checks.mjs, groundAnchors).
  const anchors = groundAnchors(shed);
  if (anchors) {
    line('Foundation and hardware', label(anchors.kit.item), 1, 'kit', item(anchors.kit.item), src(anchors.kit.item));
    if (anchors.ties) line('Foundation and hardware', `${label('hurricaneTie')}, Simpson H2.5A, floor frame to the outer skid at the corners`, 4 * anchors.ties, 'each', item('hurricaneTie'), src('hurricaneTie'));
  }

  // Fasteners, sealants and flashing. Counts follow the nailing schedule on
  // the details sheet (rounded up); boxes are rounded up from the counts.
  {
    const per = { stud: 4, 'corner stud': 6, 'king stud': 6, 'jack stud': 6, 'post stud': 6, 'top cripple': 4, 'bottom cripple': 4, 'rough sill': 4, 'sill block': 4, 'head block': 4, 'floor joist': 6, 'rim joist': 0, rafter: 4, 'rafter tie': 6, 'eave blocking': 4, 'gable stud': 4, 'vent trimmer': 4, 'vent header': 4, 'door stile': 0, 'door rail': 0, 'door brace': 0, 'bottom chord': 4, 'king post': 0 };
    let n16 = 0;
    const tieNails = heelJoint(shed)?.nails ?? 3;
    for (const m of all) {
      const k = /** @type {Record<string, number>} */ (per)[m.kind];
      // Plates, headers, rims, skids, beams and anything long: two nails every 16".
      n16 += m.kind === 'rafter tie' ? 2 * tieNails : k !== undefined ? k : 2 * Math.ceil(m.length / 16);
    }
    // Siding nails come in 1 lb boxes (about 140) and 5 lb boxes (about 770):
    // buy whichever mix of the two covers the count for the least money.
    const sidingNails = (n) => {
      const p1 = item('sidingNails'); const p5 = item('sidingNails5');
      let best = { five: 0, one: Math.ceil(n / 140), cost: Math.ceil(n / 140) * p1 };
      for (let five = 1; five <= Math.ceil(n / 770); five++) {
        const one = Math.ceil(Math.max(0, n - five * 770) / 140);
        const cost = five * p5 + one * p1;
        if (cost < best.cost - 0.005) best = { five, one, cost };
      }
      line('Fasteners and sealants', label('sidingNails5'), best.five, 'box', p5, src('sidingNails5'));
      line('Fasteners and sealants', label('sidingNails'), best.one, 'box', p1, src('sidingNails'));
    };
    // 16d galvanized commons run about 45 to the pound (a 5 lb box holds about 225).
    line('Fasteners and sealants', label('framingNails'), Math.ceil(n16 / 225), 'box', item('framingNails'), src('framingNails'));
    // Sheathing: about 60 8d nails a 4x8 sheet (6" at edges, 12" in the field); 478 in a 5 lb box.
    const panelSiding = d.siding && ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16'].includes(d.sidingType);
    // A gambrel's gussets take their own count of 8d nails (gambrel.mjs).
    const gambrelGussetNails = dims.gambrel ? (dims.rafterCenters.length - 2) * (2 * dims.gambrel.nailsPerKnee + dims.gambrel.nailsPerPeak) : 0;
    const sheathingSheets = floorSheets + roofSheets + deckSheets + loftSheets + gambrelGussetNails / 60 + (d.siding && !panelSiding ? Math.ceil(((shed.sidingArea ?? 0) * 1.1) / 32) : 0);
    line('Fasteners and sealants', label('sheathingNails'), Math.ceil((sheathingSheets * 60) / 478), 'box', item('sheathingNails'), src('sheathingNails'));
    if (panelSiding) {
      const sheets = shed.sidingFull.length + sidingUpperSheets(shed);
      // LP panels: each shiplap joint double-nailed (16 more a sheet at 6" up an
      // 8 ft edge), and the 7/16" panel on studs at 24" nailed at 6" in the field
      // too (ESR-1301), another 16 a sheet.
      const lp = d.sidingType.startsWith('LP SmartSide') ? 16 + (d.sidingType === 'LP SmartSide 7/16' && d.studSpacing > 16 ? 16 : 0) : 0;
      sidingNails(sheets * (60 + lp));
    }
    // Lap siding: a nail at every stud in every course (140 to the 1 lb box), plus 10% for misses.
    if (lapCuts) sidingNails(lapCuts.nails * 1.1);
    line('Fasteners and sealants', label('roofingNails'), roofNailBoxes, 'box', item('roofingNails'), src('roofingNails'));
    // Trim: two nails every 16" along each board, about 168 to the pound.
    const trimIn = (shed.wallTrim || []).reduce((t, x) => t + x.length, 0) + (shed.trim ? (shed.trim.fasciaFt + shed.trim.rakeFt) * 12 : 0);
    if (trimIn) line('Fasteners and sealants', label('trimNails'), Math.ceil((2 * Math.ceil(trimIn / 16)) / 168), 'box', item('trimNails'), src('trimNails'));
    // Connector nails: the rafter connectors, hangers or ties, about 8 each (check the maker's schedule).
    const connectors = dims.rafterCenters.length * 2 + (d.roofType === 'ridgeBeam' && !dims.lean ? shed.members.filter((m) => m.kind === 'rafter').length : 0);
    // Truss gussets take the same 1-1/2" nails, counted per joint by the truss check (truss.mjs).
    let gussetNails = 0;
    if (dims.truss) {
      const n = trussChecks(d).nails;
      const kp = shed.members.filter((m) => m.kind === 'king post').length;
      gussetNails = (dims.trusses || []).length * (2 * (n.heelBottom + n.heelTop) + 2 * n.peak) + kp * 2 * n.foot;
    }
    line('Fasteners and sealants', label('connectorNails'), Math.ceil((connectors * 8 + gussetNails) / 120), 'pack', item('connectorNails'), src('connectorNails'));
    // Exterior caulk: round each door and window (unit to casing, casing to siding), along
    // the inside edge of each corner board, plus 10 ft for vents and odd joints; a tube runs about 25 ft.
    let caulkIn = 120;
    for (const op of shed.framedOpenings) caulkIn += 2 * 2 * (op.width + op.height);
    caulkIn += 8 * 96;
    if (d.siding) line('Fasteners and sealants', label('caulk'), Math.ceil(caulkIn / 12 / 25), 'tube', item('caulk'), src('caulk'));
    // Z-flashing over every door and window head and over any horizontal siding joint.
    let zIn = shed.framedOpenings.reduce((t, op) => t + op.width + 9, 0);
    if (!shed.lap?.length) zIn += (shed.sidingUpper || []).length * 48;
    // Horizontal panel siding: Z-flashing along every row joint (IRC R703.3.1).
    zIn += (shed.sidingJoints || []).reduce((t, j) => t + j.len, 0);
    if (d.siding) line('Fasteners and sealants', label('zFlashing'), Math.ceil(zIn / 120), 'piece', item('zFlashing'), src('zFlashing'));
  }
  // Consumables the build steps call for: adhesive under the subfloor (a tube
  // does about a sheet and a half on joists at 16", proportionally more at 24") and in a site-built door
  // frame; screws for door skins (about 60 a leaf, about 100 to a 1 lb box; the
  // subfloor is nailed with the 8d sheathing nails); flashing tape round each opening; shims for doors and windows.
  {
    const doorsBuilt = (shed.doors || []).reduce((t, x) => t + x.leaves, 0);
    line('Fasteners and sealants', label('adhesive'), Math.ceil(floorSheets / (1.5 * (d.joistSpacing || 16) / 16)) + doorsBuilt, 'tube', item('adhesive'), src('adhesive'));
    if (doorsBuilt) line('Fasteners and sealants', label('screws'), Math.ceil((doorsBuilt * 60) / 100), 'box', item('screws'), src('screws'));
    const bought = d.openings.filter((o) => o.product !== 'site-built');
    const tapeFt = bought.reduce((t, o) => t + (2 * (o.width + o.height)) / 12, 0);
    if (tapeFt) line('Fasteners and sealants', label('flashingTape'), Math.ceil(tapeFt / 75), 'roll', item('flashingTape'), src('flashingTape'));
    if (bought.length) line('Fasteners and sealants', label('shims'), Math.ceil(bought.length / 2), 'bundle', item('shims'), src('shims'));
  }
  // Site-built doors: tee hinges (three a leaf), a pull a leaf and a hasp.
  for (const dr of shed.doors || []) {
    line('Door hardware', `${label('tHinge')} (door ${dr.id})`, 3 * dr.leaves, 'each', item('tHinge'), src('tHinge'));
    line('Door hardware', `${label('doorPull')} (door ${dr.id})`, dr.leaves, 'each', item('doorPull'), src('doorPull'));
    line('Door hardware', `${label('hasp')} (door ${dr.id})`, 1, 'each', item('hasp'), src('hasp'));
    // A pair of doors: a cane bolt drops into the floor to hold the fixed leaf, which the hasp's staple then locks to.
    if (dr.leaves > 1) line('Door hardware', `${label('caneBolt')} (door ${dr.id})`, 1, 'each', item('caneBolt'), src('caneBolt'));
  }

  const sum = (rows) => Math.round(rows.reduce((t, r) => t + r.total, 0) * 100) / 100;
  const lumberCost = sum(shopping.filter((r) => r.section === 'Lumber'));
  const total = sum(shopping);
  // What the order costs at the till: sales tax at the rate you set, and the
  // store's delivery charge if you chose delivery.
  const tax = Math.round(total * d.taxRate) / 100;
  const deliveryFee = d.delivery === 'pickup' ? 0 : priceOr(prices.delivery?.[d.delivery], DELIVERY[d.delivery]?.fee ?? 0);
  const grandTotal = Math.round((total + tax + deliveryFee) * 100) / 100;
  const boards = lumber.reduce((t, l) => t + l.result.boards.length, 0);
  const lowerBound = Math.round(lumber.reduce((t, l) => t + l.result.lowerBound, 0) * 100) / 100;
  // The boards the cut sheet uses, at the prices it was optimised on: what the lower bound is
  // a bound on. lumberCost adds spares and any bulk prices on top.
  const cutSheetCost = Math.round(lumber.reduce((t, l) => t + l.result.cost, 0) * 100) / 100;
  return {
    parts, lumber, shopping, problems, notes, total, unpriced, tax, deliveryFee, grandTotal, trimCuts, lapCuts, lumberCost, cutSheetCost, lowerBound, boards,
    pieces: all.length, floorSheets, roofSheets,
    footprintSqFt: (d.length * d.width) / 144,
  };
}

/** Store delivery charges for building materials (see prices.mjs for sources). */
export { DELIVERY } from './prices.mjs';
import { DELIVERY } from './prices.mjs';

/** @typedef {ReturnType<typeof estimate>} Estimate */

/**
 * Lumber cost of only some materials: what a search needs when a change can
 * move only those materials (the rest cost the same either way).
 * @param {Shed} shed @param {string[]} materials @param {Prices} [prices]
 */
export function lumberCostOf(shed, materials, prices = examplePrices()) {
  const d = shed.design;
  let cost = 0;
  for (const material of materials) {
    const pieces = shed.members.filter((m) => m.material === material).map((m) => ({ len: m.length, id: m.id, kind: m.kind }));
    if (!pieces.length) continue;
    const stocks = d.lengths.map((ft) => ({ length: ft * 12, price: boardCost(prices, material, ft) }));
    cost += cutWithinHaul(pieces, stocks, d.kerf, d.maxHaulFt).cost;
  }
  return Math.round(cost * 100) / 100;
}

/**
 * Identical boards (the same stock length cut into the same pieces in the same
 * order) as one line with a count, in the order they first appear, so a cut
 * sheet reads "10 x 8' board: C 93"" rather than ten lines of it.
 * @template {{ stock: number, cuts: any[], offcut: number }} B
 * @param {B[]} boards
 * @returns {(B & { count: number })[]}
 */
export function groupBoards(boards) {
  /** @type {(B & { count: number })[]} */
  const out = [];
  const at = new Map();
  for (const b of boards) {
    const key = `${b.stock}|${b.cuts.map((c) => (typeof c === 'number' ? String(c) : `${c.mark ?? ''}:${c.len}`)).join(',')}`;
    if (at.has(key)) out[at.get(key)].count += 1;
    else { at.set(key, out.length); out.push({ ...b, count: 1 }); }
  }
  return out;
}

/**
 * What one board is cut into, in words: "2 x 7' 0" rafter (R1)" or
 * "8' 9" top plate (P3) + 3' 0" cripple (C2)". Same marks are counted together.
 * @param {{ cuts: { mark?: string, kind?: string, len: number }[] }} b
 */
export function boardUse(b) {
  /** @type {Map<string, { n: number, c: any }>} */
  const by = new Map();
  for (const c of b.cuts) { const k = `${c.mark}|${c.len}`; const e = by.get(k); if (e) e.n += 1; else by.set(k, { n: 1, c }); }
  return [...by.values()].map(({ n, c }) => `${n > 1 ? `${n} x ` : ''}${fmtFtIn(c.len)} ${c.kind}${c.mark ? ` (${c.mark})` : ''}`).join(' + ');
}

/**
 * For each material and board length on the cut sheet, what its pieces are for,
 * keyed like the shopping list's lumber lines ("2x6:14" -> "rafter, ridge board").
 */
export function lumberUses(est) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const l of est.lumber) {
    /** @type {Map<number, Map<string, number>>} */
    const byLen = new Map();
    for (const b of l.result.boards) {
      const kinds = byLen.get(b.stock) || new Map();
      for (const c of b.cuts) kinds.set(c.kind, (kinds.get(c.kind) || 0) + 1);
      byLen.set(b.stock, kinds);
    }
    for (const [stock, kinds] of byLen) out.set(`${l.material}:${stock / 12}`, [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n > 1 ? ` x ${n}` : ''}`).join(', '));
  }
  return out;
}

/** CSV of the cut sheet: one row per set of identical boards, its cuts and the offcut of each. */
export function cutSheetCsv(est) {
  const rows = [['boards', 'material', 'stock length', 'cuts (mark: length)', 'offcut each', 'why this long']];
  for (const l of est.lumber) {
    for (const b of groupBoards(l.result.boards)) {
      rows.push([String(b.count), l.material, `${b.stock / 12}'`, b.cuts.map((c) => `${c.mark}: ${fmtIn(c.len)}`).join('; '), fmtIn(b.offcut), /** @type {any} */ (b).why || '']);
    }
  }
  if (est.trimCuts) {
    for (const b of groupBoards(est.trimCuts.boards)) rows.push([String(b.count), '1x4 trim', `${b.stock / 12}'`, b.cuts.map((c) => fmtIn(c)).join('; '), fmtIn(b.offcut), '']);
  }
  if (est.lapCuts) {
    for (const b of groupBoards(est.lapCuts.boards)) rows.push([String(b.count), 'lap siding', `${b.stock / 12}'`, b.cuts.map((c) => fmtIn(c)).join('; '), fmtIn(b.offcut)]);
  }
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

/**
 * Where a price came from, in words: the store and date for a listing, with
 * "(scaled)" or "(estimate)" whenever the number is not the listing's own.
 * An estimate can still name the page it was estimated from.
 * @param {any} s a shopping line's source
 */
export function sourceLabel(s) {
  if (!s) return '';
  if (s.swap) return s.store ? `your swap, ${s.store}` : 'your swap';
  if (s.kind === 'yours') return 'your price';
  const tag = s.kind === 'derived' ? ' (scaled)' : s.kind === 'estimate' ? ' (estimate)' : '';
  if (!s.store && !s.seen) return s.kind === 'estimate' ? 'estimate' : tag.trim();
  return `${s.store || 'listing'}${s.seen ? `, ${s.seen}` : ''}${tag}`;
}

/** CSV of the shopping list. */
/**
 * Where the money goes: each section of the shopping list (lumber, sheet goods,
 * siding, roofing, hardware...) with its total and share, in list order.
 * @param {{ section: string, total: number }[]} shopping
 */
export function sectionTotals(shopping) {
  /** @type {Map<string, number>} */
  const by = new Map();
  for (const r of shopping) by.set(r.section, (by.get(r.section) || 0) + r.total);
  const all = [...by.values()].reduce((t, x) => t + x, 0) || 1;
  return [...by].map(([section, total]) => ({ section, total: Math.round(total * 100) / 100, share: total / all }));
}

export function shoppingCsv(est) {
  const rows = [['section', 'item', 'qty', 'unit', 'unit price', 'total', 'price source', 'listing']];
  const sub = new Map(sectionTotals(est.shopping).map((x) => [x.section, x.total]));
  est.shopping.forEach((r, i) => {
    const s = r.source || {};
    rows.push([r.section, r.name, String(r.qty), r.unit, r.price.toFixed(2), r.total.toFixed(2), sourceLabel(s), s.url || '']);
    // A subtotal row closes each section.
    if (est.shopping[i + 1]?.section !== r.section) rows.push([r.section, `Subtotal, ${r.section.toLowerCase()}`, '', '', '', /** @type {number} */ (sub.get(r.section)).toFixed(2), '', '']);
  });
  rows.push(['', 'Total', '', '', '', est.total.toFixed(2), '', '']);
  for (const u of est.unpriced) rows.push(['Not in the total', u, '1', 'each', '', '', 'no unit picked', '']);
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}
