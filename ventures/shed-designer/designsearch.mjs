// @ts-check
// Design search: many whole designs under your limits, each framed, priced and
// checked, and the ones nothing else beats on cost, storage and looks at once
// (the Pareto front).
//
// It answers "what is the best shed I can get under 100 sq ft for the least
// money" without starting from one design: it tries sizes that fit the
// footprint limit (8x12, 10x10, 7x14, 9x11 ...), a gable or a lean-to (one
// slope, tall front wall, low back wall), the ridge running either way,
// several door and window layouts and which door and window, ridge beam or
// ridge board, pitch, overhang, wall height, stud and rafter spacing, rafter
// and joist size, the foundation, the floor panel, the siding and the roof
// covering. Keys you fix (say the shingles and siding that match your house)
// are never changed.
//
// Every design kept passes every structural check (checks.mjs) and every
// load-path and connection check (connections.mjs). Cost is the estimate's
// materials total before tax. Storage and looks are defined below; looks is a
// heuristic score, documented term by term, and nothing more.
//
// Stable API (the gallery consumes it):
//   searchDesigns(opts)        -> { front, all, evaluated, rejected, constraints }
//   searchSteps(opts)          generator of progress, returning the same object
//   evaluateDesign(design, prices, constraints) -> Scored
//   storageOf(shed)            -> Storage
//   looksOf(shed)              -> Looks
//   paretoFront(scored, objectives)
//   picks(front)               -> named picks: cheapest, most storage, best looks, balanced
//   sizesUnder(maxSqFt, opts)  -> [{ length, width }] in inches
//   layoutOpenings(layout, size, roofType) -> the openings a layout puts on a size
//   LAYOUTS, DOORS, WINDOWS, OBJECTIVES, DEFAULT_CONSTRAINTS
// Fields are only ever added to these results, never renamed or removed.

import { buildShed, normalize, defaultDesign, minWallFor } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { storageOf as sharedStorage } from './storage.mjs';
import { LEVER_KNOBS, searchKeep } from './levers.mjs';

/**
 * @typedef {{ floorSqFt: number, clearHeightIn: number, wallHeightIn: number, wallVolumeCuFt: number, overheadCuFt: number,
 *   volumeCuFt: number, usableCuFt: number, shelfFt: number, headroom: number, overheadOpen: boolean, notes: string[] }} Storage
 * @typedef {{ key: string, label: string, points: number, max: number, why: string }} LooksTerm
 * @typedef {{ score: number, terms: LooksTerm[] }} Looks
 * @typedef {{ design: any, label: string, cost: number, storage: Storage, looks: Looks, ok: boolean,
 *   feasible: boolean, why: string[], worst: { member: string, ratio: number } | null,
 *   peak: number, wallHeight: number, footprintSqFt: number, layout?: string }} Scored
 */

/**
 * What the search maximises or minimises. Each reads one number off a scored design.
 * `storage` is the usable volume; `shelf` (wall length free of openings) can be
 * asked for in its place or as well.
 */
export const OBJECTIVES = {
  cost: { pick: 'Cheapest', label: 'Materials cost (before tax)', unit: '$', sense: -1, of: (/** @type {Scored} */ s) => s.cost },
  storage: { pick: 'Most storage', label: 'Storage volume', unit: 'cu ft', sense: 1, of: (/** @type {Scored} */ s) => s.storage.volumeCuFt },
  looks: { pick: 'Best looks', label: 'Looks (heuristic score)', unit: '/100', sense: 1, of: (/** @type {Scored} */ s) => s.looks.score },
  floor: { pick: 'Most floor', label: 'Floor area inside', unit: 'sq ft', sense: 1, of: (/** @type {Scored} */ s) => s.storage.floorSqFt },
  shelf: { pick: 'Most clear wall', label: 'Wall free of openings', unit: 'ft', sense: 1, of: (/** @type {Scored} */ s) => s.storage.shelfFt },
  // Storage you can load today: the room, the roof space when it is open to the room, and the space over a
  // decked loft or attic; not the space over bare ties, which needs decking first (storage.mjs, usableCuFt).
  usable: { pick: 'Most usable storage', label: 'Usable storage (open or decked)', unit: 'cu ft', sense: 1, of: (/** @type {Scored} */ s) => s.storage.usableCuFt },
};

/**
 * The limits a design must meet to be kept.
 * maxFootprint: outside framing length x width, sq ft (many places exempt a
 *   shed under 100 or 120 sq ft from a permit; some count the overhang, so check
 *   your local rule). maxPeak: inches above grade (0 = no limit). minWall and
 *   maxWall: floor to top of plates, inches; 8 ft sidewalls are customary. On
 *   a lean-to they bound the low back wall; the tall front wall is the roof's
 *   rise above it, held in by maxPeak.
 * minFootprintShare: sizes much smaller than the limit are skipped (they lose
 *   on storage to a size that uses the allowance), as a share of maxFootprint.
 * halfFeet: also try sides in 6" steps (four times the sizes).
 * maxUtilisation: the highest share of capacity any checked member may use.
 *   The checks are allowable-stress design, whose allowables already carry
 *   the NDS safety margin, so 1 is a code-level design; set 0.8 for more.
 */
export const DEFAULT_CONSTRAINTS = { maxFootprint: 100, minFootprintShare: 0.8, maxPeak: 156, minWall: 78, maxWall: 98, minSide: 72, maxSide: 192, halfFeet: false, maxUtilisation: 1 };

