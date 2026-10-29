// @ts-check
// Starting prices, each with where it came from. These are national-chain
// (Home Depot) listings found on 2026-10-29. Most were read from the search
// result's copy of the product page because the product pages refuse automated
// fetches, so a price can be days or weeks old and differs by store; the page
// says so and links each one. Every price is editable on the page.
//
// A board length with no listing of its own is priced at the per-foot rate of
// the nearest listed length of the same lumber, and says so. Items with no
// listing at all are marked as estimates.

/** @typedef {{ price: number, url?: string, store?: string, seen?: string, note: string, kind: 'listed' | 'derived' | 'estimate' }} Priced */

const HD = 'Home Depot';
const SEEN = '2026-10-29';
const SNIP = 'price read from the search result for this product page';

/** Listed boards: material -> length in ft -> listing. */
export const LISTED_LUMBER = {
  '2x4': {
    8: { price: 4.15, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-8-ft-Prime-Stud-058449/312528776', note: `${SNIP}; other listings $3.85-$4.25` },
    10: { price: 7.72, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-10-ft-2-and-BTR-S-Dry-Spruce-Pine-Fir-Lumber-0133160/303335795', note: SNIP },
    12: { price: 8.46, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-12-ft-Premium-Kiln-Dried-Heat-Treated-Whitewood-Dimensional-Lumber-244S12P/319459507', note: SNIP },
    16: { price: 13.17, url: 'https://www.homedepot.com/p/2-in-x-4-in-x-16-ft-2-Premium-Grade-SPF-Dimensional-Lumber-0133166/303335813', note: SNIP },
  },
  '2x6': {
    8: { price: 6.83, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-8-ft-2-Premium-Grade-SPF-Dimensional-Lumber-0200352/203445784', note: `${SNIP}; listings vary $6.75-$9.62` },
    12: { price: 10.68, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-12-ft-2-and-Better-PRIME-Kiln-Dried-Heat-Treated-Spruce-Pine-Fir-Lumber-S206SE-1-12/311720641', note: SNIP },
    16: { price: 14.34, url: 'https://www.homedepot.com/p/2-in-x-6-in-x-16-ft-2-Premium-Grade-SPF-Dimensional-Lumber-058447/312528849', note: SNIP },
  },
  '2x8': {
    12: { price: 12.34, url: 'https://www.homedepot.com/p/2-in-x-8-in-x-12-ft-2-Premium-Grade-Southern-Yellow-Pine-Dimensional-Lumber-560499/202085927', note: `${SNIP}; Southern yellow pine; other copies of the page show $15.38-$15.52` },
  },
  '2x10': {
    12: { price: 25.46, url: 'https://www.homedepot.com/p/2-in-x-10-in-x-12-ft-2-Premium-Grade-Fir-Dimensional-Lumber-603708/206182035', note: `${SNIP}; Douglas fir (western pricing); pine is often cheaper` },
  },
  'PT 2x6': {
    12: { price: 14.18, url: 'https://www.homedepot.com/p/WeatherShield-2-in-x-6-in-x-12-ft-2-Prime-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-253921/206967802', note: `${SNIP}; ground contact` },
    16: { price: 19.48, url: 'https://www.homedepot.com/p/WeatherShield-2-in-x-6-in-x-16-ft-2-Prime-Ground-Contact-Pressure-Treated-Southern-Yellow-Pine-Lumber-253921/206967797', note: `${SNIP}; ground contact` },
  },
  'PT 4x4': {
    12: { price: 22.88, url: 'https://www.homedepot.com/p/4-in-x-4-in-x-12-ft-2-Pressure-Treated-Ground-Contact-Southern-Pine-Timber-4230254/100073070', note: `${SNIP}; ground contact` },
  },
  'PT 4x6': {
    12: { price: 32.88, url: 'https://www.homedepot.com/p/4-in-x-6-in-x-12-ft-2-Pressure-Treated-Ground-Contact-Southern-Pine-Timber-260430/100062638', note: `${SNIP}; ground contact` },
  },
};

/** For lumber with no listing at all: the listed lumber whose per-foot rate it is scaled from, and by how much. */
const UNLISTED = {
  '2x12': ['2x10', 1.25], 'PT 2x4': ['PT 2x6', 0.7], 'PT 2x8': ['PT 2x6', 1.35], 'PT 2x10': ['PT 2x6', 1.75], 'PT 2x12': ['PT 2x6', 2.2],
};

/** Listed items, keyed as in lumber.mjs EXAMPLE_ITEMS; `per` divides a listing into the unit the estimate counts. */
export const LISTED_ITEMS = {
  floorSheet: { price: 49.53, url: 'https://www.homedepot.com/p/Plytanium-23-32-in-x-4-ft-x-8-ft-Southern-Pine-Tongue-and-Groove-Plywood-Sheathing-605189/100003769', note: `${SNIP}; 23/32" tongue-and-groove` },
  roofSheet: { price: 11.68, url: 'https://www.homedepot.com/p/OSB-7-16-in-Sheathing-Panel-Application-as-4-ft-x-8-ft-386081/202106230', note: `${SNIP}; listings vary $10.38-$14.98` },
  siding8: { price: 46.78, url: 'https://www.homedepot.com/p/reviews/Plytanium-Plywood-Siding-Panel-T1-11-8-IN-OC-Nominal-19-32-in-x-4-ft-x-8-ft-Actual-0-563-in-x-48-in-x-96-in-113699/100000016/2', note: `${SNIP} (the product's reviews page)` },
  shingleBundle: { price: 40.47, url: 'https://www.homedepot.com/p/Owens-Corning-TruDefinition-Duration-Algae-Resistant-Estate-Gray-Laminate-Architectural-Shingles-32-8-sq-ft-per-Bundle-TD20/205655964', note: `${SNIP}; 32.8 sq ft per bundle` },
  underlayment: { price: 119, url: 'https://www.homedepot.com/p/GAF-FeltBuster-1000-sq-ft-Synthetic-Roofing-Underlayment-Roll-0973/205035868', note: `${SNIP}; one roll covers 1,000 sq ft` },
  dripEdge: { price: 11.98, url: 'https://www.homedepot.com/p/Amerimax-Home-Products-F5-5S-x-10-ft-White-Aluminum-Drip-Edge-Flashing-5511600120/100074238', note: `${SNIP}; cheaper profiles $7.68-$8.48` },
  fasciaTrim: { price: 23.52, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-6-in-x-12-ft-Radiata-Pine-Finger-Joint-Primed-Board-253192/304798235', note: `${SNIP}; finger-jointed primed board` },
  soffitPanel: { price: 20.68, url: 'https://www.homedepot.com/p/Ply-Gem-Economy-T4-12-75-in-x-12-ft-White-Vinyl-Vented-Soffit-EVS12P-04/306292522', note: `${SNIP}; 12-3/4" x 12 ft vented vinyl` },
  hurricaneTie: { price: 0.58, url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-H2-5A-18-Gauge-Galvanized-Hurricane-Tie-H2-5A/203302239', note: `${SNIP}; Simpson H2.5A` },
  rafterHanger: { price: 1.77, url: 'https://www.homedepot.com/p/Simpson-Strong-Tie-LUS-Galvanized-Face-Mount-Joist-Hanger-for-2x6-Nominal-Lumber-LUS26/100374889', note: `${SNIP}; Simpson LUS26` },
  gableVent: { price: 22.98, url: 'https://www.homedepot.com/p/Gibraltar-Building-Products-12-in-x-12-in-Square-White-Galvanized-Steel-Built-in-Screen-Gable-Louver-Vent-GLFF1212WH-1-8/310198861', note: `${SNIP}; a 12x12 vent, the nearest listed size` },
  lpPanel: { price: 39.96, url: 'https://www.homedepot.com/p/LP-SmartSide-SmartSide-38-Series-8-in-Application-as-4-ft-x-8-ft-Cedar-Texture-OC-Panel-Engineered-Treated-Wood-Siding-27874/100055901', note: `${SNIP}; LP SmartSide 38 Series 3/8" 4x8 panel` },
  vinylBox: { price: 169, url: 'https://www.homedepot.com/p/Double-4-5-in-x-145-in-White-Dutch-Lap-Vinyl-Siding-PCD4504H/301738325', note: `${SNIP}; one box covers 200 sq ft` },
  boardBox: { price: 89.18, url: 'https://www.homedepot.com/p/CMPC-1-in-x-8-in-x-8-ft-Primed-Finger-Joint-Pine-Board-Actual-Size-0-75-in-x-7-25-in-x-8-ft-3-Piece-Per-Box-CMPC0028777/300125808', note: `${SNIP}; box of three primed 1x8x8 boards` },
  battenBox: { price: 25.08, url: 'https://homedepot.com/p/1-in-x-3-in-x-8-ft-Spruce-Pine-Fir-Furring-Strip-Common-Board-10-Per-box-EHD0000368/326303094', note: `${SNIP}; box of ten 1x3x8 furring strips` },
  hardiePlank: { price: 9.68, url: 'https://www.homedepot.com/p/James-Hardie-Hardie-Plank-HZ10-6-25-in-x-144-in-Primed-Cedarmill-Fiber-Cement-Lap-Siding-215570/100075705', note: `${SNIP}; 6-1/4" x 12 ft plank, 5" exposure` },
  metalPanel: { price: 19.98, url: 'https://homedepot.com/p/Gibraltar-Building-Products-8-ft-Corrugated-Galvanized-Steel-31-Gauge-Roof-Panel-13513/202092961', note: `${SNIP}; 8 ft corrugated panel, about 21-1/2" net cover (inferred)` },
  metalRidge: { price: 21.88, url: 'https://homedepot.com/p/Union-Corrugating-10-1-2-ft-x-14-in-29-Gauge-Galvanized-Steel-Black-Ridge-Cap-ST-RC-0812-003/322332805', note: `${SNIP}; 10-1/2 ft ridge cap` },
  stain: { price: 49.98, url: 'https://www.homedepot.com/p/BEHR-Premium-1-gal-Deep-Base-Solid-Color-Waterproofing-Stain-Sealer-501301/202263885', note: `${SNIP}; solid-colour exterior stain` },
  drywall: { price: 15.58, url: 'https://homedepot.com/b/Building-Materials-Drywall-Drywall-Sheets/4x8/N-5yc1vZbb52Z1z18jbl', note: `${SNIP} (category page); 1/2" UltraLight 4x8` },
  plywoodLining: { price: 27.56, url: 'https://www.homedepot.com/p/Plytanium-15-32-in-x-4-ft-x-8-ft-3-Ply-RTD-Sheathing-132411/100067329', note: `${SNIP}; 15/32" 4x8; listings vary $23.48-$29.23` },
  osbLining: { price: 11.68, url: 'https://www.homedepot.com/p/OSB-7-16-Application-as-4ft-X-8-ft-Sheathing-Panel-386081/202106230', note: `${SNIP}; 7/16" 4x8` },
  pegboard: { price: 23.98, url: 'https://homedepot.com/p/Pegboard-White-Panel-Common-3-16-in-x-4-ft-x-8-ft-Actual-0-155-in-x-47-7-in-x-95-7-in-486140/202189722', note: `${SNIP}; 3/16" 4x8` },
  beadboard: { price: 22.78, url: 'https://homedepot.com/p/3-16-in-x-4-ft-x-8-ft-MDF-Beadboard-Panel-739558/202090200', note: `${SNIP}; 3/16" MDF 4x8` },
  insulation: { price: 77.97, url: 'https://homedepot.com/p/CertainTeed-R13-Kraft-Faced-Fiberglass-Insulation-Batt-15-in-x-93-in-13-Pieces-645710/330975699', note: `${SNIP}; R-13 kraft-faced, 125.94 sq ft a bag` },
  jointCompound: { price: 21.84, url: 'https://www.homedepot.com/p/USG-Sheetrock-Brand-4-5-Gal-Plus-3-Lightweight-All-Purpose-Pre-Mixed-Joint-Compound-381466/100321602', note: `${SNIP}; 4.5 gal` },
  drywallTape: { price: 7.49, url: 'https://hemlockhardware.com/products/266811-sheetrock-2-1-16-in-x-500-ft-paper-joint-drywall-tape', store: 'Hemlock Hardware', note: `${SNIP}; 500 ft paper tape (no big-box listing found)` },
  interiorPaint: { price: 31.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Deep-Base-Eggshell-Enamel-Low-Odor-Interior-Paint-Primer-230001/202761523', note: `${SNIP}; Behr Premium Plus interior` },
  paint: { price: 45.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Medium-Base-Satin-Enamel-Exterior-Paint-Primer-940001/202301640', note: `${SNIP}; Behr Premium Plus exterior` },
};

/** Wall sheathing under lap and board-and-batten siding is the same OSB panel as the roof. */
/** @type {any} */ (LISTED_ITEMS).wallSheathing = LISTED_ITEMS.roofSheet;

/** Items with no listing: our own rough figure, marked as an estimate. */
const ESTIMATES = {
  siding9: ['siding8', 108 / 96], siding10: ['siding8', 120 / 96],
  rakeTrim: 11, glitter: 10, interiorPanel: 30, accentPaint: 18, concreteBlock: 3.5, gravelTon: 45,
  lpPanel9: ['lpPanel', 108 / 96], lpPanel10: ['lpPanel', 120 / 96],
};

const withSource = (l) => ({ store: HD, ...l, seen: SEEN, kind: /** @type {const} */ ('listed') });

/**
 * Price and source for one board.
 * @param {string} material @param {number} ft
 * @returns {Priced}
 */
export function boardPrice(material, ft) {
  const listed = /** @type {Record<string, Record<number, any>>} */ (LISTED_LUMBER)[material];
  if (listed?.[ft]) return withSource(listed[ft]);
  if (listed) {
    const lens = Object.keys(listed).map(Number).sort((a, b) => Math.abs(a - ft) - Math.abs(b - ft) || b - a);
    const from = lens[0];
    const l = listed[from];
    return { price: Math.round((l.price / from) * ft * 100) / 100, url: l.url, store: HD, seen: SEEN, note: `scaled by length from the listed ${from} ft board ($${l.price.toFixed(2)})`, kind: 'derived' };
  }
  const un = /** @type {Record<string, [string, number]>} */ (/** @type {unknown} */ (UNLISTED))[material];
  if (un) {
    const base = boardPrice(un[0], ft);
    return { price: Math.round(base.price * un[1] * 100) / 100, note: `no listing found; our estimate from ${un[0]} x ${un[1]}`, kind: 'estimate' };
  }
  return { price: ft, note: 'no listing found; $1 a foot placeholder', kind: 'estimate' };
}

/** Price and source for a non-lumber item. @param {string} key @returns {Priced} */
export function itemPrice(key) {
  const l = /** @type {Record<string, any>} */ (LISTED_ITEMS)[key];
  if (l) return withSource(l);
  const e = /** @type {Record<string, any>} */ (ESTIMATES)[key];
  if (Array.isArray(e)) {
    const base = itemPrice(e[0]);
    return { price: Math.round(base.price * e[1] * 100) / 100, url: base.url, store: base.store, seen: base.seen, note: 'no listing found for this length; scaled by area from the listed 4x8 panel', kind: 'derived' };
  }
  if (typeof e === 'number') return { price: e, note: 'no listing found; our estimate', kind: 'estimate' };
  return { price: 0, note: 'no price', kind: 'estimate' };
}
