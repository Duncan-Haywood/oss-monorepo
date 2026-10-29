// @ts-check
// Dimensional lumber: what a board called "2x4" actually measures, the lengths
// a yard stocks, and how to print a length the way a framer reads a tape.
//
// Actual sizes are the standard dressed (surfaced-dry) sizes for softwood
// dimension lumber in the US (American Softwood Lumber Standard, PS 20):
// 2x is 1-1/2 in thick; 4 in nominal is 3-1/2, 6 is 5-1/2, 8 is 7-1/4,
// 10 is 9-1/4 and 12 is 11-1/4.

/** @typedef {{ thick: number, depth: number }} Section */

/** Nominal size -> actual cross-section in inches (thickness x depth). */
export const ACTUAL = Object.freeze({
  '2x4': { thick: 1.5, depth: 3.5 },
  '2x6': { thick: 1.5, depth: 5.5 },
  '2x8': { thick: 1.5, depth: 7.25 },
  '2x10': { thick: 1.5, depth: 9.25 },
  '2x12': { thick: 1.5, depth: 11.25 },
  '4x4': { thick: 3.5, depth: 3.5 },
  '4x6': { thick: 3.5, depth: 5.5 },
});

/** The 2x sizes in order, for "one size up" (a ridge one deeper than the rafters). */
export const TWO_BY = ['2x4', '2x6', '2x8', '2x10', '2x12'];

/** Standard lengths in feet a yard usually stocks. */
export const STANDARD_LENGTHS_FT = [8, 10, 12, 14, 16, 18, 20];

/** Lengths switched on unless the user changes them. */
export const DEFAULT_LENGTHS_FT = [8, 10, 12, 14, 16];

/**
 * @param {string} nominal
 * @returns {Section}
 */
export function actual(nominal) {
  const key = String(nominal).replace(/^PT\s+/i, '');
  const s = /** @type {Record<string, Section>} */ (ACTUAL)[key];
  if (!s) throw new Error(`Unknown lumber size ${nominal}`);
  return s;
}

/** "PT 2x6" -> "2x6". */
export function nominalOf(material) {
  return String(material).replace(/^PT\s+/i, '');
}

export function isTreated(material) {
  return /^PT\s/i.test(String(material));
}

/** Round up to the next 1/16 in, so a cut list never asks for a board a hair short. */
export function ceil16(inches) {
  return Math.ceil(inches * 16 - 1e-6) / 16;
}