/**
 * Whole-foot (or, with halfFeet, half-foot) sizes whose outside footprint is within the limit
 * and at least minFootprintShare of it, both ways round (length is the ridge
 * direction), sides between minSide and maxSide inches.
 * @param {number} maxSqFt @param {Partial<typeof DEFAULT_CONSTRAINTS>} [c]
 */
export function sizesUnder(maxSqFt, c = {}) {
  const k = { ...DEFAULT_CONSTRAINTS, ...c };
  const out = [];
  for (let w = k.minSide; w <= k.maxSide; w += 6) {
    for (let l = k.minSide; l <= k.maxSide; l += 6) {
      const sq = (l * w) / 144;
      if (sq > maxSqFt + 1e-9 || sq < k.minFootprintShare * maxSqFt - 1e-9) continue;
      if (!k.halfFeet && (l % 12 || w % 12)) continue;
      out.push({ length: l, width: w });
    }
  }
  // Largest first, then nearest square.
  return out.sort((a, b) => b.length * b.width - a.length * a.width || Math.abs(a.length - a.width) - Math.abs(b.length - b.width));
}

/**
 * Doors the search can fit, by id: the site-built door (siding on a 2x4 Z
 * frame), a 32" prehung steel door and 48" double shed doors. Rough openings
 * are the makers' (products.mjs).
 */
export const DOORS = {
  'site-built': { kind: 'door', width: 38.5, height: 78, product: 'site-built' },
  'masonite-3280-flush': { kind: 'door', width: 34.25, height: 82, product: 'masonite-3280-flush' },
  'sr-48x72': { kind: 'door', width: 48, height: 71.25, product: 'sr-48x72' },
};
/** Windows the search can fit, by id: shed sliders. Each is set so its head lines up with the door head. */
export const WINDOWS = {
  'swm-1823': { kind: 'window', width: 18.25, height: 23.25, product: 'swm-1823' },
  'swm-1421': { kind: 'window', width: 14.25, height: 21.25, product: 'swm-1421' },
  'swm-h2427': { kind: 'window', width: 24.25, height: 27.25, product: 'swm-h2427' },
};

export const LAYOUTS = {
  'eave door, two windows opposite': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => [
    { ...DOOR, wall: 'front', offset: (L - DOOR.width) / 2 },
    ...(L >= 96 ? [{ ...WIN, wall: 'back', offset: L / 4 - WIN.width / 2 }, { ...WIN, wall: 'back', offset: (3 * L) / 4 - WIN.width / 2 }] : [{ ...WIN, wall: 'back', offset: (L - WIN.width) / 2 }]),
  ],
  'eave door between two windows': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => (L >= 120 ? [
    { ...DOOR, wall: 'front', offset: (L - DOOR.width) / 2 },
    { ...WIN, wall: 'front', offset: (L - DOOR.width) / 4 - WIN.width / 2 },
    { ...WIN, wall: 'front', offset: L - (L - DOOR.width) / 4 - WIN.width / 2 },
  ] : null),
  'gable door, a window each side': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => [
    { ...DOOR, wall: 'right', offset: (W - DOOR.width) / 2 },
    { ...WIN, wall: 'front', offset: (L - WIN.width) / 2 },
    { ...WIN, wall: 'back', offset: (L - WIN.width) / 2 },
  ],
  'gable door, window in the far gable': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => [
    { ...DOOR, wall: 'right', offset: (W - DOOR.width) / 2 },
    { ...WIN, wall: 'left', offset: (W - WIN.width) / 2 },
  ],
  'gable door, no windows': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => [
    { ...DOOR, wall: 'right', offset: (W - DOOR.width) / 2 },
  ],
  // Everything in the front wall (FRONT_WALL_LAYOUTS): on a lean-to that is the tall wall, so the low back wall
  // and the end walls can drop to the lowest you allow (and the back can stand against a fence).
  'eave door, no windows': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR) => [
    { ...DOOR, wall: 'front', offset: (L - DOOR.width) / 2 },
  ],
  // The window centred in the wall beyond the door, at least 18" clear of it and of the corner.
  'eave door and a window beside it': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR, /** @type {any} */ WIN) => {
    const doorEnd = L / 3 + DOOR.width / 2;
    const at = doorEnd + Math.max(18, (L - doorEnd - WIN.width) / 2);
    return at + WIN.width <= L - 18 ? [{ ...DOOR, wall: 'front', offset: L / 3 - DOOR.width / 2 }, { ...WIN, wall: 'front', offset: at }] : null;
  },
  // Clerestory: the door 12" from the left corner and a row of fixed 23 x 12 transoms along the rest of the
  // wall, high, their sills 6" over the door head: 6" apart (room for two king studs), 8" clear of the door
  // and 12" of the corner. On a lean-to that is the tall front wall, so they light the back of a shed
  // standing against a fence and leave the wall below them for shelves.
  'eave door and clerestory windows': (/** @type {number} */ L, /** @type {number} */ W, /** @type {any} */ DOOR) => {
    const T = CLERESTORY;
    const door = { ...DOOR, wall: 'front', offset: 12 };
    const a = 12 + DOOR.width + 8;
    const b = L - 12;
    const n = Math.floor((b - a + 6) / (T.width + 6) + 1e-9);
    if (n < 1) return null;
    const used = n * T.width + (n - 1) * 6;
    return [door, ...Array.from({ length: n }, (_, i) => ({ ...T, wall: 'front', offset: a + (b - a - used) / 2 + i * (T.width + 6), sill: DOOR.height + 6 }))];
  },
};

