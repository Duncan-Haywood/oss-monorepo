// @ts-check
// The shed framing engine. A design (footprint, wall height, roof pitch,
// lumber sizes, doors and windows) goes in; every board comes out with its
// real cross-section, its cut length and where it sits in 3D, plus the sheet
// goods that cover it.
//
// Coordinates are inches. x runs along the ridge (the shed's length), y across
// the gable span (its width) from the front eave wall at y = 0 to the back eave
// wall at y = width, and z is up from the top of the gravel pad.
//
// Front and back are the eave walls (full length, the roof's low edges); left
// and right are the gable ends, framed between them. Every member's geometry is
// a flat profile (a list of [p, q] points) extruded `thickness` along `w`:
// world = origin + p*u + q*v + t*w. A stud is a rectangle; a rafter is a
// parallelogram with its birdsmouth notch; a gable stud has its top cut to the
// roof line. The same profile drives the 3D view and the drawings.

import { actual, ceil16, TWO_BY, DEFAULT_LENGTHS_FT, fmtFtIn as fmtFt, fmtIn } from './lumber.mjs';
import { lumberCostOf } from './estimate.mjs';
import { productById } from './products.mjs';

/** @typedef {[number, number, number]} Vec */
/** @typedef {{ origin: Vec, u: Vec, v: Vec, w: Vec, profile: [number, number][], thickness: number }} Geom */
/**
 * @typedef {{ id: string, group: string, kind: string, material: string, length: number,
 *   note?: string, geom: Geom, local?: { s0: number, s1: number, z0: number, z1: number, top?: [number, number][] } }} Member
 */
/** @typedef {{ id: string, kind: 'door'|'window', wall: 'front'|'back'|'left'|'right', offset: number, width: number, height: number, sill?: number, header?: string, product?: string }} Opening */

export const WALLS = /** @type {const} */ (['front', 'right', 'back', 'left']);

export const WALL_LABEL = {
  front: 'Front (eave side)', back: 'Back (eave side)', left: 'Left (gable end)', right: 'Right (gable end)',
};

/**
 * The starter, as asked for: an 8x12 with a single 6'6" door on one 12 ft side,
 * two windows on the other, gable vents, a ridge-beam roof and an 8 ft peak limit,
 * finished the common way (stained T1-11, charcoal shingles, white trim, bare
 * framing inside). Built the way the owner asked on 2026-10-29: a door built on
 * site from the siding rather than a prehung one, the small 14 x 21 shed window
 * Home Depot sells, and solid blocks on tamped soil with no crushed stone. The
 * colours, glitter and decorated interior are options.
 */
