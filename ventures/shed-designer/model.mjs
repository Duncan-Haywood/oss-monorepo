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
import { estimate } from './estimate.mjs';
import { productById } from './products.mjs';
import { headerCheck, studCheck } from './structure.mjs';
import { gambrelShape, gambrelParts, gambrelAnalysis, loftSpan, bandAbove, zOnPoly, GUSSET_T as GAMBREL_GUSSET_T, LOFT_LIVE } from './gambrel.mjs';
import { needsKingPost, needsChordBrace, trussForces } from './truss.mjs';
import { roofSides, threeHinged, FRONT_PITCH_MIN, FRONT_PITCH_MAX } from './saltbox.mjs';
import { LAP_PRODUCTS, layoutFace, lapStocks, lapStagger, evenExposure, lapStudLimit } from './lap.mjs';
import { bbox } from './integrity.mjs';
import { pickFinish, SIDING_FINISHES, TRIM_FINISHES, DOOR_FINISHES, SHINGLE_FAMILIES } from './looks.mjs';
import { LOCKABLE } from './levers.mjs';

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

/** A lean-to's walls by what they are: a tall front, a low back and two end walls. */
export const LEAN_WALL_LABEL = {
  front: 'Front (tall side)', back: 'Back (low side)', left: 'Left (end wall)', right: 'Right (end wall)',
};

/** A saltbox's eave walls by their slopes: a short steep one over the front, a long shallow one over the back. */
export const SALT_WALL_LABEL = {
  front: 'Front (steep side)', back: 'Back (long slope)', left: 'Left (gable end)', right: 'Right (gable end)',
};

/** The label for a wall in this design's style. @param {{ style?: string }} design @param {string} wall */
export const wallLabel = (design, wall) => (design.style === 'leanTo' ? LEAN_WALL_LABEL : design.style === 'saltbox' ? SALT_WALL_LABEL : WALL_LABEL)[wall];

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
    wallHeight: 84.5,
    pitch: 5,
    overhang: 12,
    studSize: '2x4',
    studSpacing: 16,
    // Studs as far apart as the siding and the stud check allow (autoStudSpacing).
    autoStuds: true,
    joistSize: '2x6',
    joistSpacing: 16,
    rafterSize: '2x6',
    rafterSpacing: 24,
    tieSize: '2x4',
    roofType: 'ridgeBeam',
    // 'gable'; 'leanTo' (one slope, from a tall front wall down to a low back wall, which is the
    // wall height); or 'gambrel' (barn): then `pitch` is the upper slope, `gambrelLower` the lower one
    // and `gambrelKnee` the lower slope's horizontal run (0: a quarter of the width); see gambrel.mjs.
    // 'saltbox': a gable with its ridge off centre, `pitch` the long back slope and `frontPitch`
    // the short steep front one; the ridge sits where they meet (saltbox.mjs).
    style: 'gable',
    frontPitch: 10,
    gambrelLower: 20,
    gambrelKnee: 0,
    loft: 'none',
    loftJoist: '2x6',
    beamSize: '2x10',
    skidSize: '4x4',
    skidSpacing: 48,
    foundation: 'blocks',
    // 'framed': skids, joists and a subfloor; 'none': no floor, the walls bear on
    // PT 4x6 perimeter timbers on a full gravel pad (the foundation and pad
    // choices then do not apply).
    floor: 'framed',
    // Most a block or pier may be from the next along a skid, inches.
    blockSpacing: 48,
    compaction: 'hand tamper',
    // Gravel under each block: on bare clay or silt the starter's blocks would
    // carry about 1,970 psf, over the IRC's 1,500 (see checks.mjs, skidOnBlocks).
    pad: 'under blocks',
    // How deep a pier goes below grade, inches: your frost depth, or 12" to firm soil where the ground does not freeze.
    pierDepth: 24,
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
    // The automatic overhang takes the longest from 6" to 18" whose materials
    // cost at most this many dollars more than the cheapest overhang's.
    overhangBudget: 25,
    roofColor: 'charcoal',
    trimColor: 'white',
    doorColor: 'stained',
    glitter: false,
    interior: 'none',
    insulation: false,
    // Storage on the truss bottom chords: sizes them for 20 psf (IRC Table R301.5) instead of 10.
    atticStorage: false,
    // Count custom-size doors and windows at the median of the catalogue's range (off: left out of the total).
    customRange: false,
    sidingType: 'T1-11',
    // Panel siding (T1-11, LP panels) runs with its 8 ft length up the wall ('vertical', the usual way)
    // or along it ('horizontal': rows of 4 ft high panels, each row joint Z-flashed over blocking).
    sidingRun: 'vertical',
    // T1-11 bought primed (a primed 19/32" 4x8 wood panel) instead of bare, to paint.
    sidingPrimed: false,
    wallTrim: '1x4',
    // For fiber cement: James Hardie sells HZ5 plank where winters freeze and HZ10 where they don't.
    climate: 'mild',
    roofCover: 'shingles',
    rafterSeat: 'connector',
    // Ground anchors at the four corners (checks.mjs, ANCHOR_KITS): a 48" kit for
    // soil class 4a or firmer, a 30" kit for class 2, or none.
    anchors: '48',
    maxFootprint: 100,
    // The longest board you can carry home (ft, 0 for no limit). Longer stock is
    // bought only for a piece that cannot be spliced; a pickup's 8 ft bed with
    // the tailgate down carries 12 ft.
    maxHaulFt: 12,
    // Site plan, all in feet and typed by you (0 for none): the lot, where the
    // shed sits on it (its front wall faces the street), the house, and the
    // setback your town asks for. Nothing here changes the framing.
    lotWidthFt: 0,
    lotDepthFt: 0,
    siteLeftFt: 0,
    siteRearFt: 0,
    houseWidthFt: 0,
    houseDepthFt: 0,
    houseLeftFt: 0,
    houseFrontFt: 0,
    setbackFt: 0,
    // Choices no search may change (keys of LOCKABLE in levers.mjs).
    locked: /** @type {string[]} */ ([]),
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
/**
 * With no floor, each wall bears on one of these on edge on the gravel pad:
 * ground-contact PT, as the IRC asks of wood in contact with the ground (R317.1.2).
 */
export const PERIMETER_TIMBER = '4x6';

export const BLOCKS = {
  blocks: { name: 'solid concrete block, 4 x 8 x 16', plural: 'solid 4 x 8 x 16 concrete blocks', h: 4, along: 16, across: 8, item: 'concreteBlock' },
  'deck blocks': { name: 'concrete deck block (pier block)', plural: 'concrete deck blocks', h: 8, along: 11, across: 11, item: 'deckBlock' },
  CMU: { name: 'concrete masonry unit (CMU), 8 x 8 x 16, cores vertical', plural: '8 x 8 x 16 CMU blocks, cores vertical', h: 8, along: 16, across: 8, item: 'cmuBlock' },
  // A pier poured in a 12" form tube (11-1/2" inside) on a 16" square, 6" thick
  // footing pad poured at the bottom of its hole (6" is the IRC's least footing
  // thickness, R403.1.1), from the bottom of its
  // hole (pierDepth below grade, set it to your frost depth) to 4" above
  // grade. Drawn and checked as the 10.2" square of the same area, so the
  // bearing and soil checks use the tube's true round area. It needs no
  // gravel: the hole goes down to firm soil.
  piers: { name: 'concrete pier in a 12" form tube', plural: 'concrete piers in 12" form tubes', h: 4, along: 10.2, across: 10.2, item: 'concreteBag', pier: true, tubeIn: 11.5, footIn: 16, footThick: 6 },
};

const classic = () => ({ ...defaultDesign(), foundation: 'gravel', pad: 'full', wallHeight: 96, pitch: 6, skidSize: '4x6', roofType: 'ridgeBoard', sidingColor: 'natural', polkaDots: false, maxPeak: 0, ventHeight: 12, autoWall: false, autoPitch: false, autoOverhang: false, rafterSeat: 'birdsmouth', maxFootprint: 0, roofColor: 'charcoal', trimColor: 'white', glitter: false, interior: 'none' });

/**
 * Site plan extras that `normalize` fills in (not `defaultDesign`, so the
 * presets' design keys stay put).
 * @typedef {{ siteFacing: string, northDeg: number | null, easementSide: string, easementFt: number, easementNote: string }} SiteExtras
 */
/** @typedef {ReturnType<typeof defaultDesign> & Partial<SiteExtras>} Design */

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
  // One slope from a tall front wall down to a low back wall: no ridge, no ties,
  // and the back wall can stand against a fence or the house. 96 sq ft.
  '8x12 lean-to': () => ({ ...defaultDesign(), name: '8x12 lean-to shed', style: 'leanTo', wallHeight: 72, pitch: 4, maxPeak: 0, gableVents: false,
    autoWall: false, autoPitch: false, autoOverhang: true, openings: [
      { id: 'o1', kind: 'door', wall: 'front', offset: 24, width: 38.5, height: 78, product: 'site-built' },
      { id: 'o2', kind: 'window', wall: 'front', offset: 98, width: 14.25, height: 21.25, sill: 50, product: 'swm-1421' },
      { id: 'o3', kind: 'window', wall: 'right', offset: 41, width: 14.25, height: 21.25, sill: 40, product: 'swm-1421' },
    ] }),
  // 6/12, not 8/12: at 8/12 a 2x6 rafter's birdsmouth is more than a third of its depth (paretoaudit found it).
  '8x8 lean': () => ({ ...classic(), name: '8x8 garden shed', length: 96, width: 96, wallHeight: 84, pitch: 6, rafterSpacing: 24, openings: [
    { id: 'o1', kind: 'door', wall: 'left', offset: 22, width: 52, height: 72 },
  ] }),
  // A barn for storage under the 100 sq ft line: gambrel trusses of 2x4 (they check at about 30%),
  // a loft over half the length, the door in the gable end under the tall middle, shingles and
  // primed lap siding to paint, and two windows on the long side.
  '10x10 barn': () => ({ ...defaultDesign(), name: '10x10 gambrel barn with loft', length: 120, width: 120, style: 'gambrel', gambrelLower: 20, pitch: 6,
    autoPitch: false, autoOverhang: false, maxPeak: 0, rafterSize: '2x4', loft: 'half', sidingType: 'LP SmartSide lap', sidingColor: 'white', openings: [
      { id: 'o1', kind: 'door', wall: 'left', offset: 40.75, width: 38.5, height: 78, product: 'site-built' },
      { id: 'o2', kind: 'window', wall: 'front', offset: 24, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
      { id: 'o3', kind: 'window', wall: 'front', offset: 81.75, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
    ] }),
  // A saltbox: a 10/12 front over the door and a long 5/12 back, the ridge about a third of the way
  // back. Ridge board and ties, shingles, primed lap siding to paint, a window in a gable end.
  '8x12 saltbox': () => ({ ...defaultDesign(), name: '8x12 saltbox shed', style: 'saltbox', pitch: 5, frontPitch: 10, roofType: 'ridgeBoard', wallHeight: 84.5,
    autoWall: false, autoPitch: false, autoOverhang: true, maxPeak: 0, gableVents: false, sidingType: 'LP SmartSide lap', sidingColor: 'white', openings: [
      { id: 'o1', kind: 'door', wall: 'front', offset: 52.75, width: 38.5, height: 78, product: 'site-built' },
      { id: 'o2', kind: 'window', wall: 'right', offset: 21, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
      { id: 'o3', kind: 'window', wall: 'back', offset: 64.875, width: 14.25, height: 21.25, sill: 44, product: 'swm-1421' },
    ] }),
};


/** The presets in a roof style other than the gable, for the design search and the gallery to start from. */
export const STYLE_PRESETS = Object.fromEntries(Object.entries(PRESETS).filter(([, make]) => make().style === 'leanTo'));

/** The roof structures, with the words the options and search results use for each. */
export const ROOF_TYPES = [
  { type: 'ridgeBeam', short: 'ridge beam on posts', option: 'Ridge beam on posts (open to the roof)' },
  { type: 'ridgeBoard', short: 'ridge board and ties', option: 'Ridge board with rafter ties (ties across the room)' },
  { type: 'truss', short: 'site-built trusses', option: 'Site-built trusses with OSB gussets (no ridge member)' },
];

/** Truss gusset thickness (7/16" OSB) and sizes in inches: along the bottom chord at a heel, each way from the peak, and each way from the king post's foot. */
export const GUSSET_T = 7 / 16;
/** Attic storage: the deck's thickness (23/32" or 3/4" panel) and the least clear height over it counted as storage (a 12" tote). */
export const ATTIC_DECK_T = 0.75;
export const ATTIC_CLEAR = 12;
export const GUSSET = { heel: 16, peak: 12, foot: 8 };

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
  const out = {
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
    floor: pick(o.floor, ['framed', 'none'], d.floor),
    blockSpacing: Math.min(96, Math.max(24, num(o.blockSpacing, d.blockSpacing))),
    pierDepth: Math.min(72, Math.max(12, num(o.pierDepth, d.pierDepth))),
    floorTreated: o.floorTreated !== false,
    siding: o.siding !== false,
    roofing: o.roofing !== false,
    gableVents: o.gableVents !== false,
    roofType: pick(o.roofType, ['ridgeBeam', 'ridgeBoard', 'truss'], d.roofType),
    beamSize: pick(o.beamSize, ['2x8', '2x10', '2x12'], d.beamSize),
    maxPeak: Math.min(240, Math.max(0, num(o.maxPeak, d.maxPeak))),
    snowLoad: Math.min(150, Math.max(0, num(o.snowLoad, d.snowLoad))),
    windLoad: Math.min(80, Math.max(0, num(o.windLoad, d.windLoad))),
    sidingColor: pickFinish(o.sidingColor, SIDING_FINISHES, d.sidingColor),
    polkaDots: o.polkaDots === true,
    autoWall: o.autoWall === true,
    autoStuds: o.autoStuds === true,
    autoPitch: o.autoPitch === true,
    autoOverhang: o.autoOverhang === true,
    overhangBudget: Math.min(500, Math.max(0, num(o.overhangBudget, d.overhangBudget))),
    roofColor: pickFinish(o.roofColor, SHINGLE_FAMILIES, d.roofColor, false),
    trimColor: pickFinish(o.trimColor, TRIM_FINISHES, d.trimColor),
    doorColor: pickFinish(o.doorColor, DOOR_FINISHES, d.doorColor),
    glitter: o.glitter === true,
    interior: pick(o.interior, ['none', 'OSB', 'plywood', 'drywall', 'beadboard', 'pegboard', 'teen bedroom'], d.interior),
    insulation: o.insulation === true,
    atticStorage: o.atticStorage === true,
    customRange: o.customRange === true,
    wallTrim: pick(o.wallTrim, ['1x4', '5/4', 'none'], d.wallTrim),
    climate: pick(o.climate, ['mild', 'freezing'], d.climate),
    sidingType: pick(o.sidingType, ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement', 'LP SmartSide lap'], d.sidingType),
    sidingRun: pick(o.sidingRun, ['vertical', 'horizontal'], d.sidingRun),
    sidingPrimed: o.sidingPrimed === true,
    roofCover: pick(o.roofCover, ['shingles', 'metal'], d.roofCover),
    rafterSeat: pick(o.rafterSeat, ['birdsmouth', 'connector'], d.rafterSeat),
    anchors: pick(o.anchors, ['48', '30', 'none'], d.anchors),
    maxFootprint: Math.min(1000, Math.max(0, num(o.maxFootprint, d.maxFootprint))),
    maxHaulFt: /** @type {any} */ (o.maxHaulFt) !== '' && o.maxHaulFt !== null && [0, 8, 10, 12, 14, 16, 18, 20].includes(Number(o.maxHaulFt)) ? Number(o.maxHaulFt) : d.maxHaulFt,
    ...Object.fromEntries(['lotWidthFt', 'lotDepthFt', 'siteLeftFt', 'siteRearFt', 'houseWidthFt', 'houseDepthFt', 'houseLeftFt', 'houseFrontFt', 'setbackFt']
      .map((f) => [f, Math.min(2000, Math.max(0, num(o[f], d[f])))])),
    // Site plan extras, defaulted here rather than in defaultDesign() so the
    // presets' design keys (and their stored pictures) do not move: which way
    // the front (door) wall faces on the lot; north in degrees clockwise from
    // straight up the plan (toward the rear lot line), null for no arrow; and
    // an easement strip along one lot line, with a note as on the plat.
    siteFacing: pick(o.siteFacing, ['street', 'left', 'right', 'rear'], 'street'),
    northDeg: o.northDeg === null || o.northDeg === undefined || /** @type {any} */ (o.northDeg) === '' || typeof o.northDeg === 'boolean' || !Number.isFinite(Number(o.northDeg)) ? null : ((Math.round(Number(o.northDeg)) % 360) + 360) % 360,
    easementSide: pick(o.easementSide, ['none', 'street', 'left', 'right', 'rear'], 'none'),
    easementFt: Math.min(200, Math.max(0, num(o.easementFt, 0))),
    easementNote: typeof o.easementNote === 'string' ? o.easementNote.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) : '',
    locked: Array.isArray(o.locked) ? [...new Set(o.locked.filter((k) => typeof k === 'string' && k in LOCKABLE))] : [],
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
      kind: /** @type {'door'|'window'} */ (op.kind === 'window' ? 'window' : 'door'),
      wall: pick(op.wall, WALLS, 'front'),
      offset: Math.max(0, num(op.offset, 24)),
      width: Math.min(144, Math.max(12, num(op.width, 36))),
      height: Math.min(120, Math.max(12, num(op.height, 36))),
      ...(op.kind === 'window' ? { sill: Math.max(6, num(op.sill, 42)) } : {}),
      ...(TWO_BY.includes(op.header) ? { header: op.header } : {}),
      ...(op.product ? { product: String(op.product) } : {}),
    })),
    style: pick(o.style, ['gable', 'leanTo', 'gambrel', 'saltbox'], 'gable'),
    // The front is the steep side, and no more than three times the back's pitch, which keeps the ridge
    // at least a quarter of the width back from the front wall.
    frontPitch: Math.min(FRONT_PITCH_MAX, 3 * Math.min(14, Math.max(2, num(o.pitch, d.pitch))), Math.max(FRONT_PITCH_MIN, Math.min(14, Math.max(2, num(o.pitch, d.pitch))), num(o.frontPitch, d.frontPitch))),
    gambrelLower: Math.min(30, Math.max(16, num(o.gambrelLower, d.gambrelLower))),
    gambrelKnee: Math.min(120, Math.max(0, num(o.gambrelKnee, d.gambrelKnee))),
    loft: pick(o.loft, ['none', 'half', 'full'], 'none'),
    loftJoist: pick(o.loftJoist, ['2x6', '2x8', '2x10'], d.loftJoist),
  };
  // A gambrel is framed as gusseted trusses with ties (no ridge beam, no birdsmouth, no eave
  // overhang); a loft goes on a gambrel's ties only.
  if (out.style === 'gambrel') Object.assign(out, { roofType: 'ridgeBoard', rafterSeat: 'birdsmouth', overhang: 0, autoOverhang: false });
  else out.loft = 'none';
  // A saltbox has a ridge board or a ridge beam: no site-built saltbox truss is modelled, so a saved truss roof builds with a ridge board.
  if (out.style === 'saltbox' && out.roofType === 'truss') Object.assign(out, { roofType: 'ridgeBoard', atticStorage: false });
  // Resolved here, not in buildShed, so every reader of the design (moves, checks, the page) sees the spacing framed.
  if (out.autoStuds) out.studSpacing = autoStudSpacing(out);
  return out;
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