/** The clerestory window: a fixed 23 x 12 transom (products.mjs), set long side level. */
const CLERESTORY = { kind: 'window', width: 23.25, height: 12.25, product: 'swm-t2312' };

/** Share of the budget kept for the polish phase. */
const POLISH_SHARE = 0.35;
/** The lighter value of each framing knob, tried on every front design first. */
const LIGHT = { joistSize: '2x4', joistSpacing: 24, rafterSpacing: 24, studSpacing: 'auto', rafterSize: '2x4' };
/** Knobs the polish tries: they mostly move cost, and leave the plan and openings alone. */
const POLISH_KNOBS = ['joistSize', 'joistSpacing', 'rafterSpacing', 'studSpacing', 'rafterSize', 'overhang', 'wall', 'floorPanel', 'foundation', 'pad', 'blockSpacing', 'floor', 'roofCover', 'sidingType'];
/** The layouts that put every opening in the front wall: seeded for a lean-to, not a gable. */
const FRONT_WALL_LAYOUTS = ['eave door, no windows', 'eave door and a window beside it', 'eave door and clerestory windows'];

/** The knobs the search turns, each with its values. Keys in opts.fixed are left as the base has them. */
const KNOBS = {
  roofType: ['ridgeBoard', 'ridgeBeam', 'truss'],
  pitch: [4, 5, 6, 7, 8, 9],
  overhang: [6, 8, 9, 12],
  wall: ['auto', 88, 92, 97.125],
  // Only 'auto', the design's own default: 24" where the siding allows it and the studs pass, else 16"
  // (model.mjs autoStudSpacing). A fixed 16" beside it is the same shed with more studs, and a
  // fixed 24" passes only where auto already picks it; a spacing you fix is still searched as given.
  studSpacing: ['auto'],
  rafterSpacing: [16, 24],
  rafterSize: ['2x4', '2x6'],
  // Foundation and floor options and their limits live in levers.mjs.
  ...LEVER_KNOBS,
  sidingType: ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'fiber cement', 'LP SmartSide lap', 'vinyl', 'board and batten'],
  roofCover: ['shingles', 'metal'],
  door: Object.keys(DOORS),
  window: Object.keys(WINDOWS),
  // A deck you can load on a truss gable's bottom chords: attic storage (the
  // chords sized for 20 psf and decked). Storage counts the space over a deck
  // only (storage.mjs), so this and a gambrel's loft (below) are how the search
  // buys roof storage on a tied roof. Pinned off on any other roof.
  atticStorage: [false, true],
  // Gable, lean-to or gambrel (barn), tried last from each design (a lean-to has no ridge and a
  // gambrel its own trusses, so roofType does nothing to either).
  // and a saltbox (an off-centre ridge: its front at twice the back's pitch, the classic third-of-the-way ridge).
  style: ['gable', 'leanTo', 'gambrel', 'saltbox'],
  // A gambrel's own shape: its lower slope (18/12 to 24/12, the usual barn range), how far in the
  // bend sits (a fifth, a quarter or a third of the width), and a decked loft on its ties. They
  // change nothing on another style, so designAt pins them there and no design is built twice.
  gambrelLower: [20, 18, 22, 24],
  gambrelKnee: ['quarter', 'fifth', 'third'],
  loft: ['none', 'half', 'full'],
};

/** The knee knob in inches of run from the eave wall (0: the model's own quarter of the width). */
const KNEE_FRACTION = { fifth: 1 / 5, quarter: 0, third: 1 / 3 };

/**
 * Storage, by the one definition in storage.mjs (shared with the detail panel,
 * designfacts.mjs), rounded to 0.1. Volume is the search's storage objective.
 * @param {any} shed
 * @returns {Storage}
 */
export function storageOf(shed) {
  const s = sharedStorage(shed);
  return {
    floorSqFt: r1(s.floorSqFt), clearHeightIn: r1(s.clearHeightIn), wallHeightIn: r1(s.wallHeightIn), wallVolumeCuFt: r1(s.wallVolumeCuFt), overheadCuFt: r1(s.overheadCuFt),
    volumeCuFt: r1(s.volumeCuFt), usableCuFt: r1(s.usableCuFt), shelfFt: r1(s.shelfFt), headroom: r1(s.headroom), overheadOpen: s.overheadOpen, notes: s.notes,
  };
}

const r1 = (/** @type {number} */ x) => Math.round(x * 10) / 10;
/** Full points inside [lo, hi], falling linearly to zero `fall` beyond either end. */
const band = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ fall) => (x >= lo && x <= hi ? 1 : Math.max(0, 1 - (x < lo ? lo - x : x - hi) / fall));

