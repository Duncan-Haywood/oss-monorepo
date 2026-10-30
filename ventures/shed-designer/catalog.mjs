// @ts-check
// The same part at other stores, and cheaper parts that do the same job.
// Every offer is a product page with its model or item number and the price
// read from a search-result copy of that page on 2026-10-29 (the store pages
// themselves refuse automated reads, and we do not scrape them or copy their
// photos: follow the link to see the product). Prices move; the link is the
// check.

import { LOWES } from './lowes.mjs';

/** @typedef {{ store: string, name: string, model: string, price: number, url: string, note?: string, bulk?: { min: number, price: number } }} Offer */

/** The oldest copy an offer's note names, in days ("a copy about 1,443 days old"), or 0 when it names none. @param {{ note?: string }} o */
export const copyAgeDays = (o) => Math.max(0, ...[...(o.note || '').matchAll(/([\d,]+)(?:-([\d,]+))? days old/g)].map((m) => Number((m[2] || m[1]).replace(/,/g, ''))));

/** An offer's price for a quantity: the bulk price once the quantity reaches it. @param {Offer} o @param {number} qty */
export const offerPrice = (o, qty) => (o.bulk && qty >= o.bulk.min ? o.bulk.price : o.price);

const SEEN = '2026-10-29';

/** The two chains the tool prices a whole order at (owner, 2026-10-30: Home Depot and Lowe's only). */
export const MAIN_STORES = ['Home Depot', "Lowe's"];