/** Header depth by rough-opening width: the old rule of thumb, kept for a design with no loads to size from. */
export function defaultHeader(width) {
  if (width <= 48) return '2x6';
  if (width <= 72) return '2x8';
  if (width <= 96) return '2x10';
  return '2x12';
}

/**
 * The line load on a header in this wall, lb/ft (checks.mjs checks it with the
 * same number). An eave wall carries its strip of roof: under a ridge beam the
 * lower half of the rafter run plus the wall and overhang, under a ridge board
 * the whole half roof (the pair and its tie are a truss), plus 10 lb/ft of
 * wall. A gable wall carries 40 lb/ft of gable framing and the end rafter's
 * strip, half a rafter spacing.
 * @param {Partial<Design>} d @param {string} wall
 */
export function headerLoadPlf(d, wall) {
  if (wall === 'front' || wall === 'back') {
    const e = eaveWallLoads(d, wall);
    return e.dead + e.snow + 10;
  }
  // A saltbox's end rafter has its steep front side too: the steeper slope weighs more on plan.
  const cos = 1 / Math.sqrt(1 + (Math.max(d.pitch ?? 0, d.style === 'saltbox' ? d.frontPitch ?? 0 : 0) / 12) ** 2);
  return 40 + (15 / cos + (d.snowLoad ?? 0)) * ((d.rafterSpacing ?? 24) / 2) / 12;
}

/**
 * The roof's load on an eave wall, lb/ft, as dead and snow: the same numbers
 * checks.mjs's eaveRoofPlf gives (a test pins them together). A saltbox's
 * two eave walls carry different loads; name the wall, or get the heavier.
 * @param {Partial<Design>} d @param {string} [wall]
 */
export function eaveWallLoads(d, wall) {
  const cos = 1 / Math.sqrt(1 + ((d.pitch ?? 0) / 12) ** 2);
  if (d.style === 'saltbox') return saltboxWallLoads(/** @type {any} */ (d), wall);
  if (d.style === 'gambrel') {
    // The gambrel trusses' reactions, a loft's storage load counted as dead.
    const g = gambrelAnalysis(/** @type {any} */ (d)).wall;
    return { dead: g.dead + g.loft, snow: g.snow };
  }
  const D = actual(d.studSize || '2x4').depth;
  const lean = d.style === 'leanTo';
  const beam = !lean && d.roofType === 'ridgeBeam';
  const truss = !lean && d.roofType === 'truss';
  const run = (d.width ?? 0) / 2 - (beam ? 1.5 : truss ? 0 : 0.75) - D;
  const tribFt = (beam ? run / 2 + D + (d.overhang ?? 0) : (d.width ?? 0) / 2 + (d.overhang ?? 0)) / 12;
  // Under trusses the eave wall also carries half the attic (bottom chord) load.
  const attic = truss ? (trussForces(/** @type {any} */ (d)).wc * (d.width ?? 0)) / 2 / 12 / ((d.rafterSpacing ?? 24) / 12) : 0;
  return { dead: (15 / cos) * tribFt + attic, snow: (d.snowLoad ?? 0) * tribFt };
}

/**
 * A saltbox's roof load on an eave wall, lb/ft. Under a ridge beam each
 * rafter is a simple span, so the wall takes the lower half of its own side's
 * run plus the wall and the overhang. Under a ridge board the rafter pair and
 * its tie are a three-hinged frame (saltbox.mjs, threeHinged): each wall takes
 * its reaction of the load between the seats, plus the strip outside its seat.
 * Snow is the same on plan both sides, so under a ridge board it splits evenly;
 * the dead load (15 psf along each slope) does not quite.
 * @param {Design} d @param {string} [wall]
 */
function saltboxWallLoads(d, wall) {
  const s = roofSides(d);
  const W = d.width;
  const D = actual(d.studSize || '2x4').depth;
  const beam = d.roofType === 'ridgeBeam';
  const o = (d.overhang ?? 0) / 12;
  const snow = d.snowLoad ?? 0;
  const per = (back) => {
    const sd = back ? s.back : s.front;
    if (beam) {
      const run = sd.half - 1.5 - D;
      const f = (run / 2 + D) / 12 + o;
      return { dead: (15 / sd.cos) * f, snow: snow * f };
    }
    const a = s.ridgeY - s.seatAt;
    const b = W - s.ridgeY - s.seatAt;
    const r = threeHinged(15 / s.front.cos, 15 / s.back.cos, a, b, a * s.front.t);
    const outside = s.seatAt / 12 + o;
    return { dead: (back ? r.Vb : r.Va) + (15 / sd.cos) * outside, snow: snow * (W / 2 / 12 + o) };
  };
  if (wall === 'front' || wall === 'back') return per(wall === 'back');
  const f = per(false);
  const b = per(true);
  return f.dead + f.snow >= b.dead + b.snow ? f : b;
}

/**
 * The widest stud spacing the siding allows: lap siding over OSB as its
 * maker's install guide says (lap.mjs), T1-11 and LP's 3/8" panel 16" (their
 * span rating), LP's 7/16" panel and siding over OSB 24". With autoStuds on
 * (the default) the walls are framed at that spacing, if the wall studs still
 * pass their check there (studCheck: roof load and wind, NDS 3.9-3), else at
 * 16". A shed is framed to what it needs, not to a house's habit of 16".
 * @param {Partial<Design>} d
 */
export function autoStudSpacing(d) {
  const allowed = !d.siding ? 16 : lapStudLimit(d) ?? (d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide' ? 16 : 24);
  if (allowed < 24) return 16;
  // The stud check at 24" on the tallest wall: the auto wall's height when it sets the walls.
  const H = (d.autoWall ? minWallFor(/** @type {any} */ (d)) : d.wallHeight ?? 96) + (d.style === 'leanTo' ? ((d.width ?? 0) * (d.pitch ?? 0)) / 12 : 0);
  const e = eaveWallLoads({ ...d, studSpacing: 24 });
  return studCheck(d.studSize || '2x4', 24, H - 4.5, [e.dead, e.snow], d.windLoad ?? 0) <= 1 ? 24 : 16;
}

/**
 * The header over an opening: the one asked for, or the shallowest two-ply
 * size that carries this wall's load (headerCheck: bending, shear, L/240 and
 * bearing on one jack a side). IRC Table R602.7(1) starts at two 2x4s too.
 * Sized to the load rather than to a house rule of thumb.
 * @param {Partial<Design>} d @param {Opening} op
 */
export function headerFor(d, op) {
  if (op.header) return op.header;
  const w = headerLoadPlf(d, op.wall);
  for (const size of ['2x4', '2x6', '2x8', '2x10', '2x12']) if (headerCheck(size, op.width, w, 2, 1, d.studSize || '2x4') <= 1) return size;
  return '2x12';
}

/** @param {Vec} a @param {Vec} b @param {number} k */
const add = (a, b, k = 1) => /** @type {Vec} */ ([a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]);

/** @returns {Geom} */
/**
 * The part of the rectangle [s0, s1] x [z0, z1] under a wall's top line `clip(s)`
 * (piecewise linear, bending only at `corners`), as a profile in the siding's
 * order: bottom left to right, then the top right to left. Null when less than
 * half an inch of it is under the line.
 * @param {(s: number) => number} clip @param {number[]} corners
 * @param {number} s0 @param {number} s1 @param {number} z0 @param {number} z1
 * @returns {[number, number][] | null}
 */
export function clipRect(clip, corners, s0, s1, z0, z1) {
  const xs = [s0, s1, ...corners.filter((c) => c > s0 && c < s1)].sort((a, b) => a - b);
  // Where the top line crosses the row's top or bottom between two breakpoints.
  const all = [...xs];
  for (let i = 0; i + 1 < xs.length; i++) {
    const [a, b] = [xs[i], xs[i + 1]];
    const [ca, cb] = [clip(a), clip(b)];
    for (const zz of [z0, z1]) if ((ca - zz) * (cb - zz) < 0) all.push(a + ((zz - ca) / (cb - ca)) * (b - a));
  }
  const pts = [...new Set(all.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b).filter((x) => clip(x) >= z0 - 1e-6);
  if (pts.length < 2 || pts[pts.length - 1] - pts[0] < 0.5) return null;
  const top = pts.map((x) => /** @type {[number, number]} */ ([x, Math.max(z0, Math.min(z1, clip(x)))]));
  if (Math.max(...top.map((q) => q[1])) - z0 < 0.5) return null;
  /** @type {[number, number][]} */
  const raw = [[pts[0], z0], [pts[pts.length - 1], z0], ...top.reverse()];
  // Merge repeated points (where the roof line meets the row's bottom), then drop
  // points on a straight line between their neighbours.
  const out = raw.filter((q, i) => { const r = raw[(i + raw.length - 1) % raw.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-6; });
  return out.filter((q, i) => {
    const a = out[(i + out.length - 1) % out.length];
    const b = out[(i + 1) % out.length];
    return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1e-6;
  });
}

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
/**
 * Where the shed sits on the lot you typed, in inches from the front-left lot
 * corner (x along the street, y back from it); the shed's front wall faces the
 * street. Clearances are to the walls and, front and back, to the eave's drip
 * line, since some towns measure a setback to the wall and some to the eave.
 * Null when no lot is typed.
 * @param {Design} d
 */
export function siteLayout(d) {
  if (!(d.lotWidthFt > 0 && d.lotDepthFt > 0)) return null;
  const lot = { w: d.lotWidthFt * 12, d: d.lotDepthFt * 12 };
  const facing = d.siteFacing || 'street';
  // Facing a side lot line turns the shed a quarter turn: its length runs front to back.
  const turned = facing === 'left' || facing === 'right';
  const [fx, fy] = turned ? [d.width, d.length] : [d.length, d.width];
  const x0 = d.siteLeftFt * 12;
  const y1 = lot.d - d.siteRearFt * 12;
  const shed = { x0, x1: x0 + fx, y0: y1 - fy, y1 };
  const o = d.overhang;
  // The eaves overhang the front and back walls; the gable ends have none.
  const eaves = turned ? ['left', 'right'] : ['front', 'rear'];
  const raw = { left: shed.x0, right: lot.w - shed.x1, front: shed.y0, rear: lot.d - shed.y1 };
  const eave = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, eaves.includes(k) ? v - o : v]));
  const clear = { ...raw, frontEave: eave.front, rearEave: eave.rear, leftEave: eave.left, rightEave: eave.right };
  const house = d.houseWidthFt > 0 && d.houseDepthFt > 0
    ? { x0: d.houseLeftFt * 12, x1: (d.houseLeftFt + d.houseWidthFt) * 12, y0: d.houseFrontFt * 12, y1: (d.houseFrontFt + d.houseDepthFt) * 12 }
    : null;
  // Nearest gap between the shed's walls and the house (0 when they overlap).
  const gap = house ? Math.hypot(Math.max(0, house.x0 - shed.x1, shed.x0 - house.x1), Math.max(0, house.y0 - shed.y1, shed.y0 - house.y1)) : null;
  const side = d.easementSide === 'street' ? 'front' : d.easementSide;
  const easement = side && side !== 'none' && d.easementFt > 0 ? { side, width: d.easementFt * 12, note: d.easementNote || '' } : null;
  return { lot, shed, overhang: o, clear, eaves, facing, house, houseGap: gap, setback: d.setbackFt * 12, north: d.northDeg ?? null, easement };
}

/** Site-plan problems worth a warning: off the lot, inside the setback you typed, or on top of the house. @param {Design} d */
function siteWarnings(d) {
  const site = siteLayout(d);
  if (!site) return [];
  const out = [];
  const lines = /** @type {const} */ ([['left', 'left'], ['right', 'right'], ['front', 'street'], ['rear', 'rear']]);
  const off = lines.filter(([k]) => site.clear[k] < -1e-9).map(([, name]) => name);
  if (off.length) out.push(`On the site plan the shed runs past the ${off.join(' and ')} lot line${off.length > 1 ? 's' : ''}; check the lot size and where you placed it.`);
  else if (site.setback > 0) {
    const near = lines.filter(([k]) => Math.min(site.clear[k], site.clear[`${k}Eave`]) < site.setback - 1e-9);
    if (near.length) out.push(`On the site plan the shed (or its eave) is closer than your ${fmtFt(site.setback)} setback to the ${near.map(([, n]) => n).join(', ').replace(/, ([^,]*)$/, ' and $1')} lot line${near.length > 1 ? 's' : ''}.`);
  }
  if (site.house && site.houseGap !== null && site.houseGap < 1e-9) out.push('On the site plan the shed overlaps the house; check where you placed each.');
  const e = site.easement;
  if (e) {
    const key = /** @type {'left'|'right'|'front'|'rear'} */ (e.side);
    const reach = Math.min(site.clear[key], site.clear[`${key}Eave`]);
    if (reach < e.width - 1e-9) out.push(`On the site plan the shed${reach < site.clear[key] ? ' (or its eave)' : ''} reaches into the ${fmtFt(e.width)} easement along the ${key === 'front' ? 'street' : key} lot line; most easements do not allow a building in them.`);
  }
  return out;
}

/**
 * Frame a design. `prices` are the prices the page is pricing at (the
 * visitor's own, as typed); only the automatic overhang reads them, to weigh
 * each eave length at those prices rather than the starting ones.
 * @param {any} input
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function buildShed(input, prices) {
  const d0 = normalize(input);
  // The page, the swaps, the options and the simplicity search rebuild the same
  // designs again and again; a built shed is never modified, so keep recent ones.
  const key = JSON.stringify(d0) + (prices && d0.autoOverhang ? `|${JSON.stringify(prices)}` : '');
  const hit = BUILT.get(key);
  if (hit) { BUILT.delete(key); BUILT.set(key, hit); return hit; }
  const shed = d0.autoWall || d0.autoPitch || d0.autoOverhang ? buildAuto(d0, prices) : buildFramed(d0);
  BUILT.set(key, shed);
  if (BUILT.size > 200) BUILT.delete(BUILT.keys().next().value);
  return shed;
}

/** Recently built sheds by normalized design, least recently used first. @type {Map<string, Shed>} */
const BUILT = new Map();

/** Lowest wall (floor to top of plates) that frames every door and window with its header. */
export function minWallFor(d) {
  let need = 60;
  // On a lean-to the front wall is taller than the back (which is the wall height you set) by the roof's rise.
  const rise = d.style === 'leanTo' ? (d.width - actual(d.studSize).depth) * (d.pitch / 12) : 0;
  for (const op of d.openings) {
    const bottom = op.kind === 'window' ? op.sill ?? 42 : 0;
    need = Math.max(need, bottom + op.height + actual(headerFor(d, op)).depth + 3 - (op.wall === 'front' ? rise : 0));
  }
  return Math.ceil(need * 8) / 8;
}

/**
 * Let the doorway and the height limit set the walls and the roof: walls as low
 * as the tallest opening allows, and the steepest whole pitch whose peak stays
 * under the limit. When no pitch fits, the lowest pitch at which the gable vents
 * still fit is used and the warning says by how much the limit is missed.
 * @param {Design} d0
 * @param {import('./estimate.mjs').Prices} [prices] the page's prices, for the overhang (else the starting ones)
 */
function buildAuto(d0, prices) {
  let d = { ...d0, autoWall: false, autoPitch: false, autoOverhang: false };
  if (d0.autoWall) d.wallHeight = minWallFor(d0);
  let shed;
  let why = '';
  if (d0.autoPitch) {
    // The peak rises with the pitch and so does the room for a gable vent, so
    // both searches are binary searches over the whole pitches 3 to 12.
    const at = new Map();
    // A lean-to's front wall grows with the pitch, so its walls are set again at each pitch.
    const wallAt = (p) => (d0.autoWall && d0.style === 'leanTo' ? { wallHeight: minWallFor({ ...d0, pitch: p }) } : {});
    // A saltbox keeps the shape you chose: its front pitch scales with the back's, to the nearest whole pitch.
    const ratio = d0.style === 'saltbox' ? d0.frontPitch / d0.pitch : 0;
    const frontAt = (p) => (ratio ? { frontPitch: Math.min(FRONT_PITCH_MAX, Math.max(FRONT_PITCH_MIN, Math.round(p * ratio))) } : {});
    const build = (p) => { if (!at.has(p)) at.set(p, buildFramed(normalize({ ...d, pitch: p, ...wallAt(p), ...frontAt(p) }))); return at.get(p); };
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
      const ventsFit = (s) => !d0.gableVents || d0.style === 'leanTo' || Object.keys(s.vents).length === 2;
      // Shingles want 4/12 or steeper (makers allow less only over a double underlayment); metal goes to 3/12.
      const lo = d0.roofCover === 'metal' ? 3 : 4;
      const p = ventsFit(build(12)) ? firstTrue(lo, 12, ventsFit) : 12;
      shed = build(p);
      why = d0.gableVents && d0.style !== 'leanTo' ? 'the lowest pitch at which the gable vents still fit, since no pitch meets the height limit' : 'the lowest pitch for a shingle roof, since no pitch meets the height limit';
    }
  } else {
    shed = buildFramed(normalize(d));
  }
  let s = /** @type {Shed} */ (shed);
  let overhangWhy = '';
  /** @type {any} */
  let overhangChoice = null;
  if (d0.autoOverhang) {
    // The longest overhang from 6" to 18" whose whole order (rafters, sub-fascia,
    // sheathing, roofing, drip edge, trim) costs at most overhangBudget dollars
    // more than the cheapest overhang's, at the prices the page is using (the
    // visitor's own when they have typed any; the starting prices otherwise). A longer eave
    // keeps rain off the siding, so a little money buys it; 0 takes the cheapest.
    // An overhang that leaves a door or window unframed prices without it, so it
    // looks cheap; those are skipped unless no overhang frames every opening.
    const all = [];
    for (let oh = 6; oh <= 18; oh++) {
      const t = buildFramed(normalize({ ...s.design, autoWall: false, autoPitch: false, autoOverhang: false, overhang: oh }));
      const framed = new Set((t.framedOpenings || []).map((/** @type {any} */ p) => p.op?.id ?? p.id));
      all.push({ oh, t, cost: estimate(t, prices).total, frames: t.design.openings.every((o) => framed.has(o.id)) });
    }
    const tries = all.some((x) => x.frames) ? all.filter((x) => x.frames) : all;
    const min = Math.min(...tries.map((x) => x.cost));
    const cheapest = /** @type {any} */ (tries.find((x) => x.cost <= min + 0.005));
    const best = /** @type {any} */ (tries.filter((x) => x.cost <= min + d0.overhangBudget + 0.005).pop());
    const next = tries.find((x) => x.oh > best.oh && x.cost > min + d0.overhangBudget + 0.005);
    s = best.t;
    overhangChoice = { overhang: best.oh, adds: best.cost - min, cheapest: cheapest.oh, budget: d0.overhangBudget, next: next ? { overhang: next.oh, adds: next.cost - min } : null };
    const money = (n) => {
      const format = (n) => `$${n.toFixed(2)}`;
      const text = format(Math.abs(n));
      return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
    };
    overhangWhy = best.cost - min < 0.005
      ? `overhang ${fmtIn(best.oh)}, the longest from 6" to 18" at the lowest materials cost`
      : `overhang ${fmtIn(best.oh)}, the longest from 6" to 18" within ${money(d0.overhangBudget)} of the cheapest (${fmtIn(cheapest.oh)}); it adds ${money(best.cost - min)}`;
    if (next) overhangWhy += `, and ${fmtIn(next.oh)} would add ${money(next.cost - min)}`;
  }
  const auto = [];
  if (d0.autoWall) auto.push(`walls ${fmtFt(s.design.wallHeight)}, the lowest that frames the tallest door or window`);
  if (d0.autoPitch) auto.push(`${d0.style === 'gambrel' ? 'upper roof' : d0.style === 'saltbox' ? `roof ${s.design.frontPitch}/12 front and` : 'roof'} ${s.design.pitch}/12${d0.style === 'saltbox' ? ' back' : ''}, ${why}`);
  if (overhangWhy) auto.push(overhangWhy);
  s.notes.unshift(`Set for you: ${auto.join('; ')}.`);
  s.design = { ...s.design, autoWall: d0.autoWall, autoPitch: d0.autoPitch, autoOverhang: d0.autoOverhang };
  if (overhangChoice) /** @type {any} */ (s).overhangChoice = overhangChoice;
  return s;
}