/**
 * Looks: a heuristic score out of 100, the sum of the terms below. It encodes
 * common rules of thumb for small outbuildings, not a measurement of beauty,
 * and two people will disagree with it. Each term says why it scored what it did.
 * - pitch (20): full from 6/12 to 9/12, the range most house roofs use, so the
 *   shed reads as part of the house; less at shallower pitches. A lean-to's
 *   single slope reads as deliberate when it is low: full from 3/12 to 5/12,
 *   less as it steepens and the front wall towers. A saltbox: full for a back
 *   slope from 4/12 to 6/12 under a front at least half again as steep.
 * - roofShare (15): the roof's rise as a share of the gable end's height above
 *   grade, full from 30% to 45%; a thin roof on tall walls looks like a box.
 * - plan (10): footprint long side over short side, full from 1.2 to 1.6;
 *   exactly square is boxier, much longer looks like a corridor.
 * - overhang (15): full from 8" to 12"; none looks unfinished, deep looks heavy.
 * - walls (10): floor to plate from 84" to 98", the customary 7 to 8 ft
 *   sidewall; on a lean-to, the mean of its low and tall walls.
 * - symmetry (15): each wall's openings mirror about its centre within 2".
 * - windows (15): 8 for one window, 12 for two or more, and 3 more when every
 *   window head lines up with the door head within 1".
 * @param {any} shed
 * @returns {Looks}
 */
export function looksOf(shed) {
  const d = shed.design;
  const k = shed.dims;
  /** @type {LooksTerm[]} */
  const terms = [];
  const add = (key, label, max, frac, why) => terms.push({ key, label, max, points: r1(max * Math.max(0, Math.min(1, frac))), why });
  const lean = d.style === 'leanTo';
  const barn = d.style === 'gambrel';
  if (barn) {
    add('pitch', 'Roof pitch', 20, d.pitch >= 4 && d.pitch <= 8 ? 1 : d.pitch === 3 || d.pitch === 9 ? 0.6 : 0.3,
      `${d.gambrelLower}/12 below the bend and ${d.pitch}/12 above it; full marks for an upper slope from 4/12 to 8/12, the classic barn outline`);
  } else if (d.style === 'saltbox') {
    // A saltbox reads right when the long back is a house-like slope under a front about twice as steep.
    add('pitch', 'Roof pitch', 20, (d.pitch >= 4 && d.pitch <= 6 ? 1 : d.pitch === 3 || d.pitch === 7 ? 0.6 : 0.3) * (d.frontPitch >= 1.5 * d.pitch ? 1 : 0.7),
      `${d.frontPitch}/12 front and ${d.pitch}/12 back; full marks for a back from 4/12 to 6/12 under a front at least half again as steep, the classic saltbox`);
  } else if (lean) {
    add('pitch', 'Roof pitch', 20, d.pitch >= 3 && d.pitch <= 5 ? 1 : d.pitch === 6 || d.pitch === 2 ? 0.7 : d.pitch === 7 ? 0.4 : 0.15,
      `${d.pitch}/12 on one slope; full marks from 3/12 to 5/12, where a lean-to looks deliberate`);
  } else {
    add('pitch', 'Roof pitch', 20, d.pitch >= 6 && d.pitch <= 9 ? 1 : d.pitch === 5 || d.pitch === 10 ? 0.7 : d.pitch === 4 || d.pitch >= 11 ? 0.4 : 0.15,
      `${d.pitch}/12; full marks from 6/12 to 9/12, where most house roofs sit`);
  }
  const rise = k.peak - k.plateTop;
  const share = rise / k.peak;
  add('roofShare', 'Roof to wall proportion', 15, band(share, 0.3, 0.45, 0.15), `the roof is ${Math.round(share * 100)}% of the ${lean ? 'end wall' : 'gable end'}'s height; full from 30% to 45%`);
  const aspect = Math.max(d.length, d.width) / Math.min(d.length, d.width);
  add('plan', 'Footprint proportion', 10, band(aspect, 1.2, 1.6, 0.5), `long side ${aspect.toFixed(2)} times the short; full from 1.2 to 1.6`);
  // Half marks: a barn traditionally has none, but it is the one shape here that cannot have one.
  if (barn) add('overhang', 'Overhang', 15, 0.5, 'none, as on a barn: its steep lower slope carries the water past the wall; half marks');
  else add('overhang', 'Overhang', 15, band(d.overhang, 8, 12, 8), `${d.overhang}" at the eaves; full from 8" to 12"`);
  const wall = k.plateTop - k.floorTop + (lean ? k.rise / 2 : 0);
  add('walls', 'Sidewall height', 10, band(wall, 84, 98, 12), `${Math.round(wall)}" floor to plate${lean ? ' (the mean of the low and tall walls)' : ''}; full from 84" to 98"`);
  const walls = [...new Set(d.openings.map((o) => o.wall))];
  const sym = walls.filter((w) => {
    const len = w === 'front' || w === 'back' ? d.length : d.width;
    const ops = d.openings.filter((o) => o.wall === w).map((o) => ({ c: o.offset + o.width / 2, w: o.width, k: o.kind }));
    return ops.every((o) => ops.some((p) => p.k === o.k && Math.abs(p.w - o.w) < 1 && Math.abs(p.c + o.c - len) < 2));
  }).length;
  add('symmetry', 'Symmetry', 15, walls.length ? sym / walls.length : 1, `${sym} of ${walls.length} walls with openings are symmetric about their centre`);
  const wins = d.openings.filter((o) => o.kind === 'window');
  const doors = d.openings.filter((o) => o.kind === 'door');
  const doorHead = doors.length ? Math.max(...doors.map((o) => o.height)) : null;
  const aligned = wins.length > 0 && doorHead !== null && wins.every((o) => Math.abs((o.sill ?? 42) + o.height - doorHead) <= 1);
  add('windows', 'Windows', 15, ((wins.length >= 2 ? 12 : wins.length === 1 ? 8 : 0) + (aligned ? 3 : 0)) / 15,
    `${wins.length} window${wins.length === 1 ? '' : 's'}${aligned ? ', heads in line with the door head' : ''}`);
  return { score: r1(terms.reduce((t, x) => t + x.points, 0)), terms };
}

