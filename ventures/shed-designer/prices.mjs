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
  paint: { price: 45.98, url: 'https://www.homedepot.com/p/BEHR-PREMIUM-PLUS-1-gal-Medium-Base-Satin-Enamel-Exterior-Paint-Primer-940001/202301640', note: `${SNIP}; Behr Premium Plus exterior` },
};

/** Items with no listing: our own rough figure, marked as an estimate. */
const ESTIMATES = {
  siding9: ['siding8', 108 / 96], siding10: ['siding8', 120 / 96],
  rakeTrim: 11, glitter: 10, interiorPanel: 30, interiorPaint: 40, accentPaint: 18, concreteBlock: 3.5, gravelTon: 45,
};

const withSource = (l) => ({ ...l, store: HD, seen: SEEN, kind: /** @type {const} */ ('listed') });

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
    return { price: Math.round(base.price * e[1] * 100) / 100, url: base.url, store: base.store, seen: base.seen, note: `no listing found; scaled by area from the listed 4x8 panel`, kind: 'derived' };
  }
  if (typeof e === 'number') return { price: e, note: 'no listing found; our estimate', kind: 'estimate' };
  return { price: 0, note: 'no price', kind: 'estimate' };
}
