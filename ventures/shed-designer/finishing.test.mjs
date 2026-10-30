// Wall trim, site-built doors, block foundations, fasteners, store offers,
// design swaps and the simplicity search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, BLOCKS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { itemPrice } from './prices.mjs';
import { EXAMPLE_ITEMS } from './lumber.mjs';
import { OFFERS, storeComparison, swapsFor, storeTotals, storeList, pricesFor } from './catalog.mjs';
import { simplify, cutMetrics, sidingSpan, budget, laborHours } from './simplify.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildSheets } from './drawings.mjs';
import { buildInstructions } from './instructions.mjs';
import { quoteRequest, itemRef } from './quote.mjs';
import { shoppingCsv, examplePrices } from './estimate.mjs';
const examplePricesWith = (extra) => ({ ...examplePrices(), ...extra });

test('1x4 trim: two boards a corner, and a casing round every opening', () => {
  const shed = buildShed(defaultDesign());
  const d = shed.design;
  const corners = shed.wallTrim.filter((t) => t.where.endsWith('corner'));
  assert.equal(corners.length, 8);
  const doors = d.openings.filter((o) => o.kind === 'door').length;
  const windows = d.openings.length - doors;
  assert.equal(shed.wallTrim.length - corners.length, doors * 3 + windows * 4);
  const est = estimate(shed);
  const cut = est.trimCuts.boards.flatMap((b) => b.cuts).sort((a, b) => a - b);
  assert.deepEqual(cut, shed.wallTrim.map((t) => t.length).sort((a, b) => a - b));
  for (const b of est.trimCuts.boards) assert.ok(b.cuts.reduce((t, c) => t + c, 0) <= b.stock);
  assert.ok(est.shopping.some((r) => r.section === 'Wall trim'));
  assert.equal(buildShed(normalize({ ...defaultDesign(), wallTrim: 'none' })).wallTrim.length, 0);
});

test('a site-built door too short or too narrow for its Z brace is warned about', () => {
  const brace = (width, height) => {
    const d = defaultDesign();
    d.openings = d.openings.map((o) => (o.kind === 'door' ? { ...o, product: 'site-built', width, height } : o));
    return buildShed(normalize(d)).warnings.filter((w) => w.includes('Z brace'));
  };
  assert.deepEqual(brace(38.5, 78), [], 'the starting door is fine');
  assert.deepEqual(brace(60, 78), [], 'a pair is fine');
  assert.match(brace(38.5, 12)[0], /runs at 1 deg .* taller or narrower/, 'a 12" leaf');
  assert.match(brace(20, 78)[0], /runs at 70 deg .* wider/, 'a 20" leaf');
});

test('a site-built door: Z frame on the cut sheet, hinges on the list, a plan sheet and steps', () => {
  const d = defaultDesign();
  d.openings = d.openings.map((o) => (o.kind === 'door' ? { ...o, product: 'site-built' } : o));
  const shed = buildShed(normalize(d));
  assert.equal(shed.doors.length, 1);
  const kinds = shed.doorParts.map((p) => p.kind);
  assert.equal(kinds.filter((k) => k === 'door stile').length, 2);
  assert.equal(kinds.filter((k) => k === 'door rail').length, 3);
  assert.equal(kinds.filter((k) => k === 'door brace').length, 2);
  const est = estimate(shed);
  const onSheet = est.lumber.flatMap((l) => l.result.boards.flatMap((b) => b.cuts.map((c) => c.id)));
  for (const p of shed.doorParts) assert.ok(onSheet.includes(p.id), p.id);
  assert.equal(est.shopping.find((r) => /tee hinge/.test(r.name)).qty, 3);
  assert.ok(!est.shopping.some((r) => r.section === 'Doors and windows' && /door/i.test(r.name)), 'no prehung door bought');
  assert.ok(buildSheets(shed).some((s) => s.id === 'door-o1'));
  assert.ok(buildInstructions(shed, est).some((s) => /Build door o1/.test(s.title)));
  // A wide opening becomes a pair.
  d.openings = d.openings.map((o) => (o.kind === 'door' ? { ...o, width: 60, product: 'site-built' } : o));
  assert.equal(buildShed(normalize(d)).doors[0].leaves, 2);
});

