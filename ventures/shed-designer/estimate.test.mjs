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
