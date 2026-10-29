// @ts-check
// The same part at other stores, and cheaper parts that do the same job.
// Every offer is a product page with its model or item number and the price
// read from a search-result copy of that page on 2026-10-29 (the store pages
// themselves refuse automated reads, and we do not scrape them or copy their
// photos: follow the link to see the product). Prices move; the link is the
// check.

import { LOWES } from './lowes.mjs';

/** @typedef {{ store: string, name: string, model: string, price: number, url: string, note?: string, bulk?: { min: number, price: number } }} Offer */

/** An offer's price for a quantity: the bulk price once the quantity reaches it. @param {Offer} o @param {number} qty */
export const offerPrice = (o, qty) => (o.bulk && qty >= o.bulk.min ? o.bulk.price : o.price);

const SEEN = '2026-10-29';

/** Offers for each shopping-list item key (keys as in lumber.mjs EXAMPLE_ITEMS). @type {Record<string, Offer[]>} */
export const OFFERS = {
  siding8: [
    { store: 'Home Depot', name: 'Plytanium T1-11 8 in. OC, 19/32 x 4 x 8 (not primed)', model: 'model 113699, internet 100000016', price: 43.98, url: 'https://www.homedepot.com/p/Plytanium-Plywood-Siding-Panel-T1-11-8-IN-OC-Nominal-19-32-in-x-4-ft-x-8-ft-Actual-0-563-in-x-48-in-x-96-in-113699/100000016' },
    { store: "Lowe's", name: 'Plytanium SYP T1-11 8 in. groove, 0.594 x 48 x 96 (not primed)', model: 'see category page', price: 44.78, url: 'https://www.lowes.com/pl/siding-stone-veneer/wood-siding-accessories/plytanium/t1-11/2365411302-4294851170-328841971', note: 'category page; copies showed up to $47.48' },
  ],
  lpPanel: [
    { store: 'Home Depot', name: 'LP SmartSide 38 Series Cedar Texture 8 in. OC panel, 3/8 x 4 x 8', model: 'model 27874, internet 100055901', price: 45.98, url: 'https://www.homedepot.com/p/LP-SmartSide-LP-SmartSide-Cedar-Texture-8-in-OC-Panel-Engineered-Treated-Wood-Siding-8-in-Application-as-3-8-in-x-4-ft-x-8-ft-27874/100055901', note: 'copies showed $42.78-$53.58' },
    { store: "Lowe's", name: 'LP SmartSide 38 Series primed panel, 3/8 x 48 x 96', model: 'item 55897, model 27874', price: 45.98, url: 'https://www.lowes.com/pd/SmartSide-38-Series-Primed-Engineered-Treated-Wood-Siding-Panel-Common-0-375-in-x-48-in-x-96-in-Actual-0-315-in-x-48-563-in-x-95-875-in/3058153', note: 'copies showed $42.78-$53.98' },
    { store: 'Menards', name: 'LP SmartSide 3/8 x 4 x 8 grooved 8 in. OC, factory primed', model: 'model 27874 (page slug)', price: 54.98, url: 'https://www.menards.com/main/building-materials/siding/engineered-wood-siding/lp-reg-smartside-reg-3-8-grooved-8-oc-strand-panel-siding/27874/p-1444438201579.htm', note: 'model and SKU pairing not confirmed' },
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
    { store: 'Menards', name: '2 x 4 x 8 construction/framing lumber, stud or better', model: 'SKU 1021101', price: 4.25, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-4-construction-framing-lumber/1021101/p-1444451086852-c-13125.htm', note: 'before the 11% rebate' },
  ],
  'lumber:2x4:12': [
    { store: 'Menards', name: '2 x 4 x 12 construction/framing lumber, #2 and better SPF', model: 'SKU 1021127', price: 9.12, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-4-construction-framing-lumber/1021127/p-1444422744154-c-13125.htm', note: 'copies also showed $5.97 and $6.79' },
  ],
  'lumber:2x6:8': [
    { store: "Lowe's", name: '2 x 6 x 8 #2 and better SPF, kiln-dried', model: 'product 1000057075', price: 7.15, url: 'https://www.lowes.com/pd/2-in-x-6-in-x-8-ft-Whitewood-S4S-Kiln-dried-Lumber/1000057075' },
    { store: 'Menards', name: '2 x 6 x 8 construction/framing lumber', model: 'SKU 1021758', price: 9.52, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021758/p-1444422369989.htm' },
  ],
  'lumber:2x6:14': [
    { store: 'Menards', name: '2 x 6 x 14 construction/framing lumber', model: 'SKU 1021787', price: 16.89, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-6-construction-framing-lumber/1021787/p-1444422485941-c-13125.htm' },
  ],
  'lumber:2x10:12': [
    { store: 'Menards', name: '2 x 10 x 12 #2 and better construction/framing lumber', model: 'SKU 1022032', price: 25.99, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/2-x-10-2-better-construction-framing-lumber/1022032/p-1444422415848-c-13125.htm' },
  ],
  'lumber:PT 4x4:12': [
    { store: 'Menards', name: 'AC2 4 x 4 x 12 #2 pressure-treated timber (UC4B)', model: 'SKU 1112265', price: 25.72, url: 'https://www.menards.com/main/building-materials/lumber-boards/timbers-logs/ac2-reg-4-x-4-2-critical-structural-green-pressure-treated-timber/1112265/p-1444422764205-c-13131.htm', note: 'another Menards page showed $21.28' },
  ],
  'lumber:PT 2x6:8': [
    { store: 'Menards', name: 'AC2 2 x 6 x 8 #2 prime ground-contact treated', model: 'SKU 1111024', price: 12.52, url: 'https://www.menards.com/main/building-materials/lumber-boards/dimensional-lumber/ac2-reg-2-x-6-ground-contact-green-pressure-treated-lumber/1111024/p-1444422259079-c-13125.htm', note: 'an old copy of the page' },
  ],
  'lumber:PT 2x6:12': [
    { store: 'Menards', name: 'AC2 2 x 6 x 12 #2 prime ground-contact treated', model: 'SKU 1111040', price: 19.48, url: 'https://www.menards.com/main/building-materials/lumber-boards/treated-wood-products/treated-boards-decking-lumber-timbers/ac2-reg-2-x-6-ground-contact-green-pressure-treated-lumber/1111040/p-1444422441223.htm' },
  ],
  roofSheet: [
    { store: 'Menards', name: '7/16 x 4 x 8 OSB', model: 'SKU 1242728', price: 13.48, url: 'https://www.menards.com/main/building-materials/panel-products/osb-sheathing/7-16-x-4-x-8-osb/1242728-2/p-1444422471192-c-13330.htm' },
  ],
  floorSheet: [
    { store: "Lowe's", name: '23/32 x 4 x 8 tongue-and-groove Douglas fir plywood', model: 'product 50204087', price: 43.48, url: 'https://www.lowes.com/pd/23-32-CAT-PS1-09-Tongue-and-Groove-Douglas-Fir-Application-as-4-x-8/50204087', note: 'possibly an old copy of the page' },
  ],
  shingleBundle: [
    { store: "Lowe's", name: 'Owens Corning TruDefinition Duration, Onyx Black, 32.8 sq ft', model: 'product 3428124', price: 44.48, url: 'https://www.lowes.com/pd/Owens-Corning-TruDefinition-Duration-32-8-Sq-Ft-Onyx-Black-Laminated-Architectural-Roof-Shingles/3428124', note: 'an old copy of the page' },
  ],
  underlayment: [
    { store: 'Menards', name: 'Masterguard 48 in. x 250 ft synthetic underlayment (1,000 sq ft)', model: 'SKU 1511823', price: 74.99, url: 'https://www.menards.com/main/building-materials/roofing/roofing-underlayment/masterguard-48-x-250-synthetic-roofing-underlayment/1511823/p-4348828407018044-c-13250.htm' },
  ],
  dripEdge: [
    { store: "Lowe's", name: 'Amerimax 2 in. x 10 ft galvanized drip edge', model: 'product 5014645301', price: 6.98, url: 'https://www.lowes.com/pd/Amerimax-Drip-Edge-2-in-x-10-ft-Galvanized-Mill-Finish-Galvanized-Steel-Drip-Edge/5014645301', note: 'an old copy of the page' },
    { store: 'Menards', name: '10 ft galvanized roof edge, style D', model: 'SKU 1564095', price: 18.89, url: 'https://www.menards.com/main/building-materials/roofing/metal-roofing/10-roof-edge/galvanized1564095-05/p-1559197980721-c-5815.htm' },
  ],
  pitchConnector: [
    { store: 'Menards', name: 'MiTek TMPH2 rafter-to-plate connector (equivalent to Simpson VPA2)', model: 'TMPH2, SKU 2272302', price: 14.99, url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-ewp-hangers/mitek-reg-1-1-2-rafter-width-adjustable-rafter-to-plate-connector/tmph2/p-1444445535536-c-8832.htm', note: 'a MiTek part; Menards does not stock the Simpson VPA2' },
  ],
  rafterHanger: [
    { store: "Lowe's", name: 'Simpson Strong-Tie LUS26 2x6 hanger', model: 'LUS26, product 1187273', price: 1.58, url: 'https://www.lowes.com/pd/Simpson-Strong-Tie-LUS26-2-x-6-Double-Shear-Hanger/1187273' },
    { store: 'Menards', name: 'MiTek JUS26-TZ 2x6 hanger (equivalent to LUS26)', model: 'JUS26-TZ, SKU 2271741', price: 1.98, url: 'https://www.menards.com/main/hardware/fasteners-connectors/construction-hardware/structural-hangers/mitek-reg-2-x-6-8-18-gauge-triple-zinc-slant-nail-joist-hanger/jus26-tz/p-1444445489695-c-8843.htm' },
  ],
  stain: [
    { store: "Lowe's", name: 'Valspar solid exterior stain and sealer, tintable, 1 gal', model: 'VL1028091-16, product 1000515853', price: 48.98, url: 'https://www.lowes.com/pd/Valspar-Tintable-Neutral-Base-Solid-Exterior-Stain-and-Sealer-Actual-Net-Contents-116-fl-oz/1000515853' },
    { store: 'Menards', name: 'Dutch Boy solid exterior stain and sealer, 1 gal', model: '5531629935-1DBSLD1G', price: 41.98, url: 'https://www.menards.com/main/paint/exterior-paint-stain/exterior-wood-stains/solid-color-stain/dutch-boy-reg-solid-exterior-stain-sealer/5531629935-1dbsld1g/p-1642874260939791-c-7957.htm' },
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
  { id: 'notrim', when: (d) => d.siding && d.wallTrim !== 'none', change: { wallTrim: 'none' }, title: 'Drop the 1x4 corner boards and casings', why: 'Saves the trim boards and an afternoon.', cost: 'Panel edges at the corners and round the openings are left bare; caulk and paint them well.' },
  { id: 'compactor', when: (d) => d.compaction === 'hand tamper' && d.length * d.width > 144 * 144, change: { compaction: 'plate compactor' }, title: 'Rent a plate compactor instead of hand tamping', why: 'A big pad goes much faster and packs harder.', cost: 'A day\'s rental costs more than a tamper.' },
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
    // The listing the line was priced from counts as that store's offer.
    const own = r.source?.url && r.source.kind === 'listed' && !listed.some((o) => o.store === r.source.store)
      ? [{ store: r.source.store, name: r.name, model: 'see the listing', price: r.source.price ?? r.price, url: r.source.url, note: r.source.note }]
      : [];
    const offers = [...own, ...listed];
    if (offers.length < 2) continue;
    const at = offers.map((o) => ({ ...o, price: offerPrice(o, r.qty) }));
    const best = at.reduce((a, b) => (b.price < a.price ? b : a));
    rows.push({ line: r, offers: at, best, saving: Math.max(0, Math.round((r.price - best.price) * r.qty * 100) / 100) });
  }
  const stores = [...new Set(rows.flatMap((row) => row.offers.map((o) => o.store)))].sort((a, b) => (a === 'Home Depot' ? -1 : b === 'Home Depot' ? 1 : a.localeCompare(b)));
  /** What the compared lines cost if bought all at one store (null where that store has no offer). */
  const totals = Object.fromEntries(stores.map((s) => {
    let t = 0;
    let missing = 0;
    let carried = 0;
    for (const row of rows) {
      const o = row.offers.find((x) => x.store === s);
      if (o) t += o.price * row.line.qty; else { missing += 1; carried += row.line.price * row.line.qty; }
    }
    return [s, { total: Math.round(t * 100) / 100, missing, withCarry: Math.round((t + carried) * 100) / 100 }];
  }));
  const cheapestMix = Math.round(rows.reduce((t, row) => t + row.best.price * row.line.qty, 0) * 100) / 100;
  // Where to buy what: each compared line at its cheapest store, and the saving
  // against the cheapest single store that lists every compared line.
  /** @type {Record<string, { lines: string[], total: number }>} */
  const split = {};
  for (const row of rows) {
    const st = row.best.store;
    split[st] = split[st] || { lines: [], total: 0 };
    split[st].lines.push(`${row.line.qty} x ${row.line.name}`);
    split[st].total = Math.round((split[st].total + row.best.price * row.line.qty) * 100) / 100;
  }
  // One stop: the store whose prices make these lines cheapest, a line it has no
  // listing for carried at the list's own price.
  const ranked = [...stores].sort((a, b) => totals[a].withCarry - totals[b].withCarry);
  const oneStop = ranked.length ? { store: ranked[0], total: totals[ranked[0]].withCarry } : null;
  // One extra stop: for each other store, what buying only its cheaper lines there saves.
  const addOns = oneStop ? stores.filter((st) => st !== oneStop.store).map((st) => {
    let saving = 0;
    const lines = [];
    for (const row of rows) {
      const hereOffer = row.offers.find((o) => o.store === oneStop.store);
      const here = hereOffer ? hereOffer.price : row.line.price;
      const there = row.offers.find((o) => o.store === st);
      if (there && there.price < here) {
        saving += (here - there.price) * row.line.qty;
        lines.push(row.line.name);
      }
    }
    return { store: st, saving: Math.round(saving * 100) / 100, lines };
  }).filter((a) => a.saving > 0).sort((a, b) => b.saving - a.saving) : [];
  return { rows, stores, totals, cheapestMix, split, oneStop, addOns, splitSaving: oneStop ? Math.round((oneStop.total - cheapestMix) * 100) / 100 : null, seen: SEEN };
}

/**
 * The whole shopping list priced at each store on its own: every line at that
 * store's listing where we have one, and how many lines that covers. Lines a
 * store has no readable listing for are carried at the list's own price and
 * counted, so two stores are compared on the lines both price.
 * @param {import('./estimate.mjs').Estimate} est
 */
export function storeTotals(est, stores = ['Home Depot', "Lowe's", 'Menards']) {
  const priceAt = (r, st) => {
    const key = r.source?.key;
    const offer = key && OFFERS[key]?.find((o) => o.store === st);
    if (offer) return offerPrice(offer, r.qty);
    if (r.source?.kind === 'listed' && r.source.store === st) return r.source.price ?? r.price;
    return null;
  };
  const out = stores.map((st) => {
    let priced = 0; let carried = 0; let n = 0;
    for (const r of est.shopping) {
      const p = priceAt(r, st);
      if (p === null) carried += r.total; else { priced += p * r.qty; n += 1; }
    }
    return { store: st, lines: n, of: est.shopping.length, priced: Math.round(priced * 100) / 100, carried: Math.round(carried * 100) / 100, total: Math.round((priced + carried) * 100) / 100 };
  });
  // Like for like: only the lines every store prices.
  const shared = est.shopping.filter((r) => stores.every((st) => priceAt(r, st) !== null));
  const sharedTotals = Object.fromEntries(stores.map((st) => [st, Math.round(shared.reduce((t, r) => t + /** @type {number} */ (priceAt(r, st)) * r.qty, 0) * 100) / 100]));
  return { stores: out, shared: shared.length, sharedTotals, priceAt };
}

/** Swaps that apply to this design. @param {any} design */
export const swapsFor = (design) => SWAPS.filter((s) => s.when(design));