/**
 * Frame, price and check one design, and say whether it meets the constraints.
 * @param {any} design @param {import('./estimate.mjs').Prices} [prices]
 * @param {Partial<typeof DEFAULT_CONSTRAINTS>} [constraints]
 * @returns {Scored}
 */
export function evaluateDesign(design, prices, constraints = {}) {
  const c = { ...DEFAULT_CONSTRAINTS, ...constraints };
  const shed = buildShed(design, prices);
  const d = shed.design;
  const est = estimate(shed, prices);
  const sc = structuralChecks(shed);
  const cc = connectionChecks(shed);
  const why = [];
  for (const r of sc.rows) if (!r.ok || r.ratio > c.maxUtilisation + 1e-9) why.push(`${r.member} at ${Math.round(r.ratio * 100)}% of capacity`);
  if (!cc.ok) why.push('a load-path or connection check fails');
  // Warnings that mean the design is not buildable as drawn, or a product used outside its rating.
  for (const w of shed.warnings) if (/left out|does not fit|too low|too shallow|longer than any board|need \d+ ft boards|panels are rated for studs/.test(w)) why.push(w);
  const sq = (d.length * d.width) / 144;
  if (c.maxFootprint > 0 && sq > c.maxFootprint + 1e-9) why.push(`footprint ${sq.toFixed(1)} sq ft is over ${c.maxFootprint}`);
  if (c.maxPeak > 0 && shed.dims.peak > c.maxPeak + 0.01) why.push(`peak ${Math.round(shed.dims.peak)}" is over ${c.maxPeak}"`);
  const wall = shed.dims.plateTop - shed.dims.floorTop;
  if (wall < c.minWall - 0.01 || wall > c.maxWall + 0.01) why.push(`wall ${wall}" is outside ${c.minWall}" to ${c.maxWall}"`);
  const worstRow = sc.rows.reduce((m, r) => (!m || r.ratio > m.ratio ? r : m), /** @type {any} */ (null));
  return {
    design: d, label: d.name, cost: Math.round(est.total * 100) / 100, storage: storageOf(shed), looks: looksOf(shed),
    ok: sc.ok && cc.ok, feasible: why.length === 0, why,
    worst: worstRow ? { member: worstRow.member, ratio: Math.round(worstRow.ratio * 1000) / 1000 } : null,
    peak: Math.round(shed.dims.peak * 100) / 100, wallHeight: wall, footprintSqFt: r1(sq),
  };
}

/**
 * The designs no other beats: at least as good on every objective and better on one.
 * Ties on every objective keep the first. Sorted cheapest first when cost is an objective.
 * @param {Scored[]} scored @param {string[]} [objectives]
 */
export function paretoFront(scored, objectives = ['cost', 'storage', 'looks']) {
  const fs = objectives.map((o) => OBJECTIVES[o]);
  const v = (s) => fs.map((f) => f.sense * f.of(s)); // larger is better on every axis
  const vals = scored.map(v);
  const dominates = (a, b) => a.every((x, i) => x >= b[i] - 1e-9) && a.some((x, i) => x > b[i] + 1e-9);
  const out = [];
  const seen = new Set();
  scored.forEach((s, i) => {
    if (vals.some((w, j) => j !== i && dominates(w, vals[i]))) return;
    const key = vals[i].map((x) => x.toFixed(2)).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  });
  const ci = objectives.indexOf('cost');
  return ci >= 0 ? out.sort((a, b) => a.cost - b.cost) : out;
}

/**
 * Named picks from a front, for a gallery to lead with: the cheapest, the most
 * storage, the best looks, and the balanced one, nearest the ideal point once
 * each objective is scaled 0 to 1 across the front. Each pick says why.
 * @param {Scored[]} front @param {string[]} [objectives]
 * @returns {{ key: string, label: string, why: string, design: Scored }[]}
 */
export function picks(front, objectives = ['cost', 'storage', 'looks']) {
  if (!front.length) return [];
  const fs = objectives.map((o) => OBJECTIVES[o]);
  const lo = fs.map((f) => Math.min(...front.map((s) => f.sense * f.of(s))));
  const hi = fs.map((f) => Math.max(...front.map((s) => f.sense * f.of(s))));
  const norm = (s) => fs.map((f, i) => (hi[i] - lo[i] > 1e-9 ? (f.sense * f.of(s) - lo[i]) / (hi[i] - lo[i]) : 1));
  const best = (f) => front.reduce((m, s) => (f.sense * f.of(s) > f.sense * f.of(m) ? s : m));
  const out = [];
  for (const [i, key] of objectives.entries()) {
    const f = fs[i];
    const s = best(f);
    out.push({ key, label: f.pick, why: `${f.of(s)} ${f.unit}, the ${f.sense < 0 ? 'least' : 'most'} on the front`, design: s });
  }
  const dist = (s) => Math.hypot(...norm(s).map((x) => 1 - x));
  const bal = front.reduce((m, s) => (dist(s) < dist(m) ? s : m));
  out.push({ key: 'balanced', label: 'Balanced', why: 'nearest to best-on-everything, each objective scaled across the front', design: bal });
  return out;
}

