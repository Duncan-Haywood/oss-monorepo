// @ts-check
// Is the design a good deal? Its storage per dollar beside wood shed kits and
// installed sheds sold by Home Depot and Lowe's at 100 sq ft or under.
//
// Every kit price below was read on 2026-10-30 from a search engine's copy of
// the store's product page: both stores answer automated requests with 403, so
// none was read from the live page. Search copies can be months old, so each
// row links its listing for a person to check. Specs marked with a `specFrom`
// URL come from a third-party seller's page for the same model, read the same
// day. No price here is estimated: a listing whose price could not be read is
// left out (Tuff Shed's Sundance series at Home Depot is quote-only).

import { storageOf } from './paretoaudit.mjs';

const SEEN = '2026-10-30';
const SNIPPET = 'search-result copy of the store page';
const LCC_SPEC = 'https://www.shedsdirect.com/wood-sheds/2462-little-cottage-co-value-gable-8x10-vgs-pc.html';

/**
 * @typedef {{ store: 'Home Depot' | "Lowe's", name: string, model: string, url: string, price: number,
 *   source: string, seen: string, lengthFt: number, widthFt: number, sidewallIn?: number, specFrom?: string,
 *   siding: string, floor: boolean, shingles: boolean, installed: boolean, note?: string }} Kit
 */

/** @type {Kit[]} */
export const KITS = [
  { store: 'Home Depot', name: 'Little Cottage Co. Value Gable 8x8 precut kit with floor', model: '8x8 VGS-PC-FK', url: 'https://www.homedepot.com/p/329166423', price: 1809, source: SNIPPET, seen: SEEN, lengthFt: 8, widthFt: 8, sidewallIn: 75, specFrom: LCC_SPEC, siding: '3/8" LP SmartSide panel', floor: true, shingles: false, installed: false, note: 'specs are the 8x10 model\'s, carried across the line' },
  { store: 'Home Depot', name: 'Little Cottage Co. Value Gable 8x10 precut kit with floor', model: '8x10 VGS-PC-FK', url: 'https://www.homedepot.com/p/329166424', price: 2039, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, sidewallIn: 75, specFrom: LCC_SPEC, siding: '3/8" LP SmartSide panel', floor: true, shingles: false, installed: false },
  { store: 'Home Depot', name: 'Little Cottage Co. Value Gable 10x10 precut kit with floor', model: '10x10 VGS-PC-FK', url: 'https://www.homedepot.com/p/329166428', price: 2339, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 10, siding: 'LP SmartSide panel', floor: true, shingles: false, installed: false },
  { store: 'Home Depot', name: 'Little Cottage Co. Classic Gable 10x10 precut kit with floor', model: '10x10 CGS-PC-FK', url: 'https://www.homedepot.com/p/328634345', price: 3349, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 10, siding: 'not stated', floor: true, shingles: false, installed: false },
  { store: 'Home Depot', name: 'Little Cottage Co. Value Gambrel 10x10, 6 ft sidewalls, with floor', model: '10x10 VGB-6-PC-FK', url: 'https://www.homedepot.com/p/329166500', price: 2305.62, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 10, sidewallIn: 72, siding: 'not stated', floor: true, shingles: false, installed: false },
  { store: 'Home Depot', name: 'Handy Home Meridian 8x12 kit with floor', model: '19350-7', url: 'https://www.homedepot.com/p/204675983', price: 2509.74, source: SNIPPET, seen: SEEN, lengthFt: 12, widthFt: 8, sidewallIn: 76, specFrom: 'https://www.shedsforlessdirect.com/handy-home-meridian-8x12-wood-storage-shed-floor-p-866.html', siding: 'primed SmartSide panel', floor: true, shingles: false, installed: false },
  { store: 'Home Depot', name: 'Handy Home Meridian 8x10 kit with floor', model: '19348-4', url: 'https://www.homedepot.com/p/204675972', price: 2299, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, siding: 'SmartSide panel', floor: true, shingles: false, installed: false, note: 'price read from a category page and matched by name' },
  { store: 'Home Depot', name: 'Best Barns Haven Mini 8x12 kit', model: 'HMINDG12', url: 'https://www.homedepot.com/p/202957602', price: 2160, source: SNIPPET, seen: SEEN, lengthFt: 12, widthFt: 8, sidewallIn: 76, specFrom: 'https://www.ecanopy.com/brk-hmindg12.html', siding: 'primed LP SmartSide panel', floor: false, shingles: false, installed: false, note: 'floor not stated as included' },
  { store: 'Home Depot', name: 'Best Barns Salt Box 8x12 kit, no floor', model: 'SBOXDE12', url: 'https://www.homedepot.com/p/202903582', price: 2100, source: SNIPPET, seen: SEEN, lengthFt: 12, widthFt: 8, siding: 'not stated', floor: false, shingles: false, installed: false },
  { store: "Lowe's", name: 'Little Cottage Co. Value Gable 8x8', model: '5014970873', url: 'https://www.lowes.com/pd/Little-Cottage-Company-Value-8-ft-x-8-ft-Wood-Storage-Shed/5014970873', price: 1649, source: SNIPPET, seen: SEEN, lengthFt: 8, widthFt: 8, siding: 'LP SmartSide panel', floor: false, shingles: false, installed: false, note: 'floor not in the title' },
  { store: "Lowe's", name: 'Little Cottage Co. Value Gable 8x10, floor included', model: '5014970887', url: 'https://www.lowes.com/pd/Little-Cottage-Company-Value-8-ft-x-10-ft-Wood-Storage-Shed-Floor-Included/5014970887', price: 2039, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, sidewallIn: 75, specFrom: LCC_SPEC, siding: '3/8" LP SmartSide panel', floor: true, shingles: false, installed: false },
  { store: "Lowe's", name: 'Heartland Monterra Value Gable 8x8', model: '5015993947', url: 'https://www.lowes.com/pd/Heartland-Monterra-Value-Gable-8-ft-Gable-Style-Wood-Outdoor-Storage-Shed-with-Doors/5015993947', price: 1189.15, source: SNIPPET, seen: SEEN, lengthFt: 8, widthFt: 8, siding: 'engineered wood', floor: false, shingles: false, installed: false, note: 'sale price (was $1,399); the floor version is $1,599' },
  { store: "Lowe's", name: 'Heartland Midtown 8x10 with treated floor', model: '5013045535', url: 'https://www.lowes.com/pd/Heartland-MIDTOWN-8X10-W-TREATED-FLOOR/5013045535', price: 1999, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, siding: 'engineered wood', floor: true, shingles: false, installed: false },
  { store: "Lowe's", name: 'Heartland Midtown 8x10, installed, floor included', model: '5016179211', url: 'https://www.lowes.com/pd/Heartland-Midtown-8-ft-x-10-ft-Installed-Wood-Outdoor-Storage-Shed-Floor-Included/5016179211', price: 3875, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, siding: 'engineered wood', floor: true, shingles: true, installed: true, note: 'includes delivery, install, local permits and up to 6" of levelling; a category page showed $3,135' },
  { store: "Lowe's", name: 'Heartland Statesman 10x10, installed, floor included', model: '5017987731', url: 'https://www.lowes.com/pd/Heartland-Statesman-10-ft-x-10-ft-Gable-Style-Wood-Outdoor-Storage-Shed-1-Windows-Floor-Included-Installation-Included/5017987731', price: 4193, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 10, siding: 'engineered wood', floor: true, shingles: true, installed: true },
  { store: 'Home Depot', name: 'Tuff Shed Tahoe Sierra 8x10, primed, installed', model: '8x10 SR E1 NP', url: 'https://www.homedepot.com/p/305605282', price: 3299, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, sidewallIn: 72, siding: 'LP engineered wood', floor: true, shingles: true, installed: true, note: '6 ft sidewall (title); delivery and install included, permits excluded; floor and shingles assumed with install, not stated' },
  { store: 'Home Depot', name: 'Handy Home Meridian 8x10, professionally assembled, shingles', model: '60755-4', url: 'https://www.homedepot.com/p/301291141', price: 2749, source: SNIPPET, seen: SEEN, lengthFt: 10, widthFt: 8, siding: 'SmartSide panel', floor: true, shingles: true, installed: true, note: 'sale price (was $2,999)' },
];

