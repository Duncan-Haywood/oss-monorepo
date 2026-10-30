import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { estimate, examplePrices, markName, cutSheetCsv, shoppingCsv } from './estimate.mjs';

const classic = () => PRESETS['8x12 classic']();

test('marks run A..Z then AA', () => {
  assert.equal(markName(0), 'A');
  assert.equal(markName(25), 'Z');
  assert.equal(markName(26), 'AA');
  assert.equal(markName(27), 'AB');
});

test('every framing member is on the cut sheet exactly once', () => {
  const shed = buildShed(classic());
  const est = estimate(shed);
  const cut = est.lumber.flatMap((l) => l.result.boards.flatMap((b) => b.cuts.map((c) => c.id))).sort();
  assert.deepEqual(cut, shed.members.map((m) => m.id).sort());
  assert.equal(est.parts.reduce((t, p) => t + p.qty, 0), shed.members.length);
  assert.equal(new Set(est.parts.map((p) => p.mark)).size, est.parts.length);
  assert.deepEqual(est.problems, []);
});

test('shopping list covers lumber, sheets, roofing, vents and hardware, and totals add up', () => {
  const shed = buildShed(classic());
  const est = estimate(shed, examplePrices());
  const sections = new Set(est.shopping.map((r) => r.section));
  for (const s of ['Lumber', 'Sheet goods', 'Roofing', 'Foundation and hardware']) assert.ok(sections.has(s), s);
  assert.ok(est.shopping.some((r) => /gable vent/i.test(r.name) && r.qty === 2));
  const sum = est.shopping.reduce((t, r) => t + r.total, 0);
  assert.ok(Math.abs(sum - est.total) < 0.01);
  assert.ok(est.lumberCost >= est.lowerBound);
  assert.ok(est.cutSheetCost + 1e-9 >= est.lowerBound);
  // 8x12 floor: 3 sheet-lengths in each of two 4 ft rows, staggered, packed into whole sheets.
  assert.equal(est.floorSheets, 3);
});

test('your prices change the order cost', () => {
  const shed = buildShed(classic());
  const p = examplePrices();
  const base = estimate(shed, p).lumberCost;
  for (const ft of Object.keys(p.lumber['2x4'])) p.lumber['2x4'][ft] *= 2;
  assert.ok(estimate(shed, p).lumberCost > base);
});

test('CSV exports have a header and a row per set of identical boards, counting every board', () => {
  const est = estimate(buildShed(classic()));
  const rows = cutSheetCsv(est).trim().split('\n');
  assert.match(rows[0], /^boards,material,stock length/);
  assert.equal(rows.slice(1).filter((r) => !r.includes('1x4 trim')).reduce((t, r) => t + Number(r.split(',')[0]), 0), est.boards);
  assert.match(shoppingCsv(est), /^section,item,qty/);
});

test('pink siding with purple polka dots gets paint, and the ridge beam gets hangers', () => {
  const shed = buildShed({ ...defaultDesign(), sidingColor: 'pink', polkaDots: true });
  const est = estimate(shed);
  const paint = est.shopping.filter((r) => r.section === 'Paint');
  assert.ok(paint.some((r) => /pink/.test(r.name) && r.qty >= 1));
  assert.ok(paint.some((r) => /polka/.test(r.name)));
  assert.ok(est.shopping.some((r) => /hanger/.test(r.name) && r.qty === 14));
  assert.ok(est.shopping.some((r) => /gable vent/i.test(r.name) && r.qty === 4));
  assert.deepEqual(est.problems, []);
});

test('identical boards are grouped with a count, and the cut sheet still accounts for every board', async () => {
  const { groupBoards, cutSheetCsv } = await import('./estimate.mjs');
  const est = estimate(buildShed(defaultDesign()));
  for (const l of est.lumber) {
    const groups = groupBoards(l.result.boards);
    assert.equal(groups.reduce((t, g) => t + g.count, 0), l.result.boards.length, l.material);
    assert.ok(groups.length <= l.result.boards.length);
  }
  const rows = cutSheetCsv(est).trim().split('\n').slice(1);
  const lumberRows = rows.filter((r) => !r.includes('1x4 trim'));
  assert.equal(lumberRows.reduce((t, r) => t + Number(r.split(',')[0]), 0), est.lumber.reduce((t, l) => t + l.result.boards.length, 0));
  assert.ok(rows.length < est.boards, 'fewer lines than boards');
  // Trim offcuts allow for the kerf, like the framing.
  if (est.trimCuts) for (const b of est.trimCuts.boards) assert.ok(Math.abs(b.offcut - (b.stock - b.cuts.reduce((t, c) => t + c, 0) - b.cuts.length * defaultDesign().kerf)) < 1e-6 || b.offcut === 0);
});

