// Wall trim, site-built doors, block foundations, fasteners, store offers,
// design swaps and the simplicity search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, BLOCKS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { itemPrice } from './prices.mjs';
import { EXAMPLE_ITEMS } from './lumber.mjs';
import { OFFERS, storeComparison, swapsFor } from './catalog.mjs';
import { simplify, cutMetrics, sidingSpan } from './simplify.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildSheets } from './drawings.mjs';
import { buildInstructions } from './instructions.mjs';
import { quoteRequest, itemRef } from './quote.mjs';
import { shoppingCsv } from './estimate.mjs';

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
  const tamp = estimate(buildShed(defaultDesign())).shopping.filter((r) => r.section === 'Site prep').map((r) => r.name).join('|');
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
    assert.ok(EXAMPLE_ITEMS[k] || /^lumber:[^:]+:\d+$/.test(k), k);
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
  assert.match(body, /Lowe's: item 131203, model L51844416, https:\/\/www\.lowes\.com\//);
  const hd = quoteRequest(shed, est, 'homedepot').body;
  assert.match(hd, /Home Depot: model 702636, internet 307424572/);
  assert.equal(itemRef({ source: { key: 'trim1x4x16' } }, undefined), '');
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
