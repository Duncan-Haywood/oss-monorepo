// @ts-check
// The same part at other stores, and cheaper parts that do the same job.
// Every offer is a product page with its model or item number and the price
// read from a search-result copy of that page on 2026-10-29 (the store pages
// themselves refuse automated reads, and we do not scrape them or copy their
// photos: follow the link to see the product). Prices move; the link is the
// check.

/** @typedef {{ store: string, name: string, model: string, price: number, url: string, note?: string }} Offer */

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
};

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
  const stores = [...new Set(Object.values(OFFERS).flat().map((o) => o.store))];
  const rows = [];
  for (const r of est.shopping) {
    const key = r.source?.key;
    const offers = key && OFFERS[key];
    if (!offers) continue;
    const best = offers.reduce((a, b) => (b.price < a.price ? b : a));
    rows.push({ line: r, offers, best, saving: Math.max(0, Math.round((r.price - best.price) * r.qty * 100) / 100) });
  }
  /** What the compared lines cost if bought all at one store (null where that store has no offer). */
  const totals = Object.fromEntries(stores.map((s) => {
    let t = 0;
    let missing = 0;
    for (const row of rows) {
      const o = row.offers.find((x) => x.store === s);
      if (o) t += o.price * row.line.qty; else missing += 1;
    }
    return [s, { total: Math.round(t * 100) / 100, missing }];
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
  const complete = stores.filter((st) => totals[st].missing === 0).sort((a, b) => totals[a].total - totals[b].total);
  const oneStop = complete.length ? { store: complete[0], total: totals[complete[0]].total } : null;
  return { rows, stores, totals, cheapestMix, split, oneStop, splitSaving: oneStop ? Math.round((oneStop.total - cheapestMix) * 100) / 100 : null, seen: SEEN };
}

/** Swaps that apply to this design. @param {any} design */
export const swapsFor = (design) => SWAPS.filter((s) => s.when(design));