export function defaultDesign() {
  return {
    name: '8x12 ridge-beam shed',
    length: 144,
    width: 96,
    wallHeight: 86.5,
    pitch: 5,
    overhang: 12,
    studSize: '2x4',
    studSpacing: 16,
    joistSize: '2x6',
    joistSpacing: 16,
    rafterSize: '2x6',
    rafterSpacing: 24,
    tieSize: '2x4',
    roofType: 'ridgeBeam',
    beamSize: '2x10',
    skidSize: '4x4',
    skidSpacing: 48,
    foundation: 'blocks',
    compaction: 'hand tamper',
    pad: 'none',
    spares: 5,
    laborRate: 50,
    // The US average combined state and local sales tax (Tax Foundation, mid-2026: 7.53%); set your own.
    taxRate: 7.53,
    delivery: 'pickup',
    floorPanel: 'plywood',
    floorTreated: true,
    siding: true,
    sidingColor: 'natural',
    polkaDots: false,
    roofing: true,
    gableVents: true,
    ventWidth: 12,
    ventHeight: 8,
    maxPeak: 96,
    snowLoad: 30,
    windLoad: 20,
    autoWall: true,
    autoPitch: true,
    autoOverhang: true,
    roofColor: 'charcoal',
    trimColor: 'white',
    glitter: false,
    interior: 'none',
    insulation: false,
    sidingType: 'T1-11',
    wallTrim: '1x4',
    roofCover: 'shingles',
    rafterSeat: 'connector',
    maxFootprint: 100,
    kerf: 0.125,
    lengths: [...DEFAULT_LENGTHS_FT],
    openings: /** @type {Opening[]} */ ([
      { id: 'o1', kind: 'door', wall: 'front', offset: 53, width: 38.5, height: 78, product: 'site-built' },
      { id: 'o2', kind: 'window', wall: 'back', offset: 32, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
      { id: 'o3', kind: 'window', wall: 'back', offset: 98, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
    ]),
  };
}

/** The classic shape the presets start from: 8 ft walls, ridge board with rafter ties, unpainted siding, no height limit. */
/**
 * What the skids can sit on besides the gravel itself. Sizes are the block's
 * own (inches): its height, its length along the skid and its width across.
 * Every block sits on the compacted gravel pad.
 */
export const BLOCKS = {
  blocks: { name: 'solid concrete block, 4 x 8 x 16', plural: 'solid 4 x 8 x 16 concrete blocks', h: 4, along: 16, across: 8, item: 'concreteBlock' },
  'deck blocks': { name: 'concrete deck block (pier block)', plural: 'concrete deck blocks', h: 8, along: 11, across: 11, item: 'deckBlock' },
  CMU: { name: 'concrete masonry unit (CMU), 8 x 8 x 16, cores vertical', plural: '8 x 8 x 16 CMU blocks, cores vertical', h: 8, along: 16, across: 8, item: 'cmuBlock' },
};

const classic = () => ({ ...defaultDesign(), foundation: 'gravel', pad: 'full', wallHeight: 96, pitch: 6, skidSize: '4x6', roofType: 'ridgeBoard', sidingColor: 'natural', polkaDots: false, maxPeak: 0, ventHeight: 12, autoWall: false, autoPitch: false, autoOverhang: false, rafterSeat: 'birdsmouth', maxFootprint: 0, roofColor: 'charcoal', trimColor: 'white', glitter: false, interior: 'none' });

/** @typedef {ReturnType<typeof defaultDesign>} Design */

/** Starting points for the "New design" menu. */
export const PRESETS = {
  '8x10': () => ({ ...classic(), name: '8x10 gable shed', length: 120, width: 96, openings: [
    { id: 'o1', kind: 'door', wall: 'front', offset: 34, width: 52, height: 80 },
    { id: 'o2', kind: 'window', wall: 'right', offset: 32, width: 32, height: 24, sill: 48 },
  ] }),
  '8x12': () => defaultDesign(),
  '8x12 classic': () => ({ ...classic(), name: '8x12 gable shed', openings: defaultDesign().openings.map((o) => (o.kind === 'door' ? { id: o.id, kind: 'door', wall: 'front', offset: 53, width: 38, height: 82 } : { id: o.id, kind: 'window', wall: 'back', offset: o.offset, width: 24, height: 36, sill: 36 })) }),
  '10x12': () => ({ ...classic(), name: '10x12 gable shed', length: 144, width: 120, openings: [
    { id: 'o1', kind: 'door', wall: 'front', offset: 46, width: 52, height: 80 },
    { id: 'o2', kind: 'window', wall: 'left', offset: 44, width: 32, height: 24, sill: 48 },
    { id: 'o3', kind: 'window', wall: 'right', offset: 44, width: 32, height: 24, sill: 48 },
  ] }),
  '12x16': () => ({ ...classic(), name: '12x16 gable shed', length: 192, width: 144, pitch: 5, openings: [
    { id: 'o1', kind: 'door', wall: 'left', offset: 36, width: 72, height: 80 },
    { id: 'o2', kind: 'window', wall: 'front', offset: 36, width: 36, height: 36, sill: 42 },
    { id: 'o3', kind: 'window', wall: 'front', offset: 120, width: 36, height: 36, sill: 42 },
  ] }),
  '8x8 lean': () => ({ ...classic(), name: '8x8 garden shed', length: 96, width: 96, wallHeight: 84, pitch: 8, rafterSpacing: 24, openings: [
    { id: 'o1', kind: 'door', wall: 'left', offset: 22, width: 52, height: 72 },
  ] }),
};

const fmtSpan = (inches) => `${Math.round(inches / 12 * 10) / 10} ft`;

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

/**
 * Fill gaps and clamp nonsense so a half-typed form still draws something.
 * @param {Partial<Design>} input
 * @returns {Design}
 */
export function normalize(input) {
  const d = defaultDesign();
  const o = { ...d, ...input };
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const ids = new Set();
  const idOf = (id, i) => {
    let out = typeof id === 'string' && id.trim() ? id.slice(0, 40) : Number.isFinite(id) ? String(id) : `o${i + 1}`;
    for (let k = i + 1; ids.has(out); k++) out = `o${k}`;
    ids.add(out);
    return out;
  };
  const lengths = Array.isArray(o.lengths) ? o.lengths.map(Number).filter((n) => n >= 4 && n <= 24).sort((a, b) => a - b) : d.lengths;
  return {
    ...o,
    name: (typeof o.name === 'string' && o.name.trim() ? o.name : d.name).slice(0, 80),
    length: Math.min(480, Math.max(48, num(o.length, d.length))),
    width: Math.min(240, Math.max(48, num(o.width, d.width))),
    wallHeight: Math.min(144, Math.max(60, num(o.wallHeight, d.wallHeight))),
    pitch: Math.min(14, Math.max(2, num(o.pitch, d.pitch))),
    overhang: Math.min(36, Math.max(0, num(o.overhang, d.overhang))),
    studSize: pick(o.studSize, ['2x4', '2x6'], d.studSize),
    studSpacing: pick(num(o.studSpacing, 16), [12, 16, 24], 16),
    joistSize: pick(o.joistSize, ['2x4', '2x6', '2x8', '2x10', '2x12'], d.joistSize),
    joistSpacing: pick(num(o.joistSpacing, 16), [12, 16, 24], 16),
    rafterSize: pick(o.rafterSize, ['2x4', '2x6', '2x8', '2x10'], d.rafterSize),
    rafterSpacing: pick(num(o.rafterSpacing, 24), [12, 16, 24], 24),
    tieSize: pick(o.tieSize, ['2x4', '2x6'], d.tieSize),
    skidSize: pick(o.skidSize, ['4x4', '4x6'], d.skidSize),
    skidSpacing: Math.min(72, Math.max(24, num(o.skidSpacing, d.skidSpacing))),
    spares: Math.min(25, Math.max(0, num(o.spares, d.spares))),
    laborRate: Math.min(500, Math.max(0, num(o.laborRate, d.laborRate))),
    taxRate: Math.min(15, Math.max(0, num(o.taxRate, d.taxRate))),
    delivery: pick(o.delivery, ['pickup', 'homedepot', 'lowes'], d.delivery),
    pad: pick(o.pad, ['full', 'under blocks', 'none'], d.pad),
    floorPanel: pick(o.floorPanel, ['plywood', 'OSB'], d.floorPanel),
    compaction: pick(o.compaction, ['hand tamper', 'plate compactor'], d.compaction),
    foundation: pick(o.foundation, ['gravel', ...Object.keys(BLOCKS)], d.foundation),
    floorTreated: o.floorTreated !== false,
    siding: o.siding !== false,
    roofing: o.roofing !== false,
    gableVents: o.gableVents !== false,
    roofType: pick(o.roofType, ['ridgeBeam', 'ridgeBoard'], d.roofType),
    beamSize: pick(o.beamSize, ['2x8', '2x10', '2x12'], d.beamSize),
    maxPeak: Math.min(240, Math.max(0, num(o.maxPeak, d.maxPeak))),
    snowLoad: Math.min(150, Math.max(0, num(o.snowLoad, d.snowLoad))),
    windLoad: Math.min(80, Math.max(0, num(o.windLoad, d.windLoad))),
    sidingColor: pick(o.sidingColor, ['natural', 'unfinished', 'red', 'pink', 'hot pink', 'lavender', 'mint', 'gray', 'blue', 'green', 'white'], d.sidingColor),
    polkaDots: o.polkaDots === true,
    autoWall: o.autoWall === true,
    autoPitch: o.autoPitch === true,
    autoOverhang: o.autoOverhang === true,
    roofColor: pick(o.roofColor, ['charcoal', 'brown', 'pink', 'purple', 'teal'], d.roofColor),
    trimColor: pick(o.trimColor, ['white', 'purple', 'pink', 'black', 'gold'], d.trimColor),
    glitter: o.glitter === true,
    interior: pick(o.interior, ['none', 'OSB', 'plywood', 'drywall', 'beadboard', 'pegboard', 'teen bedroom'], d.interior),
    insulation: o.insulation === true,
    wallTrim: pick(o.wallTrim, ['1x4', 'none'], d.wallTrim),
    sidingType: pick(o.sidingType, ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement'], d.sidingType),
    roofCover: pick(o.roofCover, ['shingles', 'metal'], d.roofCover),
    rafterSeat: pick(o.rafterSeat, ['birdsmouth', 'connector'], d.rafterSeat),
    maxFootprint: Math.min(1000, Math.max(0, num(o.maxFootprint, d.maxFootprint))),
    ventWidth: Math.min(36, Math.max(6, num(o.ventWidth, d.ventWidth))),
    ventHeight: Math.min(36, Math.max(6, num(o.ventHeight, d.ventHeight))),
    kerf: Math.min(0.25, Math.max(0, num(o.kerf, d.kerf))),
    lengths: lengths.length ? lengths : d.lengths,
    // A product, when chosen, sets the rough opening to the maker's.
    // A saved file or a pasted link can carry anything; an opening that is not an object is dropped,
    // and one with a blank or repeated id gets a fresh one (the editor and the door parts go by id).
    openings: (Array.isArray(o.openings) ? o.openings : []).filter((op) => op && typeof op === 'object' && !Array.isArray(op)).map((op) => {
      const pr = productById(op.product);
      if (op.kind === 'door' && op.product === 'site-built') return op;
      return pr && pr.kind === (op.kind === 'window' ? 'window' : 'door') ? { ...op, width: pr.roW, height: pr.roH } : { ...op, product: undefined };
    }).map((op, i) => ({
      id: idOf(op.id, i),
      kind: op.kind === 'window' ? 'window' : 'door',
      wall: pick(op.wall, WALLS, 'front'),
      offset: Math.max(0, num(op.offset, 24)),
      width: Math.min(144, Math.max(12, num(op.width, 36))),
      height: Math.min(120, Math.max(12, num(op.height, 36))),
      ...(op.kind === 'window' ? { sill: Math.max(6, num(op.sill, 42)) } : {}),
      ...(TWO_BY.includes(op.header) ? { header: op.header } : {}),
      ...(op.product ? { product: String(op.product) } : {}),
    })),
  };
}

/** Outside length of a wall as you face it: eave walls run the shed's length, gable ends its width. */
export function wallFaceLength(design, wall) {
  return wall === 'front' || wall === 'back' ? design.length : design.width;
}

/** Where an opening's left edge sits along its wall's axis (x for eave walls, y for gable ends); offsets run from the left corner as seen from outside. */
export function axisStart(design, op) {
  if (op.wall === 'front' || op.wall === 'right') return op.offset;
  return wallFaceLength(design, op.wall) - op.offset - op.width;
}

/** Header depth by rough-opening width. A rule of thumb for a light shed, not a span table. */
export function defaultHeader(width) {
  if (width <= 48) return '2x6';
  if (width <= 72) return '2x8';
  if (width <= 96) return '2x10';
  return '2x12';
}

/** @param {Vec} a @param {Vec} b @param {number} k */
const add = (a, b, k = 1) => /** @type {Vec} */ ([a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]);

/** @returns {Geom} */
function rectGeom(origin, u, v, w, lu, lv, thickness) {
  return { origin, u, v, w, profile: [[0, 0], [lu, 0], [lu, lv], [0, lv]], thickness };
}

/**
 * Break a run longer than the longest board at framing centres.
 * @param {number} start @param {number} end @param {number} maxLen
 * @param {number[]} breaks positions a joint may land on (stud, joist or rafter centres)
 * @param {number[]} [avoid] joints to keep at least `minAway` from (a cap plate's from the top plate's)
 * @param {number} [minAway]
 * @returns {{ runs: [number, number][], forced: boolean }}
 */
export function splitRun(start, end, maxLen, breaks, avoid = [], minAway = 0) {
  const runs = /** @type {[number, number][]} */ ([]);
  let cur = start;
  let forced = false;
  const sorted = [...breaks].sort((a, b) => a - b);
  while (end - cur > maxLen + 1e-9) {
    const ok = (b) => b > cur + 12 && b <= cur + maxLen + 1e-9 && b < end - 6 && avoid.every((a) => Math.abs(a - b) >= minAway);
    let cand = sorted.filter(ok);
    if (!cand.length) cand = sorted.filter((b) => b > cur + 12 && b <= cur + maxLen + 1e-9 && b < end - 6);
    let b;
    if (cand.length) b = cand[cand.length - 1];
    else { b = cur + maxLen; forced = true; }
    runs.push([cur, b]);
    cur = b;
  }
  runs.push([cur, end]);
  return { runs, forced };
}

/**
 * Every way to break a run at framing centres into pieces no longer than
 * maxLen (with splitRun's limits on stubs), each joint passing `ok`, longest
 * first piece first, so the first answer is splitRun's when that one is
 * allowed. Stops after `limit` dead ends.
 * @param {number} start @param {number} end @param {number} maxLen
 * @param {number[]} breaks @param {(b: number) => boolean} ok @param {number} limit
 * @returns {Generator<number[]>}
 */
/** IRC R602.3.2: end joints in double top plates offset at least 24". */
export const PLATE_OFFSET_MIN = 24;

export function* jointSets(start, end, maxLen, breaks, ok, limit) {
  const sorted = [...breaks].sort((a, b) => b - a);
  let budget = limit;
  /** @returns {Generator<number[]>} */
  function* from(c) {
    if (end - c <= maxLen + 1e-9) { yield []; return; }
    for (const b of sorted) {
      if (budget <= 0) return;
      if (!(b > c + 12 && b <= c + maxLen + 1e-9 && b < end - 6 && ok(b))) continue;
      let any = false;
      for (const rest of from(b)) { any = true; yield [b, ...rest]; }
      if (!any) budget -= 1;
    }
  }
  yield* from(start);
}

/** Layout centres k*spacing between two limits, measured from the building corner. */
function layoutCenters(spacing, lo, hi) {
  const out = [];
  for (let c = spacing; c < hi; c += spacing) if (c > lo) out.push(c);
  return out;
}

/**
 * Build the whole shed.
 * @param {Partial<Design>} input
 */
export function buildShed(input) {
  const d0 = normalize(input);
  // The page, the swaps, the options and the simplicity search rebuild the same
  // designs again and again; a built shed is never modified, so keep recent ones.
  const key = JSON.stringify(d0);
  const hit = BUILT.get(key);
  if (hit) { BUILT.delete(key); BUILT.set(key, hit); return hit; }
  const shed = d0.autoWall || d0.autoPitch || d0.autoOverhang ? buildAuto(d0) : buildFramed(d0);
  BUILT.set(key, shed);
  if (BUILT.size > 200) BUILT.delete(BUILT.keys().next().value);
  return shed;
}

/** Recently built sheds by normalized design, least recently used first. @type {Map<string, Shed>} */
const BUILT = new Map();

/** Lowest wall (floor to top of plates) that frames every door and window with its header. */
export function minWallFor(d) {
  let need = 60;
  for (const op of d.openings) {
    const bottom = op.kind === 'window' ? op.sill ?? 42 : 0;
    need = Math.max(need, bottom + op.height + actual(op.header || defaultHeader(op.width)).depth + 3);
  }
  return Math.ceil(need * 8) / 8;
}

/**
 * Let the doorway and the height limit set the walls and the roof: walls as low
 * as the tallest opening allows, and the steepest whole pitch whose peak stays
 * under the limit. When no pitch fits, the lowest pitch at which the gable vents
 * still fit is used and the warning says by how much the limit is missed.
 * @param {Design} d0
 */
function buildAuto(d0) {
  let d = { ...d0, autoWall: false, autoPitch: false, autoOverhang: false };
  if (d0.autoWall) d.wallHeight = minWallFor(d0);
  let shed;
  let why = '';
  if (d0.autoPitch) {
    // The peak rises with the pitch and so does the room for a gable vent, so
    // both searches are binary searches over the whole pitches 3 to 12.
    const at = new Map();
    const build = (p) => { if (!at.has(p)) at.set(p, buildFramed(normalize({ ...d, pitch: p }))); return at.get(p); };
    /** The first pitch in [lo, hi] where ok holds, if ok is false below some pitch and true above. */
    const firstTrue = (lo, hi, ok) => { while (lo < hi) { const mid = (lo + hi) >> 1; if (ok(build(mid))) hi = mid; else lo = mid + 1; } return lo; };
    const fits = (s) => !d0.maxPeak || s.dims.peak <= d0.maxPeak + 1e-9;
    if (!d0.maxPeak) {
      shed = build(12);
      why = 'the steepest the tool offers with no height limit';
    } else if (fits(build(3))) {
      // Steepest that fits: the last pitch before the first that does not.
      shed = build(firstTrue(3, 13, (s) => !fits(s)) - 1);
      why = `the steepest whole pitch that keeps the peak under ${fmtFt(d0.maxPeak)}`;
    }
    if (!shed) {
      const ventsFit = (s) => !d0.gableVents || Object.keys(s.vents).length === 2;
      const p = ventsFit(build(12)) ? firstTrue(3, 12, ventsFit) : 12;
      shed = build(p);
      why = d0.gableVents ? 'the lowest pitch at which the gable vents still fit, since no pitch meets the height limit' : 'the lowest pitch for a shingle roof, since no pitch meets the height limit';
    }
  } else {
    shed = buildFramed(normalize(d));
  }
  let s = /** @type {Shed} */ (shed);
  let overhangWhy = '';
  if (d0.autoOverhang) {
    // The longest overhang from 6" to 18" that needs no more lumber money than the shortest:
    // past that point the rafters (or sub-fascia) need longer boards.
    // Only some materials change from try to try, so only those are re-priced;
    // the others cost the same in every try and cannot change which is cheapest.
    const tries = [];
    for (let oh = 6; oh <= 18; oh++) {
      const t = buildFramed(normalize({ ...s.design, autoWall: false, autoPitch: false, autoOverhang: false, overhang: oh }));
      tries.push({ oh, t, cost: 0 });
    }
    // A material is re-priced if its cut list differs between any two tries.
    const cutList = (t, mat) => t.members.filter((m) => m.material === mat).map((m) => m.length).sort((a, b) => a - b).join(',');
    const mats = [...new Set(tries.flatMap((x) => x.t.members.map((m) => m.material)))];
    const moved = mats.filter((mat) => new Set(tries.map((x) => cutList(x.t, mat))).size > 1);
    for (const x of tries) x.cost = lumberCostOf(x.t, moved);
    const min = Math.min(...tries.map((x) => x.cost));
    const best = tries.filter((x) => x.cost <= min + 0.01).pop();
    s = /** @type {any} */ (best).t;
    overhangWhy = `overhang ${fmtIn(s.design.overhang)}, the longest that needs no longer rafter boards (the rafters are ${fmtIn(s.dims.rafterCut)})`;
  }
  const auto = [];
  if (d0.autoWall) auto.push(`walls ${fmtFt(s.design.wallHeight)}, the lowest that frames the tallest door or window`);
  if (d0.autoPitch) auto.push(`roof ${s.design.pitch}/12, ${why}`);
  if (overhangWhy) auto.push(overhangWhy);
  s.notes.unshift(`Set for you: ${auto.join('; ')}.`);
  s.design = { ...s.design, autoWall: d0.autoWall, autoPitch: d0.autoPitch, autoOverhang: d0.autoOverhang };
  return s;
}

/** @param {Design} d */
function buildFramed(d) {
  /** @type {Member[]} */
  const members = [];
  /** @type {{ id: string, kind: string, item: string, geom: Geom, group: string, wall?: string, side?: string, pos?: number[] }[]} */
  const panels = [];
  /** @type {{ kind: string, geom: Geom, group: string, tex?: string, from?: number, bottom?: number }[]} */
  const fixtures = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const notes = [];
  const counters = {};
  const nextId = (p) => { counters[p] = (counters[p] || 0) + 1; return `${p}${counters[p]}`; };

  const L = d.length;
  const W = d.width;
  const maxStock = Math.max(...d.lengths) * 12;
  const X = /** @type {Vec} */ ([1, 0, 0]);
  const Y = /** @type {Vec} */ ([0, 1, 0]);
  const Z = /** @type {Vec} */ ([0, 0, 1]);
  const neg = (v) => /** @type {Vec} */ ([-v[0], -v[1], -v[2]]);
  const treated = (n) => (d.floorTreated ? `PT ${n}` : n);

  const push = (m) => { members.push(m); return m; };

  // ---------------- Foundation ----------------
  const skid = actual(d.skidSize); // laid on edge: thick across, depth up
  const block = /** @type {any} */ (BLOCKS)[d.foundation] || null;
  const blockH = block ? block.h : 0;
  const skidTop = blockH + skid.depth;
  let skidCount = Math.max(2, Math.ceil((W - skid.thick) / d.skidSpacing) + 1);
  // A ridge beam brings about half its load down each gable post to the floor
  // at mid-width. An odd number of skids puts one right under the posts;
  // otherwise the post lands mid-span on the end joist (a 10x12 at 48" skid
  // spacing put 1,403 lb there, 1.38 times a single 2x6 joist's allowable bending).
  if (d.roofType === 'ridgeBeam' && skidCount % 2 === 0) skidCount += 1;
  const skidYs = [];
  for (let i = 0; i < skidCount; i++) skidYs.push(skid.thick / 2 + (i * (W - skid.thick)) / (skidCount - 1));
  const skidSplit = splitRun(0, L, maxStock, [], [], 0);
  if (skidSplit.runs.length > 1) {
    notes.push(`Skids are longer than the longest board you allowed (${maxStock / 12} ft), so each is spliced; stagger the joints between skids${block ? ' and land each joint on a block' : ''}.`);
  }
  // Even pieces read better than one long and one stub.
  const skidPieces = skidSplit.runs.length;
  // Block centres along each skid: one at each end, one under every skid joint
  // (a butt joint between blocks would hang in the air), and more between so no
  // two are over 4 ft apart. Without a joint this is the even layout of
  // ceil(L / 4 ft) + 1 blocks.
  const blockXs = [];
  if (block) {
    const fixed = [0];
    for (let k = 1; k < skidPieces; k++) fixed.push((L * k) / skidPieces - block.along / 2);
    fixed.push(L - block.along);
    if (skidPieces === 1) {
      const n = Math.ceil(L / 48) + 1;
      for (let k = 0; k < n; k++) blockXs.push((k * (L - block.along)) / (n - 1));
    } else {
      for (let i = 0; i + 1 < fixed.length; i++) {
        const n = Math.max(1, Math.ceil((fixed[i + 1] - fixed[i]) / 48 - 1e-9));
        for (let k = 0; k < n; k++) blockXs.push(fixed[i] + (k * (fixed[i + 1] - fixed[i])) / n);
      }
      blockXs.push(fixed[fixed.length - 1]);
    }
  }
  skidYs.forEach((y, i) => {
    for (let k = 0; k < skidPieces; k++) {
      const s0 = (L * k) / skidPieces;
      const s1 = (L * (k + 1)) / skidPieces;
      push({
        id: nextId('SK'), group: 'foundation', kind: 'skid', material: `PT ${d.skidSize}`, length: ceil16(s1 - s0),
        note: skidPieces > 1 ? 'butt joint, stagger between skids' : undefined,
        geom: rectGeom([s0, y - skid.thick / 2, blockH], X, Z, Y, s1 - s0, skid.depth, skid.thick),
        local: { s0, s1, z0: y - skid.thick / 2, z1: y + skid.thick / 2 },
      });
    }
    if (block) {
      for (const x of blockXs) {
        fixtures.push({ kind: 'block', group: 'foundation', geom: rectGeom([x, y - block.across / 2, 0], X, Z, Y, block.along, block.h, block.across) });
      }
    }
  });
  const blockCount = skidCount * blockXs.length;
  const pad = 12;
  // With blocks, the gravel can go under each block alone (a 4"-deep bed 2" wider
  // than the block all round, from bags) instead of under the whole shed.
  const underBlocks = Boolean(block) && d.pad === 'under blocks';
  // Or no gravel at all: the blocks sit on stripped, tamped firm soil.
  const noPad = Boolean(block) && d.pad === 'none';
  let baseCuFt = 0;
  if (noPad) {
    // nothing under the blocks but the ground
  } else if (underBlocks) {
    for (const f of fixtures.filter((x) => x.kind === 'block')) {
      const o = f.geom.origin;
      fixtures.push({ kind: 'gravel', group: 'foundation', geom: rectGeom([o[0] - 2, o[1] - 2, -4], X, Z, Y, block.along + 4, 4, block.across + 4) });
      baseCuFt += ((block.along + 4) * (block.across + 4) * 4) / 1728;
    }
  } else {
    fixtures.push({ kind: 'gravel', group: 'foundation', geom: rectGeom([-pad, -pad, -4], X, Z, Y, L + 2 * pad, 4, W + 2 * pad) });
  }
  const gravelCuYd = underBlocks || noPad ? 0 : ((L + 2 * pad) * (W + 2 * pad) * 4) / 46656;

  // ---------------- Floor ----------------
  const joist = actual(d.joistSize);
  const jz = skidTop;
  const floorTop = jz + joist.depth + 0.75;
  const joistCenters = [0.75, ...layoutCenters(d.joistSpacing, 0.75 + 1.5, L - 0.75 - 1.5), L - 0.75];
  const rimSplit = splitRun(0, L, maxStock, joistCenters);
  for (const y0 of [0, W - 1.5]) {
    for (const [s0, s1] of rimSplit.runs) {
      push({
        id: nextId('RJ'), group: 'floor', kind: 'rim joist', material: treated(d.joistSize), length: ceil16(s1 - s0),
        note: rimSplit.runs.length > 1 ? 'splice centred on a joist' : undefined,
        geom: rectGeom([s0, y0, jz], X, Z, Y, s1 - s0, joist.depth, 1.5),
        local: { s0, s1, z0: y0, z1: y0 + 1.5 },
      });
    }
  }
  for (const c of joistCenters) {
    push({
      id: nextId('FJ'), group: 'floor', kind: 'floor joist', material: treated(d.joistSize), length: ceil16(W - 3),
      geom: rectGeom([c - 0.75, 1.5, jz], Y, Z, X, W - 3, joist.depth, 1.5),
      local: { s0: c - 0.75, s1: c + 0.75, z0: 1.5, z1: W - 1.5 },
    });
  }
  if (W - 3 > maxStock) warnings.push(`Floor joists need ${Math.ceil((W - 3) / 12)} ft boards; add that length to your stock list or add a centre beam (not modelled).`);
  // Floor sheets: 8 ft across the joists, rows of 4 ft, odd rows staggered half a sheet.
  /** @type {number[]} */
  const floorPieces = [];
  const floorRows = Math.ceil(W / 48 - 1e-9);
  for (let r = 0; r < floorRows; r++) {
    const y0 = r * 48;
    const h = Math.min(48, W - y0);
    const cuts = [0];
    for (let x = r % 2 ? 48 : 96; x < L; x += 96) cuts.push(x);
    cuts.push(L);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const len = cuts[i + 1] - cuts[i];
      floorPieces.push(len);
      panels.push({ id: nextId('FS'), kind: 'floor sheet', item: 'floorSheet', group: 'floor', geom: rectGeom([cuts[i], y0, floorTop - 0.75], X, Y, Z, len, h, 0.75) });
    }
  }

  // ---------------- Walls ----------------
  const stud = actual(d.studSize);
  const D = stud.depth;
  const beam = d.roofType === 'ridgeBeam';
  const H = d.wallHeight;
  const studLen = H - 4.5;
  const plateTop = floorTop + H;
  if (studLen > maxStock) warnings.push(`Studs are ${Math.ceil(studLen / 12)} ft long, longer than any board you allowed.`);


  /** @type {Record<string, any>} */
  const walls = {};
  const wallSpecs = {
    front: { axis: X, start: 0, len: L, base: /** @type {Vec} */ ([0, 0, floorTop]), w: Y, eave: true },
    back: { axis: X, start: 0, len: L, base: /** @type {Vec} */ ([0, W, floorTop]), w: neg(Y), eave: true },
    left: { axis: Y, start: D, len: W - 2 * D, base: /** @type {Vec} */ ([0, D, floorTop]), w: X, eave: false },
    right: { axis: Y, start: D, len: W - 2 * D, base: /** @type {Vec} */ ([L, D, floorTop]), w: neg(X), eave: false },
  };
  const prefix = { front: 'F', back: 'B', left: 'L', right: 'R' };

  for (const name of WALLS) {
    const spec = wallSpecs[name];
    const { len, start } = spec;
    const P = prefix[name];
    /** @type {Member[]} */
    const wm = [];
    const addM = (kind, material, s0, s1, z0, z1, note) => {
      const m = push({
        id: nextId(`${P}`), group: `wall:${name}`, kind, material, note,
        length: ceil16(kind.includes('plate') || kind === 'header' || kind === 'rough sill' ? s1 - s0 : z1 - z0),
        geom: rectGeom(add(add(spec.base, spec.axis, s0), Z, z0), spec.axis, Z, spec.w, s1 - s0, z1 - z0, D),
        local: { s0, s1, z0, z1 },
      });
      wm.push(m);
      return m;
    };
    const endZone = spec.eave ? D + 1.5 : 1.5;
    // Openings on this wall, in framed coordinates, rejected if they do not fit.
    const ops = [];
    for (const op of d.openings.filter((o) => o.wall === name)) {
      const a = axisStart(d, op) - start;
      const hdr = op.header || defaultHeader(op.width);
      const hd = actual(hdr).depth;
      const bottom = op.kind === 'window' ? op.sill ?? 42 : 0;
      const headerTop = bottom + op.height + hd;
      const label = `${op.kind === 'door' ? 'Door' : 'Window'} ${op.width}" x ${op.height}" on the ${name} wall`;
      if (a - 3 < endZone - 1e-9 || a + op.width + 3 > len - endZone + 1e-9) {
        const off = op.offset + op.width > wallFaceLength(d, name);
        warnings.push(off
          ? `${label} runs past the end of the ${wallFaceLength(d, name) / 12} ft wall (it starts ${fmtIn(op.offset)} from the corner); it is left out. Slide it back onto the wall.`
          : `${label} is too close to a corner to frame with king and jack studs; it is left out of the framing.`);
        continue;
      }
      if (headerTop > H - 3 + 1e-9) {
        warnings.push(`${label} needs ${(headerTop + 3).toFixed(1)}" of wall with a ${hdr} header but the wall is ${H}"; it is left out. Lower it, use a shallower header or raise the wall.`);
        continue;
      }
      if (op.kind === 'window' && bottom < 4.5) {
        warnings.push(`${label} has its sill ${bottom}" above the floor; leave at least 4-1/2" for the plate and rough sill. It is left out.`);
        continue;
      }
      if (beam && !spec.eave && a - 3 < W / 2 + 1.5 - start && a + op.width + 3 > W / 2 - 1.5 - start) {
        warnings.push(`${label} is where the ridge-beam post runs down the gable wall; move it to one side. It is left out.`);
        continue;
      }
      const clash = ops.find((p) => a - 3 < p.a + p.w + 3 && a + op.width + 3 > p.a - 3);
      if (clash) {
        warnings.push(`${label} overlaps another opening's king studs; it is left out.`);
        continue;
      }
      ops.push({ op, a, w: op.width, hdr, hd, bottom, headerTop });
    }
    // Studs: ends, corner studs on eave walls, layout, then openings replace what they cover.
    const layout = layoutCenters(d.studSpacing, start, start + len).map((c) => c - start);
    const verticals = [];
    verticals.push({ s: 0, kind: 'stud' });
    verticals.push({ s: len - 1.5, kind: 'stud' });
    if (spec.eave) {
      verticals.push({ s: D, kind: 'corner stud' });
      verticals.push({ s: len - D - 1.5, kind: 'corner stud' });
    }
    if (beam && !spec.eave) {
      // Two studs under the ridge-beam post carry it down to the floor.
      verticals.push({ s: W / 2 - 1.5 - start, kind: 'post stud' });
      verticals.push({ s: W / 2 - start, kind: 'post stud' });
    }
    const occupied = (s0) => verticals.some((v) => s0 < v.s + 1.5 - 1e-9 && s0 + 1.5 > v.s + 1e-9);
    const inOpening = (s0) => ops.some((p) => s0 < p.a + p.w + 3 - 1e-9 && s0 + 1.5 > p.a - 3 + 1e-9);
    for (const c of layout) {
      const s0 = c - 0.75;
      if (s0 < 0 || s0 + 1.5 > len) continue;
      if (occupied(s0) || inOpening(s0)) continue;
      verticals.push({ s: s0, kind: 'stud' });
    }
    for (const v of verticals) addM(v.kind, d.studSize, v.s, v.s + 1.5, 1.5, 1.5 + studLen);
    const breakCenters = verticals.map((v) => v.s + 0.75);
    for (const p of ops) {
      const jack = p.bottom + p.op.height - 1.5;
      addM('king stud', d.studSize, p.a - 3, p.a - 1.5, 1.5, 1.5 + studLen);
      addM('king stud', d.studSize, p.a + p.w + 1.5, p.a + p.w + 3, 1.5, 1.5 + studLen);
      addM('jack stud', d.studSize, p.a - 1.5, p.a, 1.5, 1.5 + jack);
      addM('jack stud', d.studSize, p.a + p.w, p.a + p.w + 1.5, 1.5, 1.5 + jack);
      breakCenters.push(p.a - 2.25, p.a + p.w + 2.25);
      const hb = 1.5 + jack;
      const spacer = D - 3 > 0 ? `two plies with a ${D - 3}" plywood spacer` : 'two plies';
      for (let ply = 0; ply < 2; ply++) {
        const m = addM('header', p.hdr, p.a - 1.5, p.a + p.w + 1.5, hb, hb + p.hd, spacer);
        m.material = p.hdr;
        // Each ply is 1-1/2" thick: one at the outside face, one at the inside, the spacer between.
        const t0 = ply === 0 ? 0 : D - 1.5;
        m.geom = rectGeom(add(add(add(spec.base, spec.axis, p.a - 1.5), Z, hb), spec.w, t0), spec.axis, Z, spec.w, p.w + 3, p.hd, 1.5);
      }
      const inside = layout.filter((c) => c - 0.75 >= p.a - 1e-9 && c + 0.75 <= p.a + p.w + 1e-9).map((c) => c - 0.75);
      const crippleSpots = inside.length ? [...inside] : (p.w > 6 ? [p.a + p.w / 2 - 0.75] : []);
      // A layout line the king stud pushed aside (the layout stud would overlap
      // it) still carries a siding joint; a cripple over the jack on that side
      // gives the joint wood above the header.
      for (const [k0, jack0] of [[p.a - 3, p.a - 1.5], [p.a + p.w + 1.5, p.a + p.w]]) {
        const bumped = layout.some((c) => c - 0.75 < k0 + 1.5 - 1e-9 && c + 0.75 > k0 + 1e-9 && Math.abs(c - 0.75 - k0) > 1e-9);
        if (bumped && crippleSpots.every((x) => Math.abs(x - jack0) >= 1.5 - 1e-9)) crippleSpots.push(jack0);
      }
      const topGap = H - 3 - p.headerTop;
      if (topGap >= 1.5) {
        for (const s of crippleSpots) addM('top cripple', d.studSize, s, s + 1.5, p.headerTop, H - 3);
      } else if (topGap > 0.01) {
        notes.push(`${P} wall: the header over the ${p.op.kind} leaves a ${topGap.toFixed(2)}" gap to the top plate; fill it with plywood rather than cripples.`);
      }
      if (p.op.kind === 'window') {
        addM('rough sill', d.studSize, p.a, p.a + p.w, p.bottom - 1.5, p.bottom);
        // Sill cripples stay on the stud layout, in line with the studs, so a
        // siding joint on a layout line has wood under the window too. An
        // opening with fewer than two layout positions also gets one at each end.
        const ends = inside.length >= 2 ? [] : [p.a, p.a + p.w - 1.5];
        const below = [...ends, ...inside.filter((s) => ends.every((e) => Math.abs(s - e) >= 1.5 - 1e-9))].sort((x, y) => x - y);
        if (p.bottom - 3 >= 1.5) for (const s of below) addM('bottom cripple', d.studSize, s, s + 1.5, 1.5, p.bottom - 1.5);
      }
      fixtures.push({
        kind: p.op.kind, group: `wall:${name}`, from: spec.start + p.a, bottom: p.bottom,
        geom: rectGeom(add(add(spec.base, spec.axis, p.a), Z, p.bottom), spec.axis, Z, neg(spec.w), p.w, p.op.height, d.siding ? 1.0 : 0.4),
      });
    }
    // Plates: bottom plate is cut out at doors; top and cap plates break on studs, cap joints kept 4 ft from top joints.
    const doorGaps = ops.filter((p) => p.op.kind === 'door').map((p) => [p.a, p.a + p.w]).sort((a, b) => a[0] - b[0]);
    const bottomRuns = [];
    let cur = 0;
    for (const [g0, g1] of doorGaps) { if (g0 > cur) bottomRuns.push([cur, g0]); cur = g1; }
    if (cur < len) bottomRuns.push([cur, len]);
    for (const [r0, r1] of bottomRuns) {
      for (const [s0, s1] of splitRun(r0, r1, maxStock, breakCenters).runs) addM('bottom plate', d.studSize, s0, s1, 0, 1.5);
    }
    // The cap plate interlocks the corners: on the eave walls it stops one wall
    // depth short of each end, and the gable walls' cap runs that much long to
    // lap over the eave walls' top plate.
    const [c0, c1] = spec.eave ? [D, len - D] : [-D, len + D];
    let top = splitRun(0, len, maxStock, breakCenters);
    let topJoints = top.runs.slice(1).map((r) => r[0]);
    let cap = splitRun(c0, c1, maxStock, breakCenters, topJoints, 48);
    // The greedy split takes the longest top-plate piece first, which can leave
    // the cap no joint 4 ft clear of it (a window can remove the stud the cap
    // joint needs). Then choose both plates' joints together.
    // 4 ft is the aim; the IRC's minimum (R602.3.2) is 24", the fallback.
    const clearOf = (tj, gap) => (b) => tj.every((t) => Math.abs(t - b) >= gap - 1e-9);
    const capJoints = (r) => r.runs.slice(1).map((x) => x[0]);
    if (topJoints.length && !capJoints(cap).every(clearOf(topJoints, 48))) {
      search: for (const gap of [48, PLATE_OFFSET_MIN]) {
        for (const tj of jointSets(0, len, maxStock, breakCenters, () => true, 400)) {
          const cj = jointSets(c0, c1, maxStock, breakCenters, clearOf(tj, gap), 400).next().value;
          if (!cj) continue;
          const runs = (a, b, js) => /** @type {[number, number][]} */ ([a, ...js].map((x, i) => [x, [...js, b][i]]));
          top = { runs: runs(0, len, tj), forced: false };
          topJoints = tj;
          cap = { runs: runs(c0, c1, cj), forced: false };
          break search;
        }
      }
    }
    for (const [s0, s1] of top.runs) addM('top plate', d.studSize, s0, s1, H - 3, H - 1.5);
    for (const [s0, s1] of cap.runs) addM('cap plate', d.studSize, s0, s1, H - 1.5, H, spec.eave ? `stops ${D}" short of each end; the end walls' cap laps over it` : `runs ${D}" past each end to lap over the long walls`);
    if (top.runs.length > 1) notes.push(`${WALL_LABEL[name]}: plates are longer than your longest board, so they splice over studs; the cap plate's joints are kept 4 ft from the top plate's where the layout allows, and never under the code's 24".`);
    walls[name] = { name, len, start, members: wm, openings: ops, eave: spec.eave };
  }

  // ---------------- Roof ----------------
  const t = d.pitch / 12;
  const cos = 1 / Math.sqrt(1 + t * t);
  const sin = t * cos;
  const raf = actual(d.rafterSize);
  const rd = raf.depth;
  const plumbH = rd / cos;
  const o = d.overhang;
  const rh = beam ? 1.5 : 0.75; // half the ridge's thickness: one board, or a two-ply beam
  const r = W / 2 - rh;
  // With a birdsmouth the rafter's underside passes through the inside top edge of the plate;
  // on a variable-pitch connector (no notch) it rests on the outside top edge instead.
  const connector = d.rafterSeat === 'connector';
  const seatAt = connector ? 0 : D;
  const zb = (dist) => plateTop + (dist - seatAt) * t; // underside of rafter at a distance from the eave wall's outside face
  const zt = (dist) => zb(dist) + plumbH; // top of rafter
  const ridgeTop = zt(r);
  let ridgeSize = beam ? d.beamSize : TWO_BY.find((s) => TWO_BY.indexOf(s) > TWO_BY.indexOf(d.rafterSize) && actual(s).depth >= plumbH - 1e-9);
  if (beam && actual(d.beamSize).depth < plumbH - 1e-9) {
    warnings.push(`A ${d.beamSize} ridge beam is shallower than the rafters' ${plumbH.toFixed(2)}" plumb cut; choose a deeper beam.`);
  }
  if (!ridgeSize) {
    ridgeSize = '2x12';
    warnings.push(`At ${d.pitch}/12 the rafter's plumb cut is ${plumbH.toFixed(2)}" deep, more than a 2x12 ridge; use a built-up or engineered ridge.`);
  }
  const ridgeD = actual(ridgeSize).depth;
  if (!connector && D * t > rd / 3 + 1e-9) {
    warnings.push(`The birdsmouth is ${(D * t).toFixed(2)}" deep, more than a third of the ${d.rafterSize} rafter; a deeper rafter or lower pitch keeps more wood over the wall.`);
  }
  const rafterCut = ceil16((r + o) / cos + rd * Math.tan(Math.atan(t)));
  // The end rafters sit over the gable walls. An inner rafter (and the tie
  // nailed to its far side) must clear the gable wall's studs, so one that
  // lands within a wall's depth of an end moves in to the nearest clear spot;
  // that shortens its bay rather than widening one past the spacing.
  const innerLo = D + 0.75;
  const innerHi = L - D - 0.75 - (beam ? 0 : 1.5);
  const rafterCenters = [0.75, ...[...new Set(layoutCenters(d.rafterSpacing, 0.75 + 1.5, L - 0.75 - 1.5)
    .map((c) => Math.min(innerHi, Math.max(innerLo, c))))].filter((c) => innerLo <= innerHi), L - 0.75];
  /** @param {number} dist @param {boolean} back */
  const yOf = (dist, back) => (back ? W - dist : dist);
  const rafterProfile = (back) => {
    /** @type {[number, number][]} */
    const pts = [];
    if (o > 0) pts.push([yOf(-o, back), zb(-o)]);
    if (connector) pts.push([yOf(0, back), zb(0)], [yOf(r, back), zb(r)], [yOf(r, back), zt(r)], [yOf(-o, back), zt(-o)]);
    else pts.push([yOf(0, back), zb(0)], [yOf(0, back), plateTop], [yOf(D, back), plateTop], [yOf(r, back), zb(r)], [yOf(r, back), zt(r)], [yOf(-o, back), zt(-o)]);
    if (o === 0 && !connector) pts.splice(0, 1); // tail is the heel cut: start at the plate seat
    return pts;
  };
  const birdNote = connector
    ? `${d.pitch}/12 plumb cuts at ridge and tail; no birdsmouth: sits on a variable-pitch connector`
    : `${d.pitch}/12 plumb cuts at ridge and tail; birdsmouth ${((D * t)).toFixed(2).replace(/\.?0+$/, '')}" heel, ${D}" seat`;
  for (const c of rafterCenters) {
    for (const back of [false, true]) {
      push({
        id: nextId('RF'), group: 'roof', kind: 'rafter', material: d.rafterSize, length: rafterCut, note: birdNote,
        geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: rafterProfile(back), thickness: 1.5 },
      });
    }
  }
  // The metal you buy, shown where it goes: a variable-pitch connector's two side
  // plates at each rafter seat, and a hanger's two flanges where a rafter meets
  // the ridge beam (thin steel, so drawn 1/16" thick).
  {
    const steel = 1 / 16;
    const sides = (c) => [c - 0.75 - steel, c + 0.75];
    for (const c of rafterCenters) {
      for (const back of [false, true]) {
        if (connector) {
          for (const x of sides(c)) {
            const y0 = back ? W - D : 0;
            fixtures.push({ kind: 'connector', group: 'roof', geom: rectGeom([x, y0, plateTop], Y, Z, X, D, 3, steel) });
          }
        }
        if (beam) {
          for (const x of sides(c)) {
            const y0 = back ? W / 2 + rh : W / 2 - rh - 2;
            fixtures.push({ kind: 'connector', group: 'roof', geom: rectGeom([x, y0, zb(r) - 0.5], Y, Z, X, 2, Math.min(4.5, plumbH), steel) });
          }
        }
      }
    }
  }
  // Eave blocking: a block between each pair of rafters on top of each eave
  // wall, flush with the outside, its top bevelled to the roof. It closes the
  // wall top between rafters (screen or drill it for venting) and stops the
  // rafters rolling.
  {
    const topAt = (y) => zt(y) - plateTop;
    // A birdsmouth deep enough to leave no rafter above the plate's outside
    // edge leaves no room for a block either (the birdsmouth warning says so).
    if (topAt(0) > 0.5) {
    /** @type {[number, number][]} */
    const front = [[0, plateTop], [1.5, plateTop], [1.5, plateTop + topAt(1.5)], [0, plateTop + topAt(0)]];
    for (const back of [false, true]) {
      const prof = /** @type {[number, number][]} */ (front.map(([y, z]) => [yOf(y, back), z]));
      for (let i = 0; i + 1 < rafterCenters.length; i++) {
        // A rafter tie sits on the plate beside every rafter but the end ones; start past it.
        const tied = !beam && i > 0 && i < rafterCenters.length - 1 && zt(0) - plateTop > 0.5;
        const x0 = rafterCenters[i] + 0.75 + (tied ? 1.5 : 0);
        const gap = rafterCenters[i + 1] - 0.75 - x0;
        if (gap < 1) continue;
        push({
          id: nextId('EB'), group: 'roof', kind: 'eave blocking', material: d.rafterSize, length: ceil16(gap),
          note: `between rafters on the plate, top bevelled to ${d.pitch}/12`,
          geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: gap },
        });
      }
    }
    }
  }
  if (beam) {
    // Structural ridge beam: two plies, one piece each, rafters hung from it.
    for (const y0 of [W / 2 - 1.5, W / 2]) {
      push({
        id: nextId('RB'), group: 'roof', kind: 'ridge beam', material: ridgeSize, length: ceil16(L),
        note: 'two plies nailed together; one piece, bears on the gable posts',
        geom: rectGeom([0, y0, ridgeTop - actual(ridgeSize).depth], X, Z, Y, L, actual(ridgeSize).depth, 1.5),
      });
    }
    if (L > maxStock) warnings.push(`The ridge beam should be one piece ${Math.ceil(L / 12)} ft long; add that length to your board list.`);
    notes.push(`Ridge-beam roof: the beam carries the rafters (fix them with hangers), so there are no rafter ties and the inside is open to the roof. The beam size is your choice, not a span-table result; check it for a ${fmtSpan(L)} span and your snow load.`);
  } else {
    const ridgeSplit = splitRun(0, L, maxStock, rafterCenters);
    for (const [s0, s1] of ridgeSplit.runs) {
      push({
        id: nextId('RB'), group: 'roof', kind: 'ridge board', material: ridgeSize, length: ceil16(s1 - s0),
        note: ridgeSplit.runs.length > 1 ? 'joint centred on a rafter pair' : undefined,
        geom: rectGeom([s0, W / 2 - 0.75, ridgeTop - ridgeD], X, Z, Y, s1 - s0, ridgeD, 1.5),
      });
    }
  }
  // Rafter ties at plate height on every pair but the gable ends, which the gable wall ties.
  const tie = actual(d.tieSize);
  const topAt0 = zt(0) - plateTop;
  // On a flat, narrow roof the ridge can hang lower than the ties (or, for a
  // beam, the gable walls' plates) it has to clear.
  const ridgeBottom = ridgeTop - ridgeD;
  const clearAbove = beam ? plateTop : plateTop + tie.depth;
  if (ridgeBottom < clearAbove - 1 / 16) {
    warnings.push(`The ridge sits too low: its underside is ${fmtIn(clearAbove - ridgeBottom)} below the ${beam ? 'top of the gable walls' : 'tops of the rafter ties'}, so the two run into each other as drawn. Steepen the roof${beam ? ', use a shallower beam' : ''} or widen the shed.`);
  }
  if (beam) {
    // no ties: the ridge beam holds the rafters up, so they do not push the walls out
  } else if (topAt0 <= 0.5) {
    warnings.push('The rafters are too shallow over the wall for a rafter tie at the plate; deepen the rafters.');
  } else {
    const clipped = topAt0 < tie.depth;
    const dc = clipped ? D + (tie.depth - plumbH) / t : 0;
    /** @type {[number, number][]} */
    const prof = clipped
      ? [[0, plateTop], [W, plateTop], [W, plateTop + topAt0], [W - dc, plateTop + tie.depth], [dc, plateTop + tie.depth], [0, plateTop + topAt0]]
      : [[0, plateTop], [W, plateTop], [W, plateTop + tie.depth], [0, plateTop + tie.depth]];
    rafterCenters.slice(1, -1).forEach((c) => {
      push({
        id: nextId('RT'), group: 'roof', kind: 'rafter tie', material: d.tieSize, length: ceil16(W),
        note: clipped ? 'ends cut to the roof slope' : 'nail to rafter at the plate',
        geom: { origin: [c + 0.75, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 1.5 },
      });
    });
    if (W > maxStock) warnings.push(`Rafter ties need ${Math.ceil(W / 12)} ft boards; add that length to your stock list.`);
  }
  // Gable studs between the gable wall's top plate and the end rafter. With a
  // ridge board, one post sits under the ridge; with a ridge beam, a two-ply
  // post carries the beam down onto the post studs in the wall below. A gable
  // vent replaces the studs it covers with trimmers, a flat header as high as
  // the roof allows and a sill block. Under a ridge board the vent is centred;
  // under a beam the post is in the middle, so a pair of vents flanks it.
  const ventInfo = /** @type {Record<string, any[]>} */ ({});
  const postZone = beam ? [W / 2 - 1.5, W / 2 + 1.5] : [W / 2 - 0.75, W / 2 + 0.75];
  for (const name of ['left', 'right']) {
    const x0 = name === 'left' ? 0 : L - D;
    const gableMember = (kind, e0, e1, h0, h1, note, z0rel = 0) => {
      const m = push({
        id: nextId(name === 'left' ? 'LG' : 'RG'), group: `gable:${name}`, kind, material: d.studSize,
        length: ceil16(Math.max(h0, h1) - z0rel),
        note,
        geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: [[e0, plateTop + z0rel], [e1, plateTop + z0rel], [e1, plateTop + h1], [e0, plateTop + h0]], thickness: D },
        local: { s0: e0, s1: e1, z0: H + z0rel, z1: H + Math.max(h0, h1), top: [[e0, H + h0], [e1, H + h1]] },
      });
      walls[name].members.push(m);
      return m;
    };
    const rafterUnder = (y) => zb(Math.min(y, W - y)) - plateTop;
    /** @type {{ v0: number, v1: number, ventTop: number, ventBottom: number, headerTop: number }[]} */
    const vents = [];
    if (d.gableVents) {
      const vw = d.ventWidth;
      const vh = d.ventHeight;
      const spans = beam ? [[W / 2 - 1.5 - vw, W / 2 - 1.5], [W / 2 + 1.5, W / 2 + 1.5 + vw]] : [[W / 2 - vw / 2, W / 2 + vw / 2]];
      for (const [v0, v1] of spans) {
        const headerTop = Math.floor(Math.min(beam ? Infinity : ridgeBottom - plateTop, rafterUnder(v0), rafterUnder(v1)) * 8) / 8;
        const ventTop = headerTop - 1.5;
        const ventBottom = ventTop - vh;
        const outer = v0 < W / 2 ? v0 - 1.5 : v1 + 1.5;
        if (ventBottom - 1.5 < 0 || rafterUnder(outer) < 3) {
          warnings.push(`A ${vw}" x ${vh}" gable vent does not fit under the ${name} gable at ${d.pitch}/12${beam ? ' beside the ridge-beam post' : ''}; make it smaller, steepen the roof or widen the shed. ${beam ? 'They are' : 'It is'} left out.`);
          vents.length = 0;
          break;
        }
        vents.push({ v0, v1, ventTop, ventBottom, headerTop });
      }
    }
    const blocked = (e0, e1) => (e1 > postZone[0] - 1e-9 && e0 < postZone[1] + 1e-9) || vents.some((v) => e1 > v.v0 - 1.5 - 1e-9 && e0 < v.v1 + 1.5 + 1e-9);
    for (const c of layoutCenters(d.studSpacing, 0, W)) {
      const e0 = c - 0.75;
      const e1 = c + 0.75;
      if (blocked(e0 - (beam ? 0 : 1.5), e1 + (beam ? 0 : 1.5))) continue;
      const h0 = rafterUnder(e0);
      const h1 = rafterUnder(e1);
      if (Math.min(h0, h1) < 3) continue;
      gableMember('gable stud', e0, e1, h0, h1, `top cut to ${d.pitch}/12`);
    }
    // The post (under a centred vent, it stands on the vent header instead).
    const centreVent = vents.find((v) => v.v0 < W / 2 && v.v1 > W / 2);
    const postBase = centreVent ? centreVent.headerTop : 0;
    const postH = ridgeBottom - plateTop;
    if (postH - postBase >= 3) {
      if (beam) {
        for (const e0 of [W / 2 - 1.5, W / 2]) gableMember('beam post', e0, e0 + 1.5, postH, postH, 'square top under the ridge beam, over the post studs');
      } else {
        gableMember('ridge post', W / 2 - 0.75, W / 2 + 0.75, postH, postH, centreVent ? 'from the vent header to the ridge' : 'square top under the ridge', postBase);
      }
    }
    for (const v of vents) {
      const { v0, v1, ventTop, ventBottom } = v;
      for (const [e0, e1] of [[v0 - 1.5, v0], [v1, v1 + 1.5]]) {
        if (e1 > postZone[0] + 1e-9 && e0 < postZone[1] - 1e-9) continue; // the post is this side's trimmer
        gableMember('vent trimmer', e0, e1, rafterUnder(e0), rafterUnder(e1), `top cut to ${d.pitch}/12`);
      }
      for (const [kind, z0] of /** @type {[string, number][]} */ ([['vent header', ventTop], ['vent sill', ventBottom - 1.5]])) {
        const m = push({
          id: nextId(name === 'left' ? 'LG' : 'RG'), group: `gable:${name}`, kind, material: d.studSize, length: ceil16(v1 - v0),
          note: 'flat between the trimmers',
          geom: rectGeom([x0, v0, plateTop + z0], Y, Z, X, v1 - v0, 1.5, D),
          local: { s0: v0, s1: v1, z0: H + z0, z1: H + z0 + 1.5 },
        });
        walls[name].members.push(m);
      }
      const mid = (v0 + v1) / 2;
      if (ventBottom - 1.5 >= 1.5) gableMember('vent cripple', mid - 0.75, mid + 0.75, ventBottom - 1.5, ventBottom - 1.5, 'under the vent sill');
      fixtures.push({ kind: 'vent', group: `gable:${name}`, geom: rectGeom([name === 'left' ? 0 : L, v0, plateTop + ventBottom], Y, Z, name === 'left' ? neg(X) : X, v1 - v0, d.ventHeight, d.siding ? 1.0 : 0.4) });
    }
    if (vents.length) ventInfo[name] = vents.map((v) => ({ s0: v.v0, s1: v.v1, z0: H + v.ventBottom, z1: H + v.ventTop }));
  }

  // ---------------- Interior ----------------
  // A lining on the inside of every wall (OSB, plywood, drywall, beadboard or
  // pegboard), with the door and windows left open. "Teen bedroom" adds pink
  // paneling, posters, string lights along the plates, a rug and a beanbag. Poster art is generic and drawn in the
  // browser; the big poster can show a picture the viewer uploads.
  let interior = null;
  if (d.interior !== 'none') {
    const pt = 0.25;
    const faces = {
      front: { origin: /** @type {Vec} */ ([0, D, floorTop]), u: X, w: Y, from: D, to: L - D },
      back: { origin: /** @type {Vec} */ ([0, W - D, floorTop]), u: X, w: neg(Y), from: D, to: L - D },
      left: { origin: /** @type {Vec} */ ([D, 0, floorTop]), u: Y, w: X, from: D, to: W - D },
      right: { origin: /** @type {Vec} */ ([L - D, 0, floorTop]), u: Y, w: neg(X), from: D, to: W - D },
    };
    let sqft = 0;
    /** @type {Record<string, [number, number][]>} */
    const free = {};
    for (const name of WALLS) {
      const f = faces[name];
      const spec = wallSpecs[name];
      // Openings on this wall, in the face's axis coordinate, as [a0, a1, z0, z1].
      const holes = walls[name].openings.map((p) => [spec.start + p.a, spec.start + p.a + p.w, p.bottom, p.bottom + p.op.height]);
      const xs = [...new Set([f.from, f.to, ...holes.flatMap((h) => [h[0], h[1]])])].filter((x) => x >= f.from && x <= f.to).sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const x0 = xs[i]; const x1 = xs[i + 1];
        const cut = holes.filter((h) => h[0] < x1 - 1e-9 && h[1] > x0 + 1e-9).sort((a, b) => a[2] - b[2]);
        let z = 0;
        for (const h of [...cut, [0, 0, H, H]]) {
          if (h[2] > z + 0.5) {
            fixtures.push({ kind: 'lining', group: name === 'front' ? 'front lining' : 'interior', geom: rectGeom(add(add(f.origin, f.u, x0), Z, z), f.u, Z, f.w, x1 - x0, h[2] - z, pt) });
            sqft += ((x1 - x0) * (h[2] - z)) / 144;
          }
          z = Math.max(z, h[3]);
        }
      }
      // Free stretches of wall for posters: away from openings and corners.
      const spans = [];
      let cur = f.from + 4;
      for (const h of holes.sort((a, b) => a[0] - b[0])) { if (h[0] - 4 > cur) spans.push([cur, h[0] - 4]); cur = Math.max(cur, h[1] + 4); }
      if (f.to - 4 > cur) spans.push([cur, f.to - 4]);
      free[name] = /** @type {[number, number][]} */ (spans);
    }
    if (d.interior === 'teen bedroom') {
      // Big poster on the widest free stretch, then 18x24 posters on the rest.
      let bigAt = null;
      for (const name of WALLS) for (const sp of free[name]) if (sp[1] - sp[0] >= 40 && (!bigAt || sp[1] - sp[0] > bigAt.sp[1] - bigAt.sp[0])) bigAt = { name, sp };
      const posterAt = (name, x0, w, h, z0, tex) => {
        const f = faces[name];
        const o0 = add(add(add(f.origin, f.u, x0), Z, z0), f.w, pt + 0.05);
        fixtures.push({ kind: 'poster', group: name === 'front' ? 'front lining' : 'decor', tex, geom: rectGeom(o0, f.u, Z, f.w, w, h, 0.05) });
      };
      let n = 0;
      for (const name of WALLS) {
        for (const sp of free[name]) {
          let a = sp[0];
          let b = sp[1];
          if (bigAt && bigAt.name === name && bigAt.sp === sp) {
            const mid = (a + b) / 2;
            posterAt(name, mid - 18, 36, 48, 30, 'big');
            continue;
          }
          while (b - a >= 20 && n < 12) {
            posterAt(name, a + (b - a >= 44 ? (b - a - 40) / 2 : (b - a - 18) / 2), 18, 24, 52, `poster-${n % 4}`);
            n += 1;
            if (b - a >= 44) { posterAt(name, a + (b - a - 40) / 2 + 22, 18, 24, 52, `poster-${n % 4}`); n += 1; }
            a = b;
          }
        }
      }
      // String lights just under the top plates, one bulb every 8".
      let bulb = 0;
      for (const name of WALLS) {
        const f = faces[name];
        for (let x = f.from + 6; x < f.to - 6; x += 8) {
          fixtures.push({ kind: `bulb-${bulb++ % 4}`, group: name === 'front' ? 'front lining' : 'decor', geom: rectGeom(add(add(add(f.origin, f.u, x), Z, H - 8 - (bulb % 2) * 1.5), f.w, pt), f.u, Z, f.w, 1.6, 1.6, 1.6) });
        }
      }
      // A rug and a beanbag on the floor.
      fixtures.push({ kind: 'rug', group: 'decor', geom: rectGeom([L / 2 - 30, W / 2 - 20, floorTop], X, Y, Z, 60, 40, 0.4) });
      fixtures.push({ kind: 'beanbag', group: 'decor', geom: rectGeom([L - D - 34, W - D - 34, floorTop], X, Y, Z, 28, 28, 14) });
      fixtures.push({ kind: 'beanbag', group: 'decor', geom: rectGeom([L - D - 31, W - D - 31, floorTop + 14], X, Y, Z, 22, 22, 6) });
    }
    interior = { type: d.interior, sqft, panels: Math.ceil((sqft * 1.1) / 32), paint: d.interior === 'teen bedroom' ? 'pink' : 'white' };
  }

  // ---------------- Fascia, soffit, rake trim ----------------
  // A 2x6 sub-fascia nailed across the rafter tails (in the cut list), a 1x6
  // fascia board over it, a vented soffit on the underside of the tails, and a
  // 1x4 rake board up each gable edge (those three are bought, not cut from framing).
  const trim = { fasciaFt: 0, soffitSqFt: 0, rakeFt: 0 };
  if (o > 0) {
    const fz = zt(-o);
    const sf = actual('2x6');
    const fsplit = splitRun(0, L, maxStock, rafterCenters);
    for (const back of [false, true]) {
      const y0 = back ? W + o : -o - 1.5;
      for (const [s0, s1] of fsplit.runs) {
        push({
          id: nextId('SF'), group: 'roof', kind: 'sub-fascia', material: '2x6', length: ceil16(s1 - s0),
          note: fsplit.runs.length > 1 ? 'joint on a rafter tail' : 'across the rafter tails',
          geom: rectGeom([s0, y0, fz - sf.depth], X, Z, Y, s1 - s0, sf.depth, 1.5),
        });
      }
      fixtures.push({ kind: 'fascia', group: 'trim', geom: rectGeom([0, back ? W + o + 1.5 : -o - 1.5 - 0.75, fz - sf.depth - 0.5], X, Z, Y, L, sf.depth + 0.5, 0.75) });
      // Soffit on the underside of the tails, from the wall to the sub-fascia.
      const sv = /** @type {Vec} */ ([0, back ? -cos : cos, sin]);
      const sw = /** @type {Vec} */ ([0, back ? -sin : sin, -cos]);
      const start = /** @type {Vec} */ ([0, back ? W + o : -o, zb(-o)]);
      fixtures.push({ kind: 'soffit', group: 'trim', geom: rectGeom(start, X, sv, sw, L, o / cos, 0.3) });
    }
    trim.fasciaFt = (2 * L) / 12;
    trim.soffitSqFt = (2 * L * (o / cos)) / 144;
  }
  trim.rakeFt = (4 * ((W / 2 + o) / cos)) / 12;
  // Rake boards: a 3-1/2" band under the roof edge on each gable face, eave tail to peak.
  {
    const top = (dist) => zt(dist) + (7 / 16) / cos;
    const band = 3.5 / cos;
    /** @type {[number, number][]} */
    const prof = [[-o, top(-o) - band], [W / 2, top(W / 2) - band], [W + o, top(-o) - band], [W + o, top(-o)], [W / 2, top(W / 2)], [-o, top(-o)]];
    for (const x0 of [-0.75, L]) fixtures.push({ kind: 'fascia', group: 'trim', geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 0.75 } });
  }

  // ---------------- Sheathing, siding, roofing ----------------
  const slopeLen = (W / 2 + o) / cos; // eave tail to the ridge line, along the roof
  /** @type {number[]} */
  const roofPieces = [];
  const roofRows = Math.ceil(slopeLen / 48 - 1e-9);
  for (const back of [false, true]) {
    const vy = back ? -cos : cos;
    const eave = /** @type {Vec} */ ([0, yOf(-o, back), zt(-o)]);
    const v = /** @type {Vec} */ ([0, vy, sin]);
    const w = /** @type {Vec} */ ([0, back ? sin : -sin, cos]);
    for (let rr = 0; rr < roofRows; rr++) {
      const q0 = rr * 48;
      const h = Math.min(48, slopeLen - q0);
      const cuts = [0];
      for (let x = rr % 2 ? 48 : 96; x < L; x += 96) cuts.push(x);
      cuts.push(L);
      for (let i = 0; i + 1 < cuts.length; i++) {
        roofPieces.push(cuts[i + 1] - cuts[i]);
        {
          panels.push({ id: nextId('RS'), kind: 'roof sheathing', item: 'roofSheet', group: 'sheathing', side: back ? 'back' : 'front', pos: [cuts[i], q0], geom: rectGeom(add(add(eave, X, cuts[i]), v, q0), X, v, w, cuts[i + 1] - cuts[i], h, 7 / 16) });
        }
      }
    }
    if (d.roofing) {
      fixtures.push({ kind: 'shingles', group: 'roofing', geom: rectGeom(add(eave, w, 7 / 16), X, v, w, L, slopeLen, 0.35) });
    }
  }
  const roofAreaSqFt = (2 * slopeLen * L) / 144;

  const sidingT = d.sidingType === 'LP SmartSide' ? 3 / 8 : d.sidingType === 'LP SmartSide 7/16' ? 7 / 16 : 19 / 32;
  /** @type {{ wall: string, length: number }[]} */
  const sidingFull = [];
  /** @type {number[]} */
  const sidingUpper = [];
  if (d.siding) {
    const bottomZ = skidTop; // siding laps down over the rim joist
    const sheetFor = (h) => [96, 108, 120].find((s) => s >= h - 1e-9);
    for (const name of WALLS) {
      const eave = name === 'front' || name === 'back';
      const faceLen = eave ? L : W;
      const clip = (s) => (eave ? plateTop : zt(Math.min(s, W - s)));
      const origin = name === 'front' ? [0, 0, 0] : name === 'back' ? [0, W, 0] : name === 'left' ? [0, 0, 0] : [L, 0, 0];
      const u = eave ? X : Y;
      const w = name === 'front' ? neg(Y) : name === 'back' ? Y : name === 'left' ? neg(X) : X;
      for (let s0 = 0; s0 < faceLen - 1e-9; s0 += 48) {
        const s1 = Math.min(faceLen, s0 + 48);
        /** @type {[number, number][]} */
        const prof = [[s0, bottomZ], [s1, bottomZ], [s1, clip(s1)]];
        if (!eave && s0 < W / 2 && s1 > W / 2) prof.push([W / 2, clip(W / 2)]);
        prof.push([s0, clip(s0)]);
        const need = Math.max(...prof.map((p) => p[1])) - bottomZ;
        const sheet = sheetFor(need);
        if (sheet) sidingFull.push({ wall: name, length: sheet });
        else { sidingFull.push({ wall: name, length: 96 }); sidingUpper.push(Math.ceil(need - 96)); }
        panels.push({
          id: nextId('SD'), kind: 'siding', item: 'siding', group: 'siding', wall: name,
          geom: { origin: /** @type {Vec} */ (origin), u, v: Z, w, profile: prof, thickness: sidingT },
        });
      }
    }
  }

  // ---------------- Wall trim: 1x4 corner boards and casings ----------------
  // Nominal 1x4 (3/4 x 3-1/2) over the siding: a board on each face of every
  // corner (the eave-face board covers the edge of the gable-face one), and a
  // picture-frame casing round each door and window (no sill board under a door).
  /** @type {{ where: string, length: number }[]} */
  const wallTrim = [];
  if (d.siding && d.wallTrim !== 'none') {
    const tw = 3.5;
    const tt = 0.75;
    const bottomZ = skidTop;
    const rakeUnder = (dist) => zt(dist) + (7 / 16) / cos - 3.5 / cos;
    for (const name of WALLS) {
      const eave = name === 'front' || name === 'back';
      const faceLen = eave ? L : W;
      const origin = /** @type {Vec} */ (name === 'back' ? [0, W, 0] : name === 'right' ? [L, 0, 0] : [0, 0, 0]);
      const u = eave ? X : Y;
      const w = name === 'front' ? neg(Y) : name === 'back' ? Y : name === 'left' ? neg(X) : X;
      const at = add(origin, w, sidingT);
      const topAt = (s) => (eave ? plateTop : rakeUnder(Math.min(s, faceLen - s)));
      const board = (kind, prof, where) => {
        fixtures.push({ kind: 'casing', group: 'trim', geom: { origin: at, u, v: Z, w, profile: prof, thickness: tt } });
        const zs = prof.map((p) => p[1]);
        const ss = prof.map((p) => p[0]);
        wallTrim.push({ where, length: Math.ceil(kind === 'v' ? Math.max(...zs) - Math.min(...zs) : Math.max(...ss) - Math.min(...ss)) });
      };
      // Corner boards: eave faces reach past the gable siding and its board.
      const ends = eave ? [[-(sidingT + tt), tw - (sidingT + tt)], [faceLen + sidingT + tt - tw, faceLen + sidingT + tt]] : [[-sidingT, tw - sidingT], [faceLen + sidingT - tw, faceLen + sidingT]];
      for (const [s0, s1] of ends) board('v', [[s0, bottomZ], [s1, bottomZ], [s1, topAt(s1)], [s0, topAt(s0)]], `${name} corner`);
      const spec = wallSpecs[name];
      for (const p of walls[name].openings) {
        const a0 = spec.start + p.a;
        const a1 = a0 + p.w;
        const z0 = floorTop + p.bottom;
        const z1 = z0 + p.op.height;
        const door = p.op.kind === 'door';
                const label = `${p.op.kind} ${p.op.id}`;
        board('v', [[a0 - tw, z0], [a0, z0], [a0, z1], [a0 - tw, z1]], `${label} side`);
        board('v', [[a1, z0], [a1 + tw, z0], [a1 + tw, z1], [a1, z1]], `${label} side`);
        board('h', [[a0 - tw, z1], [a1 + tw, z1], [a1 + tw, z1 + tw], [a0 - tw, z1 + tw]], `${label} head`);
        if (!door) board('h', [[a0 - tw, z0 - tw], [a1 + tw, z0 - tw], [a1 + tw, z0], [a0 - tw, z0]], `${label} sill`);
      }
    }
  }

  // ---------------- Site-built doors ----------------
  // A shed door built on site: the siding cut out of the opening is the skin,
  // screwed and glued to a frame of 2x4s laid flat (two stiles, three rails and
  // a Z of two braces that runs down toward the hinges), hung on tee hinges with
  // a 1/4" gap all round. Over 48" wide it is a pair of doors.
  /** @type {any[]} */
  const doorParts = [];
  /** @type {{ id: string, leaves: number, w: number, h: number, railLen: number, braceLen: number, braceAngle: number }[]} */
  const doors = [];
  // Only the openings the walls could frame get built, bought and flashed; the
  // rest are left out with a warning.
  const framedOpenings = Object.values(walls).flatMap((w) => w.openings.map((p) => p.op));
  for (const op of framedOpenings.filter((x) => x.kind === 'door' && x.product === 'site-built')) {
    const leaves = op.width > 48 ? 2 : 1;
    const w = (op.width - 0.25 * (leaves + 1)) / leaves;
    const h = op.height - 0.5;
    const railLen = w - 7;
    const bay = (h - 3 * 3.5) / 2;
    const braceLen = Math.hypot(railLen, bay);
    const braceAngle = (Math.atan2(bay, railLen) * 180) / Math.PI;
    doors.push({ id: op.id, leaves, w, h, railLen, braceLen, braceAngle });
    // Pieces that are the same in both leaves and in every rail position share one note, so they share a part mark.
    for (let i = 0; i < leaves; i++) {
      const tag = `door ${op.id}`;
      const part = (kind, length, note) => doorParts.push({ id: nextId('DR'), group: 'door', kind, material: '2x4', length: Math.ceil(length * 8) / 8, note: `${tag}: ${note}` });
      part('door stile', h, 'laid flat, full height');
      part('door stile', h, 'laid flat, full height');
      for (let r = 0; r < 3; r++) part('door rail', railLen, 'top, middle and bottom rails between the stiles');
      part('door brace', braceLen + 3.5, `Z brace, ends cut at ${braceAngle.toFixed(0)} deg to fit between rails, low end at the hinge side`);
      part('door brace', braceLen + 3.5, `Z brace, ends cut at ${braceAngle.toFixed(0)} deg to fit between rails, low end at the hinge side`);
    }
  }

  const sidingArea = panels.filter((p) => p.kind === 'siding').reduce((t, p) => {
    let a2 = 0;
    const pts = p.geom.profile;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; a2 += x0 * y1 - x1 * y0; }
    return t + Math.abs(a2) / 2 / 144;
  }, 0);

  const dims = {
    length: L, width: W, wallHeight: H, pitch: d.pitch, overhang: o,
    skidTop, floorTop, plateTop, ridgeTop, peak: ridgeTop + (d.roofing ? 7 / 16 / cos + 0.35 / cos : 7 / 16 / cos),
    studLen, rafterCut, slopeLen, plumbH, ridgeSize, ridgeD, stud: D, joistDepth: joist.depth, rafterDepth: rd,
    skidCount, skidYs, joistCenters, rafterCenters, gravelCuYd, padSqFt: underBlocks || noPad ? 0 : ((L + 2 * pad) * (W + 2 * pad)) / 144, baseBags: Math.ceil(baseCuFt / 0.5), underBlocks, noPad, blockCount, block, roofAreaSqFt, floorRows, roofRows,
    heel: connector ? 0 : D * t, maxStock, connector,
  };

  if (d.siding && d.sidingColor === 'unfinished' && d.sidingType !== 'vinyl') {
    warnings.push(d.sidingType.startsWith('LP SmartSide')
      ? 'Unfinished LP SmartSide: the factory primer is not a finish. LP asks for a paint topcoat within 180 days of installing it to keep the warranty.'
      : 'Unfinished siding: bare wood and plywood siding grey, check and absorb water. Leaving it unfinished is a choice you can make, but paint or stain makes it last.');
  }
  if (d.siding && d.studSpacing > 16 && (d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide')) {
    warnings.push(`${d.sidingType === 'T1-11' ? 'T1-11' : 'LP SmartSide 3/8"'} panels are rated for studs at 16" on centre; at ${d.studSpacing}" use the 7/16" LP panel, lap siding over OSB, or studs at 16".`);
  }
  if (d.maxFootprint > 0 && (L * W) / 144 > d.maxFootprint + 1e-9) {
    warnings.push(`The footprint is ${((L * W) / 144).toFixed(0)} sq ft, over your ${d.maxFootprint} sq ft limit (often the size below which a shed needs no permit; check your local rule).`);
  }
  if (d.maxPeak > 0 && dims.peak > d.maxPeak + 1e-9) {
    const tallest = Math.max(0, ...Object.values(walls).flatMap((w) => w.openings.map((p) => p.headerTop)));
    const minWall = Math.max(60, Math.ceil((tallest + 3) * 2) / 2);
    const low = buildFramed(normalize({ ...d, wallHeight: minWall, pitch: 3, maxPeak: 0, autoWall: false, autoPitch: false })).dims.peak;
    warnings.push(`The peak is ${fmtFt(dims.peak)} above the gravel, ${fmtFt(dims.peak - d.maxPeak)} over your ${fmtFt(d.maxPeak)} limit. Your tallest opening needs walls of at least ${fmtFt(minWall)}; with those walls and a 3/12 roof (about the least that sheds water under shingles) the peak would still be ${fmtFt(low)}. To get lower: a shorter door, a door in the gable end, a lower floor or a narrower shed${d.gableVents ? ', or smaller or no gable vents (they need a steeper roof to fit)' : ''}.`);
  }

  return { design: d, members, panels, fixtures, walls, framedOpenings, warnings, notes, dims, vents: ventInfo, trim, wallTrim, doorParts, doors, interior, sidingArea, floorPieces, roofPieces, sidingFull, sidingUpper };
}

/** @typedef {ReturnType<typeof buildFramed>} Shed */