/**
 * @param {Design} d
 * @param {Record<string, number[]>} [lapNailers] extra full-height studs, by wall, at these
 *   face positions (inches along the siding face): where a lap butt joint found no stud.
 */
function buildFramed(d, lapNailers) {
  /** @type {Member[]} */
  const members = [];
  /** @type {{ id: string, kind: string, item: string, geom: Geom, group: string, wall?: string, side?: string, pos?: number[], course?: number, face?: [number, number][], where?: string }[]} */
  const panels = [];
  /** @type {{ id?: string, kind: string, geom: Geom, group: string, op?: string, tex?: string, from?: number, bottom?: number }[]} */
  const fixtures = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const notes = [];
  const counters = {};
  const nextId = (p) => { counters[p] = (counters[p] || 0) + 1; return `${p}${counters[p]}`; };

  const L = d.length;
  const W = d.width;
  // The two roof slopes and the ridge's line across the width: mid-width on a
  // gable, off centre toward the steep front on a saltbox (saltbox.mjs).
  const salt = d.style === 'saltbox';
  const sides = roofSides(d);
  const yR = sides.ridgeY;
  const maxStock = Math.max(...d.lengths) * 12;
  // Members that can be spliced (skids, rims, plates, a ridge board, the
  // sub-fascia) break at the longest board you can haul, so they never need a
  // long one; a ridge beam, joists, studs and rafters still take what they need.
  const shortest = Math.min(...d.lengths) * 12;
  const spliceAt = d.maxHaulFt > 0 ? Math.min(maxStock, Math.max(shortest, ...d.lengths.filter((ft) => ft <= d.maxHaulFt).map((ft) => ft * 12))) : maxStock;
  const X = /** @type {Vec} */ ([1, 0, 0]);
  const Y = /** @type {Vec} */ ([0, 1, 0]);
  const Z = /** @type {Vec} */ ([0, 0, 1]);
  const neg = (v) => /** @type {Vec} */ ([-v[0], -v[1], -v[2]]);
  const treated = (n) => (d.floorTreated ? `PT ${n}` : n);

  const push = (m) => { members.push(m); return m; };

  // ---------------- Foundation ----------------
  // With no floor (floor 'none') there are no skids, blocks, joists or
  // subfloor: each wall's bottom plate bears on a PT 4x6 perimeter timber on
  // edge on a full gravel pad, and the gravel is the floor.
  const floorless = d.floor === 'none';
  const timber = actual(PERIMETER_TIMBER); // on edge: thick across, depth up
  const skid = actual(d.skidSize); // laid on edge: thick across, depth up
  const block = floorless ? null : /** @type {any} */ (BLOCKS)[d.foundation] || null;
  const blockH = block ? block.h : 0;
  const skidTop = floorless ? timber.depth : blockH + skid.depth;
  let skidCount = floorless ? 0 : Math.max(2, Math.ceil((W - skid.thick) / d.skidSpacing) + 1);
  // A ridge beam brings about half its load down each gable post to the floor
  // at mid-width. An odd number of skids puts one right under the posts;
  // otherwise the post lands mid-span on the end joist (a 10x12 at 48" skid
  // spacing put 1,403 lb there, 1.38 times a single 2x6 joist's allowable bending).
  if (!floorless && d.roofType === 'ridgeBeam' && d.style !== 'leanTo' && skidCount % 2 === 0) skidCount += 1;
  const skidYs = [];
  for (let i = 0; i < skidCount; i++) skidYs.push(skid.thick / 2 + (i * (W - skid.thick)) / (skidCount - 1));
  // A saltbox's ridge-beam posts stand off centre: give them a skid of their own unless one is already under them.
  // The nearest inner skid moves under them if it is within half a spacing; otherwise one more skid goes in.
  if (salt && !floorless && d.roofType === 'ridgeBeam' && !skidYs.some((y) => Math.abs(y - yR) <= skid.thick / 2 - 1.5 + 1e-9)) {
    const inner = skidYs.map((y, i) => ({ y, i })).filter((x) => x.i > 0 && x.i < skidYs.length - 1).sort((p, q) => Math.abs(p.y - yR) - Math.abs(q.y - yR))[0];
    if (inner && Math.abs(inner.y - yR) <= d.skidSpacing / 2) skidYs[inner.i] = yR;
    else { skidYs.push(yR); skidCount += 1; }
    skidYs.sort((a, b) => a - b);
  }
  const skidSplit = splitRun(0, L, spliceAt, [], [], 0);
  if (skidCount && skidSplit.runs.length > 1) {
    notes.push(`Skids are longer than the longest board you allowed or can haul (${spliceAt / 12} ft), so each is spliced; stagger the joints between skids${block ? ' and land each joint on a block' : ''}.`);
  }
  // Even pieces read better than one long and one stub.
  const skidPieces = skidSplit.runs.length;
  // Block centres along each skid: one at each end, one under every skid joint
  // (a butt joint between blocks would hang in the air), and more between so no
  // two are over blockSpacing (4 ft unless you set it) apart. Without a joint
  // this is the even layout of ceil(L / blockSpacing) + 1 blocks.
  const blockXs = [];
  const bs = d.blockSpacing;
  if (block) {
    const fixed = [0];
    for (let k = 1; k < skidPieces; k++) fixed.push((L * k) / skidPieces - block.along / 2);
    fixed.push(L - block.along);
    if (skidPieces === 1) {
      const n = Math.ceil(L / bs - 1e-9) + 1;
      for (let k = 0; k < n; k++) blockXs.push((k * (L - block.along)) / (n - 1));
    } else {
      for (let i = 0; i + 1 < fixed.length; i++) {
        const n = Math.max(1, Math.ceil((fixed[i + 1] - fixed[i]) / bs - 1e-9));
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
  const underBlocks = Boolean(block) && !block.pier && d.pad === 'under blocks';
  // Or no gravel at all: the blocks sit on stripped, tamped firm soil. A pier goes down to firm soil and needs none.
  const noPad = Boolean(block) && (d.pad === 'none' || Boolean(block.pier));
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
  // Perimeter timbers (no floor): the eave walls' run the full length, the
  // gable walls' butt between them; each splices at the longest board you haul.
  if (floorless) {
    const th = timber.thick;
    const runs = [
      { name: 'front', from: 0, to: L, at: (s) => [s, 0, 0], u: X, w: Y },
      { name: 'back', from: 0, to: L, at: (s) => [s, W - th, 0], u: X, w: Y },
      { name: 'left', from: th, to: W - th, at: (s) => [0, s, 0], u: Y, w: X },
      { name: 'right', from: th, to: W - th, at: (s) => [L - th, s, 0], u: Y, w: X },
    ];
    let spliced = false;
    for (const r of runs) {
      const split = splitRun(r.from, r.to, spliceAt, [], [], 0);
      if (split.runs.length > 1) spliced = true;
      for (const [s0, s1] of split.runs) {
        push({
          id: nextId('PT'), group: 'foundation', kind: 'perimeter timber', material: `PT ${PERIMETER_TIMBER}`, length: ceil16(s1 - s0),
          note: split.runs.length > 1 ? 'butt joint, not under a door' : undefined,
          geom: rectGeom(/** @type {Vec} */ (r.at(s0)), r.u, Z, r.w, s1 - s0, timber.depth, th),
          local: { s0, s1, z0: 0, z1: th },
        });
      }
    }
    notes.push(
      `No floor: the walls stand on ${runs.length} PT ${PERIMETER_TIMBER} perimeter timbers on edge (ground-contact treated) on a full 4" gravel pad, and the gravel is the floor. It costs less than skids, joists and a subfloor, and sits ${fmtIn(timber.depth)} above the gravel instead of a framed floor's height, but:`,
      'Damp: a gravel floor drains, but the ground under it stays damp and the shed air with it. Keep tools, bags and anything that rusts or mildews up on shelves or pallets, and grade the ground so water runs away from the pad. A sheet of polyethylene under the gravel cuts the moisture rising from the soil (not on the shopping list).',
      'Rodents and insects can dig under a timber where a floor would shut them out. Galvanized 1/4" hardware cloth laid under the gravel and turned up the inside face of the timbers keeps burrowers out (not on the shopping list).',
      `The door opening keeps its timber as a ${fmtIn(timber.depth)} step; a mower or a barrow needs a short ramp of compacted gravel or a board.`,
    );
    if (spliced) notes.push(`Perimeter timbers are longer than the longest board you allowed or can haul (${spliceAt / 12} ft), so they are spliced; keep each joint off the corners, and the bottom plate's joints at least 2 ft from it.`);
  }
  // Under a ridge beam each gable post brings about half the beam's load down
  // to the ground; with no floor it needs a footing of its own, a pier
  // under the timber (below).
  const postPiers = floorless && d.roofType === 'ridgeBeam' && d.style !== 'leanTo';
  // Piers: concrete from the bottom of the hole to the top of the tube, in
  // Quikrete 80 lb bags (0.6 cu ft each, the bag's stated yield); each 4 ft
  // tube is cut into as many piers as it holds. A post pier stops at the top
  // of the 4" gravel pad, under the timber.
  const pierDef = block?.pier ? block : postPiers ? /** @type {any} */ (BLOCKS).piers : null;
  const pierLen = block?.pier ? d.pierDepth + block.h : postPiers ? d.pierDepth + 4 : 0;
  const pierCuFt = pierDef ? (Math.PI * (pierDef.tubeIn / 2) ** 2 * pierLen) / 1728 : 0;
  const pierCount = block?.pier ? skidCount * blockXs.length : postPiers ? 2 : 0;
  const pierTubes = pierCount ? Math.ceil(pierCount / Math.max(1, Math.floor(48 / pierLen))) : 0;
  // A bare 12" tube presses the starter's soil at about 2,450 psf, over the IRC's
  // 1,500 for clay or silt; the footing pad spreads it over 1.78 sq ft.
  const pierFootIn = pierDef ? pierDef.footIn : 0;
  const pierFootCuFt = pierDef ? (pierDef.footIn ** 2 * pierDef.footThick) / 1728 : 0;
  const pierBags = pierCount ? Math.ceil((pierCount * (pierCuFt + pierFootCuFt)) / 0.6 - 1e-9) : 0;
  if (postPiers) {
    for (const x of [timber.thick / 2, L - timber.thick / 2]) {
      const a = pierDef.along;
      fixtures.push({ kind: 'post pier', group: 'foundation', geom: rectGeom([x - a / 2, yR - a / 2, -pierLen], X, Z, Y, a, pierLen, a) });
    }
  }

  // ---------------- Floor ----------------
  const joist = actual(d.joistSize);
  const jz = skidTop;
  const floorTop = floorless ? timber.depth : jz + joist.depth + 0.75;
  const joistCenters = floorless ? [] : [0.75, ...layoutCenters(d.joistSpacing, 0.75 + 1.5, L - 0.75 - 1.5), L - 0.75];
  const rimSplit = splitRun(0, L, spliceAt, joistCenters);
  for (const y0 of floorless ? [] : [0, W - 1.5]) {
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
  if (!floorless && W - 3 > maxStock) warnings.push(`Floor joists need ${Math.ceil((W - 3) / 12)} ft boards; add that length to your stock list or add a centre beam (not modelled).`);
  // Floor sheets: 8 ft across the joists, rows of 4 ft, odd rows staggered half a sheet.
  /** @type {number[]} */
  const floorPieces = [];
  const floorRows = floorless ? 0 : Math.ceil(W / 48 - 1e-9);
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
  // A lean-to has one slope: the front wall stands taller than the back by the
  // rafter's rise between their seats, and the end walls are framed square at
  // the back wall's height with raked studs above, as a gable end is. It has
  // no ridge, so neither a ridge beam nor trusses.
  const lean = d.style === 'leanTo';
  const beam = !lean && d.roofType === 'ridgeBeam';
  // Site-built king-post trusses: each top-chord pair, its bottom chord and a
  // king post in one plane, joined by 7/16" OSB gussets nailed to both faces.
  const truss = !lean && d.roofType === 'truss';
  const H = d.wallHeight;
  const studLen = H - 4.5;
  const plateTop = floorTop + H;
  const rise = lean ? (W - D) * (d.pitch / 12) : 0;
  const highPlateTop = plateTop + rise;
  /** Floor to top of plates, by wall: the lean-to's front wall is the tall one. */
  const wallH = (name) => (lean && name === 'front' ? H + rise : H);
  if (wallH('front') - 4.5 > maxStock) warnings.push(`Studs are ${Math.ceil((wallH('front') - 4.5) / 12)} ft long, longer than any board you allowed.`);


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
    const Hw = wallH(name);
    const studLenW = Hw - 4.5;
    const spec = wallSpecs[name];
    const { len, start } = spec;
    const P = prefix[name];
    /** @type {Member[]} */
    const wm = [];
    const addM = (kind, material, s0, s1, z0, z1, note) => {
      const m = push({
        id: nextId(`${P}`), group: `wall:${name}`, kind, material, note,
        length: ceil16(kind.includes('plate') || kind === 'header' || kind === 'rough sill' || kind.endsWith(' block') ? s1 - s0 : z1 - z0),
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
      const hdr = headerFor(d, op);
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
      if (headerTop > Hw - 3 + 1e-9) {
        warnings.push(`${label} needs ${(headerTop + 3).toFixed(1)}" of wall with a ${hdr} header but the wall is ${Hw}"; it is left out. Lower it, use a shallower header or raise the wall.`);
        continue;
      }
      if (op.kind === 'window' && bottom < 4.5) {
        warnings.push(`${label} has its sill ${bottom}" above the floor; leave at least 4-1/2" for the plate and rough sill. It is left out.`);
        continue;
      }
      if (beam && !spec.eave && a - 3 < yR + 1.5 - start && a + op.width + 3 > yR - 1.5 - start) {
        warnings.push(`${label} is where the ridge-beam post runs down the gable wall; move it to one side. It is left out.`);
        continue;
      }
      const clash = ops.find((p) => a - 3 < p.a + p.w + 3 && a + op.width + 3 > p.a - 3);
      if (clash) {
        warnings.push(`${label} overlaps another opening's king studs; it is left out.`);
        continue;
      }
      ops.push({ op, a, w: op.width, hdr, hd, bottom, headerTop, bay: /** @type {[number, number] | null} */ (null) });
    }
    // Studs: ends, corner studs on eave walls, layout, then openings replace what they cover.
    const layout = layoutCenters(d.studSpacing, start, start + len).map((c) => c - start);
    // A window that fits inside one stud bay cuts no stud, so it needs no king,
    // jack or header (IRC R602.7 headers are for openings that interrupt
    // studs): the two layout studs are its sides, with a flat block above and
    // below. The plates span that bay as they span every other one; checks.mjs
    // checks them with a rafter landing mid-bay. Not for a door, nor when a
    // header was asked for, nor when the bay is more than 1-1/2" wider than the
    // window (it would need a filler stud).
    for (const p of ops) {
      if (p.op.kind !== 'window' || p.op.header || p.bottom + p.op.height + 1.5 > H - 3 + 1e-9) continue;
      for (let i = 0; i + 1 < layout.length; i++) {
        const f0 = layout[i] + 0.75;
        const f1 = layout[i + 1] - 0.75;
        if (!(f0 <= p.a + 1e-9 && p.a + p.w <= f1 + 1e-9 && f1 - f0 - p.w < 1.5 - 1e-9 && f0 - 1.5 >= 0 && f1 + 1.5 <= len)) continue;
        // Its side studs must stay: no other opening's kings over them.
        if (ops.some((q) => q !== p && !q.bay && f0 - 1.5 < q.a + q.w + 3 && f1 + 1.5 > q.a - 3)) continue;
        p.bay = [f0, f1];
      }
    }
    const verticals = [];
    verticals.push({ s: 0, kind: 'stud' });
    verticals.push({ s: len - 1.5, kind: 'stud' });
    if (spec.eave) {
      verticals.push({ s: D, kind: 'corner stud' });
      verticals.push({ s: len - D - 1.5, kind: 'corner stud' });
    }
    if (beam && !spec.eave) {
      // Two studs under the ridge-beam post carry it down to the floor.
      verticals.push({ s: yR - 1.5 - start, kind: 'post stud' });
      verticals.push({ s: yR - start, kind: 'post stud' });
    }
    const occupied = (s0) => verticals.some((v) => s0 < v.s + 1.5 - 1e-9 && s0 + 1.5 > v.s + 1e-9);
    const inOpening = (s0) => ops.some((p) => !p.bay && s0 < p.a + p.w + 3 - 1e-9 && s0 + 1.5 > p.a - 3 + 1e-9);
    for (const c of layout) {
      const s0 = c - 0.75;
      if (s0 < 0 || s0 + 1.5 > len) continue;
      // A saltbox's off-centre beam post can push a layout stud aside without covering its line;
      // the stud then goes tight against the post, so a siding joint on that line keeps its wood.
      const post = salt && !spec.eave ? verticals.find((v) => v.kind === 'post stud' && s0 < v.s + 1.5 - 1e-9 && s0 + 1.5 > v.s + 1e-9) : null;
      const posts = verticals.filter((v) => v.kind === 'post stud');
      if (post && !posts.some((v) => v.s <= c + 1e-9 && v.s + 1.5 >= c - 1e-9)) {
        const beside = c > yR - start ? Math.max(...verticals.filter((v) => v.kind === 'post stud').map((v) => v.s)) + 1.5 : Math.min(...verticals.filter((v) => v.kind === 'post stud').map((v) => v.s)) - 1.5;
        if (beside >= 0 && beside + 1.5 <= len && !occupied(beside) && !inOpening(beside)) verticals.push({ s: beside, kind: 'stud' });
        continue;
      }
      if (occupied(s0) || inOpening(s0)) continue;
      verticals.push({ s: s0, kind: 'stud' });
    }
    // A stud off the layout where lap siding needs one for a butt joint (two
    // openings close together can leave no layout stud between their casings).
    for (const c of lapNailers?.[name] || []) {
      const s0 = c - start - 0.75;
      if (s0 >= 0 && s0 + 1.5 <= len && !occupied(s0) && !inOpening(s0)) verticals.push({ s: s0, kind: 'stud', note: 'extra stud to back a lap siding butt joint' });
    }
    for (const v of verticals) addM(v.kind, d.studSize, v.s, v.s + 1.5, 1.5, 1.5 + studLenW, /** @type {any} */ (v).note);
    const breakCenters = verticals.map((v) => v.s + 0.75);
    // Where a plate may also break over a header: on a top cripple (or, with
    // the header tight to the plate, anywhere on it), with the header running
    // at least a stud width past the joint each side. Used only when the stud
    // centres leave no plate split.
    const headerBreaks = [];
    for (const p of ops) {
      const fixture = () => fixtures.push({
        kind: p.op.kind, group: `wall:${name}`, op: p.op.id, from: spec.start + p.a, bottom: p.bottom,
        geom: rectGeom(add(add(spec.base, spec.axis, p.a), Z, p.bottom), spec.axis, Z, neg(spec.w), p.w, p.op.height, d.siding ? 1.0 : 0.4),
      });
      if (p.bay) {
        addM('sill block', d.studSize, p.bay[0], p.bay[1], p.bottom - 1.5, p.bottom, 'flat, between the studs');
        addM('head block', d.studSize, p.bay[0], p.bay[1], p.bottom + p.op.height, p.bottom + p.op.height + 1.5, 'flat, between the studs');
        fixture();
        continue;
      }
      const jack = p.bottom + p.op.height - 1.5;
      addM('king stud', d.studSize, p.a - 3, p.a - 1.5, 1.5, 1.5 + studLenW);
      addM('king stud', d.studSize, p.a + p.w + 1.5, p.a + p.w + 3, 1.5, 1.5 + studLenW);
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
      const topGap = Hw - 3 - p.headerTop;
      const overHdr = topGap >= 1.5 ? crippleSpots.map((x) => x + 0.75) : [...inside.map((x) => x + 0.75), p.a + p.w / 2];
      headerBreaks.push(...overHdr.filter((x) => x - 1.5 >= p.a - 1.5 - 1e-9 && x + 1.5 <= p.a + p.w + 1.5 + 1e-9));
      if (topGap >= 1.5) {
        for (const s of crippleSpots) addM('top cripple', d.studSize, s, s + 1.5, p.headerTop, Hw - 3);
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
      fixture();
    }
    // Plates: bottom plate is cut out at doors; top and cap plates break on studs, cap joints kept 4 ft from top joints.
    const doorGaps = ops.filter((p) => p.op.kind === 'door').map((p) => [p.a, p.a + p.w]).sort((a, b) => a[0] - b[0]);
    const bottomRuns = [];
    let cur = 0;
    for (const [g0, g1] of doorGaps) { if (g0 > cur) bottomRuns.push([cur, g0]); cur = g1; }
    if (cur < len) bottomRuns.push([cur, len]);
    // The cap plate interlocks the corners: on the eave walls it stops one wall
    // depth short of each end, and the gable walls' cap runs that much long to
    // lap over the eave walls' top plate.
    // A lean-to's tall front wall laps nothing: its cap runs full length, and
    // the end walls' plates stop against its inside face.
    const [c0, c1] = lean && name === 'front' ? [0, len] : lean && !spec.eave ? [0, len + D] : spec.eave ? [D, len - D] : [-D, len + D];
    const capNote = lean && name === 'front' ? 'full length; the end walls stop against this wall\'s inside face'
      : lean && !spec.eave ? `stops at the tall front wall; runs ${D}" past the back end to lap over the back wall`
        : spec.eave ? `stops ${D}" short of each end; the end walls' cap laps over it` : `runs ${D}" past each end to lap over the long walls`;
    // The greedy split takes the longest top-plate piece first, which can leave
    // the cap no joint 4 ft clear of it (a window can remove the stud the cap
    // joint needs). Then choose both plates' joints together: on stud centres,
    // 4 ft apart, then the IRC's 24" minimum (R602.3.2), then over a header.
    const clearOf = (tj, gap) => (b) => tj.every((t) => Math.abs(t - b) >= gap - 1e-9);
    const runsOf = (a, b, js) => /** @type {[number, number][]} */ ([a, ...js].map((x, i) => [x, [...js, b][i]]));
    const choosePlates = (stock) => {
      const top0 = splitRun(0, len, stock, breakCenters);
      const tj0 = top0.runs.slice(1).map((r) => r[0]);
      const cap0 = splitRun(c0, c1, stock, breakCenters, tj0, 48);
      if (!tj0.length || cap0.runs.slice(1).every((x) => clearOf(tj0, 48)(x[0]))) return { top: top0, cap: cap0, overHeader: false };
      for (const [breaks, gap] of [[breakCenters, 48], [breakCenters, PLATE_OFFSET_MIN], [[...breakCenters, ...headerBreaks], PLATE_OFFSET_MIN]]) {
        // jointSets bounds its dead ends, not its answers: a long wall has more
        // top-plate joint sets than can be tried, so try the first few hundred.
        let tries = 0;
        for (const tj of jointSets(0, len, stock, breaks, () => true, 400)) {
          if (++tries > 300) break;
          const cj = jointSets(c0, c1, stock, breaks, clearOf(tj, gap), 400).next().value;
          if (!cj) continue;
          const overHeader = [...tj, ...cj].some((x) => !breakCenters.some((c) => Math.abs(c - x) < 1e-9));
          return { top: { runs: runsOf(0, len, tj), forced: false }, cap: { runs: runsOf(c0, c1, cj), forced: false }, overHeader };
        }
      }
      return { top: top0, cap: cap0, overHeader: false };
    };
    // Splice at the longest board you can haul; where that leaves a joint off
    // the framing or caps closer than 24" to a top-plate joint, take the next
    // longer board you allowed.
    const bottomWithin = (stock) => bottomRuns.map(([r0, r1]) => splitRun(r0, r1, stock, breakCenters));
    const fine = (stock, pl) => !pl.top.forced && !pl.cap.forced && !bottomWithin(stock).some((r) => r.forced)
      && pl.cap.runs.slice(1).every((x) => clearOf(pl.top.runs.slice(1).map((r) => r[0]), PLATE_OFFSET_MIN)(x[0]));
    let plateStock = spliceAt;
    let plates = choosePlates(plateStock);
    for (const ft of d.lengths.filter((x) => x * 12 > spliceAt).sort((x, y) => x - y)) {
      if (fine(plateStock, plates)) break;
      plateStock = ft * 12;
      plates = choosePlates(plateStock);
    }
    const { top, cap, overHeader } = plates;
    for (const r of bottomWithin(plateStock)) for (const [s0, s1] of r.runs) addM('bottom plate', floorless ? `PT ${d.studSize}` : d.studSize, s0, s1, 0, 1.5);
    for (const [s0, s1] of top.runs) addM('top plate', d.studSize, s0, s1, Hw - 3, Hw - 1.5);
    for (const [s0, s1] of cap.runs) addM('cap plate', d.studSize, s0, s1, Hw - 1.5, Hw, capNote);
    if (top.runs.length > 1) notes.push(`${wallLabel(d, name)}: plates are longer than the longest board you allowed or can haul, so they splice over studs; the cap plate's joints are kept 4 ft from the top plate's where the layout allows, and never under the code's 24".`);
    if (overHeader) notes.push(`${wallLabel(d, name)}: with ${plateStock / 12} ft boards no plate split keeps its joints on full studs, so a plate joint sits over the header, which runs at least 1-1/2" past it each side. Nail both plate ends down into the header (or its cripple).`);
    // A short plate stub is legal but fussy; say when one longer board avoids it.
    const stub = (pl) => Math.min(...[...pl.top.runs, ...pl.cap.runs].map(([a, b]) => b - a));
    const shortest = stub({ top, cap });
    if (top.runs.length > 1 && shortest < PLATE_OFFSET_MIN - 1e-9) {
      const better = DEFAULT_LENGTHS_FT.filter((ft) => ft * 12 > plateStock).find((ft) => {
        const pl = choosePlates(ft * 12);
        return !pl.overHeader && stub(pl) >= PLATE_OFFSET_MIN - 1e-9;
      });
      if (better) notes.push(`${wallLabel(d, name)}: the plates need a ${fmtIn(shortest)} piece with ${plateStock / 12} ft boards; ${d.maxHaulFt && better > d.maxHaulFt ? `${better} ft boards would avoid it, if you can haul them (your limit is ${d.maxHaulFt} ft)` : `adding ${better} ft boards to your list avoids it`}.`);
    }
    // Siding nailers: a 4 ft siding joint needs wood under both panel edges.
    // Where an opening's king, jack or cripples leave one side (or both) bare
    // between the plates, add a nailer flush with the framing that is there.
    if (d.siding) {
      const faceLen = spec.eave ? L : W;
      const holes = ops.map((p) => ({ s0: p.a, s1: p.a + p.w, z0: p.bottom, z1: p.bottom + p.op.height }));
      const at = (x, z) => wm.find((m) => m.local.s0 <= x + 1e-9 && m.local.s1 >= x - 1e-9 && m.local.z0 <= z + 1e-9 && m.local.z1 >= z - 1e-9);
      for (let f = 48; f < faceLen - 1e-9; f += 48) {
        const x = f - start;
        if (x < 0.75 || x > len - 0.75) continue;
        /** @type {{ s0: number, z0: number, z1: number }[]} */
        const runs = [];
        for (let z = 1.5 + 0.25; z < Hw - 3; z += 0.5) {
          if (holes.some((h) => x > h.s0 - 0.5 && x < h.s1 + 0.5 && z > h.z0 && z < h.z1)) continue;
          const left = at(x - 0.5, z);
          const right = at(x + 0.5, z);
          if (left && right) continue;
          const s0 = left ? left.local.s1 : right ? right.local.s0 - 1.5 : x - 0.75;
          const last = runs[runs.length - 1];
          if (last && Math.abs(last.s0 - s0) < 1e-9 && Math.abs(last.z1 - (z - 0.25)) < 1e-9) last.z1 = z + 0.25;
          else runs.push({ s0, z0: z - 0.25, z1: z + 0.25 });
        }
        for (const r of runs) {
          // Between two members closer than 1-1/2" (a king beside an end stud) the nailer is ripped to the gap.
          const beside = (m) => m.local.z0 < r.z1 - 1e-9 && m.local.z1 > r.z0 + 1e-9;
          const nextRight = wm.filter((m) => beside(m) && m.local.s0 >= r.s0 + 1e-9).reduce((t, m) => Math.min(t, m.local.s0), len);
          const s1 = Math.min(r.s0 + 1.5, nextRight);
          const s0a = s1 - r.s0 < 1.5 - 1e-9 && r.s0 === x - 0.75 ? Math.max(0, s1 - 1.5) : r.s0;
          // ... and between a king and a post or stud on its left, ripped to that gap too.
          const s0 = wm.filter((m) => beside(m) && m.local.s1 > s0a + 1e-9 && m.local.s1 < s1 - 1e-9 && m.local.s0 < s0a + 1e-9).reduce((t, m) => Math.max(t, m.local.s1), s0a);
          // It has to put wood under whichever panel edge was bare.
          const zm = (r.z0 + r.z1) / 2;
          const wooded = (xx) => Boolean(at(xx, zm)) || (s0 <= xx + 1e-9 && s1 >= xx - 1e-9);
          if (s1 - s0 < 0.5 || !wooded(x - 0.5) || !wooded(x + 0.5)) continue;
          // Snap to the members above and below, and keep it only if it clashes with nothing.
          const over = (m) => m.local.s0 < s1 - 1e-9 && m.local.s1 > s0 + 1e-9;
          const below = wm.filter((m) => over(m) && m.local.z1 <= r.z0 + 0.5 + 1e-9).reduce((t, m) => Math.max(t, m.local.z1), 1.5);
          const above = wm.filter((m) => over(m) && m.local.z0 >= r.z1 - 0.5 - 1e-9).reduce((t, m) => Math.min(t, m.local.z0), Hw - 3);
          if (above - below < 3) continue;
          if (wm.some((m) => over(m) && m.local.z0 < above - 1e-9 && m.local.z1 > below + 1e-9) || s0 < 0 || s1 > len) continue;
          const m = addM('siding nailer', d.studSize, s0, s1, below, above, s1 - s0 < 1.5 - 1e-9 ? `behind a siding joint beside an opening; ripped to ${fmtIn(s1 - s0)} to fit` : 'behind a siding joint beside an opening');
          m.length = ceil16(above - below);
        }
      }
    }
    walls[name] = { name, len, start, members: wm, openings: ops, eave: spec.eave, height: Hw };
  }

  // ---------------- Roof ----------------
  const t = d.pitch / 12;
  const cos = 1 / Math.sqrt(1 + t * t);
  const sin = t * cos;
  const raf = actual(d.rafterSize);
  const rd = raf.depth;
  const plumbH = rd / cos;
  const o = d.overhang;
  const rh = beam ? 1.5 : truss ? 0 : 0.75; // half the ridge's thickness: one board, a two-ply beam, or none (truss chords meet)
  const r = W / 2 - rh;
  // With a birdsmouth the rafter's underside passes through the inside top edge of the plate;
  // on a variable-pitch connector (no notch) it rests on the outside top edge instead.
  // A truss's top chord sits on its bottom chord, so its underside passes through
  // the top outside corner of the bottom chord, a chord's depth above the plate.
  const connector = !truss && d.rafterSeat === 'connector';
  const chord = actual(d.tieSize);
  const seatBase = plateTop + (truss ? chord.depth : 0);
  const seatAt = connector || truss ? 0 : D;
  const zb = (dist) => seatBase + (dist - seatAt) * t; // underside of rafter at a distance from the eave wall's outside face
  const zt = (dist) => zb(dist) + plumbH; // top of rafter
  // The same, side by side: on a saltbox the front slope is steeper than the
  // back, and the ridge is off centre at yR. On a gable both sides are zb and zt.
  /** @param {boolean} back */
  const slope = (back) => { const sd = back ? sides.back : sides.front; return { t: sd.t, cos: sd.cos, sin: sd.t * sd.cos, plumb: rd / sd.cos, pitch: sd.pitch }; };
  /** @param {number} dist @param {boolean} back */
  const zbS = (dist, back) => seatBase + (dist - seatAt) * slope(back).t;
  /** @param {number} dist @param {boolean} back */
  const ztS = (dist, back) => zbS(dist, back) + slope(back).plumb;
  /** A side's rafter run, from its eave wall's outside face to the ridge's face. @param {boolean} back */
  const runS = (back) => (back ? W - yR : yR) - rh;
  /** The underside and top of a gable or saltbox roof at a point across the width: the lower of the two slopes' lines. */
  const underAt = (y) => Math.min(zbS(y, false), zbS(W - y, true));
  const overAt = (y) => Math.min(ztS(y, false), ztS(W - y, true));
  // A gambrel's cross-section, gussets and checks (gambrel.mjs); null for a gable.
  const gam = d.style === 'gambrel' ? gambrelShape(d, plateTop) : null;
  const gamFrame = gam ? gambrelAnalysis(d) : null;
  const loftX = gam ? loftSpan(d, D) : null;
  const gamParts = gam && gamFrame ? gambrelParts(gam, gamFrame.gusset) : null;
  // A lean-to's rafter runs from the back wall (dist 0) over the front wall
  // (dist W): its underside meets the back seat as a gable rafter's does, and
  // the front wall stands `rise` taller so the front seat lands on its plates.
  // Its high point is the top of the front tail.
  // A ridge's top is flush with the lower of the two rafters' tops at its faces (the steep side's, on a saltbox).
  const ridgeTop = lean ? zt(W + o) : gam ? gam.ridgeTop : Math.min(ztS(runS(false), false), ztS(runS(true), true));
  // How deep the ridge has to be to take both sides' plumb cuts: on a gable, the plumb cut.
  const plumbNeed = lean || gam ? plumbH : Math.max(ridgeTop - zbS(runS(false), false), ridgeTop - zbS(runS(true), true));
  let ridgeSize = lean ? '' : beam ? d.beamSize : truss ? d.rafterSize : TWO_BY.find((s) => TWO_BY.indexOf(s) > TWO_BY.indexOf(d.rafterSize) && actual(s).depth >= plumbNeed - 1e-9);
  if (beam && actual(d.beamSize).depth < plumbNeed - 1e-9) {
    warnings.push(`A ${d.beamSize} ridge beam is shallower than the rafters' ${plumbNeed.toFixed(2)}" plumb cut${salt ? 's' : ''}; choose a deeper beam.`);
  }
  if (!ridgeSize && !lean && !gam) {
    ridgeSize = '2x12';
    warnings.push(`At ${salt ? `${sides.front.pitch}/12 and ${d.pitch}/12 the rafters' plumb cuts need` : `${d.pitch}/12 the rafter's plumb cut is`} ${plumbNeed.toFixed(2)}" ${salt ? 'of ridge' : 'deep'}, more than a 2x12 ridge; use a built-up or engineered ridge.`);
  }
  const ridgeD = lean || truss || gam ? 0 : actual(ridgeSize).depth;
  const steepT = salt ? Math.max(t, sides.front.t) : t;
  if (!connector && !truss && !gam && D * steepT > rd / 3 + 1e-9) {
    warnings.push(`The birdsmouth${salt ? ' on the steep front rafters' : ''} is ${(D * steepT).toFixed(2)}" deep, more than a third of the ${d.rafterSize} rafter; a deeper rafter or lower pitch keeps more wood over the wall.`);
  }
  const rafterCut = ceil16(((lean ? W + o : r) + o) / cos + rd * Math.tan(Math.atan(t)));
  /** A side's rafter cut length (a saltbox's two sides differ). @param {boolean} back */
  const rafterCutS = (back) => (lean || !salt ? rafterCut : ceil16((runS(back) + o) / slope(back).cos + rd * slope(back).t));
  // The end rafters sit over the gable walls. An inner rafter (and the tie
  // nailed to its far side) must clear the gable wall's studs, so one that
  // lands within a wall's depth of an end moves in to the nearest clear spot;
  // that shortens its bay rather than widening one past the spacing.
  // Under a gambrel's loft a joist lies against the inside of each gable wall; trusses keep clear of it.
  const innerLo = D + 0.75 + (truss ? GUSSET_T : 0) + (loftX ? 1.5 : 0);
  const innerHi = L - D - 0.75 - (beam || lean ? 0 : truss ? GUSSET_T : 1.5) - (loftX ? 1.5 : 0);
  const rafterCenters = [0.75, ...[...new Set(layoutCenters(d.rafterSpacing, 0.75 + 1.5, L - 0.75 - 1.5)
    .map((c) => Math.min(innerHi, Math.max(innerLo, c))))].filter((c) => innerLo <= innerHi), L - 0.75];
  /** @param {number} dist @param {boolean} back */
  const yOf = (dist, back) => (back ? W - dist : dist);
  const rafterProfile = (back) => {
    const rr = runS(back);
    const zbb = (dist) => zbS(dist, back);
    const ztt = (dist) => ztS(dist, back);
    /** @type {[number, number][]} */
    const pts = [];
    if (o > 0) pts.push([yOf(-o, back), zbb(-o)]);
    if (connector || truss) pts.push([yOf(0, back), zbb(0)], [yOf(rr, back), zbb(rr)], [yOf(rr, back), ztt(rr)], [yOf(-o, back), ztt(-o)]);
    else pts.push([yOf(0, back), zbb(0)], [yOf(0, back), plateTop], [yOf(D, back), plateTop], [yOf(rr, back), zbb(rr)], [yOf(rr, back), ztt(rr)], [yOf(-o, back), ztt(-o)]);
    if (o === 0 && !connector && !truss) pts.splice(0, 1); // tail is the heel cut: start at the plate seat
    return pts;
  };
  /** @param {boolean} back */
  const birdNoteS = (back) => {
    const p = slope(back).pitch;
    const which = salt ? (back ? 'back (long) slope: ' : 'front (steep) slope: ') : '';
    return truss
      ? `truss top chord: ${p}/12 plumb cuts at the peak and tail; no notch: sits on the bottom chord, joined by gussets`
      : connector
      ? `${which}${p}/12 plumb cuts at ridge and tail; no birdsmouth: sits on a variable-pitch connector`
      : `${which}${p}/12 plumb cuts at ridge and tail; birdsmouth ${((D * slope(back).t)).toFixed(2).replace(/\.?0+$/, '')}" heel, ${D}" seat`;
  };
  if (lean) {
    // One rafter a bay, eave tail to eave tail. A birdsmouth notches each
    // wall: at the back the underside passes the plate's inside top edge (the
    // heel at the outside face), at the front its outside top edge (the heel
    // at the inside face). On a connector the underside rests on the back
    // plate's outside edge and the front plate's inside edge, and the
    // connector's seat takes up the slope.
    const fz = highPlateTop;
    /** @type {[number, number][]} */
    const pts = [[W + o, zb(-o)], [W, zb(0)]];
    if (connector) pts.push([D, zb(W - D)], [-o, zb(W + o)]);
    else pts.push([W, plateTop], [W - D, plateTop], [D, zb(W - D)], [D, fz], [0, fz], [-o, zb(W + o)]);
    pts.push([-o, zt(W + o)], [W + o, zt(-o)]);
    const prof = /** @type {[number, number][]} */ (pts.filter((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) + Math.abs(q[1] - pts[i - 1][1]) > 1e-9));
    const note = connector
      ? `${d.pitch}/12 plumb cuts at both tails; no birdsmouth: sits on a variable-pitch connector on each wall`
      : `${d.pitch}/12 plumb cuts at both tails; a birdsmouth on each wall, ${(D * t).toFixed(2).replace(/\.?0+$/, '')}" heel, ${D}" seat (the front one's heel faces in)`;
    for (const c of rafterCenters) {
      push({
        id: nextId('RF'), group: 'roof', kind: 'rafter', material: d.rafterSize, length: rafterCut, note,
        geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 1.5 },
      });
    }
  }
  if (!gam) for (const c of lean ? [] : rafterCenters) {
    for (const back of [false, true]) {
      push({
        id: nextId('RF'), group: 'roof', kind: 'rafter', material: d.rafterSize, length: rafterCutS(back), note: birdNoteS(back),
        geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: rafterProfile(back), thickness: 1.5 },
      });
    }
  }
  // The metal you buy, shown where it goes: a variable-pitch connector's two side
  // plates at each rafter seat, and a hanger's two flanges where a rafter meets
  // the ridge beam (thin steel, so drawn 1/16" thick).
  if (!gam) {
    const steel = 1 / 16;
    const sides = (c) => [c - 0.75 - steel, c + 0.75];
    for (const c of rafterCenters) {
      for (const back of [false, true]) {
        if (connector) {
          for (const x of sides(c)) {
            const y0 = back ? W - D : 0;
            fixtures.push({ kind: 'connector', group: 'roof', geom: rectGeom([x, y0, back ? plateTop : highPlateTop], Y, Z, X, D, 3, steel) });
          }
        }
        if (beam) {
          for (const x of sides(c)) {
            const y0 = back ? yR + rh : yR - rh - 2;
            fixtures.push({ kind: 'connector', group: 'roof', geom: rectGeom([x, y0, zbS(runS(back), back) - 0.5], Y, Z, X, 2, Math.min(4.5, slope(back).plumb), steel) });
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
    const topAt = (y, back = false) => ztS(y, back) - plateTop;
    // A birdsmouth deep enough to leave no rafter above the plate's outside
    // edge leaves no room for a block either (the birdsmouth warning says so).
    if (!gam && Math.min(topAt(0), topAt(0, true)) > 0.5) {
    /** @type {(back: boolean) => [number, number][]} */
    const front = (back) => [[0, plateTop], [1.5, plateTop], [1.5, plateTop + topAt(1.5, back)], [0, plateTop + topAt(0, back)]];
    // A lean-to's front block sits on the tall wall, under the high end of the rafters.
    /** @type {[number, number][]} */
    const leanFront = [[0, highPlateTop], [1.5, highPlateTop], [1.5, zt(W - 1.5)], [0, zt(W)]];
    for (const back of [false, true]) {
      const prof = /** @type {[number, number][]} */ (lean && !back ? leanFront : front(back).map(([y, z]) => [yOf(y, back), z]));
      for (let i = 0; i + 1 < rafterCenters.length; i++) {
        // A rafter tie sits on the plate beside every rafter but the end ones; start past it.
        const tied = !beam && !truss && !lean && i > 0 && i < rafterCenters.length - 1 && ztS(0, back) - plateTop > 0.5;
        // Trusses carry a gusset on each face at the heel: start and stop past them.
        const inner = (j) => truss && j > 0 && j < rafterCenters.length - 1;
        const x0 = rafterCenters[i] + 0.75 + (tied ? 1.5 : 0) + (inner(i) ? GUSSET_T : 0);
        const gap = rafterCenters[i + 1] - 0.75 - x0 - (inner(i + 1) ? GUSSET_T : 0);
        if (gap < 1) continue;
        // Between trusses the block is a square-cut piece of the bottom chord's size
        // on the plate; the space above it, under the roof, is the soffit's vent path.
        if (truss) {
          push({
            id: nextId('EB'), group: 'roof', kind: 'eave blocking', material: d.tieSize, length: ceil16(gap),
            note: 'between the truss heels on the plate, flush outside; screen the gap above for venting',
            geom: rectGeom([x0, back ? W - 1.5 : 0, plateTop], X, Y, Z, gap, 1.5, chord.depth),
          });
          continue;
        }
        push({
          id: nextId('EB'), group: 'roof', kind: 'eave blocking', material: d.rafterSize, length: ceil16(gap),
          note: `between rafters on the plate, top bevelled to ${slope(back).pitch}/12`,
          geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: gap },
        });
      }
    }
    }
  }
  if (gam) {
    // no ridge: the gussets and the sheathing join the upper chords at the peak
  } else if (truss) {
    // No ridge member: the top chords meet at the peak, held by the peak gussets.
  } else if (beam) {
    // Structural ridge beam: two plies, one piece each, rafters hung from it.
    for (const y0 of [yR - 1.5, yR]) {
      push({
        id: nextId('RB'), group: 'roof', kind: 'ridge beam', material: ridgeSize, length: ceil16(L),
        note: 'two plies nailed together; one piece, bears on the gable posts',
        geom: rectGeom([0, y0, ridgeTop - actual(ridgeSize).depth], X, Z, Y, L, actual(ridgeSize).depth, 1.5),
      });
    }
    if (L > maxStock) warnings.push(`The ridge beam should be one piece ${Math.ceil(L / 12)} ft long; add that length to your board list.`);
    notes.push(`Ridge-beam roof: the beam carries the rafters (fix them with hangers), so there are no rafter ties and the inside is open to the roof. The beam size is your choice, not a span-table result; check it for a ${fmtSpan(L)} span and your snow load.`);
  } else if (lean) {
    notes.push(`Lean-to roof: each rafter bears on the tall front wall and the low back wall, so there is no ridge and no rafter ties; it pushes no wall outward. The front wall is ${fmtIn(rise)} taller than the back. Cover the soffits with vented panels at both eaves: air comes in low and out high.`);
  } else {
    const ridgeSplit = splitRun(0, L, spliceAt, rafterCenters);
    for (const [s0, s1] of ridgeSplit.runs) {
      push({
        id: nextId('RB'), group: 'roof', kind: 'ridge board', material: ridgeSize, length: ceil16(s1 - s0),
        note: ridgeSplit.runs.length > 1 ? 'joint centred on a rafter pair' : undefined,
        geom: rectGeom([s0, yR - 0.75, ridgeTop - ridgeD], X, Z, Y, s1 - s0, ridgeD, 1.5),
      });
    }
  }
  if (salt) {
    notes.push(`Saltbox roof: the ridge is ${fmtIn(yR)} back from the front wall's outside face, where a ${sides.front.pitch}/12 front and a ${d.pitch}/12 back meet. Two rafter cuts: ${fmtIn(rafterCutS(false))} at the front, ${fmtIn(rafterCutS(true))} at the back. The ${ridgeSize} ridge is set flush with the steep front rafters' tops, so the back rafters stand ${fmtIn(rh * (sides.front.t - t))} proud of it at their plumb cut; the sheathing bridges it.`);
  }
  // Rafter ties at plate height on every pair but the gable ends, which the gable wall ties.
  const tie = actual(d.tieSize);
  const topAt0 = Math.min(ztS(0, false), ztS(0, true)) - plateTop;
  // On a flat, narrow roof the ridge can hang lower than the ties (or, for a
  // beam, the gable walls' plates) it has to clear.
  const ridgeBottom = ridgeTop - ridgeD;
  const clearAbove = beam ? plateTop : plateTop + tie.depth;
  if (!truss && !gam && !lean && ridgeBottom < clearAbove - 1 / 16) {
    warnings.push(`The ridge sits too low: its underside is ${fmtIn(clearAbove - ridgeBottom)} below the ${beam ? 'top of the gable walls' : 'tops of the rafter ties'}, so the two run into each other as drawn. Steepen the roof${beam ? ', use a shallower beam' : ''} or widen the shed.`);
  }
  /** @type {{ x: number, heel: number, peak: number, foot: number }[]} */
  const trusses = [];
  if (gam) {
    frameGambrelTrusses();
  } else if (beam || lean) {
    // no ties: the ridge beam (or, on a lean-to, the tall wall) holds the rafters up, so they do not push the walls out
  } else if (truss) {
    // Each truss inside the gable ends: the bottom chord, wall face to wall face
    // on the plates, in the plane of its top chords; a king post from the bottom
    // chord to the peak; and a gusset on each face at both heels, the peak and
    // the king post's foot. Over each gable wall the top chords bear on gable
    // studs (as under a ridge board), with the gable siding as their gusset.
    // Under each end pair's heels, a block of the chord size on the long wall's
    // plate fills the chord's depth, so the end top chords bear like the rest.
    for (const c of [rafterCenters[0], rafterCenters[rafterCenters.length - 1]]) {
      for (const back of [false, true]) {
        const y0 = back ? W - D : 0;
        push({
          id: nextId('BC'), group: 'roof', kind: 'heel block', material: d.tieSize, length: ceil16(D),
          note: 'on the long wall\'s plate under a gable-end top chord\'s heel',
          geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: [[y0, plateTop], [y0 + D, plateTop], [y0 + D, seatBase], [y0, seatBase]], thickness: 1.5 },
        });
      }
    }
    const kpHalf = chord.depth / 2;
    // A king post only where the bottom chord needs holding up at mid-span (truss.mjs).
    const kpTop = needsKingPost(d) ? zb(W / 2 - kpHalf) - seatBase : 0;
    for (const c of rafterCenters.slice(1, -1)) {
      push({
        id: nextId('BC'), group: 'roof', kind: 'bottom chord', material: d.tieSize, length: ceil16(W),
        note: 'square ends, flush with the outside of the walls; gussets join it to the top chords',
        geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: [[0, plateTop], [W, plateTop], [W, seatBase], [0, seatBase]], thickness: 1.5 },
      });
      if (kpTop >= 3) {
        push({
          id: nextId('KP'), group: 'roof', kind: 'king post', material: d.tieSize, length: ceil16(zb(W / 2) - seatBase),
          note: `top cut to a point at ${d.pitch}/12 each way, under the peak`,
          geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, thickness: 1.5,
            profile: [[W / 2 - kpHalf, seatBase], [W / 2 + kpHalf, seatBase], [W / 2 + kpHalf, zb(W / 2 - kpHalf)], [W / 2, zb(W / 2)], [W / 2 - kpHalf, zb(W / 2 - kpHalf)]] },
        });
      }
      const gl = GUSSET.heel;
      const pl = GUSSET.peak;
      const fl = GUSSET.foot;
      /** @type {[string, [number, number][]][]} */
      const shapes = [
        ['heel', [[0, plateTop], [gl, plateTop], [gl, zt(gl)], [0, zt(0)]]],
        ['heel', [[W - gl, plateTop], [W, plateTop], [W, zt(0)], [W - gl, zt(gl)]]],
        ['peak', [[W / 2 - pl, zb(W / 2 - pl)], [W / 2 + pl, zb(W / 2 - pl)], [W / 2 + pl, zt(W / 2 - pl)], [W / 2, zt(W / 2)], [W / 2 - pl, zt(W / 2 - pl)]]],
      ];
      if (kpTop >= 3) shapes.push(['foot', [[W / 2 - fl, plateTop], [W / 2 + fl, plateTop], [W / 2 + fl, seatBase + Math.min(6, kpTop)], [W / 2 - fl, seatBase + Math.min(6, kpTop)]]]);
      for (const [where, prof] of shapes) {
        for (const fx of [c - 0.75 - GUSSET_T, c + 0.75]) {
          panels.push({ id: nextId('GU'), kind: 'truss gusset', item: 'roofSheet', group: 'roof', where, geom: { origin: [fx, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: GUSSET_T } });
        }
      }
      trusses.push({ x: c, heel: gl, peak: pl, foot: fl });
    }
    // Under net wind uplift the bottom chords push: with no king post, a 2x4
    // laid flat across their tops at mid-span, end to end between the gable
    // walls, halves their unbraced length (truss.mjs, needsChordBrace). An
    // attic deck nailed to the chords braces them instead. Pieces
    // no longer than the longest board, each joint on a truss.
    if (kpTop < 3 && needsChordBrace(d) && !d.atticStorage && rafterCenters.length > 3) {
      // From the inside face of one gable wall's framing to the other's.
      const x0 = stud.depth;
      const x1 = L - stud.depth;
      const cuts = [x0];
      while (x1 - cuts[cuts.length - 1] > spliceAt + 1e-9) {
        const at = rafterCenters.filter((c) => c > cuts[cuts.length - 1] + 1 && c <= cuts[cuts.length - 1] + spliceAt + 1e-9).pop();
        if (at === undefined) break;
        cuts.push(at);
      }
      cuts.push(x1);
      for (let i = 0; i + 1 < cuts.length; i++) {
        push({
          id: nextId('CB'), group: 'roof', kind: 'chord brace', material: '2x4', length: ceil16(cuts[i + 1] - cuts[i]),
          note: 'flat across the bottom chords at mid-span, two 10d into each; ends butt the gable-end framing, toenailed',
          geom: { origin: [cuts[i], W / 2 - 1.75, seatBase], u: X, v: Y, w: Z, profile: [[0, 0], [cuts[i + 1] - cuts[i], 0], [cuts[i + 1] - cuts[i], 3.5], [0, 3.5]], thickness: 1.5 },
        });
      }
    }
    notes.push(`Trusses: ${rafterCenters.length - 2} site-built ${kpTop >= 3 ? 'king-post trusses' : 'trusses (no web: the bottom chord spans the walls on its own)'} at ${d.rafterSpacing}" on centre, ${d.rafterSize} top chords and a ${d.tieSize} bottom chord${kpTop >= 3 ? ` and king post` : ''}, joined by 7/16" OSB gussets glued and nailed on both faces. Over each gable wall the top chords bear on the gable studs instead, with the gable siding nailed to both as their gusset. Build the trusses flat on a jig, then stand them on the walls; nothing is longer than ${fmtSpan(Math.max(W, rafterCut))}.`);
    if (W > maxStock) warnings.push(`Truss bottom chords need ${Math.ceil(W / 12)} ft boards; add that length to your stock list.`);
    // Attic storage: a deck of the floor panel on the inside trusses' bottom
    // chords, where a 12" tote fits under the top chords, in two strips either
    // side of the king posts. The end bays stay open as the way up.
    if (d.atticStorage && rafterCenters.length > 3) {
      const clear = ATTIC_CLEAR + ATTIC_DECK_T;
      const yIn = clear / t; // the top chord's underside is `clear` above the chord here
      const kp = kpTop >= 3;
      const strips = kp ? [[yIn, W / 2 - kpHalf], [W / 2 + kpHalf, W - yIn]] : [[yIn, W - yIn]];
      const x0 = rafterCenters[1] - 0.75;
      const x1 = rafterCenters[rafterCenters.length - 2] + 0.75;
      // Panel ends land on a truss centre, no piece longer than a sheet.
      const cuts = [x0];
      while (x1 - cuts[cuts.length - 1] > 96 + 1e-9) {
        const at = rafterCenters.filter((c) => c > cuts[cuts.length - 1] + 1 && c <= cuts[cuts.length - 1] + 96 + 1e-9).pop();
        if (at === undefined) break;
        cuts.push(at);
      }
      cuts.push(x1);
      for (const [y0, y1] of strips) {
        if (y1 - y0 < 6) continue;
        for (let i = 0; i + 1 < cuts.length; i++) {
          panels.push({ id: nextId('AD'), kind: 'attic deck', item: d.floorPanel === 'OSB' ? 'floorOSB' : 'floorSheet', group: 'roof', geom: rectGeom([cuts[i], y0, seatBase], X, Y, Z, cuts[i + 1] - cuts[i], y1 - y0, ATTIC_DECK_T) });
        }
      }
      const area = panels.filter((p) => p.kind === 'attic deck').reduce((tot, p) => tot + (p.geom.profile[2][0] * p.geom.profile[2][1]) / 144, 0);
      if (area) notes.push(`Attic storage: ${area.toFixed(0)} sq ft of deck on the truss bottom chords, where a 12" tote fits under the roof; the chords and walls are checked for 20 psf of storage (IRC Table R301.5). Reach it through the open end bays.`);
      else warnings.push('Attic storage: the roof is too low for 12" of clear height over the bottom chords, so no deck is laid; steepen the roof.');
    }
  } else if (topAt0 <= 0.5) {
    warnings.push('The rafters are too shallow over the wall for a rafter tie at the plate; deepen the rafters.');
  } else {
    // Each end of the tie is cut to its own slope where the rafter's top comes down below the tie's.
    const endTop = (back) => ztS(0, back) - plateTop;
    const clipped = topAt0 < tie.depth;
    const dcS = (back) => (endTop(back) < tie.depth ? D + (tie.depth - slope(back).plumb) / slope(back).t : 0);
    /** @type {[number, number][]} */
    const prof = /** @type {[number, number][]} */ ((clipped
      ? [[0, plateTop], [W, plateTop], [W, plateTop + Math.min(tie.depth, endTop(true))], [W - dcS(true), plateTop + tie.depth], [dcS(false), plateTop + tie.depth], [0, plateTop + Math.min(tie.depth, endTop(false))]]
      : [[0, plateTop], [W, plateTop], [W, plateTop + tie.depth], [0, plateTop + tie.depth]])
      .filter((q, i, a) => i === 0 || Math.abs(q[0] - a[i - 1][0]) + Math.abs(q[1] - a[i - 1][1]) > 1e-9));
    rafterCenters.slice(1, -1).forEach((c) => {
      push({
        id: nextId('RT'), group: 'roof', kind: 'rafter tie', material: d.tieSize, length: ceil16(W),
        note: clipped ? `end${salt ? 's each' : 's'} cut to the roof slope` : 'nail to rafter at the plate',
        geom: { origin: [c + 0.75, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 1.5 },
      });
    });
    if (W > maxStock) warnings.push(`Rafter ties need ${Math.ceil(W / 12)} ft boards; add that length to your stock list.`);
  }
  /**
   * The gambrel trusses (gambrel.mjs has the shape and the checks): four chords
   * a truss, plywood gussets on both faces at the knees and the peak, and a tie
   * at plate height beside the lower chords. The end trusses stand on the gable
   * walls, whose studs carry them, so they get neither. Under a loft the ties
   * are loft joists, a joist lies against the inside of each gable wall the loft
   * reaches, and a subfloor covers them.
   */
  function frameGambrelTrusses() {
    if (!gam || !gamFrame || !gamParts) return;
    const P = gamParts;
    const td = gamFrame.tieDepth;
    const mirror = (pts, back) => /** @type {[number, number][]} */ (pts.map(([y, z]) => [yOf(y, back), z]));
    const last = rafterCenters.length - 1;
    rafterCenters.forEach((c, i) => {
      const end = i === 0 || i === last;
      for (const back of [false, true]) {
        push({
          id: nextId('GL'), group: 'roof', kind: 'lower chord', material: d.rafterSize, length: P.lowerCut,
          note: `${d.gambrelLower}/12; foot cut level (${P.footDeg} deg off square) to sit on the plate, top mitred ${P.kneeLowDeg} deg off square at the knee`,
          geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: mirror(P.lower, back), thickness: 1.5 },
        });
        push({
          id: nextId('GU'), group: 'roof', kind: 'upper chord', material: d.rafterSize, length: P.upperCut,
          note: `${d.pitch}/12; bottom mitred ${P.kneeUpDeg} deg off square at the knee, plumb cut (${P.ridgeDeg} deg off square) at the peak`,
          geom: { origin: [c - 0.75, 0, 0], u: Y, v: Z, w: X, profile: mirror(P.upper, back), thickness: 1.5 },
        });
        if (!end) {
          for (const x of [c - 0.75 - GAMBREL_GUSSET_T, c + 0.75]) panels.push({ id: nextId('GK'), kind: 'gambrel gusset', item: 'gusset', group: 'roof', geom: { origin: [x, 0, 0], u: Y, v: Z, w: X, profile: mirror(P.knee, back), thickness: GAMBREL_GUSSET_T } });
        }
      }
      if (!end) {
        for (const x of [c - 0.75 - GAMBREL_GUSSET_T, c + 0.75]) panels.push({ id: nextId('GP'), kind: 'gambrel gusset', item: 'gusset', group: 'roof', geom: { origin: [x, 0, 0], u: Y, v: Z, w: X, profile: P.peak, thickness: GAMBREL_GUSSET_T } });
      }
    });
    // Ties (or loft joists) on the plates, ends cut to the lower slope.
    const dc = td / gam.tl;
    /** @type {[number, number][]} */
    const prof = [[0, plateTop], [W, plateTop], [W - dc, plateTop + td], [dc, plateTop + td]];
    const tieNote = loftX ? `loft joist and truss tie; ends cut to ${d.gambrelLower}/12, ${gamFrame.heelNails} 16d into each lower chord` : `truss tie on the plates; ends cut to ${d.gambrelLower}/12, ${gamFrame.heelNails} 16d into each lower chord`;
    /** Loft joist centres, for the subfloor's end joints. */
    const joists = [];
    rafterCenters.slice(1, -1).forEach((c) => {
      push({ id: nextId('RT'), group: 'roof', kind: 'rafter tie', material: gamFrame.tieSize, length: ceil16(W), note: tieNote, geom: { origin: [c + 0.75, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 1.5 } });
      joists.push(c + 1.5);
    });
    if (W > maxStock) warnings.push(`The truss ties need ${Math.ceil(W / 12)} ft boards; add that length to your stock list.`);
    // Under wind uplift the ties are pushed, not pulled: a 2x4 laid flat along their tops at mid-span, gable
    // wall to gable wall (or to the loft's edge), halves their unbraced length (gambrel.mjs, tieBrace).
    if (gamFrame.tieBrace) {
      const x0 = D;
      // To the loft's edge joist (the one nearest where a half loft starts), or the far gable wall.
      const x1 = loftX ? joists.reduce((b, j) => (Math.abs(j - loftX[0]) < Math.abs(b - loftX[0]) ? j : b), joists[0]) - 0.75 : L - D;
      const cuts = [x0];
      while (x1 - cuts[cuts.length - 1] > spliceAt + 1e-9) {
        const at = joists.map((j) => j - 1.5).filter((c) => c > cuts[cuts.length - 1] + 1 && c <= cuts[cuts.length - 1] + spliceAt + 1e-9).pop();
        if (at === undefined) break;
        cuts.push(at);
      }
      cuts.push(x1);
      for (let i = 0; i + 1 < cuts.length; i++) {
        if (cuts[i + 1] - cuts[i] < 1) continue;
        push({
          id: nextId('CB'), group: 'roof', kind: 'chord brace', material: '2x4', length: ceil16(cuts[i + 1] - cuts[i]),
          note: `flat across the ties at mid-span, two 10d into each; ends butt the ${loftX && i + 2 === cuts.length ? 'loft\'s edge joist' : 'gable-end framing'}, toenailed`,
          geom: { origin: [cuts[i], W / 2 - 1.75, plateTop + td], u: X, v: Y, w: Z, profile: [[0, 0], [cuts[i + 1] - cuts[i], 0], [cuts[i + 1] - cuts[i], 3.5], [0, 3.5]], thickness: 1.5 },
        });
      }
    }
    const kneeLow = gam.zk - gamFrame.gusset.knee * gam.sl - gam.rd * gam.cl;
    if (kneeLow < plateTop + td + 1) warnings.push('The knee gussets come down to the ties; raise the knee (a longer lower slope) or use a shallower tie.');
    if (!loftX) return;
    for (const x0 of [loftX[0] <= D + 1e-9 ? D : null, L - D - 1.5]) {
      if (x0 === null) continue;
      push({ id: nextId('LJ'), group: 'roof', kind: 'loft joist', material: gamFrame.tieSize, length: ceil16(W), note: 'against the inside of the gable wall, on the eave-wall plates; ends cut to the lower slope', geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 1.5 } });
      joists.push(x0 + 0.75);
    }
    joists.sort((a, b) => a - b);
    // The subfloor: 4 ft rows across the width between the lower chords, end joints on joists.
    const deckZ = plateTop + td;
    const yd = Math.ceil(((td + 0.75 + gam.rd / gam.cl) / gam.tl) * 4) / 4;
    const xa = loftX[0] <= D + 1e-9 ? D : joists.reduce((b, j) => (Math.abs(j - loftX[0]) < Math.abs(b - loftX[0]) ? j : b), joists[0]);
    const xb = L - D;
    const rows = Math.ceil((W - 2 * yd) / 48 - 1e-9);
    for (let rr = 0; rr < rows; rr++) {
      const y0 = yd + rr * 48;
      const h = Math.min(48, W - yd - y0);
      const cuts = [xa];
      for (let x = xa + (rr % 2 ? 48 : 96); x < xb - 1e-9;) {
        const on = joists.filter((j) => j <= x + 1e-9 && j > cuts[cuts.length - 1] + 12).pop() ?? x;
        cuts.push(on);
        x = on + 96;
      }
      cuts.push(xb);
      for (let i = 0; i + 1 < cuts.length; i++) {
        panels.push({ id: nextId('LD'), kind: 'loft deck', item: d.floorPanel === 'OSB' ? 'floorOSB' : 'floorSheet', group: 'roof', geom: rectGeom([cuts[i], y0, deckZ], X, Y, Z, cuts[i + 1] - cuts[i], h, 0.75) });
      }
    }
    notes.push(`Loft: ${fmtIn(xb - xa)} of the length, ${fmtIn(W - 2 * yd)} wide between the lower chords, its floor ${fmtFt(deckZ - floorTop)} above the shed floor. It is sized for ${LOFT_LIVE} psf of stored things (IRC Table R301.5, attics with limited storage), not for people to stand in. Add a guard or a stop board along its open edge.`);
    loftAccess(joists, xa, yd, deckZ);
  }

  /**
   * The way up. A half loft is open over the other half of the shed, so a
   * ladder leans on its edge joist. A full loft gets a hatch: the deck is left
   * out over the bay nearest the left gable that is at least 22" clear between
   * joists, 30" across the width, the least attic opening IRC R807.1 asks for,
   * and the ladder leans on the hatch's far joist. The ladder is site-built:
   * two 2x4 rails 16" apart in the clear, leaning 1 in 4, with 2x4 rungs 12"
   * apart (OSHA 1910.23 spaces ladder rungs 10" to 14"), screwed to the joist
   * at the top.
   * @param {number[]} joists loft joist centres @param {number} xa where the deck starts @param {number} yd its edge in from each wall @param {number} deckZ its underside
   */
  function loftAccess(joists, xa, yd, deckZ) {
    const deckTop = deckZ + 0.75;
    // Centred across the width, or toward the back when a door in a gable end would open onto the ladder.
    const gableDoor = d.openings.some((op) => op.kind === 'door' && (op.wall === 'left' || op.wall === 'right') && axisStart(d, op) < W / 2 + 24 && axisStart(d, op) + op.width > W / 2 - 24);
    const yc = gableDoor ? Math.max(W / 2, W - yd - 15) : W / 2;
    let face = xa - 0.75;
    let lean = -1; // the ladder's foot is toward smaller x
    if (d.loft === 'full') {
      const bays = joists.slice(1).map((j, i) => ({ x0: joists[i] + 0.75, x1: j - 0.75 }));
      const bay = bays.find((b) => b.x1 - b.x0 >= 22 - 1e-9) ?? bays.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a), bays[0]);
      if (!bay) return;
      if (bay.x1 - bay.x0 < 22 - 1e-9) warnings.push(`The loft hatch between joists is ${fmtIn(bay.x1 - bay.x0)} wide, under the 22" IRC R807.1 asks of an attic opening; with joists at ${d.rafterSpacing}" header off a wider opening, or set the trusses at 24".`);
      const h0 = Math.max(yd, yc - 15);
      const h1 = Math.min(W - yd, yc + 15);
      // Cut the hatch out of every deck piece it overlaps, keeping the rest of each piece as up to four rectangles.
      for (let i = panels.length - 1; i >= 0; i--) {
        const p = panels[i];
        if (p.kind !== 'loft deck') continue;
        const [px, py, pz] = p.geom.origin;
        const pw = p.geom.profile[2][0];
        const ph = p.geom.profile[2][1];
        if (px >= bay.x1 - 1e-9 || px + pw <= bay.x0 + 1e-9 || py >= h1 - 1e-9 || py + ph <= h0 + 1e-9) continue;
        const keep = [];
        if (bay.x0 > px + 1e-9) keep.push([px, py, bay.x0 - px, ph]);
        if (px + pw > bay.x1 + 1e-9) keep.push([bay.x1, py, px + pw - bay.x1, ph]);
        const cx0 = Math.max(px, bay.x0); const cx1 = Math.min(px + pw, bay.x1);
        if (h0 > py + 1e-9) keep.push([cx0, py, cx1 - cx0, h0 - py]);
        if (py + ph > h1 + 1e-9) keep.push([cx0, h1, cx1 - cx0, py + ph - h1]);
        panels.splice(i, 1, ...keep.map(([x, y, w, h]) => ({ ...p, id: nextId('LD'), geom: rectGeom([x, y, pz], X, Y, Z, w, h, 0.75) })));
      }
      notes.push(`Loft hatch: ${fmtIn(bay.x1 - bay.x0)} x ${fmtIn(h1 - h0)} between the joists ${fmtIn(bay.x0)} to ${fmtIn(bay.x1)} from the left end, the ladder under it.`);
      // Lean on the far joist with the foot toward the left gable, or on the near one if the foot would hit the wall.
      face = bay.x1;
      lean = -1;
    }
    // The foot has to land inside the walls: lean the other way off the hatch's other joist, or leave the ladder out.
    const reach = (deckTop - floorTop) / 4 + 3.5 / (4 / Math.hypot(1, 4)) + 3;
    if (lean < 0 && face - reach < D && d.loft === 'full') {
      const other = joists.filter((j) => j + 0.75 < face - 1).pop();
      if (other !== undefined && other + 0.75 + reach <= L - D) { face = other + 0.75; lean = 1; }
    }
    if ((lean < 0 && face - reach < D) || (lean > 0 && face + reach > L - D)) {
      notes.push('Loft ladder: the shed is too short for a ladder leaning 1 in 4 to land inside the walls; use a stepladder to reach the loft.');
      return;
    }
    const zc = deckZ - (deckZ - plateTop) / 2; // the rail's near edge meets the joist halfway up it
    const sinA = 4 / Math.hypot(1, 4);
    const wH = 3.5 / sinA; // the rail's width, level
    const nearX = (z) => face + lean * ((zc - z) / 4);
    const farX = (z) => nearX(z) + lean * wH;
    const yl = [yc - 8 - 1.5, yc + 8];
    /** @type {[number, number][]} */
    const prof = [[farX(floorTop), floorTop], [nearX(floorTop), floorTop], [face, zc], [face, deckTop], [farX(deckTop), deckTop]];
    if (lean > 0) prof.reverse();
    const railLen = ceil16(Math.hypot(deckTop - floorTop, (deckTop - floorTop) / 4) + wH / 4);
    for (const y of yl) {
      push({ id: nextId('LL'), group: 'roof', kind: 'ladder rail', material: '2x4', length: railLen, note: 'leans 1 in 4: level cut at the floor, plumb cut against the loft joist, screwed to it', geom: { origin: [0, y, 0], u: X, v: Z, w: Y, profile: prof, thickness: 1.5 } });
    }
    let rungs = 0;
    for (let z = floorTop + 12; z + 1.5 <= deckTop - 3; z += 12) {
      const xm = (nearX(z + 0.75) + farX(z + 0.75)) / 2;
      push({ id: nextId('LL'), group: 'roof', kind: 'ladder rung', material: '2x4', length: 16, note: 'flat between the rails, 12" apart; two 3" screws through each rail into its ends, glued', geom: rectGeom([xm - 1.75, yc - 8, z], Y, X, Z, 16, 3.5, 1.5) });
      rungs++;
    }
    notes.push(`Loft ladder: two 2x4 rails 16" apart and ${rungs} 2x4 rungs 12" apart, leaning 1 in 4 against the ${d.loft === 'full' ? 'hatch' : "loft's edge"} joist and screwed to it. It reaches the loft floor; there is no handhold above it, so keep a hand on the joist going over.`);
  }

  // Gable studs between the gable wall's top plate and the end rafter. With a
  // ridge board, one post sits under the ridge; with a ridge beam, a two-ply
  // post carries the beam down onto the post studs in the wall below. A gable
  // vent replaces the studs it covers with trimmers, a flat header as high as
  // the roof allows and a sill block. Under a ridge board the vent is centred;
  // under a beam the post is in the middle, so a pair of vents flanks it.
  const ventInfo = /** @type {Record<string, any[]>} */ ({});
  const postZone = gam ? [-10, -10] : beam ? [yR - 1.5, yR + 1.5] : [yR - 0.75, yR + 0.75];
  const topCut = gam || salt ? 'top cut to the roof line' : `top cut to ${d.pitch}/12`;
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
    const rafterUnder = (y) => (gam ? gam.under(y) : lean ? zb(W - y) : underAt(y)) - plateTop;
    /** @type {{ v0: number, v1: number, ventTop: number, ventBottom: number, headerTop: number }[]} */
    const vents = [];
    if (d.gableVents && !lean) {
      const vw = d.ventWidth;
      const vh = d.ventHeight;
      const spans = beam ? [[yR - 1.5 - vw, yR - 1.5], [yR + 1.5, yR + 1.5 + vw]] : [[yR - vw / 2, yR + vw / 2]];
      for (const [v0, v1] of spans) {
        const headerTop = Math.floor(Math.min(beam || gam ? Infinity : ridgeBottom - plateTop, rafterUnder(v0), rafterUnder(v1)) * 8) / 8;
        const ventTop = headerTop - 1.5;
        const ventBottom = ventTop - vh;
        const outer = v0 < yR ? v0 - 1.5 : v1 + 1.5;
        if (ventBottom - 1.5 < 0 || rafterUnder(outer) < 3) {
          warnings.push(`A ${vw}" x ${vh}" gable vent does not fit under the ${name} gable at ${salt ? `${sides.front.pitch}/12 and ` : ''}${d.pitch}/12${beam ? ' beside the ridge-beam post' : ''}; make it smaller, steepen the roof or widen the shed. ${beam ? 'They are' : 'It is'} left out.`);
          vents.length = 0;
          break;
        }
        vents.push({ v0, v1, ventTop, ventBottom, headerTop });
      }
    }
    // A stud keeps a stud's width clear of a ridge post; beside a vent it only has to miss the trimmer.
    const blocked = (e0, e1, m) => (!lean && e1 > postZone[0] - m - 1e-9 && e0 < postZone[1] + m + 1e-9) || vents.some((v) => e1 > v.v0 - 1.5 + 1e-9 && e0 < v.v1 + 1.5 - 1e-9);
    for (const c of layoutCenters(d.studSpacing, 0, W)) {
      let e0 = c - 0.75;
      let e1 = c + 0.75;
      // A layout stud that would run into a vent trimmer moves out against it, so the siding joint there keeps its wood.
      const hit = vents.find((v) => c > v.v0 - 2.25 && c <= v.v0 && e1 > v.v0 - 1.5 + 1e-9) || vents.find((v) => c < v.v1 + 2.25 && c >= v.v1 && e0 < v.v1 + 1.5 - 1e-9);
      if (hit) [e0, e1] = c <= hit.v0 ? [hit.v0 - 3, hit.v0 - 1.5] : [hit.v1 + 1.5, hit.v1 + 3];
      if (blocked(e0, e1, beam ? 0 : 1.5)) continue;
      const h0 = rafterUnder(e0);
      const h1 = rafterUnder(e1);
      if (Math.min(h0, h1) < 3) continue;
      gableMember('gable stud', e0, e1, h0, h1, topCut);
    }
    // The post (under a centred vent, it stands on the vent header instead).
    const centreVent = vents.find((v) => v.v0 < yR && v.v1 > yR);
    const postBase = centreVent ? centreVent.headerTop : 0;
    const postH = ridgeBottom - plateTop;
    if (truss || gam) {
      // No post: the gable-end top chords meet at the peak, tied by the gable siding (a gambrel's by its gable studs).
    } else if (!lean && postH - postBase >= 3) {
      if (beam) {
        for (const e0 of [yR - 1.5, yR]) gableMember('beam post', e0, e0 + 1.5, postH, postH, 'square top under the ridge beam, over the post studs');
      } else {
        gableMember('ridge post', yR - 0.75, yR + 0.75, postH, postH, centreVent ? 'from the vent header to the ridge' : 'square top under the ridge', postBase);
      }
    }
    for (const v of vents) {
      const { v0, v1, ventTop, ventBottom } = v;
      for (const [e0, e1] of [[v0 - 1.5, v0], [v1, v1 + 1.5]]) {
        if (e1 > postZone[0] + 1e-9 && e0 < postZone[1] - 1e-9) continue; // the post is this side's trimmer
        gableMember('vent trimmer', e0, e1, rafterUnder(e0), rafterUnder(e1), topCut);
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
      // Cripples under the sill on the stud layout (so a siding joint there has wood behind it), or one in the middle.
      // and under each 4 ft siding joint that crosses the vent, against the trimmer if the joint is that close.
      const onLayout = layoutCenters(d.studSpacing, v0 + 0.75, v1 - 0.75).filter((c) => c <= v1 - 0.75);
      const joints = layoutCenters(48, v0 - 1, v1 + 1).map((j) => Math.min(v1 - 0.75, Math.max(v0 + 0.75, j)));
      const cripples = [...new Set([...onLayout, ...joints])].sort((a, b) => a - b).filter((c, i, a) => i === 0 || c - a[i - 1] >= 1.5);
      for (const mid of cripples.length ? cripples : [(v0 + v1) / 2]) {
        if (ventBottom - 1.5 >= 1.5) gableMember('vent cripple', mid - 0.75, mid + 0.75, ventBottom - 1.5, ventBottom - 1.5, 'under the vent sill');
      }
      // Over the header too, where a siding joint crosses a gap of 3" or more up to the roof (a gambrel's knee can hold the header low).
      for (const j of joints) {
        const [e0, e1] = [j - 0.75, j + 0.75];
        if (e1 > postZone[0] - 1e-9 && e0 < postZone[1] + 1e-9) continue;
        if (Math.min(rafterUnder(e0), rafterUnder(e1)) - v.headerTop >= 3) gableMember('vent cripple', e0, e1, rafterUnder(e0), rafterUnder(e1), `over the vent header, ${topCut}`, v.headerTop);
      }
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
        for (const h of [...cut, [0, 0, wallH(name), wallH(name)]]) {
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
        const spec = wallSpecs[name];
        const holes = walls[name].openings.map((p) => [spec.start + p.a, spec.start + p.a + p.w, p.bottom, p.bottom + p.op.height]);
        for (let x = f.from + 6; x < f.to - 6; x += 8) {
          // Not in front of a door or window head (a low wall puts the lights at the head's height).
          const z = wallH(name) - 8 - ((bulb + 1) % 2) * 1.5;
          if (holes.some((h) => x + 1.6 > h[0] - 1e-9 && x < h[1] + 1e-9 && z + 1.6 > h[2] && z < h[3] + 1e-9)) continue;
          fixtures.push({ kind: `bulb-${bulb++ % 4}`, group: name === 'front' ? 'front lining' : 'decor', geom: rectGeom(add(add(add(f.origin, f.u, x), Z, wallH(name) - 8 - (bulb % 2) * 1.5), f.w, pt), f.u, Z, f.w, 1.6, 1.6, 1.6) });
        }
      }
      // A rug and a beanbag on the floor (the gravel, when there is no floor).
      const rugZ = floorless ? 0 : floorTop;
      fixtures.push({ kind: 'rug', group: 'decor', geom: rectGeom([L / 2 - 30, W / 2 - 20, rugZ], X, Y, Z, 60, 40, 0.4) });
      fixtures.push({ kind: 'beanbag', group: 'decor', geom: rectGeom([L - D - 34, W - D - 34, rugZ], X, Y, Z, 28, 28, 14) });
      fixtures.push({ kind: 'beanbag', group: 'decor', geom: rectGeom([L - D - 31, W - D - 31, rugZ + 14], X, Y, Z, 22, 22, 6) });
    }
    interior = { type: d.interior, sqft, panels: Math.ceil((sqft * 1.1) / 32), paint: d.interior === 'teen bedroom' ? 'pink' : 'white' };
  }

  // ---------------- Fascia, soffit, rake trim ----------------
  // A 2x6 sub-fascia nailed across the rafter tails (in the cut list), a 1x6
  // fascia board over it, a vented soffit on the underside of the tails, and a
  // 1x4 rake board up each gable edge (those three are bought, not cut from framing).
  const trim = { fasciaFt: 0, soffitSqFt: 0, rakeFt: 0 };
  if (o > 0) {
    const sf = actual('2x6');
    const fsplit = splitRun(0, L, spliceAt, rafterCenters);
    for (const back of [false, true]) {
      const y0 = back ? W + o : -o - 1.5;
      // A lean-to's front tail is its high edge: the fascia there is up at the top of the front tails.
      const fz = lean && !back ? zt(W + o) : ztS(-o, back);
      for (const [s0, s1] of fsplit.runs) {
        push({
          id: nextId('SF'), group: 'roof', kind: 'sub-fascia', material: '2x6', length: ceil16(s1 - s0),
          note: fsplit.runs.length > 1 ? 'joint on a rafter tail' : 'across the rafter tails',
          geom: rectGeom([s0, y0, fz - sf.depth], X, Z, Y, s1 - s0, sf.depth, 1.5),
        });
      }
      fixtures.push({ kind: 'fascia', group: 'trim', geom: rectGeom([0, back ? W + o + 1.5 : -o - 1.5 - 0.75, fz - sf.depth - 0.5], X, Z, Y, L, sf.depth + 0.5, 0.75) });
      // Soffit on the underside of the tails, from the wall to the sub-fascia.
      const up = lean && !back ? -1 : 1; // a lean-to's front soffit runs downhill to the wall
      const { cos: sc, sin: ss } = lean ? { cos, sin } : slope(back);
      const sv = /** @type {Vec} */ ([0, back ? -sc : sc, up * ss]);
      const sw = /** @type {Vec} */ ([0, back ? -ss : up * ss, -sc]);
      const start = /** @type {Vec} */ ([0, back ? W + o : -o, lean && !back ? zb(W + o) : zbS(-o, back)]);
      fixtures.push({ kind: 'soffit', group: 'trim', geom: rectGeom(start, X, sv, sw, L, o / sc, 0.3) });
      trim.soffitSqFt += (L * (o / sc)) / 144;
    }
    trim.fasciaFt = (2 * L) / 12;
  }
  // Each rake runs from the eave tail to the ridge's line along its own slope.
  const slopeLenS = (back) => ((back ? W - yR : yR) + o) / slope(back).cos;
  trim.rakeFt = lean ? (2 * ((W + 2 * o) / cos)) / 12 : gam ? (4 * (gam.lowerLen + gam.upperLen)) / 12 : (2 * (slopeLenS(false) + slopeLenS(true))) / 12;
  // Rake boards: a 3-1/2" band under the roof edge on each gable face, eave tail to peak.
  {
    const top = (dist) => zt(dist) + (7 / 16) / cos;
    const band = 3.5 / cos;
    // A gable's or saltbox's band: the top of the sheathing on each slope, and 3-1/2" below it square to the slope.
    const edge = (y, below) => Math.min(ztS(y, false) + (7 / 16 - below) / slope(false).cos, ztS(W - y, true) + (7 / 16 - below) / slope(true).cos);
    /** Where the two slopes' lines `below` the roof's top cross. @param {number} below */
    const cross = (below) => {
      const f0 = ztS(0, false) + (7 / 16 - below) / slope(false).cos;
      const b0 = ztS(W, true) + (7 / 16 - below) / slope(true).cos; // the back line, at y = 0
      const y = (b0 - f0) / (slope(false).t + slope(true).t);
      return /** @type {[number, number]} */ ([y, f0 + y * slope(false).t]);
    };
    /** @type {[number, number][]} */
    const prof = lean
      ? [[-o, top(W + o) - band], [W + o, top(-o) - band], [W + o, top(-o)], [-o, top(W + o)]]
      : gam
      ? [...bandAbove(gam, 7 / 16 - 3.5), ...bandAbove(gam, 7 / 16).reverse()]
      : [[-o, edge(-o, 3.5)], cross(3.5), [W + o, edge(W + o, 3.5)], [W + o, edge(W + o, 0)], cross(0), [-o, edge(-o, 0)]];
    for (const x0 of [-0.75, L]) fixtures.push({ kind: 'fascia', group: 'trim', geom: { origin: [x0, 0, 0], u: Y, v: Z, w: X, profile: prof, thickness: 0.75 } });
  }

  // ---------------- Sheathing, siding, roofing ----------------
  // On a saltbox, the long back slope's; dims.slopes has both.
  const slopeLen = lean ? (W + 2 * o) / cos : gam ? gam.lowerLen + gam.upperLen : slopeLenS(true); // eave tail to the ridge line (a lean-to's: tail to tail), along the roof
  /** @type {number[]} */
  const roofPieces = [];
  // Each roof plane, from its low edge up: one a side on a gable, two on a gambrel
  // (the upper plane's courses are numbered on from the lower's in `pos`), and on a
  // lean-to one, laid like a gable's back slope from the low back eave over the whole width.
  const roofPlanes = (lean ? [true] : [false, true]).flatMap((back) => {
    const side = back ? 'back' : 'front';
    if (lean) return [{ back, side, eave: /** @type {Vec} */ ([0, yOf(-o, back), zt(-o)]), c: cos, s: sin, len: slopeLen, q: 0 }];
    if (!gam) return [{ back, side, eave: /** @type {Vec} */ ([0, yOf(-o, back), ztS(-o, back)]), c: slope(back).cos, s: slope(back).sin, len: slopeLenS(back), q: 0 }];
    return [
      { back, side, eave: /** @type {Vec} */ ([0, yOf(0, back), plateTop]), c: gam.cl, s: gam.sl, len: gam.lowerLen, q: 0 },
      { back, side, eave: /** @type {Vec} */ ([0, yOf(gam.yk, back), gam.zk]), c: gam.cu, s: gam.su, len: gam.upperLen, q: gam.lowerLen },
    ];
  });
  const roofRows = roofPlanes.reduce((t, pl) => t + Math.ceil(pl.len / 48 - 1e-9), 0) / (lean ? 1 : 2);
  for (const { back, side, eave, c: pc, s: ps, len: planeLen, q: qBase } of roofPlanes) {
    const v = /** @type {Vec} */ ([0, back ? -pc : pc, ps]);
    const w = /** @type {Vec} */ ([0, back ? ps : -ps, pc]);
    for (let rr = 0; rr < Math.ceil(planeLen / 48 - 1e-9); rr++) {
      const q0 = rr * 48;
      const h = Math.min(48, planeLen - q0);
      // Sheets stagger 4 ft course to course, and every end joint lands on a
      // rafter: where none is under the 4 ft mark (an inner rafter moved in
      // clear of the gable wall), the sheet is cut back to the rafter before it.
      const cuts = [0];
      for (let x = rr % 2 ? 48 : 96; x < L; ) {
        const onRafter = rafterCenters.filter((c) => c <= x + 1e-9 && c > cuts[cuts.length - 1] + 12).pop() ?? x;
        cuts.push(onRafter);
        x = onRafter + 96;
      }
      cuts.push(L);
      for (let i = 0; i + 1 < cuts.length; i++) {
        roofPieces.push(cuts[i + 1] - cuts[i]);
        {
          panels.push({ id: nextId('RS'), kind: 'roof sheathing', item: 'roofSheet', group: 'sheathing', side, pos: [cuts[i], qBase + q0], geom: rectGeom(add(add(eave, X, cuts[i]), v, q0), X, v, w, cuts[i + 1] - cuts[i], h, 7 / 16) });
        }
      }
    }
    if (d.roofing) {
      fixtures.push({ kind: 'shingles', group: 'roofing', geom: rectGeom(add(eave, w, 7 / 16), X, v, w, L, planeLen, 0.35) });
    }
  }
  const roofAreaSqFt = roofPlanes.reduce((tot, pl) => tot + pl.len * L, 0) / 144;

  // The eave-wall siding runs up to the soffit: the plate, or a truss's bottom chord on it.
  const eaveTop = seatBase;
  // Lap siding goes over 7/16" OSB sheathing (laid out like panel siding, so
  // its joints fall on the studs and nailers) and its courses stand out by up
  // to two plank thicknesses at each butt edge.
  const lapBase = d.siding ? LAP_PRODUCTS[d.sidingType] : undefined;
  // Siding laps down over the rim joist, or 1" over a perimeter timber.
  const sidingBottom = floorless ? skidTop - 1 : skidTop;
  const lapExposure = lapBase ? evenExposure(lapBase, plateTop - sidingBottom) : undefined;
  const lapSpec = lapBase && { ...lapBase, exposure: /** @type {number} */ (lapExposure) };
  const sheathT = 7 / 16;
  const sidingT = lapSpec ? sheathT + 2 * lapSpec.thickness : d.sidingType === 'LP SmartSide' ? 3 / 8 : d.sidingType === 'LP SmartSide 7/16' ? 7 / 16 : 19 / 32;
  /** @type {{ wall: string, length: number, need?: number }[]} */
  const sidingFull = [];
  /** @type {number[]} */
  const sidingUpper = [];
  // The same upper pieces as shapes: the height above the lower panel at each
  // edge (left and right as seen from outside), and whether the peak is in it.
  /** @type {{ h0: number, h1: number, peak: boolean }[]} */
  const sidingUpperShapes = [];
  /** Horizontal panel joints (horizontal runs only): each is Z-flashed and backed by blocking. @type {{ wall: string, z: number, s0: number, s1: number, len: number, clip: (s: number) => number, eave: boolean }[]} */
  const sidingJoints = [];
  if (d.siding) {
    const bottomZ = sidingBottom;
    // T1-11 is sold as 4x8 only (a "4x9" listing turned out to be a 4x8: owner, 2026-11-01); LP panels come 8, 9 and 10 ft.
    const sheetFor = (h) => (lapSpec || d.sidingType === 'T1-11' ? [96] : [96, 108, 120]).find((s) => s >= h - 1e-9);
    const horizontal = !lapSpec && d.sidingRun === 'horizontal';
    for (const name of WALLS) {
      const eave = name === 'front' || name === 'back';
      const faceLen = eave ? L : W;
      const clip = (s) => (eave ? (lean && name === 'front' ? highPlateTop : eaveTop) : gam ? gam.top(s) : lean ? zt(W - s) : overAt(s));
      const origin = name === 'front' ? [0, 0, 0] : name === 'back' ? [0, W, 0] : name === 'left' ? [0, 0, 0] : [L, 0, 0];
      const u = eave ? X : Y;
      const w = name === 'front' ? neg(Y) : name === 'back' ? Y : name === 'left' ? neg(X) : X;
      const corners = !eave && !lean ? (gam ? [W - gam.yk, W / 2, gam.yk] : [yR]) : [];
      if (horizontal) {
        // Rows of panels laid on their side: 8 ft along the wall, 4 ft high, from the bottom up,
        // each piece trimmed to the roof line. Vertical joints every 8 ft land on studs at 12, 16 or 24".
        const topZ = Math.max(...[0, faceLen, ...corners].map(clip));
        for (let z0 = bottomZ, row = 0; z0 < topZ - 0.5; z0 += 48, row += 1) {
          if (row > 0) {
            // The joint runs where the wall reaches above it (a gable's slope cuts it short).
            let len = 0;
            for (let s = 0.25; s < faceLen; s += 0.5) if (clip(s) > z0) len += 0.5;
            sidingJoints.push({ wall: name, z: z0, s0: 0, s1: faceLen, len, clip, eave });
          }
          for (let s0 = 0; s0 < faceLen - 1e-9; s0 += 96) {
            const prof = clipRect(clip, corners, s0, Math.min(faceLen, s0 + 96), z0, z0 + 48);
            if (!prof) continue;
            const zs = prof.map((q) => q[1]);
            const ss = prof.map((q) => q[0]);
            sidingFull.push({ wall: name, length: 96, need: NaN, row, piece: { len: Math.max(...ss) - Math.min(...ss), w: Math.max(...zs) - Math.min(...zs) } });
            panels.push({
              id: nextId('SD'), kind: 'siding', item: 'siding', group: 'siding', wall: name, row,
              geom: { origin: /** @type {Vec} */ (origin), u, v: Z, w, profile: prof, thickness: sidingT },
            });
          }
        }
        continue;
      }
      for (let s0 = 0; s0 < faceLen - 1e-9; s0 += 48) {
        const s1 = Math.min(faceLen, s0 + 48);
        /** @type {[number, number][]} */
        const prof = [[s0, bottomZ], [s1, bottomZ], [s1, clip(s1)]];
        // The roof line's corners inside this panel, right to left: the peak, and a gambrel's knees.
        for (const y of corners) if (s0 < y && s1 > y) prof.push([y, clip(y)]);
        prof.push([s0, clip(s0)]);
        const need = Math.max(...prof.map((p) => p[1])) - bottomZ;
        const sheet = sheetFor(need);
        if (sheet) sidingFull.push({ wall: name, length: sheet, need });
        else {
          sidingFull.push({ wall: name, length: 96, need });
          sidingUpper.push(Math.ceil(need - 96));
          const above = (x) => Math.max(0, clip(x) - bottomZ - 96);
          sidingUpperShapes.push({ h0: above(s0), h1: above(s1), peak: prof.length > 4 });
        }
        panels.push({
          id: nextId(lapSpec ? 'WS' : 'SD'), kind: lapSpec ? 'wall sheathing' : 'siding', item: lapSpec ? 'wallSheathing' : 'siding', group: 'siding', wall: name,
          geom: { origin: /** @type {Vec} */ (origin), u, v: Z, w, profile: prof, thickness: lapSpec ? sheathT : sidingT },
        });
      }
    }
  }
  /** @type {ReturnType<typeof layoutFace>[]} */
  const lap = [];
  if (lapSpec) {
    // Lap courses run between the corner boards (or to the corners with no
    // trim) and stop at the casings round each door, window and vent.
    const trimW = d.wallTrim !== 'none' ? 3.5 : 0;
    for (const name of WALLS) {
      const eave = name === 'front' || name === 'back';
      const faceLen = eave ? L : W;
      const spec = wallSpecs[name];
      const origin = /** @type {Vec} */ (name === 'back' ? [0, W, 0] : name === 'right' ? [L, 0, 0] : [0, 0, 0]);
      const u = eave ? X : Y;
      const w = name === 'front' ? neg(Y) : name === 'back' ? Y : name === 'left' ? neg(X) : X;
      const ax = eave ? 0 : 1;
      const across = eave ? 1 : 0;
      const zone = name === 'front' ? [0, D] : name === 'back' ? [W - D, W] : name === 'left' ? [0, D] : [L - D, L];
      const wood = [...members, ...panels.filter((p) => p.kind === 'floor sheet')].map((m) => bbox(m.geom)).filter((g) => g.lo[across] < zone[1] - 1e-6 && g.hi[across] > zone[0] + 1e-6)
        .map((g) => ({ s0: g.lo[ax], s1: g.hi[ax], z0: g.lo[2], z1: g.hi[2] }));
      const holes = walls[name].openings.map((p) => {
        const a0 = spec.start + p.a;
        const z0 = floorTop + p.bottom;
        const door = p.op.kind === 'door';
        return { s0: a0 - trimW, s1: a0 + p.w + trimW, z0: door ? z0 : z0 - trimW, z1: z0 + p.op.height + trimW };
      });
      for (const v of ventInfo[name] || []) holes.push({ s0: v.s0 - 1, s1: v.s1 + 1, z0: floorTop + v.z0 - 1, z1: floorTop + v.z1 + 1 });
      const inset = trimW ? (eave ? trimW - (sidingT + 0.75) : trimW - sidingT) : 0;
      const face = layoutFace({
        // A lean-to's end wall tops out at its front edge, so that is where its courses peak.
        wall: name, len: faceLen, bottom: sidingBottom, top: (s) => (eave ? (lean && name === 'front' ? highPlateTop : eaveTop) : gam ? gam.top(s) : lean ? zt(W - s) : overAt(s)), peakAt: eave ? undefined : lean ? inset : yR, bends: !eave && gam ? [gam.yk, W - gam.yk] : undefined,
        from: inset, to: faceLen - inset, holes, wood, maxPlank: Math.max(...lapStocks(d).map((x) => x.length)), stagger: lapStagger(d),
      }, lapSpec);
      lap.push(face);
      const t = lapSpec.thickness;
      for (const pc of face.pieces) {
        // Each course leans out at its butt edge: its bottom rests on the course
        // below, its top on the sheathing.
        const k = t / lapSpec.exposure;
        const vz = 1 / Math.hypot(1, k);
        const v = add(/** @type {Vec} */ ([0, 0, vz]), w, -k * vz);
        const base = add(add(origin, Z, pc.zb), w, sheathT + t);
        panels.push({
          id: nextId('LP'), kind: 'lap siding', item: 'lap', group: 'siding', wall: name, course: pc.course, face: pc.pts,
          geom: { origin: base, u, v, w, profile: pc.pts.map(([s, z]) => /** @type {[number, number]} */ ([s, (z - pc.zb) / vz])), thickness: t },
        });
      }
    }
  }

  // ---------------- Blocking behind horizontal panel joints ----------------
  // IRC R703.3.1: a horizontal joint in panel siding is lapped, shiplapped, or
  // Z-flashed over solid blocking or sheathing. T1-11 has no sheathing behind it,
  // so a flat stud-size block fills each bay where a row joint crosses open
  // framing (not where a plate, header or sill already backs it, nor across a
  // door or window opening).
  for (const j of sidingJoints) {
    const name = j.wall;
    const spec = wallSpecs[name];
    const eave = spec.eave;
    const ax = eave ? 0 : 1;
    const across = eave ? 1 : 0;
    const zone = name === 'front' ? [0, D] : name === 'back' ? [W - D, W] : name === 'left' ? [0, D] : [L - D, L];
    const zb = j.z - 0.75;
    const zt = j.z + 0.75;
    // Wall and gable framing only: a sloped rafter's bounding box would cover the whole gable.
    const wood = members.filter((m) => /^(wall|gable):/.test(m.group || '')).map((m) => bbox(m.geom)).filter((g) => g.lo[across] < zone[1] - 1e-6 && g.hi[across] > zone[0] + 1e-6 && g.lo[2] < zt - 1e-6 && g.hi[2] > zb + 1e-6)
      .map((g) => [g.lo[ax], g.hi[ax]]).sort((a, b) => a[0] - b[0]);
    const holes = walls[name].openings.filter((p) => floorTop + p.bottom < zt && floorTop + p.bottom + p.op.height > zb).map((p) => [spec.start + p.a, spec.start + p.a + p.w]);
    for (const v of ventInfo[name] || []) if (floorTop + v.z0 < zt && floorTop + v.z1 > zb) holes.push([v.s0, v.s1]);
    let at = 0;
    const gaps = [];
    for (const [a, b] of wood) { if (a > at + 0.25) gaps.push([at, a]); at = Math.max(at, b); }
    const end = eave ? L : W;
    if (end > at + 0.25) gaps.push([at, end]);
    for (const [g0, g1] of gaps) {
      // A gap of a few inches (a corner's studs) leaves wood within reach of the joint on both sides.
      if (g1 - g0 < 3.5) continue;
      if (holes.some(([h0, h1]) => h0 < g1 - 1e-6 && h1 > g0 + 1e-6)) continue;
      // Only where the siding reaches above the joint (a gable's slope cuts it short).
      if (Math.min(j.clip(g0), j.clip(g1)) < zt) continue;
      const s0 = g0 - spec.start;
      const m = push({
        id: nextId(prefix[name]), group: zb >= plateTop - 1e-6 && !eave ? `gable:${name}` : `wall:${name}`, kind: 'siding blocking', material: d.studSize, length: ceil16(g1 - g0),
        note: 'flat between studs behind the horizontal siding joint',
        geom: rectGeom(add(add(spec.base, spec.axis, s0), Z, zb - floorTop), spec.axis, Z, spec.w, g1 - g0, 1.5, D),
        local: { s0, s1: s0 + (g1 - g0), z0: zb - floorTop, z1: zt - floorTop },
      });
      walls[name].members.push(m);
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
    const bottomZ = sidingBottom;
    const rakeBottom = gam ? bandAbove(gam, 7 / 16 - 3.5) : null;
    const rakeUnder = (dist) => (rakeBottom ? zOnPoly(rakeBottom, dist) : zt(dist) + (7 / 16) / cos - 3.5 / cos);
    // Under a gable's or saltbox's rake band, at a point across the width.
    const rakeUnderAt = (y) => Math.min(ztS(y, false) + (7 / 16 - 3.5) / slope(false).cos, ztS(W - y, true) + (7 / 16 - 3.5) / slope(true).cos);
    for (const name of WALLS) {
      const eave = name === 'front' || name === 'back';
      const faceLen = eave ? L : W;
      const origin = /** @type {Vec} */ (name === 'back' ? [0, W, 0] : name === 'right' ? [L, 0, 0] : [0, 0, 0]);
      const u = eave ? X : Y;
      const w = name === 'front' ? neg(Y) : name === 'back' ? Y : name === 'left' ? neg(X) : X;
      const at = add(origin, w, sidingT);
      const topAt = (s) => (eave ? (lean && name === 'front' ? highPlateTop : eaveTop) : lean || gam ? rakeUnder(lean ? W - s : Math.min(s, faceLen - s)) : rakeUnderAt(s));
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
    // A Z brace only holds a leaf square when it runs at a real slope: in a short,
    // wide leaf the rails take most of the height and the brace lies nearly flat
    // (a 12"-tall door gives about 1 degree); in a narrow one it stands nearly upright.
    if (braceAngle < 25 || braceAngle > 65) {
      warnings.push(`The site-built ${fmtIn(op.width)} x ${fmtIn(op.height)} door on the ${wallLabel(d, op.wall).toLowerCase()} wall makes ${leaves > 1 ? 'leaves' : 'a leaf'} ${fmtIn(w)} wide and ${fmtIn(h)} tall, so its Z brace runs at ${braceAngle.toFixed(0)} deg and will not keep the door from sagging; it works best between about 30 and 60 deg. ${braceAngle < 25 ? 'Make the door taller or narrower' : 'Make the door wider'}, or choose a ready-made door.`);
    }
    // Pieces that are the same in both leaves and in every rail position share one note, so they share a part mark.
    // Each piece is drawn too, laid flat on the back of the door in its opening,
    // so the parts list can point at it in 3D.
    const slab = fixtures.find((f) => f.op === op.id);
    const frameAt = (profile) => (slab ? { origin: slab.geom.origin, u: slab.geom.u, v: slab.geom.v, w: neg(slab.geom.w), profile, thickness: 1.5 } : undefined);
    const box = (u0, v0, lu, lv) => frameAt([[u0, v0], [u0 + lu, v0], [u0 + lu, v0 + lv], [u0, v0 + lv]]);
    for (let i = 0; i < leaves; i++) {
      const tag = `door ${op.id}`;
      const part = (kind, length, note, geom) => doorParts.push({ id: nextId('DR'), group: 'door', kind, material: '2x4', length: Math.ceil(length * 8) / 8, note: `${tag}: ${note}`, ...(geom ? { geom } : {}) });
      const u0 = 0.25 + i * (w + 0.25);
      const v0 = 0.25;
      part('door stile', h, 'laid flat, full height', box(u0, v0, 3.5, h));
      part('door stile', h, 'laid flat, full height', box(u0 + w - 3.5, v0, 3.5, h));
      for (let r = 0; r < 3; r++) part('door rail', railLen, 'top, middle and bottom rails between the stiles', box(u0 + 3.5, v0 + r * (3.5 + bay), railLen, 3.5));
      // A brace fills its bay corner to corner; the low end is at the hinge side
      // (the outer edge of each leaf: left on the first, right on a pair's second).
      const dx = 3.5 / Math.sin(Math.atan2(bay, railLen));
      const a = u0 + 3.5;
      const b = a + railLen;
      for (let k = 0; k < 2; k++) {
        const y0 = v0 + 3.5 + k * (3.5 + bay);
        const y1 = y0 + bay;
        const pts = /** @type {[number, number][]} */ (i === 0 ? [[a, y0], [a + dx, y0], [b, y1], [b - dx, y1]] : [[b - dx, y0], [b, y0], [a + dx, y1], [a, y1]]);
        part('door brace', braceLen + 3.5, `Z brace, ends cut at ${braceAngle.toFixed(0)} deg to fit between rails, low end at the hinge side`, frameAt(pts));
      }
    }
  }

  const sidingArea = panels.filter((p) => p.kind === 'siding' || p.kind === 'wall sheathing').reduce((t, p) => {
    let a2 = 0;
    const pts = p.geom.profile;
    for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; a2 += x0 * y1 - x1 * y0; }
    return t + Math.abs(a2) / 2 / 144;
  }, 0);

  const dims = {
    length: L, width: W, wallHeight: H, pitch: d.pitch, overhang: o,
    // The roof's thickness over the ridge, measured plumb on the steeper slope (a saltbox's front).
    skidTop, sidingBottom, floorTop, plateTop, floorless, timber: floorless ? timber : null, postPiers, ridgeTop, peak: ridgeTop + (d.roofing ? 7 / 16 + 0.35 : 7 / 16) / (lean || gam ? cos : Math.min(cos, sides.front.cos)),
    studLen, rafterCut: gamParts ? gamParts.lowerCut : rafterCut, slopeLen, plumbH, ridgeSize, ridgeD, stud: D, joistDepth: joist.depth, rafterDepth: rd,
    skidCount, skidYs, joistCenters, rafterCenters, gravelCuYd, padSqFt: underBlocks || noPad ? 0 : ((L + 2 * pad) * (W + 2 * pad)) / 144, baseBags: Math.ceil(baseCuFt / 0.5), underBlocks, noPad, blockCount, block, pierLen, pierCount, pierCuFt, pierFootIn, pierFootCuFt, pierTubes, pierBags, roofAreaSqFt, floorRows, roofRows,
    heel: connector || truss || gam ? 0 : D * t, maxStock, connector, truss, trusses, seatBase, chordDepth: truss ? chord.depth : 0,
    // The underside of the roof across the width, as [y, z] points (for storage space and the section).
    section: gam
      ? [[0, plateTop], [gam.seat, plateTop], [gam.ykIn, gam.zkIn], [W / 2, gam.ridgeIn], [W - gam.ykIn, gam.zkIn], [W - gam.seat, plateTop], [W, plateTop]]
      : lean ? [[0, highPlateTop], [D, zb(W - D)], [W - D, zb(D)], [W, plateTop]]
      : [[0, plateTop], [seatAt, seatBase], [yR - rh, zbS(runS(false), false)], [yR + rh, zbS(runS(true), true)], [W - seatAt, seatBase], [W, plateTop]],
    gambrel: gam && gamFrame && gamParts ? { ...gamParts, yk: gam.yk, zk: gam.zk, lowerLen: gam.lowerLen, upperLen: gam.upperLen, lowerPitch: d.gambrelLower, gusset: gamFrame.gusset, heelNails: gamFrame.heelNails, tieSize: gamFrame.tieSize, thrust: gamFrame.thrust, nailsPerKnee: gamFrame.nailsPerKnee, nailsPerPeak: gamFrame.nailsPerPeak, loft: loftX } : null,
    // One slope or two; on a lean-to the front wall's height and plate top.
    style: d.style, lean, rise, highWall: H + rise, highPlateTop,
    // Where the ridge is across the width, and each slope: pitch, eave tail to ridge line along the roof,
    // cosine, rafter cut and birdsmouth heel. On a gable the two are the same; on a saltbox the front is short and steep.
    saltbox: salt, ridgeY: yR, frontPitch: sides.front.pitch,
    slopes: lean || gam ? null : Object.fromEntries([false, true].map((back) => [back ? 'back' : 'front', {
      pitch: slope(back).pitch, len: slopeLenS(back), cos: slope(back).cos, run: runS(back), rafterCut: rafterCutS(back), heel: connector || truss ? 0 : D * slope(back).t,
    }])),
  };

  if (d.siding && d.sidingColor === 'unfinished' && d.sidingType !== 'vinyl') {
    warnings.push(d.sidingType === 'fiber cement'
      ? 'Unfinished fiber cement: the factory primer is not a finish. James Hardie asks for paint within 180 days of installing primed plank.'
      : d.sidingType.startsWith('LP SmartSide')
      ? 'Unfinished LP SmartSide: the factory primer is not a finish. LP asks for a paint topcoat within 180 days of installing it to keep the warranty.'
      : 'Unfinished siding: bare wood and plywood siding grey, check and absorb water. Leaving it unfinished is a choice you can make, but paint or stain makes it last.');
  }
  if (d.siding && d.sidingRun === 'horizontal' && sidingJoints.length && !lapSpec) {
    notes.push(`Siding runs horizontally: rows of 4x8 panels on their side, ${d.sidingType === 'T1-11' ? 'grooves level, ' : ''}${sidingJoints.length} row joint${sidingJoints.length > 1 ? 's' : ''} around the shed. Each row joint gets Z-flashing and a flat ${d.studSize} block in every open stud bay behind it (IRC R703.3.1: horizontal joints in panel siding are lapped, shiplapped, or Z-flashed over solid blocking); the blocks are in the parts list. Vertical joints every 8 ft land on studs.`);
  }
  if (d.siding && d.studSpacing > 16 && (d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide')) {
    warnings.push(`${d.sidingType === 'T1-11' ? 'T1-11' : 'LP SmartSide 3/8"'} panels are rated for studs at 16" on centre; at ${d.studSpacing}" use the 7/16" LP panel, lap siding over OSB, or studs at 16".`);
  }
  if (lapSpec && sidingBottom < lapSpec.clearance - 1e-9) {
    warnings.push(`The lap siding starts ${fmtIn(sidingBottom)} above the ground; the ${lapSpec.source} ask for at least ${fmtIn(lapSpec.clearance)}. ${floorless ? 'With no floor the walls sit on the timbers, low to the gravel; a framed floor on blocks lifts the siding clear.' : 'Set the skids on taller blocks or use deeper skids.'}`);
  }
  warnings.push(...siteWarnings(d));
  if (d.maxFootprint > 0 && (L * W) / 144 > d.maxFootprint + 1e-9) {
    warnings.push(`The footprint is ${((L * W) / 144).toFixed(0)} sq ft, over your ${d.maxFootprint} sq ft limit (often the size below which a shed needs no permit; check your local rule).`);
  }
  if (d.maxPeak > 0 && dims.peak > d.maxPeak + 1e-9) {
    const tallest = Math.max(0, ...Object.values(walls).flatMap((w) => w.openings.map((p) => p.headerTop)));
    const minWall = lean ? minWallFor({ ...d, pitch: 3 }) : Math.max(60, Math.ceil((tallest + 3) * 2) / 2);
    const low = buildFramed(normalize({ ...d, wallHeight: minWall, pitch: 3, maxPeak: 0, autoWall: false, autoPitch: false })).dims.peak;
    warnings.push(`The peak is ${fmtFt(dims.peak)} above the gravel, ${fmtFt(dims.peak - d.maxPeak)} over your ${fmtFt(d.maxPeak)} limit. Your tallest opening needs walls of at least ${fmtFt(minWall)}; with those walls and a 3/12 roof (about the least that sheds water under shingles) the peak would still be ${fmtFt(low)}. To get lower: a shorter door, ${lean ? 'a door in an end wall or the low back wall' : 'a door in the gable end'}, a lower floor or a narrower shed${d.gableVents && !lean ? ', or smaller or no gable vents (they need a steeper roof to fit)' : ''}.`);
  }

  // Every fixture gets an id too, so the 3D view can pick and highlight it.
  for (const f of fixtures) f.id ??= nextId('FX');

  // A lap butt joint with no stud behind it: frame a stud where the layout asked for one, once.
  const need = Object.fromEntries(lap.map((f) => [f.wall, f.nailers || []]).filter(([, v]) => v.length));
  if (!lapNailers && Object.keys(need).length) {
    const again = buildFramed(d, need);
    if (again.lap.every((f) => f.joints.every((j) => j.backed))) {
      again.notes.push(`Lap siding: ${Object.values(need).flat().length === 1 ? 'one stud is' : `${Object.values(need).flat().length} studs are`} added off the layout (${Object.entries(need).map(([w, v]) => `${w} wall at ${v.map((x) => fmtIn(x)).join(', ')}`).join('; ')}) so a butt joint between close openings lands on wood.`);
      return again;
    }
  }
  return { design: d, members, panels, fixtures, walls, framedOpenings, warnings, notes, dims, vents: ventInfo, trim, wallTrim, doorParts, doors, interior, sidingArea, floorPieces, roofPieces, sidingFull, sidingUpper, sidingUpperShapes, sidingJoints: sidingJoints.map(({ clip, ...j }) => j), lap, lapExposure, sidingStudLimit: lapStudLimit(d) };
}

/** @typedef {ReturnType<typeof buildFramed>} Shed */