/** Offers for each shopping-list item key (keys as in lumber.mjs EXAMPLE_ITEMS). @type {Record<string, Offer[]>} */
export const OFFERS = {
  siding8: [
    { store: 'Home Depot', name: 'Plytanium T1-11 8 in. OC, 19/32 x 4 x 8 (not primed)', model: 'model 113699, internet 100000016', price: 46.78, url: 'https://www.homedepot.com/p/Plytanium-Plywood-Siding-Panel-T1-11-8-IN-OC-Nominal-19-32-in-x-4-ft-x-8-ft-Actual-0-563-in-x-48-in-x-96-in-113699/100000016', note: 'the price the shopping list uses (prices.mjs); another copy of this page showed $43.98' },
    { store: "Lowe's", name: 'Plytanium SYP T1-11 8 in. groove, 0.594 x 48 x 96 (not primed)', model: 'see category page', price: 44.78, url: 'https://www.lowes.com/pl/siding-stone-veneer/wood-siding-accessories/plytanium/t1-11/2365411302-4294851170-328841971', note: 'category page; copies showed up to $47.48' },
  ],
  lpPanel: [
    { store: 'Home Depot', name: 'LP SmartSide 38 Series Cedar Texture 8 in. OC panel, 3/8 x 4 x 8', model: 'model 27874, internet 100055901', price: 39.96, url: 'https://www.homedepot.com/p/LP-SmartSide-LP-SmartSide-Cedar-Texture-8-in-OC-Panel-Engineered-Treated-Wood-Siding-8-in-Application-as-3-8-in-x-4-ft-x-8-ft-27874/100055901', note: 'the price the shopping list uses (prices.mjs); other copies of this page showed $42.78-$53.58' },
    { store: "Lowe's", name: 'LP SmartSide 38 Series primed panel, 3/8 x 48 x 96', model: 'item 55897, model 27874', price: 45.98, url: 'https://www.lowes.com/pd/SmartSide-38-Series-Primed-Engineered-Treated-Wood-Siding-Panel-Common-0-375-in-x-48-in-x-96-in-Actual-0-315-in-x-48-563-in-x-95-875-in/3058153', note: 'copies showed $42.78-$53.98' },
  ],
  lpPanel76: [
    { store: 'Home Depot', name: 'LP SmartSide 76 Series Cedar Texture panel, 4 in. OC, 7/16 x 4 x 8', model: 'model 25831, internet 100089302', price: 64.88, url: 'https://www.homedepot.com/p/LP-SmartSide-LP-SmartSide-Cedar-Texture-Panel-OC-Engineered-Treated-Wood-Siding-4-in-Application-as-7-16-in-x-4-ft-x-8-ft-25831/100089302', note: 'an older copy of the page showed $41.98' },
  ],
  trim1x4x8: [
    { store: 'Home Depot', name: 'PrimeLinx 1x4x8 radiata pine finger-joint primed', model: 'model 252978, internet 304819679', price: 10.58, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-4-in-x-8-ft-Radiata-Pine-Finger-Joint-Primed-Board-252978/304819679' },
    { store: "Lowe's", name: 'RELIABILT 1x4x8 primed S4S', model: 'see page', price: 9.98, url: 'https://www.lowes.com/pd/Common-1-in-x-4-in-x-8-ft-Actual-0-7187-in-x-3-5-in-x-8-ft-Primed-Pine-Board/1000842744' },
  ],
  trim1x4x12: [
    { store: 'Home Depot', name: 'PrimeLinx 1x4x12 radiata pine finger-joint primed', model: 'model 253128, internet 304798035', price: 15.25, url: 'https://www.homedepot.com/p/PrimeLinx-1-in-x-4-in-x-12-ft-Radiata-Pine-Finger-Joint-Primed-Board-253128/304798035' },
    { store: "Lowe's", name: 'RELIABILT 1x4x12 primed S4S', model: 'item 356473, model L51844412', price: 15.41, url: 'https://www.lowes.com/pd/1-in-x-4-in-x-12-ft-Square-Primed-Pine-Board/5002021501', note: '$13.10 each for 20 or more' },
  ],
  trim1x4x16: [
    { store: 'Home Depot', name: '1x4x16 primed pine finger-joint', model: 'model 702636, internet 307424572', price: 21.34, url: 'https://www.homedepot.com/p/1-in-x-4-in-x-16-ft-Primed-Pine-Finger-Joint-Board-702636/307424572' },
    { store: "Lowe's", name: 'RELIABILT 1x4x16 primed finger-joint', model: 'item 131203, model L51844416', price: 20.98, url: 'https://www.lowes.com/pd/ReliaBilt-1-in-x-4-in-x-16-ft-Square-Primed-Pine-Board/5002010659', note: 'category pages showed $19.98-$21.98' },
  ],
  // Lumber, keyed by material and length in feet. Lowe's lumber pages mostly show
  // "Find My Store" instead of a price, so few Lowe's boards appear here.
  'lumber:2x4:8': [
  ],
  'lumber:2x4:12': [
  ],
  'lumber:2x6:8': [
    { store: "Lowe's", name: '2 x 6 x 8 #2 and better SPF, kiln-dried', model: 'product 1000057075', price: 7.15, url: 'https://www.lowes.com/pd/2-in-x-6-in-x-8-ft-Whitewood-S4S-Kiln-dried-Lumber/1000057075' },
  ],
  'lumber:2x6:14': [
  ],
  'lumber:2x10:12': [
  ],
  'lumber:PT 4x4:12': [
  ],
  'lumber:PT 2x6:8': [
  ],
  'lumber:PT 2x6:12': [
  ],
  roofSheet: [
  ],
  floorSheet: [
    { store: "Lowe's", name: '23/32 x 4 x 8 tongue-and-groove Douglas fir plywood', model: 'product 50204087', price: 43.48, url: 'https://www.lowes.com/pd/23-32-CAT-PS1-09-Tongue-and-Groove-Douglas-Fir-Application-as-4-x-8/50204087', note: 'possibly an old copy of the page' },
  ],
  shingleBundle: [
    { store: "Lowe's", name: 'Owens Corning TruDefinition Duration, Onyx Black, 32.8 sq ft', model: 'product 3428124', price: 44.48, url: 'https://www.lowes.com/pd/Owens-Corning-TruDefinition-Duration-32-8-Sq-Ft-Onyx-Black-Laminated-Architectural-Roof-Shingles/3428124', note: 'an old copy of the page' },
  ],
  underlayment: [
  ],
  dripEdge: [
    { store: "Lowe's", name: 'Amerimax 2 in. x 10 ft galvanized drip edge', model: 'product 5014645301', price: 6.98, url: 'https://www.lowes.com/pd/Amerimax-Drip-Edge-2-in-x-10-ft-Galvanized-Mill-Finish-Galvanized-Steel-Drip-Edge/5014645301', note: 'an old copy of the page' },
  ],
  pitchConnector: [
  ],
  stain: [
    { store: "Lowe's", name: 'Valspar solid exterior stain and sealer, tintable, 1 gal', model: 'VL1028091-16, product 1000515853', price: 48.98, url: 'https://www.lowes.com/pd/Valspar-Tintable-Neutral-Base-Solid-Exterior-Stain-and-Sealer-Actual-Net-Contents-116-fl-oz/1000515853' },
  ],
  zFlashing: [
    { store: 'Home Depot', name: 'Amerimax 2.5 in. x 10 ft galvanized Z-bar flashing', model: '5651100120, Internet 100083261', price: 4.67, url: 'https://www.homedepot.com/p/Amerimax-Home-Products-2-5-in-x-10-ft-Galvanized-Steel-Z-Bar-Flashing-5651100120/100083261', note: 'read 2026-10-30 from a search result; the same model number the list prices from DK Hardware as 5/8 in. x 10 ft, so check the fit before buying' },
  ],
};

// The independent Lowe's list replaces any older Lowe's entry for the same item.
for (const l of LOWES) {
  const { key, ...offer } = l;
  OFFERS[key] = [...(OFFERS[key] || []).filter((o) => o.store !== "Lowe's"), { store: "Lowe's", ...offer }];
}

/**
 * Swaps that change the design, not just the store. Each names the design
 * change, why, and what it gives up; the page prices both and offers a button
 * that applies it so the 3D view shows the result.
 * @type {{ id: string, when: (d: any) => boolean, change: Record<string, any>, title: string, why: string, cost: string }[]}
 */
export const SWAPS = [
  { id: 'lp38', when: (d) => d.siding && d.sidingType === 'T1-11', change: { sidingType: 'LP SmartSide' }, title: 'T1-11 plywood to LP SmartSide 38 Series (3/8", primed)', why: 'Comes primed, so one coat of paint covers it; treated against rot and termites.', cost: 'Thinner than T1-11, and LP rates the 3/8" panel for studs at 16" on centre only.' },
  { id: 'lp76', when: (d) => d.siding && (d.sidingType === 'T1-11' || d.sidingType === 'LP SmartSide'), change: { sidingType: 'LP SmartSide 7/16' }, title: 'To LP SmartSide 76 Series (7/16", primed)', why: 'Stiffer primed panel, rated for studs at up to 24" on centre.', cost: 'About $20 more a sheet at the listed prices.' },
  { id: 't111', when: (d) => d.siding && d.sidingType.startsWith('LP SmartSide'), change: { sidingType: 'T1-11' }, title: 'Primed LP panels back to T1-11 plywood', why: 'Thicker plywood that holds screws well.', cost: 'Comes bare: prime or stain it.' },
  { id: 'nopaint', when: (d) => d.siding && d.sidingType !== 'vinyl' && d.sidingColor !== 'unfinished', change: { sidingColor: 'unfinished' }, title: 'Leave the siding unfinished for now', why: 'No paint or stain to buy or brush on before you use the shed.', cost: 'Bare siding weathers; LP asks for a topcoat on its primed panels within 180 days.' },
  { id: 'lapfc', when: (d) => d.siding && ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16'].includes(d.sidingType), change: { sidingType: 'fiber cement' }, title: 'Panels to horizontal fiber cement lap (HardiePlank-type, 7" exposure)', why: 'Horizontal courses like a lap-sided house; fiber cement does not rot and comes primed for paint.', cost: 'Lap siding braces nothing, so it goes over OSB sheathing and house wrap: it costs more than panels, by the difference shown.' },
  { id: 'laplp', when: (d) => d.siding && ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'fiber cement'].includes(d.sidingType), change: { sidingType: 'LP SmartSide lap' }, title: 'To horizontal engineered wood lap (LP SmartSide-type, 6-13/16" exposure)', why: 'Lighter than fiber cement and cut with ordinary wood blades; sold in 12 and 16 ft lengths.', cost: 'Also over OSB and house wrap; LP asks for paint within 180 days of putting it up.' },
  { id: 'lapfc2', when: (d) => d.siding && d.sidingType === 'LP SmartSide lap', change: { sidingType: 'fiber cement' }, title: 'Engineered wood lap to fiber cement lap', why: 'Fiber cement does not rot or feed termites, and holds paint longer.', cost: 'Heavier, dusty to cut (cut it outdoors with a fiber cement blade or shears), and sold only in 12 ft planks.' },
  { id: 'lapt111', when: (d) => d.siding && (d.sidingType === 'fiber cement' || d.sidingType === 'LP SmartSide lap'), change: { sidingType: 'T1-11' }, title: 'Lap siding back to T1-11 panels', why: 'Panels are their own sheathing and bracing, so no OSB or house wrap.', cost: 'Vertical grooves instead of horizontal courses, and bare plywood to prime or stain.' },
  { id: 'notrim', when: (d) => d.siding && d.wallTrim !== 'none' && d.sidingType !== 'fiber cement' && d.sidingType !== 'LP SmartSide lap', change: { wallTrim: 'none' }, title: 'Drop the 1x4 corner boards and casings', why: 'Saves the trim boards and an afternoon.', cost: 'Panel edges at the corners and round the openings are left bare; caulk and paint them well.' },
  { id: 'trim54', when: (d) => d.siding && d.wallTrim === '1x4' && (d.sidingType === 'fiber cement' || d.sidingType === 'LP SmartSide lap'), change: { wallTrim: '5/4' }, title: '1x4 pine trim to 5/4 trim (HardieTrim or LP 540)', why: 'Thicker trim stands proud of the lap butts, the detail both makers draw, and it is the same rot-resistant material as the siding.', cost: 'Dearer per foot than primed pine, and LP 540 comes only in 16 ft lengths.' },
  { id: 'compactor', when: (d) => d.compaction === 'hand tamper' && d.length * d.width > 144 * 144, change: { compaction: 'plate compactor' }, title: 'Rent a plate compactor instead of hand tamping', why: 'A big pad goes much faster and packs harder.', cost: 'A day\'s rental costs more than a tamper.' },
  { id: 'birdsmouth', when: (d) => d.rafterSeat === 'connector', change: { rafterSeat: 'birdsmouth' }, title: 'Variable-pitch connectors to birdsmouth notches and hurricane ties', why: 'A notched rafter sits on the plate and a Simpson H2.5A tie (under a dollar) holds it down, in place of a VPA connector (about $6.39) at each rafter end.', cost: 'A birdsmouth to lay out and cut in every rafter, two cuts each.' },
  { id: 'connector', when: (d) => d.rafterSeat === 'birdsmouth', change: { rafterSeat: 'connector' }, title: 'Birdsmouth notches to variable-pitch connectors', why: 'No notch to lay out or cut in every rafter: a square-ended rafter sits on a Simpson VPA.', cost: 'A connector per rafter end.' },
];

/**
 * Store-by-store prices for the shopping lines we have offers for.
 * @param {import('./estimate.mjs').Estimate} est
 */
export function storeComparison(est) {
  const rows = [];
  for (const r of est.shopping) {
    const key = r.source?.key;
    const listed = key && OFFERS[key];
    if (!listed) continue;
    // The listing the line was priced from is that store's offer (keeping the
    // catalogue's model number where it has one), so the table never shows a
    // store at a price other than the one the line uses.
    const s = r.source;
    const own = s?.url && s.kind === 'listed' ? s.store : null;
    const same = own && listed.find((o) => o.store === own);
    const offers = [
      ...(own ? [{ store: own, name: same?.name ?? r.name, model: same?.model ?? 'see the listing', price: r.price, url: s.url, note: s.note }] : []),
      ...listed.filter((o) => o.store !== own),
    ];
    if (offers.length < 2) continue;
    const at = offers.map((o) => ({ ...o, price: offerPrice(o, r.qty) }));
    const best = at.reduce((a, b) => (b.price < a.price ? b : a));
    rows.push({ line: r, offers: at, best, saving: Math.max(0, Math.round((r.price - best.price) * r.qty * 100) / 100) });
  }
  const stores = [...new Set(rows.flatMap((row) => row.offers.map((o) => o.store)))].sort((a, b) => (a === 'Home Depot' ? -1 : b === 'Home Depot' ? 1 : a.localeCompare(b)));
  // Stores are ranked like for like: only on the lines both chains list. A store
  // with fewer listings would otherwise look cheaper for what it leaves out.
  const both = rows.filter((row) => MAIN_STORES.every((st) => row.offers.some((o) => o.store === st)));
  const at = (row, st) => /** @type {any} */ (row.offers.find((o) => o.store === st)).price * row.line.qty;
  /** What the compared lines cost at each store: the lines both list, and how many it has no listing for. */
  const totals = Object.fromEntries(stores.map((s) => [s, {
    total: MAIN_STORES.includes(s) ? Math.round(both.reduce((t, row) => t + at(row, s), 0) * 100) / 100 : null,
    missing: rows.filter((row) => !row.offers.some((o) => o.store === s)).length,
  }]));
  const bestOf = (row) => row.offers.filter((o) => MAIN_STORES.includes(o.store)).reduce((a, b) => (b.price < a.price ? b : a));
  const cheapestMix = Math.round(both.reduce((t, row) => t + bestOf(row).price * row.line.qty, 0) * 100) / 100;
  /** @type {Record<string, { lines: string[], total: number }>} */
  const split = {};
  for (const row of both) {
    const st = bestOf(row).store;
    split[st] = split[st] || { lines: [], total: 0 };
    split[st].lines.push(`${row.line.qty} x ${row.line.name}`);
    split[st].total = Math.round((split[st].total + bestOf(row).price * row.line.qty) * 100) / 100;
  }
  const ranked = both.length ? [...MAIN_STORES].sort((a, b) => totals[a].total - totals[b].total) : [];
  const oneStop = ranked.length ? { store: ranked[0], total: totals[ranked[0]].total, by: Math.round((totals[ranked[1]].total - totals[ranked[0]].total) * 100) / 100, other: ranked[1] } : null;
  // One extra stop: what buying only the other store's cheaper lines there saves.
  const addOns = oneStop ? ranked.slice(1).map((st) => {
    let saving = 0;
    const lines = [];
    for (const row of both) {
      const d = at(row, oneStop.store) - at(row, st);
      if (d > 0) { saving += d; lines.push(row.line.name); }
    }
    return { store: st, saving: Math.round(saving * 100) / 100, lines };
  }).filter((a) => a.saving > 0) : [];
  // How many of the compared prices come from copies over a year old, per store.
  const stale = Object.fromEntries(MAIN_STORES.map((st) => [st, both.filter((row) => copyAgeDays(/** @type {any} */ (row.offers.find((o) => o.store === st))) > 365).length]));
  return { rows, stores, both: both.length, stale, totals, cheapestMix, split, oneStop, addOns, splitSaving: oneStop ? Math.round((oneStop.total - cheapestMix) * 100) / 100 : null, seen: SEEN };
}

/**
 * The whole shopping list priced at each store on its own: every line at that
 * store's listing where we have one, and how many lines that covers. Lines a
 * store has no readable listing for are carried at the list's own price and
 * counted, so two stores are compared on the lines both price.
 * @param {import('./estimate.mjs').Estimate} est
 */
export function storeTotals(est, stores = MAIN_STORES) {
  const priceAt = (r, st) => {
    const key = r.source?.key;
    const offer = key && OFFERS[key]?.find((o) => o.store === st);
    if (offer) return offerPrice(offer, r.qty);
    if ((r.source?.kind === 'listed' || r.source?.kind === 'derived') && r.source.store === st) return r.source.price ?? r.price;
    return null;
  };
  const out = stores.map((st) => {
    let priced = 0; let carried = 0; let n = 0;
    for (const r of est.shopping) {
      const p = priceAt(r, st);
      if (p === null) carried += r.total; else { priced += p * r.qty; n += 1; }
    }
    const missing = est.shopping.filter((r) => priceAt(r, st) === null).map((r) => r.name);
    return { store: st, lines: n, of: est.shopping.length, missing, priced: Math.round(priced * 100) / 100, carried: Math.round(carried * 100) / 100, total: Math.round((priced + carried) * 100) / 100 };
  });
  // Like for like: only the lines every store prices.
  const shared = est.shopping.filter((r) => stores.every((st) => priceAt(r, st) !== null));
  const sharedTotals = Object.fromEntries(stores.map((st) => [st, Math.round(shared.reduce((t, r) => t + /** @type {number} */ (priceAt(r, st)) * r.qty, 0) * 100) / 100]));
  return { stores: out, shared: shared.length, sharedTotals, priceAt };
}

const STORE_NAMES = { homedepot: 'Home Depot', lowes: "Lowe's" };

/**
 * Prices as one store charges them: its board and item prices where it lists
 * them, the starting list's elsewhere. Estimating with these re-runs the cut
 * optimizer on that store's prices, so the order buys the lengths that store
 * sells cheapest.
 * @param {string} storeKey @param {import('./estimate.mjs').Prices} base
 */
export function pricesFor(storeKey, base) {
  const st = /** @type {any} */ (STORE_NAMES)[storeKey] || storeKey;
  const p = { lumber: Object.fromEntries(Object.entries(base.lumber).map(([m, v]) => [m, { ...v }])), items: { ...base.items }, delivery: { ...(base.delivery || {}) } };
  if (st === 'Home Depot') return p;
  for (const [key, offers] of Object.entries(OFFERS)) {
    const o = offers.find((x) => x.store === st);
    if (!o) continue;
    const lm = /^lumber:(.+):(\d+)$/.exec(key);
    if (lm) { p.lumber[lm[1]] = p.lumber[lm[1]] || {}; p.lumber[lm[1]][lm[2]] = o.price; } else if (!key.startsWith('product:')) p.items[key] = o.price;
  }
  return p;
}

/**
 * The shopping list as one store would sell it: each line at that store's own
 * listing (its price, bulk price and item number), and the few it has no listing
 * for marked to come from the other store at their list price. This is the list
 * to take to one store's Pro desk for a whole-order price.
 * @param {import('./estimate.mjs').Estimate} est @param {string} storeKey
 */
export function storeList(est, storeKey) {
  const st = /** @type {any} */ (STORE_NAMES)[storeKey] || storeKey;
  const { priceAt } = storeTotals(est, [st]);
  const lines = est.shopping.map((r) => {
    const p = priceAt(r, st);
    if (p === null) return { ...r, store: r.source?.store || 'elsewhere', elsewhere: true };
    const offer = r.source?.key && OFFERS[r.source.key]?.find((o) => o.store === st);
    const source = offer ? { price: offer.price, url: offer.url, store: st, seen: SEEN, note: [offer.name, offer.model, offer.note].filter(Boolean).join('; '), kind: 'listed', key: r.source.key, model: offer.model } : r.source;
    return { ...r, price: p, total: Math.round(p * r.qty * 100) / 100, source, store: st, elsewhere: false };
  });
  const here = lines.filter((l) => !l.elsewhere);
  const sum = (ls) => Math.round(ls.reduce((t, l) => t + l.total, 0) * 100) / 100;
  return { store: st, lines, here: here.length, total: sum(lines), hereTotal: sum(here), elsewhereTotal: sum(lines.filter((l) => l.elsewhere)), share: Math.round((sum(here) / Math.max(1, sum(lines))) * 100) };
}

/** Swaps that apply to this design. @param {any} design */
export const swapsFor = (design) => SWAPS.filter((s) => s.when(design));