/** What most kits leave out, priced from this design's own shopping list. */
const LEFT_OUT = { Roofing: 'shingles, underlayment and drip edge', Paint: 'paint or stain' };

/**
 * The design's storage per dollar beside the kits nearest its size.
 * @param {any} shed a built shed
 * @param {any} est its estimate
 * @param {number} [n] how many kits to show
 */
export function valueComparison(shed, est, n = 4) {
  const st = storageOf(shed);
  const sqFt = est.footprintSqFt;
  const yours = {
    sqFt,
    cost: est.total,
    sqFtPerK: (sqFt / est.total) * 1000,
    cuFtPerK: (st.cuFt / est.total) * 1000,
    sidewallIn: shed.design.wallHeight,
    cuFt: st.cuFt,
    // Outside floor area times wall height: the one volume every kit listing
    // lets us work out too, so the like-for-like figure.
    boxCuFtPerK: ((sqFt * shed.design.wallHeight) / 12 / est.total) * 1000,
  };
  const leftOut = Object.fromEntries(Object.keys(LEFT_OUT).map((g) => [g, est.shopping.filter((l) => l.section === g).reduce((t, l) => t + (l.total || 0), 0)]));
  const kits = KITS.map((k) => {
    const kSqFt = k.lengthFt * k.widthFt;
    // A DIY kit leaves out the roofing and finish; add what yours would cost,
    // scaled by floor area, so the two are closer to like for like.
    const adder = k.installed ? 0 : Object.values(leftOut).reduce((a, b) => a + b, 0) * (kSqFt / sqFt);
    const withRoof = k.price + adder;
    return { ...k, sqFt: kSqFt, sqFtPerK: (kSqFt / k.price) * 1000, withRoof, sqFtPerKWithRoof: (kSqFt / withRoof) * 1000,
      boxCuFtPerK: k.sidewallIn ? ((kSqFt * k.sidewallIn) / 12 / withRoof) * 1000 : undefined };
  }).sort((a, b) => Math.abs(a.sqFt - sqFt) - Math.abs(b.sqFt - sqFt) || a.price - b.price).slice(0, n);
  return { yours, kits, leftOut };
}