/** Round to the nearest 1/16 in. */
export function round16(inches) {
  return Math.round(inches * 16) / 16;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/**
 * Inches as a framer writes them: 91-1/2", 7' 7-1/2" with feet.
 * @param {number} inches
 * @param {{ feet?: boolean }} [opts]
 */
export function fmtIn(inches, opts = {}) {
  const neg = inches < 0;
  let sixteenths = Math.round(Math.abs(inches) * 16);
  let ft = 0;
  if (opts.feet) { ft = Math.floor(sixteenths / 192); sixteenths -= ft * 192; }
  const whole = Math.floor(sixteenths / 16);
  const frac = sixteenths % 16;
  let s = '';
  if (frac) {
    const g = gcd(frac, 16);
    s = whole ? `${whole}-${frac / g}/${16 / g}` : `${frac / g}/${16 / g}`;
  } else {
    s = String(whole);
  }
  s += '"';
  if (opts.feet && ft) s = `${ft}' ${s}`;
  return (neg ? '-' : '') + s;
}

/** Feet and inches: 12' 0" style, used on drawings. */
export function fmtFtIn(inches) {
  return fmtIn(inches, { feet: true });
}

/**
 * Example prices, per board. They are placeholders to make the estimate
 * readable before you type your own yard's prices, not a quote and not
 * collected from any store. Price per linear foot by material, with a small
 * per-foot premium on 18 and 20 ft boards, which yards usually charge.
 */
export const EXAMPLE_PER_FOOT = Object.freeze({
  '2x4': 0.55, '2x6': 0.85, '2x8': 1.15, '2x10': 1.5, '2x12': 1.95,
  'PT 2x4': 0.75, 'PT 2x6': 1.1, 'PT 2x8': 1.5, 'PT 2x10': 1.95, 'PT 2x12': 2.5,
  'PT 4x4': 1.5, 'PT 4x6': 2.4,
});

/**
 * @param {string} material
 * @param {number} lengthFt
 */
export function examplePrice(material, lengthFt) {
  const rate = /** @type {Record<string, number>} */ (EXAMPLE_PER_FOOT)[material] ?? 1;
  const premium = lengthFt >= 18 ? 1.12 : 1;
  return Math.round(rate * lengthFt * premium * 100) / 100;
}

/** Sheet goods and other items, also example prices to be replaced. */
export const EXAMPLE_ITEMS = Object.freeze({
  floorSheet: { name: '3/4" tongue-and-groove plywood, 4x8', unit: 'sheet', price: 48 },
  roofSheet: { name: '7/16" OSB roof sheathing, 4x8', unit: 'sheet', price: 16 },
  siding8: { name: 'T1-11 siding panel, 4x8', unit: 'sheet', price: 52 },
  siding9: { name: 'T1-11 siding panel, 4x9', unit: 'sheet', price: 62 },
  siding10: { name: 'T1-11 siding panel, 4x10', unit: 'sheet', price: 72 },
  shingleBundle: { name: 'Architectural shingles (32.8 sq ft a bundle)', unit: 'bundle', price: 38 },
  underlayment: { name: 'Synthetic roof underlayment roll (1,000 sq ft)', unit: 'roll', price: 30 },
  glitter: { name: 'Paint glitter additive (one packet per gallon)', unit: 'packet', price: 10 },
  interiorPaint: { name: 'Interior paint, two coats', unit: 'gallon', price: 40 },
  dripEdge: { name: 'Drip edge, 10 ft', unit: 'piece', price: 9 },
  gableVent: { name: 'Louvered gable vent', unit: 'each', price: 18 },
  rafterHanger: { name: 'Rafter hanger at the ridge beam (2x6)', unit: 'each', price: 2.5 },
  paint: { name: 'Exterior paint for the siding, two coats', unit: 'gallon', price: 45 },
  accentPaint: { name: 'Exterior accent paint', unit: 'quart', price: 18 },
  fasciaTrim: { name: 'Primed 1x6 fascia board, 12 ft', unit: 'piece', price: 16 },
  soffitPanel: { name: 'Vented soffit panel, 12-3/4 in x 12 ft', unit: 'panel', price: 14 },
  rakeTrim: { name: 'Primed 1x4 rake board, 12 ft', unit: 'piece', price: 11 },
  interiorPanel: { name: 'Interior wall paneling, 4x8', unit: 'sheet', price: 30 },
  lpPanel: { name: 'LP SmartSide panel siding, 4x8', unit: 'sheet', price: 40 },
  lpPanel9: { name: 'LP SmartSide panel siding, 4x9', unit: 'sheet', price: 45 },
  lpPanel10: { name: 'LP SmartSide panel siding, 4x10', unit: 'sheet', price: 50 },
  vinylBox: { name: 'Vinyl lap siding (box covers 200 sq ft)', unit: 'box', price: 169 },
  boardBox: { name: 'Primed 1x8x8 boards for board and batten (box of 3)', unit: 'box', price: 89 },
  battenBox: { name: '1x3x8 battens (box of 10)', unit: 'box', price: 25 },
  hardiePlank: { name: 'Fiber cement lap plank, 6-1/4 in x 12 ft (5 in exposure)', unit: 'piece', price: 10 },
  wallSheathing: { name: '7/16" OSB wall sheathing under the siding, 4x8', unit: 'sheet', price: 12 },
  metalPanel: { name: 'Corrugated steel roof panel, 8 ft', unit: 'piece', price: 20 },
  metalRidge: { name: 'Metal ridge cap, 10-1/2 ft', unit: 'piece', price: 22 },
  stain: { name: 'Exterior solid-colour stain, two coats', unit: 'gallon', price: 50 },
  drywall: { name: '1/2" drywall, 4x8', unit: 'sheet', price: 16 },
  plywoodLining: { name: '15/32" plywood wall lining, 4x8', unit: 'sheet', price: 28 },
  osbLining: { name: '7/16" OSB wall lining, 4x8', unit: 'sheet', price: 12 },
  pegboard: { name: 'Pegboard, 4x8', unit: 'sheet', price: 24 },
  beadboard: { name: 'Beadboard panel, 4x8', unit: 'sheet', price: 23 },
  insulation: { name: 'R-13 kraft-faced batts (125.94 sq ft a bag)', unit: 'bag', price: 78 },
  jointCompound: { name: 'Joint compound, 4.5 gal', unit: 'bucket', price: 22 },
  drywallTape: { name: 'Paper drywall tape, 500 ft', unit: 'roll', price: 7.5 },
  pitchConnector: { name: 'Variable-pitch rafter connector (Simpson VPA2 or equal)', unit: 'each', price: 6.39 },
  hurricaneTie: { name: 'Rafter-to-plate tie', unit: 'each', price: 1.2 },
  concreteBlock: { name: 'Solid concrete block under skids', unit: 'each', price: 3.5 },
  gravelTon: { name: 'Crushed gravel for the pad', unit: 'ton', price: 45 },
});