test('deck blocks, CMU and solid blocks: skids sit on them, nothing floats, blocks are bought', () => {
  for (const [key, b] of Object.entries(BLOCKS)) {
    const shed = buildShed(normalize({ ...defaultDesign(), foundation: key }));
    assert.equal(shed.dims.block.h, b.h);
    const skids = shed.members.filter((m) => m.kind === 'skid');
    for (const s of skids) assert.ok(Math.abs(s.geom.origin[2] - b.h) < 1e-9);
    assert.ok(connectionChecks(shed).ok, key);
    assert.deepEqual(integrity(shed).floating, [], key);
    const est = estimate(shed);
    assert.equal(est.shopping.find((r) => r.name === EXAMPLE_ITEMS[b.item].name).qty, shed.dims.blockCount);
  }
});

test('site prep: fabric, compaction (tamper or a rented compactor) and gravel', () => {
  const tamp = estimate(buildShed(normalize({ ...defaultDesign(), foundation: 'gravel', pad: 'full' }))).shopping.filter((r) => r.section === 'Site prep').map((r) => r.name).join('|');
  assert.match(tamp, /fabric/i);
  assert.match(tamp, /tamper/i);
  assert.match(tamp, /stone/i);
  const rent = estimate(buildShed(normalize({ ...defaultDesign(), compaction: 'plate compactor' }))).shopping.filter((r) => r.section === 'Site prep');
  assert.ok(rent.some((r) => /compactor rental/i.test(r.name)));
});

test('hardware: nails, connector nails, caulk, Z-flashing, starter and ridge cap are bought', () => {
  const est = estimate(buildShed(defaultDesign()));
  const names = est.shopping.map((r) => r.name).join('|');
  for (const re of [/16d/, /8d .*sheathing/, /siding nails/, /roofing nails/, /finish nails/, /connector nails/, /caulk/i, /Z-flashing/, /starter strip/i, /ridge cap/i]) assert.match(names, re);
  for (const r of est.shopping) assert.ok(r.qty > 0 && Number.isFinite(r.total), r.name);
});