/** Feet and inches for a name: 8x12, 9.5x10. */
const ft = (/** @type {number} */ x) => String(Math.round((x / 12) * 10) / 10);

/**
 * A layout's openings on one size, with ids. Under a ridge beam the post runs
 * down the middle of each gable wall, so an opening centred there moves to sit
 * just beside it (its king studs clear the post by 1-1/2"); a 38-1/2" door
 * then needs a gable wall of 8 ft 6 in, and on a narrower one it is left out
 * and the design is rejected.
 * @param {string} layout @param {{ length: number, width: number }} size @param {string} [roofType]
 * @param {string} [door] a DOORS id @param {string} [window] a WINDOWS id
 */
export function layoutOpenings(layout, size, roofType, door = 'site-built', window = 'swm-1823') {
  const D = DOORS[door] ?? DOORS['site-built'];
  const w = WINDOWS[window] ?? WINDOWS['swm-1823'];
  const ops = LAYOUTS[layout]?.(size.length, size.width, D, { ...w, sill: Math.max(30, D.height - w.height) });
  if (!ops) return null;
  const W = size.width;
  return ops.map((o, i) => {
    const gable = o.wall === 'left' || o.wall === 'right';
    const hits = gable && roofType === 'ridgeBeam' && o.offset - 3 < W / 2 + 1.5 && o.offset + o.width + 3 > W / 2 - 1.5;
    return { ...o, id: `o${i + 1}`, ...(hits ? { offset: W / 2 + 4.5 } : {}) };
  });
}

/**
 * The design for one point in the space.
 * @param {any} base @param {{ length: number, width: number }} size @param {string} layout @param {Record<string, any>} knobs
 */
function designAt(base, size, layout, knobs, minWall = DEFAULT_CONSTRAINTS.minWall) {
  const lean = knobs.style === 'leanTo';
  const ops = layoutOpenings(layout, size, lean ? undefined : knobs.roofType, knobs.door, knobs.window);
  if (!ops) return null;
  const { wall, door, window, ...rest } = knobs;
  // A lean-to has no ridge and a gambrel frames its own trusses: their roofType is pinned, so flipping it is not a new design to evaluate.
  const barn = knobs.style === 'gambrel';
  if (lean || barn) rest.roofType = 'ridgeBoard';
  if ('atticStorage' in rest && (lean || barn || rest.roofType !== 'truss')) rest.atticStorage = false;
  // The gambrel's own knobs: as the base has them on any other style (they would change nothing).
  if (!barn) for (const k of ['gambrelLower', 'gambrelKnee', 'loft']) delete rest[k];
  // A saltbox's front is twice its back's pitch, and it has no trusses (model.mjs builds a truss roof with a ridge board).
  const salt = knobs.style === 'saltbox';
  if (salt) {
    rest.frontPitch = Math.min(18, 2 * (rest.pitch ?? base.pitch));
    if (rest.roofType === 'truss') rest.roofType = 'ridgeBoard';
  }
  else if (typeof rest.gambrelKnee === 'string') {
    const f = KNEE_FRACTION[rest.gambrelKnee] ?? 0;
    rest.gambrelKnee = f ? Math.round(size.width * f * 2) / 2 : 0;
  }
  // On a lean-to the lowest wall that frames the openings is often a door's height under the
  // tall front wall's: 'auto' there is that, or the lowest back wall you allow if higher.
  const leanAuto = lean && wall === 'auto' ? Math.max(minWall, minWallFor(normalize({ ...base, ...rest, length: size.length, width: size.width, openings: ops }))) : 0;
  return normalize({
    ...base, ...rest,
    name: `${ft(Math.min(size.width, size.length))}x${ft(Math.max(size.width, size.length))}${size.width === size.length ? '' : `, ${lean ? 'tall wall along' : 'ridge along'} the ${ft(size.length)} ft side`}, ${lean ? 'lean-to' : barn ? 'gambrel barn' : `${salt ? 'saltbox, ' : ''}${rest.roofType === 'ridgeBeam' ? 'ridge beam' : 'ridge board'}`}, ${layout}`,
    length: size.length, width: size.width,
    autoWall: wall === 'auto' && !lean, ...(leanAuto ? { wallHeight: leanAuto } : wall === 'auto' ? {} : { wallHeight: wall }),
    autoPitch: false, autoOverhang: false, maxPeak: 0, maxFootprint: 0,
    ...studKnob(rest),
    openings: ops,
  });
}

/**
 * The stud-spacing knob as design fields: 'auto' keeps the design's own default,
 * a number is framed as picked.
 * @param {Record<string, any>} kn
 */
function studKnob(kn) {
  if (!('studSpacing' in kn)) return {};
  return kn.studSpacing === 'auto' ? { studSpacing: 16, autoStuds: true } : { autoStuds: false };
}

/**
 * The search as a generator: yields { evaluated, budget, front } after each
 * design so a page can show progress and stay responsive, and returns the result.
 *
 * Phase 1 seeds one design per size, ridge direction and layout at a lean
 * setting. Phase 2 is a Pareto local search: from each design on the current
 * front it tries every one-knob change, every other layout and every other size, adds what it finds, and repeats from
 * the new front until the budget is spent or the front stops changing. It
 * expands one design at a time, the best unexpanded one on each objective in
 * turn, so each end of the front is followed out early.
 *
 * @param {{ base?: any, prices?: import('./estimate.mjs').Prices, constraints?: Partial<typeof DEFAULT_CONSTRAINTS>,
 *   objectives?: string[], fixed?: string[], budget?: number, sizes?: { length: number, width: number }[], layouts?: string[],
 *   knobs?: Partial<Record<keyof typeof KNOBS, any[]>> }} [opts]
 */