test('narrow sheet rows are ripped from shared sheets, and the count never beats the area', async () => {
  const { sheetCount2d } = await import('./estimate.mjs');
  // Two 24" rows' worth of strips come from one 48" sheet; full-width pieces pack along 8 ft.
  assert.equal(sheetCount2d([{ len: 96, w: 48 }, { len: 48, w: 48 }, { len: 48, w: 48 }, { len: 96, w: 48 }, { len: 96, w: 24 }, { len: 48, w: 24 }]), 4);
  // A 9" course at the ridge: five strips to a sheet.
  assert.equal(sheetCount2d(Array.from({ length: 5 }, () => ({ len: 96, w: 9 }))), 1);
  assert.equal(sheetCount2d(Array.from({ length: 6 }, () => ({ len: 96, w: 9 }))), 2);
  for (const make of [defaultDesign, ...Object.values(PRESETS)]) {
    const shed = buildShed(make());
    const est = estimate(shed);
    const area = (kind) => shed.panels.filter((p) => p.kind === kind).reduce((t, p) => t + p.geom.profile[2][0] * p.geom.profile[2][1], 0) / (96 * 48);
    assert.ok(est.floorSheets >= Math.ceil(area('floor sheet') - 1e-9), shed.design.name);
    assert.ok(est.roofSheets >= Math.ceil(area('roof sheathing') - 1e-9), shed.design.name);
  }
});

test('boards stay within the haul limit unless a piece needs a longer one, which says so', async () => {
  const { normalize } = await import('./model.mjs');
  const { cutWithinHaul } = await import('./estimate.mjs');
  const { connectionChecks } = await import('./connections.mjs');
  // Owner, 2026-10-30: "I can't load up a 16 foot board in the back of my truck."
  assert.equal(defaultDesign().maxHaulFt, 12);
  for (const make of Object.values(PRESETS)) {
    const s = buildShed(make());
    const est = estimate(s);
    for (const l of est.lumber) for (const b of l.result.boards) {
      if (b.stock > 144) assert.match(b.why, /needs it$/, `${s.design.name} ${l.material} ${b.stock / 12}'`);
      if (b.stock > 144) assert.ok(b.cuts.some((c) => c.len > 144), 'a long board holds a piece longer than 12 ft');
    }
    // Splices at the limit still pass every connection check (plates on studs, caps 24" from top joints).
    assert.ok(connectionChecks(s).ok, s.design.name);
  }
  // The 12x16's 16 ft plates, rims, skids, ridge board and sub-fascia are spliced at 12 ft: no 14 or 16 ft board at all.
  const big = estimate(buildShed(PRESETS['12x16']()));
  assert.ok(big.lumber.every((l) => l.result.boards.every((b) => b.stock <= 144)));
  // With no limit the same shed buys 16 ft boards again.
  const free = estimate(buildShed(normalize({ ...PRESETS['12x16'](), maxHaulFt: 0 })));
  assert.ok(free.lumber.some((l) => l.result.boards.some((b) => b.stock === 192)));
  // An 8 ft limit on the default: the one-piece 12 ft ridge beam is the only thing that needs a longer board.
  const tight = estimate(buildShed(normalize({ ...defaultDesign(), maxHaulFt: 8 })));
  const long = tight.lumber.flatMap((l) => l.result.boards.filter((b) => b.stock > 96).map((b) => b.why));
  assert.ok(long.length > 0 && long.every((w) => /ridge beam 144" needs it/.test(w)), long.join('; '));
  // The helper on its own: a 150" piece takes a 14 ft board, the short pieces stay on 8 ft ones.
  const stocks = [96, 144, 168, 192].map((length) => ({ length, price: length / 12 }));
  const r = cutWithinHaul([{ len: 150, kind: 'rim joist', mark: 'B' }, { len: 40 }, { len: 40 }], stocks, 0.125, 8);
  assert.deepEqual(r.boards.map((b) => b.stock).sort((a, b) => a - b), [96, 168]);
  assert.equal(r.boards.find((b) => b.stock === 168).why, 'B rim joist 150" needs it');
  // Junk in a link keeps the default.
  assert.equal(normalize({ ...defaultDesign(), maxHaulFt: 13 }).maxHaulFt, 12);
  assert.equal(normalize({ ...defaultDesign(), maxHaulFt: '0' }).maxHaulFt, 0);
});