test('every listed price has a link, and every item used has a price', () => {
  const est = estimate(buildShed(normalize({ ...defaultDesign(), foundation: 'deck blocks' })));
  for (const r of est.shopping) {
    assert.ok(r.price > 0, `${r.name} has a price`);
    if (r.source?.kind === 'listed') assert.match(r.source.url || '', /^https:\/\//, `${r.name} links its listing`);
  }
  for (const k of ['framingNails', 'caulk', 'deckBlock', 'trim1x4x12', 'lpPanel76', 'zFlashing', 'plateCompactor']) assert.equal(itemPrice(k).kind, 'listed', k);
});

test('store offers: every one has a store, a price, a model and a link; comparison sums', () => {
  for (const [k, list] of Object.entries(OFFERS)) {
    assert.ok(EXAMPLE_ITEMS[k] || /^lumber:[^:]+:\d+$/.test(k) || /^product:/.test(k), k);
    for (const o of list) {
      assert.ok(o.store && o.model && o.price > 0, `${k} ${o.store}`);
      assert.match(o.url, /^https:\/\//);
    }
  }
  const est = estimate(buildShed(defaultDesign()));
  const cmp = storeComparison(est);
  assert.ok(cmp.rows.length >= 2);
  const mix = cmp.rows.reduce((t, r) => t + r.best.price * r.line.qty, 0);
  assert.ok(Math.abs(mix - cmp.cheapestMix) < 0.01);
  const splitTotal = Object.values(cmp.split).reduce((t, g) => t + g.total, 0);
  assert.ok(Math.abs(splitTotal - cmp.cheapestMix) < 0.01);
  assert.ok(cmp.oneStop && cmp.splitSaving >= 0);
  for (const a of cmp.addOns) assert.ok(a.saving > 0 && a.saving <= cmp.splitSaving + 0.01 && a.store !== cmp.oneStop.store);
  // The line's own listing is one of the offers compared.
  assert.ok(cmp.rows.some((r) => r.line.section === 'Lumber' && r.offers.some((o) => o.store === 'Home Depot')));
});

test('primed LP siding in two thicknesses changes the panels bought and the siding depth', () => {
  for (const [type, re] of [['LP SmartSide', /38 Series.*3\/8/], ['LP SmartSide 7/16', /76 Series.*7\/16/]]) {
    const shed = buildShed(normalize({ ...defaultDesign(), sidingType: type }));
    assert.ok(estimate(shed).shopping.some((r) => r.section === 'Siding' && re.test(r.name)), type);
  }
  assert.equal(sidingSpan({ siding: true, sidingType: 'T1-11' }), 16);
  assert.equal(sidingSpan({ siding: true, sidingType: 'LP SmartSide 7/16' }), 24);
  const warn = buildShed(normalize({ ...defaultDesign(), studSpacing: 24 })).warnings.join(' ');
  assert.match(warn, /rated for studs at 16/);
});

test('swaps apply to the design and change what is built', () => {
  const d = defaultDesign();
  const swaps = swapsFor(d);
  assert.ok(swaps.some((s) => s.id === 'lp38'));
  const lp = buildShed(normalize({ ...d, ...swaps.find((s) => s.id === 'lp38').change }));
  assert.equal(lp.design.sidingType, 'LP SmartSide');
});

test('simplicity search: winners pass every check, keep the limits and are no worse on their goal', () => {
  const d = defaultDesign();
  const r = simplify(d);
  const base = r.base;
  assert.ok(r.evaluated > 10);
  const cheap = r.winners.cheapest;
  assert.ok(cheap.total <= base.total);
  assert.ok(cheap.ok);
  assert.ok(cheap.footprint <= d.maxFootprint);
  for (const w of Object.values(r.winners)) {
    assert.ok(w.design.overhang >= 4, 'keeps an overhang');
    assert.ok(w.design.roofCover !== 'shingles' || w.design.pitch >= 4, 'shingles at 4/12 or more');
    assert.ok(w.design.studSpacing <= sidingSpan(w.design));
    assert.equal(w.design.length * w.design.width, d.length * d.width, 'size kept unless asked');
  }
  // The front is non-dominated.
  for (const a of r.front) for (const b of r.front) {
    if (a === b) continue;
    const ang = (x) => x.cuts.angled + 2 * x.cuts.notches;
    assert.ok(!(b.total <= a.total && b.cuts.straight <= a.cuts.straight && ang(b) <= ang(a) && (b.total < a.total || b.cuts.straight < a.cuts.straight || ang(b) < ang(a))));
  }
  const c = cutMetrics(buildShed(d), estimate(buildShed(d)));
  assert.equal(c.notches, 0, 'connectors: no notches');
  assert.ok(c.angled > 0 && c.straight > 0);
});

test('quote emails name the store\'s own item and link where we have it; the CSV carries sources', () => {
  const shed = buildShed(defaultDesign());
  const est = estimate(shed);
  const body = quoteRequest(shed, est, 'lowes').body;
  assert.match(body, /\n      Lowe's: [^\n]+, https:\/\/www\.lowes\.com\//);
  const hd = quoteRequest(shed, est, 'homedepot').body;
  assert.match(hd, /\n      Home Depot[^\n]*: [^\n]*https:\/\/(www\.)?homedepot\.com\//);
  assert.equal(itemRef({ source: { key: 'trim1x4x16' } }, undefined), '');
  assert.match(quoteRequest(shed, est, 'menards').body, /Menards: SKU 1511823, https:\/\/www\.menards\.com\//);
  const csv = shoppingCsv(est).split('\n');
  assert.match(csv[0], /price source,listing$/);
  assert.ok(csv.some((l) => /https:\/\/www\.homedepot\.com\//.test(l)));
});

test('unfinished siding: no paint bought, a warning, and the swap offers it', () => {
  const d = normalize({ ...defaultDesign(), sidingColor: 'unfinished' });
  const shed = buildShed(d);
  assert.ok(!estimate(shed).shopping.some((r) => r.section === 'Paint'));
  assert.ok(shed.warnings.some((w) => /nfinished/.test(w)));
  assert.ok(swapsFor(defaultDesign()).some((s) => s.id === 'nopaint'));
  assert.ok(!swapsFor(d).some((s) => s.id === 'nopaint'));
});

test('budget search: same footprint, kept structure, off-the-shelf only, every step a real saving', () => {
  const d = defaultDesign();
  const r = budget(d);
  const b = r.best;
  assert.ok(b.total < r.base.total, 'finds something cheaper');
  assert.equal(b.design.length, d.length);
  assert.equal(b.design.width, d.width);
  assert.equal(b.design.roofType, d.roofType);
  assert.equal(b.design.rafterSeat, d.rafterSeat);
  assert.ok(b.ok, 'passes every check');
  assert.ok(b.peak <= r.peakCap + 0.01);
  for (const o of b.design.openings) if (o.product === 'site-built') assert.ok(d.openings.find((x) => x.id === o.id).product === 'site-built', 'never swaps a stock part for a site-built one');
  assert.ok(b.design.sidingType !== 'fiber cement', 'no siding whose trim pieces are unpriced');
  for (const st of b.steps) assert.ok(st.saving > 0, st.label);
  const sum = b.steps.reduce((t, st) => t + st.saving, 0);
  assert.ok(Math.abs(sum - (r.base.total + r.base.timeCost - b.total - b.timeCost)) < 0.05, 'the steps add up, materials and time');
  for (const st of b.steps) assert.ok(Math.abs(st.saving - (st.materials + st.hours * d.laborRate)) < 6, 'each step is materials plus hours at the rate');
  for (const t of r.taller) assert.ok(t.peak > r.peakCap);
});

test('gravel only under the blocks: no pad, no fabric, paver base by the bag', () => {
  const shed = buildShed(normalize({ ...defaultDesign(), foundation: 'blocks', pad: 'under blocks' }));
  assert.equal(shed.dims.gravelCuYd, 0);
  assert.ok(shed.dims.baseBags > 0);
  const names = estimate(shed).shopping.filter((r) => r.section === 'Site prep').map((r) => r.name).join('|');
  assert.match(names, /Paver base/);
  assert.doesNotMatch(names, /fabric|Crushed stone/i);
  assert.equal(shed.fixtures.filter((f) => f.kind === 'gravel').length, shed.dims.blockCount);
  // Without blocks the choice has no effect.
  assert.ok(buildShed(normalize({ ...defaultDesign(), foundation: 'gravel', pad: 'under blocks' })).dims.gravelCuYd > 0);
  // No gravel at all: blocks on the soil, nothing to buy for the pad.
  const bare = buildShed(normalize({ ...defaultDesign(), foundation: 'blocks', pad: 'none' }));
  assert.equal(bare.dims.gravelCuYd + bare.dims.baseBags, 0);
  assert.equal(bare.fixtures.filter((f) => f.kind === 'gravel').length, 0);
  assert.doesNotMatch(estimate(bare).shopping.map((r) => r.name).join('|'), /stone|Paver base|fabric/i);
  const osb = estimate(buildShed(normalize({ ...defaultDesign(), floorPanel: 'OSB' })));
  assert.ok(osb.shopping.some((r) => /OSB subfloor/.test(r.name)));
});

test('the build cache returns the same shed for the same design, and a new one for a change', () => {
  const a = buildShed(defaultDesign());
  assert.equal(buildShed(defaultDesign()), a);
  assert.notEqual(buildShed({ ...defaultDesign(), overhang: 10, autoOverhang: false }), a);
});

test('a realistic order: spare boards, consumables, sales tax and delivery', () => {
  const plain = estimate(buildShed(normalize({ ...defaultDesign(), spares: 0 })));
  const est = estimate(buildShed(defaultDesign()));
  const spares = est.shopping.filter((r) => /spares/.test(r.name));
  assert.equal(spares.length, est.lumber.filter((l) => l.result.boards.length).length, 'one spares line a material');
  for (const l of est.lumber) {
    const line = spares.find((r) => r.name.startsWith(`${l.material} x`));
    assert.equal(line.qty, Math.ceil(l.result.boards.length * 0.05), l.material);
  }
  assert.ok(!plain.shopping.some((r) => /spares/.test(r.name)));
  for (const re of [/adhesive/i, /screws/i, /Flashing tape/, /shims/i]) assert.ok(est.shopping.some((r) => re.test(r.name)), String(re));
  assert.ok(Math.abs(est.tax - est.total * 0.0753) < 0.011, 'US average sales tax by default');
  assert.equal(estimate(buildShed(normalize({ ...defaultDesign(), taxRate: 0 }))).tax, 0);
  const taxed = estimate(buildShed(normalize({ ...defaultDesign(), taxRate: 7.5, delivery: 'homedepot' })), { ...examplePricesWith({ delivery: { homedepot: 79 } }) });
  assert.ok(Math.abs(taxed.tax - taxed.total * 0.075) < 0.01);
  assert.equal(taxed.deliveryFee, 79);
  assert.ok(Math.abs(taxed.grandTotal - (taxed.total + taxed.tax + 79)) < 0.011);
});

test('whole list at each store: every line counted once, priced or carried', () => {
  const est = estimate(buildShed(defaultDesign()));
  const w = storeTotals(est);
  for (const x of w.stores) {
    assert.ok(Math.abs(x.priced + x.carried - x.total) < 0.011);
    assert.equal(x.of, est.shopping.length);
    assert.ok(x.lines <= x.of);
  }
  assert.ok(w.stores.find((x) => x.store === 'Home Depot').lines > est.shopping.length / 2);
});

test('labour: hours rise with the work, and the rate turns them into money', () => {
  const d = defaultDesign();
  const s = buildShed(d);
  const est = estimate(s);
  const h = laborHours(s, est);
  assert.ok(h > 10 && h < 120, `a shed is days of work, not minutes or months (${h} h)`);
  const notched = buildShed(normalize({ ...d, rafterSeat: 'birdsmouth' }));
  assert.ok(laborHours(notched, estimate(notched)) > h, 'notching rafters takes longer than setting connectors');
  const big = buildShed(normalize({ ...d, length: 192, width: 144, maxFootprint: 0 }));
  assert.ok(laborHours(big, estimate(big)) > h, 'a bigger shed takes longer');
});

test('one store only: its own prices and item numbers, re-optimized, the gaps marked', () => {
  const shed = buildShed(defaultDesign());
  for (const k of ['homedepot', 'lowes']) {
    const est = estimate(shed, pricesFor(k, examplePrices()));
    const l = storeList(est, k);
    assert.ok(l.share >= 70, `${k} supplies most of the order (${l.share}%)`);
    assert.equal(l.lines.length, est.shopping.length);
    assert.ok(Math.abs(l.hereTotal + l.elsewhereTotal - l.total) < 0.02);
    for (const line of l.lines.filter((x) => !x.elsewhere)) if (line.source?.url) assert.ok(line.source.store === l.store, line.name);
    const body = quoteRequest(shed, { ...est, shopping: l.lines, total: l.total }, k).body;
    if (l.lines.some((x) => x.elsewhere && !x.source?.url)) assert.match(body, /please quote your equivalent/);
  }
  // Lowe's own lumber prices change what the optimizer buys there.
  const lw = estimate(shed, pricesFor('lowes', examplePrices()));
  assert.notEqual(lw.lumberCost, estimate(shed).lumberCost);
});