export function* searchSteps(opts = {}) {
  const c = { ...DEFAULT_CONSTRAINTS, ...(opts.constraints ?? {}) };
  const base = normalize(opts.base ?? defaultDesign());
  const objectives = opts.objectives ?? ['cost', 'storage', 'looks'];
  // Your fixed keys, and the choices the design locks (levers.mjs: siding, roofing, foundation, floor, doors, windows).
  const fixed = new Set([...(opts.fixed ?? []), ...searchKeep(base).map((k) => (k === 'doors' ? 'door' : k === 'windows' ? 'window' : k))]);
  const budget = opts.budget ?? 2000;
  /** @type {Record<string, any[]>} */
  const knobs = {};
  // A fixed door or window is the base design's, when it is one the search knows.
  const baseProduct = (kind, list) => { const p = base.openings.find((o) => o.kind === kind)?.product; return p && p in list ? p : Object.keys(list)[0]; };
  const fixedValue = (k) => (k === 'studSpacing' && base.autoStuds ? 'auto' : k === 'wall' ? base.wallHeight : k === 'door' ? baseProduct('door', DOORS) : k === 'window' ? baseProduct('window', WINDOWS) : base[k]);
  for (const [k, vals] of Object.entries({ ...KNOBS, ...(opts.knobs ?? {}) })) knobs[k] = fixed.has(k) ? [fixedValue(k)] : vals;
  // Leaving the floor out is opt-in: the search keeps your floor unless opts.knobs.floor asks for both.
  if (!opts.knobs?.floor) knobs.floor = [base.floor];
  // A lean-to and a gambrel pin their roofType, so a roof structure you fixed rules them out.
  if (fixed.has('roofType') && knobs.roofType[0] !== 'ridgeBoard') knobs.style = knobs.style.filter((st) => st === 'gable');
  const sizes = opts.sizes ?? sizesUnder(c.maxFootprint > 0 ? c.maxFootprint : 100, c);
  const layouts = (opts.layouts ?? Object.keys(LAYOUTS)).filter((l) => !fixed.has('openings') && l in LAYOUTS);
  /** @type {Map<string, Scored>} */
  const seen = new Map();
  /** @type {Scored[]} */
  const all = [];
  let rejected = 0;
  /** @param {{ length: number, width: number }} size @param {string} layout @param {Record<string, any>} kn */
  const tryOne = (size, layout, kn) => {
    const d = layout ? designAt(base, size, layout, kn, c.minWall) : normalize({ ...base, ...kn, ...studKnob(kn) });
    if (!d) return null;
    const key = JSON.stringify({ ...d, name: '' });
    if (seen.has(key)) return null;
    const s = evaluateDesign(d, opts.prices, c);
    const rec = { ...s, layout, size, knobs: kn };
    seen.set(key, rec);
    if (rec.feasible) all.push(rec); else rejected++;
    return rec;
  };
  // The seed: 6/12, a foot of overhang, your foundation and floor where the search offers them, else the first option.
  const lean = Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, k === 'pitch' && v.includes(6) ? 6 : k === 'overhang' && v.includes(12) ? 12 : k in LEVER_KNOBS && v.includes(base[k]) ? base[k] : v[0]]));
  const front = () => paretoFront(all, objectives);
  const progress = () => ({ evaluated: seen.size, budget, feasible: all.length, rejected });
  // Phase 1: one lean design per size and layout; a structural failure there gets the stouter choices once.
  // Size by size. The layouts with everything in the front wall are a lean-to's (its tall wall):
  // gables are not seeded with them, which leaves a gable search as it was.
  const seeds = [];
  for (const size of sizes) for (const layout of (layouts.length ? layouts : [''])) seeds.push({ size, layout });
  // Each roof style is seeded on its own, so a lean-to front is found without a gable having to walk to it.
  // Lean-tos are seeded only when the budget is ample (20 evaluations a size); a quick search
  // reaches them, if at all, by the local search's one-knob step from a gable.
  const styles = knobs.style.includes('gable') ? knobs.style.filter((st) => st === 'gable' || budget >= 20 * sizes.length) : knobs.style;
  for (const style of styles) {
    for (const { size, layout } of seeds.filter((x) => style !== 'gable' || !FRONT_WALL_LAYOUTS.includes(x.layout) || fixed.has('openings'))) {
      if (seen.size >= budget) break;
      const seed = { ...lean, style, ...(style === 'leanTo' && knobs.pitch.includes(4) ? { pitch: 4 } : {}) };
      const r = tryOne(size, layout, seed);
      if (r && !r.feasible && !r.ok) tryOne(size, layout, { ...seed, ...Object.fromEntries(Object.entries(knobs).filter(([k]) => /Size$/.test(k)).map(([k, v]) => [k, v[v.length - 1]])), rafterSpacing: knobs.rafterSpacing[0] });
      yield progress();
    }
  }
  // Phase 2: Pareto local search, one knob at a time, one design at a time:
  // each step expands the unexpanded front design that is best on one
  // objective, taking the objectives in turn, so a cheaper (or roomier, or
  // better-looking) design found is itself expanded soon after.
  // While nothing passes yet, it searches out from the designs that failed on the fewest counts.
  // Each style other than the gable also searches out from its own front, so a lean-to is refined
  // until it can stand against the best gables rather than dropped while it is still a rough seed.
  const expanded = new Set();
  const keyOf = (s) => JSON.stringify({ ...s.design, name: '' });
  const styleFronts = styles.filter((st) => st !== 'gable');
  let step = 0;
  const exploreUntil = budget - Math.floor(budget * POLISH_SHARE);
  // The polish's share is held back only once something passes.
  while (seen.size < (all.length ? exploreUntil : budget)) {
    // The whole front first; once every design on it is expanded, each other style's own front,
    // so a lean-to still rough from its seed gets refined with the budget that is left.
    const fresh = (list) => list.filter((x) => !expanded.has(keyOf(x)));
    const pools = all.length ? [front(), ...styleFronts.map((st) => paretoFront(all.filter((x) => x.design.style === st), objectives))] : [];
    const from = all.length ? (pools.find((p) => fresh(p).length) ?? []) : [...seen.values()].sort((a, b) => a.why.length - b.why.length || a.cost - b.cost).slice(0, 8);
    const todo = fresh(from);
    if (!todo.length) break;
    // Take turns between the objectives: the unexpanded design best on this turn's objective.
    const f = OBJECTIVES[objectives[step % objectives.length]];
    step++;
    const s = todo.reduce((m, x) => (f.sense * f.of(x) > f.sense * f.of(m) ? x : m));
    expanded.add(keyOf(s));
    for (const [k, vals] of Object.entries(knobs)) {
      for (const v of vals) {
        if (seen.size >= (all.length ? exploreUntil : budget)) break;
        if (s.knobs[k] === v) continue;
        tryOne(s.size, s.layout, { ...s.knobs, [k]: v });
        yield progress();
      }
    }
    // The same design in another layout, and on another size.
    for (const layout of layouts) { if (seen.size >= (all.length ? exploreUntil : budget)) break; if (layout !== s.layout) { tryOne(s.size, layout, s.knobs); yield progress(); } }
    for (const size of sizes) { if (seen.size >= (all.length ? exploreUntil : budget)) break; if (size !== s.size) { tryOne(size, s.layout, s.knobs); yield progress(); } }
  }
  // Phase 3: polish. Each front design, cheapest first, takes any one change to
  // the framing, floor, foundation, overhang or wall height that beats it
  // outright (no worse on any objective, better on one), until none does or
  // the budget is spent. Phase 2 spreads its budget over the whole front, so
  // on a small budget a cheaper twin one knob away is often left untried.
  const beats = (a, b) => objectives.every((o) => OBJECTIVES[o].sense * (OBJECTIVES[o].of(a) - OBJECTIVES[o].of(b)) >= -1e-9)
    && objectives.some((o) => OBJECTIVES[o].sense * (OBJECTIVES[o].of(a) - OBJECTIVES[o].of(b)) > 1e-6);
  const polishMoves = Object.keys(knobs).filter((k) => POLISH_KNOBS.includes(k)).flatMap((k) => knobs[k].map((v) => [k, v]));
  /** @type {Map<string, number>} */
  const wins = new Map();
  const polished = new Set();
  // The first pass tries only the lighter framing (smaller joists and rafters,
  // wider spacing), the overhangs and the wall heights on every front design, which is where most of the saving is;
  // later passes try every polish move.
  const light = ([k, v]) => (LIGHT[k] !== undefined && LIGHT[k] === v) || k === 'overhang' || k === 'wall';
  for (let pass = 0; pass < 5 && seen.size < budget; pass++) {
    let moved = false;
    const tier = pass === 0 ? polishMoves.filter(light) : polishMoves;
    if (pass === 1) polished.clear();
    for (const f of front()) {
      if (seen.size >= budget) break;
      if (polished.has(keyOf(f))) continue;
      polished.add(keyOf(f));
      let cur = f;
      for (let improved = true; improved && seen.size < budget;) {
        improved = false;
        // Moves that have paid before are tried first, and the first that beats the design is taken.
        const order = tier.sort((p, q) => (wins.get(`${q[0]}=${q[1]}`) ?? 0) - (wins.get(`${p[0]}=${p[1]}`) ?? 0));
        for (const [k, v] of order) {
          if (seen.size >= budget || cur.knobs[k] === v) continue;
          const d = designAt(base, cur.size, cur.layout, { ...cur.knobs, [k]: v });
          const r = d && (seen.get(JSON.stringify({ ...d, name: '' })) ?? tryOne(cur.size, cur.layout, { ...cur.knobs, [k]: v }));
          if (r && r.feasible && beats(r, cur)) {
            wins.set(`${k}=${v}`, (wins.get(`${k}=${v}`) ?? 0) + 1);
            cur = r; improved = true; moved = true;
            break;
          }
        }
        yield progress();
      }
      polished.add(keyOf(cur));
    }
    if (!moved) break;
  }
  return { front: front(), all, evaluated: seen.size, rejected, constraints: c, objectives };
}

/**
 * Run the whole search and return its result (see searchSteps).
 * @param {Parameters<typeof searchSteps>[0]} [opts]
 */
export function searchDesigns(opts = {}) {
  const it = searchSteps(opts);
  for (;;) {
    const n = it.next();
    if (n.done) return n.value;
  }
}
