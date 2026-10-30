import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS } from './model.mjs';
import { estimate, examplePrices, markName, cutSheetCsv, shoppingCsv, boardUse, lumberUses, groupBoards, sectionTotals } from './estimate.mjs';

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

test('sheet goods mix strip widths and rip strips from a full sheet\'s offcut', async () => {
  const { sheetCount2d } = await import('./estimate.mjs');
  // Two 24" ends of full-width rows use half a sheet; the other half rips into two 19" ridge strips.
  assert.equal(sheetCount2d([{ len: 24, w: 48 }, { len: 24, w: 48 }, { len: 48, w: 19 }, { len: 48, w: 19 }]), 1);
  // A 30" strip and a 16" strip of different widths share one sheet.
  assert.equal(sheetCount2d([{ len: 96, w: 30 }, { len: 96, w: 16 }]), 1);
  // Pieces keep their direction: two 48 x 25 pieces cannot lie side by side across 48".
  assert.equal(sheetCount2d([{ len: 96, w: 25 }, { len: 96, w: 25 }]), 2);
  // The 8x10 preset's roof: 96 and 24 full-width rows and 48 and 72 ridge strips, 19-1/16" wide.
  assert.equal(estimate(buildShed(PRESETS['8x10']())).roofSheets, 4); // five before 2026-10-30
});

test('gable siding pieces that slope the same way nest head to toe', async () => {
  const { sidingUpperSheets } = await import('./estimate.mjs');
  const shed = buildShed(PRESETS['8x10']()); // 8 ft walls, 6/12: four pieces 10-5/8" rising to 34-5/8"
  assert.equal(shed.sidingUpper.length, 4);
  // Nested in pairs each takes 10.65 + 34.65 = 45.3, so 46" a pair and both pairs on one panel; alone they took two.
  assert.equal(sidingUpperSheets(shed), 1);
  for (const make of [defaultDesign, ...Object.values(PRESETS)]) {
    const s = buildShed(make());
    const plain = s.sidingUpper.length ? Math.ceil(s.sidingUpper.reduce((t, h) => t + h, 0) / 96) : 0;
    const area = s.sidingUpperShapes.reduce((t, p) => t + 48 * (p.h0 + p.h1) / 2, 0) / (96 * 48);
    const n = sidingUpperSheets(s);
    assert.ok(n >= Math.ceil(area - 1e-9), `${s.design.name}: ${n} panels for ${area.toFixed(2)} panels of area`);
    assert.ok(n <= Math.max(plain, s.sidingUpper.length), s.design.name);
  }
});

test('the siding note explains why a taller wall can cost less', () => {
  const at = (h) => estimate(buildShed(normalize({ ...PRESETS['8x8 lean'](), wallHeight: h, autoWall: false })));
  const [low, high] = [at(112), at(114)];
  // Before the gable pieces nested (2026-10-30), 114" walls cost less than 112". Nesting the four
  // sloped strips at 112" into one panel took that dip away; the note still explains the panel rule.
  assert.ok(low.total < high.total, `112" walls now cost less than 114" (${low.total} vs ${high.total})`);
  assert.match(low.notes.join(' '), /4 use a 9 or 10 ft panel and 4 use a strip \(of 8 columns\)/);
  assert.match(high.notes.join(' '), /8 use a strip \(of 8 columns\)/);
  const bare = estimate(buildShed(normalize({ ...PRESETS['8x8 lean'](), siding: false })));
  assert.deepEqual(bare.notes, [], 'no siding, no note');
});

test('each board and each lumber line says what it is for', () => {
  const est = estimate(buildShed(normalize(defaultDesign())));
  assert.equal(boardUse({ cuts: [{ mark: 'R1', kind: 'rafter', len: 84 }, { mark: 'R1', kind: 'rafter', len: 84 }] }), `2 x 7' 0" rafter (R1)`);
  assert.equal(boardUse({ cuts: [{ mark: 'P3', kind: 'top plate', len: 105 }, { mark: 'C2', kind: 'cripple', len: 36 }] }), `8' 9" top plate (P3) + 3' 0" cripple (C2)`);
  const uses = lumberUses(est);
  assert.match(uses.get('PT 4x4:12'), /^skid/);
  // Every cut sheet board is described, and every lumber line of the shopping list has a use.
  for (const l of est.lumber) for (const b of groupBoards(l.result.boards)) assert.ok(boardUse(b).length > 0);
  for (const r of est.shopping.filter((x) => x.section === 'Lumber' && !/spares/.test(x.name))) {
    const m = /^(.+) x (\d+)'/.exec(r.name);
    assert.ok(uses.get(`${m[1]}:${m[2]}`), r.name);
  }
});

test('the shopping list has a subtotal per section, on the page and in the CSV', () => {
  for (const d of [defaultDesign(), PRESETS['12x16'](), { ...PRESETS['8x8 lean'](), foundation: 'deck blocks' }]) {
    const est = estimate(buildShed(normalize(d)));
    // Sections come in one run each, so a subtotal closes each one once.
    const order = est.shopping.map((r) => r.section).filter((s, i, a) => s !== a[i - 1]);
    assert.equal(new Set(order).size, order.length, `sections are contiguous: ${order.join(', ')}`);
    const subs = sectionTotals(est.shopping);
    assert.equal(Math.round(subs.reduce((t, x) => t + x.total, 0) * 100) / 100, est.total);
    assert.ok(Math.abs(subs.reduce((t, x) => t + x.share, 0) - 1) < 1e-9);
    const csv = shoppingCsv(est);
    for (const x of subs) assert.ok(csv.includes(`"Subtotal, ${x.section.toLowerCase()}",,,,${x.total.toFixed(2)}`), x.section);
  }
});
