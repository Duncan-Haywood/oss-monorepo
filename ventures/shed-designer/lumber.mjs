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
  floorOSB: { name: '23/32" tongue-and-groove OSB subfloor, 4x8', unit: 'sheet', price: 36 },
  paverBase: { name: 'Paver base, 0.5 cu ft bag (a 4" bed under each block)', unit: 'bag', price: 6 },
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
  rafterHanger: { name: 'Sloped rafter hanger at the ridge beam, 2x6 (Simpson LSU26-type, field-adjustable for slope)', unit: 'each', price: 6.5 },
  rafterHanger28: { name: 'Sloped rafter hanger at the ridge beam, 2x8 (Simpson LSSU28-type)', unit: 'each', price: 11.5 },
  rafterHanger210: { name: 'Sloped rafter hanger at the ridge beam, 2x10 (Simpson LSSU210-type)', unit: 'each', price: 10.7 },
  paint: { name: 'Exterior paint for the siding, two coats', unit: 'gallon', price: 45 },
  trimPaintQt: { name: 'Exterior semi-gloss paint for the trim, two coats', unit: 'quart', price: 26 },
  trimPaintGal: { name: 'Exterior semi-gloss paint for the trim, two coats', unit: 'gallon', price: 49 },
  accentPaint: { name: 'Exterior accent paint', unit: 'quart', price: 18 },
  fasciaTrim: { name: 'Primed 1x6 fascia board, 12 ft', unit: 'piece', price: 16 },
  soffitPanel: { name: 'Vented soffit panel, 12-3/4 in x 12 ft', unit: 'panel', price: 14 },
  rakeTrim: { name: 'Primed 1x4 rake board, 12 ft', unit: 'piece', price: 11 },
  trim1x4x8: { name: 'Primed 1x4 trim board (3/4 x 3-1/2), 8 ft', unit: 'piece', price: 8 },
  trim1x4x12: { name: 'Primed 1x4 trim board (3/4 x 3-1/2), 12 ft', unit: 'piece', price: 12 },
  trim1x4x16: { name: 'Primed 1x4 trim board (3/4 x 3-1/2), 16 ft', unit: 'piece', price: 16 },
  interiorPanel: { name: 'Interior wall paneling, 4x8', unit: 'sheet', price: 30 },
  lpPanel: { name: 'LP SmartSide 38 Series primed panel siding, 3/8 in, 4x8', unit: 'sheet', price: 40 },
  lpPanel9: { name: 'LP SmartSide 38 Series primed panel siding, 3/8 in, 4x9', unit: 'sheet', price: 45 },
  lpPanel10: { name: 'LP SmartSide 38 Series primed panel siding, 3/8 in, 4x10', unit: 'sheet', price: 50 },
  lpPanel76: { name: 'LP SmartSide 76 Series primed panel siding, 7/16 in, 4x8', unit: 'sheet', price: 65 },
  lpPanel76x9: { name: 'LP SmartSide 76 Series primed panel siding, 7/16 in, 4x9', unit: 'sheet', price: 73 },
  lpPanel76x10: { name: 'LP SmartSide 76 Series primed panel siding, 7/16 in, 4x10', unit: 'sheet', price: 81 },
  vinylBox: { name: 'Vinyl lap siding (box covers 200 sq ft)', unit: 'box', price: 169 },
  bbBoard: { name: 'Board for board and batten, primed engineered wood, 4/4 x 6 in x 16 ft (LP SmartSide 440 or equal; 5-1/2 in face)', unit: 'piece', price: 27 },
  bbBatten: { name: 'Batten, primed engineered wood, 4/4 x 4 in x 16 ft (LP SmartSide 440 or equal; 3-1/2 in face)', unit: 'piece', price: 20 },
  hardiePlank: { name: 'Fiber cement lap plank, 6-1/4 in x 12 ft (5 in exposure)', unit: 'piece', price: 10 },
  lapHardie: { name: 'Fiber cement lap plank, primed, 8-1/4 in x 12 ft (HardiePlank HZ10 Cedarmill or equal), 7 in exposure', unit: 'piece', price: 12.48 },
  lapHardie5: { name: 'Fiber cement lap plank, primed, 8-1/4 in x 12 ft (HardiePlank HZ5 Cedarmill or equal, for freezing climates), 7 in exposure', unit: 'piece', price: 17.98 },
  trim54Hardie: { name: 'Fiber cement trim, primed smooth, 5/4 x 3-1/2 in x 12 ft (HardieTrim or equal)', unit: 'piece', price: 23.48 },
  trim54LP: { name: 'Engineered wood trim, primed, 5/4 x 3-1/2 in x 16 ft (LP SmartSide 540 Series or equal)', unit: 'piece', price: 25 },
  lapLP12: { name: 'Engineered wood lap, primed, 8 in x 12 ft (LP SmartSide 38 Series Cedar Texture or equal)', unit: 'piece', price: 11.28 },
  lapLP16: { name: 'Engineered wood lap, primed, 8 in x 16 ft (LP SmartSide 38 Series Cedar Texture or equal)', unit: 'piece', price: 15.48 },
  houseWrap: { name: 'House wrap (weather-resistive barrier), 3 ft x 100 ft roll', unit: 'roll', price: 38.93 },
  wrapTape: { name: 'House wrap seam tape, about 2 in x 164 ft', unit: 'roll', price: 14.97 },
  capNails: { name: '1 in. plastic cap nails for the house wrap, 2,000-count box', unit: 'box', price: 22.45 },
  jointFlashing: { name: 'Aluminum flashing coil, 10 in x 50 ft (cut into 6 in x 10 in pieces behind lap butt joints)', unit: 'roll', price: 43.68 },
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
  anchorKit48: { name: 'Ground anchor kit, 4 x 3/4 in. x 48 in. double-head auger anchors with 8 ft straps and tensioning bolts (Tie Down 59802, soil class 4a)', unit: 'kit', price: 145.84 },
  anchorKit30: { name: 'Ground anchor kit, 4 x 3/4 in. x 30 in. double-head auger anchors with 8 ft straps and tensioning bolts (Tie Down 59800, soil class 2)', unit: 'kit', price: 109.35 },
  concreteBlock: { name: 'Solid concrete block under skids', unit: 'each', price: 3.5 },
  gravelTon: { name: 'Crushed stone for the pad, 4 in. deep (bulk)', unit: 'ton', price: 45 },
  deckBlock: { name: 'Concrete deck block (pier block) under skids', unit: 'each', price: 10 },
  cmuBlock: { name: '8 x 8 x 16 concrete block (CMU) under skids', unit: 'each', price: 2.5 },
  formTube: { name: 'Concrete form tube, 12 in. x 48 in. (Quikrete Quik-Tube 692203), cut to pier length', unit: 'each', price: 15 },
  concreteBag: { name: 'Concrete mix, 80 lb bag (Quikrete 110180), for the piers', unit: 'bag', price: 6 },
  landscapeFabric: { name: 'Landscape fabric under the gravel', unit: 'roll', price: 20 },
  plateCompactor: { name: 'Plate compactor rental, 1 day (for the gravel pad)', unit: 'day', price: 90 },
  handTamper: { name: 'Steel hand tamper (buy instead of renting a compactor)', unit: 'each', price: 30 },
  framingNails: { name: '16d 3-1/2 in. galvanized common nails, 5 lb box', unit: 'box', price: 25 },
  sheathingNails: { name: '8d 2-1/2 in. hot-dipped galvanized common nails, 5 lb box (floor and roof sheathing)', unit: 'box', price: 27 },
  sidingNails: { name: '8d 2-1/2 in. hot-dipped galvanized siding nails, 1 lb box', unit: 'box', price: 6 },
  sidingNails5: { name: '8d 2-1/2 in. hot-dipped galvanized siding nails, 5 lb box (about 770)', unit: 'box', price: 19 },
  roofingNails: { name: '1-1/4 in. electro-galvanized roofing nails, 5 lb box', unit: 'box', price: 16 },
  trimNails: { name: '8d 2-1/2 in. hot-dipped galvanized finish nails, 1 lb box', unit: 'box', price: 10 },
  connectorNails: { name: 'Simpson N10DHDG 10d x 1-1/2 in. connector nails, 120-pack', unit: 'pack', price: 5 },
  adhesive: { name: 'Construction adhesive, 28 oz tube (subfloor and door frame)', unit: 'tube', price: 9 },
  screws: { name: 'Exterior screws, #8 x 1-5/8 in., 1 lb box (door skin)', unit: 'box', price: 11 },
  vinylJ: { name: 'Vinyl J-channel, 12.6 ft (round openings, under eaves and rakes)', unit: 'piece', price: 8 },
  vinylStarter: { name: 'Vinyl starter strip, 12 ft', unit: 'piece', price: 9.5 },
  vinylCorner: { name: 'Vinyl outside corner post, 10 ft', unit: 'piece', price: 26 },
  flashingTape: { name: 'Flashing tape, 4 in. roll (round door and window openings)', unit: 'roll', price: 25 },
  shims: { name: 'Wood shims, 12 a bundle (setting doors and windows)', unit: 'bundle', price: 2 },
  caulk: { name: 'Exterior paintable caulk, 10.1 oz tube (DAP Dynaflex 230)', unit: 'tube', price: 6 },
  zFlashing: { name: 'Galvanized Z-flashing (drip cap), 5/8 in. x 10 ft, over doors, windows and siding joints', unit: 'piece', price: 8 },
  starterShingle: { name: 'Starter strip shingles, 120 lin ft bundle (GAF Pro-Start)', unit: 'bundle', price: 55 },
  ridgeCapShingle: { name: 'Hip and ridge cap shingles, 25 lin ft bundle (GAF Seal-A-Ridge)', unit: 'bundle', price: 61 },
  tHinge: { name: '8 in. zinc-plated tee hinge (shed door)', unit: 'each', price: 8.5 },
  hasp: { name: '4-1/2 in. safety hasp (shed door)', unit: 'each', price: 6.6 },
  doorPull: { name: '6-1/2 in. door pull (shed door)', unit: 'each', price: 7.5 },
  caneBolt: { name: '18 in. zinc cane bolt (holds the fixed leaf of a pair of doors)', unit: 'each', price: 17.5 },
});