const money = (x) => `$${Math.round(x).toLocaleString('en-US')}`;
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The comparison as a short HTML block for the summary panel. */
export function valueHtml(cmp) {
  const y = cmp.yours;
  const rows = cmp.kits.map((k) => `<li><a href="${escAttr(k.url)}" target="_blank" rel="noopener nofollow">${escAttr(k.name)}</a> (${k.store}${k.installed ? ', installed' : ', kit'}): ${money(k.price)} for ${k.sqFt} sq ft, ${k.sqFtPerK.toFixed(0)} sq ft per $1,000${k.installed ? '' : `; ${k.sqFtPerKWithRoof.toFixed(0)} with the roofing and paint it leaves out`}${k.sidewallIn ? `; ${Math.floor(k.sidewallIn / 12)}' ${k.sidewallIn % 12}" sidewall, ${Math.round(k.boxCuFtPerK)} cu ft of floor times wall height per $1,000` : ''}.</li>`).join('');
  return `<div class="wide"><dt>Storage per dollar</dt><dd>${y.sqFtPerK.toFixed(0)} sq ft and ${y.cuFtPerK.toFixed(0)} cu ft of storage per $1,000 of materials (${y.cuFt.toFixed(0)} cu ft inside: floor times clear wall height, plus half the roof space). Like for like with the kits below: ${Math.round(y.boxCuFtPerK)} cu ft of floor times wall height per $1,000.</dd></div>`
    + `<div class="wide"><dt>Kits this size</dt><dd><ul>${rows}</ul><span class="muted">Store prices from a search engine's copy of each listing, seen ${SEEN}; check the link. Kits rarely include shingles, paint or a foundation (yours includes its blocks), and their walls are often lower. Your figure is materials only, no labour or tax.</span></dd></div>`;
}

/** The n kits nearest a floor area, nearest first, then cheapest. */
export function nearestKits(sqFt, n = 3) {
  return [...KITS].sort((a, b) => Math.abs(a.lengthFt * a.widthFt - sqFt) - Math.abs(b.lengthFt * b.widthFt - sqFt) || a.price - b.price).slice(0, n);
}

/**
 * One line for the picker's detail panel, in its per-$100 units: this design's
 * floor and floor-times-wall-height per $100 beside the nearest store kits'.
 * Kit prices leave out what the kit leaves out (shingles, usually paint, often
 * the floor), which the line says.
 * Pass `leftOut`, the design's own roofing and paint cost, to show each DIY
 * kit with that added too, scaled by floor area (valueComparison's `leftOut`).
 * @param {{ footprintSqFt: number, wallHeight: number, total: number }} f designFacts output
 * @param {number} [n]
 * @param {number} [leftOut]
 */
export function kitLineHtml(f, n = 3, leftOut = 0) {
  const per100 = (x, price) => (x / price) * 100;
  const box = (sqFt, wallIn) => (sqFt * wallIn) / 12;
  const mine = `${per100(f.footprintSqFt, f.total).toFixed(1)} sq ft and ${Math.round(per100(box(f.footprintSqFt, f.wallHeight), f.total))} cu ft of floor times wall height`;
  const kits = nearestKits(f.footprintSqFt, n).map((k) => {
    const sq = k.lengthFt * k.widthFt;
    const withRoof = k.installed || !leftOut ? 0 : k.price + leftOut * (sq / f.footprintSqFt);
    return `<li><a href="${escAttr(k.url)}" target="_blank" rel="noopener nofollow">${escAttr(k.name)}</a> (${k.store}${k.installed ? ', installed' : ', kit'}, ${money(k.price)}): ${per100(sq, k.price).toFixed(1)} sq ft${withRoof ? `; with your roofing and paint added, ${per100(sq, withRoof).toFixed(1)} sq ft` : ''}${k.sidewallIn ? ` and ${Math.round(per100(box(sq, k.sidewallIn), withRoof || k.price))} cu ft with its ${Math.floor(k.sidewallIn / 12)}' ${k.sidewallIn % 12}" walls` : ''}${k.installed ? '' : `; leaves out shingles${k.floor ? '' : /floor not/.test(k.note || '') ? ' (floor not stated)' : ' and the floor'}`}</li>`;
  }).join('');
  return `<div><dt>Against store kits, per $100</dt><dd>This design, measured outside like the kits: ${mine}.<ul class="kits">${kits}</ul><span class="muted">Kit prices are search-result copies of each listing seen ${SEEN}; check the link. Labour is in neither.</span></dd></div>`;
}
