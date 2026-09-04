import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePanels,
  parseOnHandSheets,
  optimizeSheets,
  formatSheetPlan,
  compareSheetSizes,
  formatSheetComparison,
  sheetSizeLabel,
  MAX_PANELS,
} from './sheet.mjs';

const EPS = 1e-6;

// The two invariants that decide whether a plan is cuttable at all: pieces may
// not overlap, and any two pieces must be far enough apart for the blade to
// pass between them. A packer that violates either produces a layout that
// destroys a sheet of plywood, so every packing test asserts them.
function assertCuttable(result) {
  for (const [index, sheet] of result.sheets.entries()) {
    // Trim is a factory-edge allowance for a fresh sheet only — an on-hand
    // offcut's edges are already square, so its own bounds apply with no trim.
    const trim = sheet.source === 'on-hand' ? 0 : result.trim;
    const width = sheet.width ?? result.sheetWidth;
    const height = sheet.height ?? result.sheetHeight;
    for (const p of sheet.placements) {
      assert.ok(p.x >= trim - EPS, `sheet ${index}: ${p.label} starts left of the trim line`);
      assert.ok(p.y >= trim - EPS, `sheet ${index}: ${p.label} starts above the trim line`);
      assert.ok(p.x + p.width <= width - trim + EPS, `sheet ${index}: ${p.label} runs off the right edge`);
      assert.ok(p.y + p.height <= height - trim + EPS, `sheet ${index}: ${p.label} runs off the bottom edge`);
    }
    for (let i = 0; i < sheet.placements.length; i += 1) {
      for (let j = i + 1; j < sheet.placements.length; j += 1) {
        const a = sheet.placements[i];
        const b = sheet.placements[j];
        const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
        const verticalGap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
        assert.ok(
          Math.max(horizontalGap, verticalGap) >= result.kerf - EPS,
          `sheet ${index}: ${a.label} and ${b.label} leave less than one kerf between them`,
        );
      }
    }
  }
}

test('parses width, height, quantity, and label', () => {
  assert.deepEqual(parsePanels('Shelf: 24 x 12 x 2'), [
    { label: 'Shelf', width: 24, height: 12, grainLocked: false },
    { label: 'Shelf', width: 24, height: 12, grainLocked: false },
  ]);
});

test('labels a piece by its size when no label is given', () => {
  assert.equal(parsePanels('30x15')[0].label, '30×15');
});

test('accepts * and × as separators and ignores blank lines', () => {
  assert.equal(parsePanels('\n10 * 4\n\n6 × 6\n').length, 2);
});

test('a trailing "grain" pins the orientation', () => {
  assert.equal(parsePanels('Door: 24 x 12 grain')[0].grainLocked, true);
  assert.equal(parsePanels('Door: 24 x 12')[0].grainLocked, false);
});

test('rejects a malformed line by number', () => {
  assert.throws(() => parsePanels('24 x 12\ntwo by four'), /Line 2/);
});

test('rejects a fractional quantity', () => {
  assert.throws(() => parsePanels('24 x 12 x 2.5'), /Line 1/);
});

test('rejects an empty list', () => {
  assert.throws(() => parsePanels('   \n\n'), /at least one panel/);
});

test('refuses a pasted list far larger than a real job', () => {
  assert.throws(() => parsePanels(`1 x 1 x ${MAX_PANELS + 1}`), new RegExp(String(MAX_PANELS)));
});

test('packs four half-sheets onto one sheet', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('48 x 24 x 4'),
  });
  assert.equal(result.sheets.length, 1);
  assert.equal(result.utilization, 1);
  assertCuttable(result);
});

test('kerf pushes a fourth piece onto a second sheet', () => {
  const tight = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('48 x 24 x 4'),
  });
  assert.equal(tight.sheets.length, 2);
  assertCuttable(tight);
});

test('opens a second sheet only when the first is full', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('30 x 20 x 10'),
  });
  assert.equal(result.sheets.length, 2);
  assert.equal(result.panelCount, 10);
  assert.equal(result.sheets.reduce((n, s) => n + s.placements.length, 0), 10);
  assertCuttable(result);
});

test('rotates a piece when that is the only way it fits', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('20 x 90'),
  });
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].placements[0].rotated, true);
  assertCuttable(result);
});

test('a grain-locked piece is never turned, even when it then does not fit', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('Face: 20 x 90 grain'),
  });
  assert.equal(result.sheets.length, 0);
  assert.deepEqual(result.oversize.map((p) => p.label), ['Face']);
});

test('rotation off keeps every piece upright', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    allowRotation: false,
    panels: parsePanels('40 x 20 x 4'),
  });
  assert.ok(result.sheets.every((s) => s.placements.every((p) => p.rotated === false)));
  assertCuttable(result);
});

test('reports an oversize piece instead of hiding the rest of the plan', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('Countertop: 120 x 60\nShelf: 24 x 12'),
  });
  assert.deepEqual(result.oversize.map((p) => p.label), ['Countertop']);
  assert.equal(result.panelCount, 1);
  assert.equal(result.sheets.length, 1);
  assertCuttable(result);
});

test('edge trim shrinks the usable area and insets every piece', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    trim: 0.5,
    panels: parsePanels('47 x 23.5 x 4'),
  });
  assert.equal(result.sheets.length, 1);
  assert.ok(result.sheets[0].placements.every((p) => p.x >= 0.5 && p.y >= 0.5));
  assertCuttable(result);
});

test('trim wider than the sheet is refused rather than silently ignored', () => {
  assert.throws(
    () => optimizeSheets({ sheetWidth: 10, sheetHeight: 10, trim: 5, panels: parsePanels('1 x 1') }),
    /whole sheet/,
  );
});

test('counts kerf and trim as waste rather than flattering the utilization', () => {
  const result = optimizeSheets({
    sheetWidth: 100,
    sheetHeight: 100,
    kerf: 1,
    trim: 1,
    panels: parsePanels('40 x 40 x 2'),
  });
  assert.equal(result.totalArea, 10000);
  assert.equal(result.panelArea, 3200);
  assert.equal(result.wasteArea, 6800);
  assert.equal(result.utilization, 0.32);
});

test('rejects impossible sheet and kerf values', () => {
  const panels = parsePanels('10 x 10');
  assert.throws(() => optimizeSheets({ sheetWidth: 0, sheetHeight: 48, panels }), /greater than zero/);
  assert.throws(() => optimizeSheets({ sheetWidth: 96, sheetHeight: -1, panels }), /greater than zero/);
  assert.throws(() => optimizeSheets({ sheetWidth: 96, sheetHeight: 48, kerf: -1, panels }), /kerf cannot be negative/);
  assert.throws(() => optimizeSheets({ sheetWidth: 96, sheetHeight: 48, trim: -1, panels }), /trim cannot be negative/);
  assert.throws(() => optimizeSheets({ sheetWidth: 96, sheetHeight: 48, panels: [] }), /at least one panel/);
});

test('the same cut list always produces the same plan', () => {
  const run = () => optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('A: 30 x 20 x 3\nB: 20 x 30 x 3\nC: 12 x 8 x 5'),
  });
  assert.deepEqual(run(), run());
});

test('every piece on the list reaches a sheet or the oversize report', () => {
  const panels = parsePanels('A: 30 x 20 x 3\nB: 11 x 7 x 9\nC: 200 x 5\nD: 44 x 22 x 2');
  const result = optimizeSheets({ sheetWidth: 96, sheetHeight: 48, kerf: 0.125, panels });
  const placed = result.sheets.reduce((n, s) => n + s.placements.length, 0);
  assert.equal(placed + result.oversize.length, panels.length);
  assertCuttable(result);
});

test('a realistic bookcase job packs onto one sheet with room left', () => {
  // Four shelves, two sides, a top and a bottom — the job a hobby woodworker
  // actually turns up with. Every piece is 11.25 deep, so the sheet yields four
  // 96in strips and the plan is whether the lengths fit inside them.
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('Side: 72 x 11.25 x 2\nShelf: 30 x 11.25 x 4\nTop: 31.5 x 11.25 x 2'),
  });
  assert.equal(result.sheets.length, 1);
  assert.equal(result.oversize.length, 0);
  assert.ok(result.utilization > 0.5, `expected a usable layout, got ${result.utilization}`);
  assert.ok(result.sheets[0].offcuts.length > 0, 'a part-used sheet should name its offcuts');
  assertCuttable(result);
});

test('formats a plan a shop can paste into a job ticket', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    trim: 0.25,
    panels: parsePanels('Shelf: 30 x 12 x 2'),
  });
  const text = formatSheetPlan(result, { unit: 'in', sheetCost: 62 });
  assert.match(text, /Sheet cut plan: 1 sheet of 96\.00 × 48\.00 in/);
  assert.match(text, /Saw kerf: 0\.13 in/);
  assert.match(text, /Edge trim per side: 0\.25 in/);
  assert.match(text, /Pieces placed: 2/);
  assert.match(text, /Material cost: 62\.00 at 62\.00 per sheet/);
  assert.match(text, /Shelf: 30\.00 × 12\.00 in at x 0\.25, y 0\.25/);
  assert.match(text, /Offcuts: /);
  assert.match(text, /Verify every dimension/);
});

test('the plan omits cost lines when no sheet price is given', () => {
  const result = optimizeSheets({ sheetWidth: 96, sheetHeight: 48, panels: parsePanels('10 x 10') });
  const text = formatSheetPlan(result, { unit: 'in' });
  assert.doesNotMatch(text, /Material cost/);
  assert.doesNotMatch(text, /Edge trim/);
});

test('the plan names the pieces that did not fit', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    panels: parsePanels('Countertop: 120 x 60\nShelf: 24 x 12'),
  });
  assert.match(formatSheetPlan(result, { unit: 'in' }), /Does not fit on a sheet[\s\S]*Countertop: 120\.00 × 60\.00 in/);
});

// --- On-hand offcuts ---
//
// The linear stock planner already drew cuts from a rack of offcuts before
// buying new stock. Sheet goods had no equivalent — a shop with a half-sheet
// of ply already leaning against the wall got no credit for it. These cover
// the same behavior for panels.

test('parses on-hand offcuts by size, with an optional quantity, and no label needed', () => {
  assert.deepEqual(parseOnHandSheets('24 x 12\n30 x 20 x 2'), [
    { width: 24, height: 12 },
    { width: 30, height: 20 },
    { width: 30, height: 20 },
  ]);
});

test('an empty on-hand list is the normal case, not an error', () => {
  assert.deepEqual(parseOnHandSheets(''), []);
  assert.deepEqual(parseOnHandSheets(undefined), []);
  assert.deepEqual(parseOnHandSheets('   \n\n'), []);
});

test('rejects a malformed on-hand line by number', () => {
  assert.throws(() => parseOnHandSheets('24 x 12\ntwo by four'), /On-hand line 2/);
});

test('rejects a non-positive or fractional on-hand size or quantity', () => {
  assert.throws(() => parseOnHandSheets('0 x 12'), /greater than zero/);
  assert.throws(() => parseOnHandSheets('24 x 12 x 1.5'), /On-hand line 1/);
});

test('a piece that fits an on-hand offcut is placed there instead of opening a new sheet', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('24 x 12'),
    onHand: [{ width: 30, height: 15 }],
  });
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].source, 'on-hand');
  assert.equal(result.sheetsPurchased, 0);
  assert.equal(result.onHandUsed, 1);
  assertCuttable(result);
});

test('only the pieces that do not fit an offcut cost a new sheet', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('Small: 24 x 12\nBig: 90 x 46'),
    onHand: [{ width: 30, height: 15 }],
  });
  assert.equal(result.onHandUsed, 1);
  assert.equal(result.sheetsPurchased, 1);
  assert.equal(result.sheets.length, 2);
  const sources = result.sheets.map((s) => s.source).sort();
  assert.deepEqual(sources, ['on-hand', 'purchase']);
  assertCuttable(result);
});

test('an on-hand offcut nothing was cut from never appears in the plan', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('90 x 46'),
    onHand: [{ width: 10, height: 10 }],
  });
  assert.equal(result.onHandUsed, 0);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].source, 'purchase');
});

test('an on-hand piece bigger than the configured sheet size is not marked oversize', () => {
  const result = optimizeSheets({
    sheetWidth: 48,
    sheetHeight: 48,
    kerf: 0,
    panels: parsePanels('70 x 40'),
    onHand: [{ width: 96, height: 48 }],
  });
  assert.equal(result.oversize.length, 0);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].source, 'on-hand');
  assertCuttable(result);
});

test('a second piece that only fits an already-consumed on-hand offcut is reported oversize, not a crash', () => {
  // Both required pieces fit the 100x100 on-hand offcut but neither fits a
  // fresh purchased sheet on its own. Whichever one the packer places first
  // consumes the offcut's free space, so the second reaches the "no existing
  // free rect fits" branch with nothing left that can hold it -- regression
  // for a bug where that branch always assumed a fresh sheet would fit and
  // threw reading `.width` off an undefined orientation option instead.
  const result = optimizeSheets({
    sheetWidth: 48,
    sheetHeight: 96,
    trim: 1,
    kerf: 0.125,
    onHand: [{ width: 100, height: 100 }],
    panels: parsePanels('A: 90 x 90\nB: 95 x 95'),
  });
  assert.equal(result.oversize.length, 1);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].source, 'on-hand');
  assertCuttable(result);
});

test('rejects an on-hand list that is not an array, or a non-positive piece in it', () => {
  const panels = parsePanels('10 x 10');
  assert.throws(() => optimizeSheets({ sheetWidth: 96, sheetHeight: 48, panels, onHand: 'nope' }), /must be a list/);
  assert.throws(
    () => optimizeSheets({ sheetWidth: 96, sheetHeight: 48, panels, onHand: [{ width: 0, height: 10 }] }),
    /greater than zero/,
  );
});

test('material cost and offcut cost are billed against sheets bought, not sheets on the rack', () => {
  const result = optimizeSheets({
    sheetWidth: 96,
    sheetHeight: 48,
    kerf: 0.125,
    panels: parsePanels('Small: 24 x 12\nBig: 90 x 46'),
    onHand: [{ width: 30, height: 15 }],
  });
  const text = formatSheetPlan(result, { unit: 'in', sheetCost: 62 });
  assert.match(text, /From your on-hand offcuts: 1/);
  assert.match(text, /New sheets to buy: 1/);
  assert.match(text, /Material cost: 62\.00 at 62\.00 per sheet/);
  assert.match(text, /On-hand offcuts avoided buying 1 sheet \(62\.00\)/);
  assert.match(text, /Sheet 1 \(your on-hand offcut\)/);
});

test('purchasesAvoided counts sheets the plan needed without the rack, minus what it needs with it', () => {
  // A sheet sized to fit exactly one 24×12 panel: three panels need three new
  // sheets on their own, and a single matching offcut takes one of them off
  // the shopping list.
  const withOffcut = optimizeSheets({
    sheetWidth: 24,
    sheetHeight: 12,
    kerf: 0,
    panels: parsePanels('24 x 12 x 3'),
    onHand: [{ width: 24, height: 12 }],
  });
  assert.equal(withOffcut.onHandUsed, 1);
  assert.equal(withOffcut.sheetsPurchased, 2);
  assert.equal(withOffcut.purchasesAvoided, 1);
});

test('compareSheetSizes ranks by sheets still needing to be bought when offcuts are on hand', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels('24 x 12 x 2'),
    kerf: 0,
    onHand: [{ width: 24, height: 12 }],
    candidates: [
      { width: 96, height: 48, costPerSheet: 62 },
      { width: 48, height: 48, costPerSheet: 22 },
    ],
  });
  // The offcut exactly matches one panel and has no room left for the
  // second, so every candidate size still needs one new sheet for it.
  assert.ok(comparison.rows.every((row) => row.onHandUsed === 1));
  assert.ok(comparison.rows.every((row) => row.sheetCount === 1));
});

// --- Sheet size comparison ---
//
// The question a shop asks at the lumber yard is not "how do I nest these,"
// it is "do I buy 4×8, 5×5 Baltic, or a stack of half-sheets?" The comparison
// has to pick the size that costs less cash when prices are known, and the
// size that buys fewer sheets when they are not.

const CABINET_DOORS = 'Door: 28 x 28 x 4';
const BOOKCASE = 'Side: 72 x 11.25 x 2\nShelf: 30 x 11.25 x 4\nTop: 31.5 x 11.25 x 2';

test('names common inch sheets the way a shop orders them', () => {
  assert.equal(sheetSizeLabel(96, 48), '4×8');
  assert.equal(sheetSizeLabel(48, 96), '4×8');
  assert.equal(sheetSizeLabel(60, 60), '5×5');
  assert.equal(sheetSizeLabel(48, 48), '4×4');
  assert.equal(sheetSizeLabel(120, 60), '5×10');
  assert.equal(sheetSizeLabel(50, 30, 'cm'), '50.00 × 30.00');
});

test('priced 28-inch doors: two cheap 4×8 sheets beat one $90 Baltic 5×5', () => {
  // Four 28×28 doors: 5×5 takes one sheet, 4×8 takes two, 4×4 takes four.
  // At $42 / $90 / $22 the cash ranking is 4×8 ($84), 4×4 ($88), 5×5 ($90).
  const comparison = compareSheetSizes({
    panels: parsePanels(CABINET_DOORS),
    kerf: 0.125,
    candidates: [
      { width: 96, height: 48, costPerSheet: 42 },
      { width: 60, height: 60, costPerSheet: 90 },
      { width: 48, height: 48, costPerSheet: 22 },
    ],
  });
  assert.deepEqual(comparison.rows.map((row) => [row.label, row.sheetCount, row.totalCost]), [
    ['4×8', 2, 84],
    ['4×4', 4, 88],
    ['5×5', 1, 90],
  ]);
  assert.equal(comparison.winner.label, '4×8');
  assert.equal(comparison.priced, true);
  assert.deepEqual(comparison.savings, { kind: 'cost', amount: 4 });
  assert.ok(comparison.rows.every((row) => row.fitsAll));
});

test('without prices the same doors pick 5×5 because it is one sheet, not two', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels(CABINET_DOORS),
    kerf: 0.125,
    candidates: [
      { width: 96, height: 48 },
      { width: 60, height: 60 },
    ],
  });
  assert.equal(comparison.winner.label, '5×5');
  assert.equal(comparison.winner.sheetCount, 1);
  assert.equal(comparison.runnerUp.sheetCount, 2);
  assert.equal(comparison.priced, false);
  assert.deepEqual(comparison.savings, { kind: 'sheets', amount: 1 });
});

test('a cheaper 5×5 still loses when the 72-inch sides will not fit it', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels(BOOKCASE),
    kerf: 0.125,
    candidates: [
      { width: 96, height: 48, costPerSheet: 62 },
      { width: 60, height: 60, costPerSheet: 55 },
    ],
  });
  assert.equal(comparison.winner.label, '4×8');
  assert.equal(comparison.winner.fitsAll, true);
  assert.equal(comparison.winner.totalCost, 62);
  assert.equal(comparison.runnerUp.label, '5×5');
  assert.equal(comparison.runnerUp.fitsAll, false);
  assert.equal(comparison.runnerUp.oversizeCount, 2);
});

test('when 5×5 is the cheaper complete buy, it wins', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels(CABINET_DOORS),
    kerf: 0.125,
    candidates: [
      { width: 96, height: 48, costPerSheet: 62 },
      { width: 60, height: 60, costPerSheet: 55 },
    ],
  });
  assert.equal(comparison.winner.label, '5×5');
  assert.equal(comparison.winner.totalCost, 55);
  assert.equal(comparison.runnerUp.totalCost, 124);
  assert.deepEqual(comparison.savings, { kind: 'cost', amount: 69 });
});

test('the comparison text names the buy and the cash difference', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels(CABINET_DOORS),
    kerf: 0.125,
    candidates: [
      { width: 96, height: 48, costPerSheet: 42 },
      { width: 60, height: 60, costPerSheet: 90 },
    ],
  });
  const text = formatSheetComparison(comparison, { unit: 'in' });
  assert.match(text, /4×8 \(96\.00 × 48\.00 in\): 2 sheets, \$84\.00/);
  assert.match(text, /← buy this size/);
  assert.match(text, /Buying 4×8 costs \$6\.00 less than 5×5/);
  assert.match(text, /Verify prices and dimensions/);
});

test('refuses a one-size comparison rather than ranking a single row against itself', () => {
  assert.throws(
    () => compareSheetSizes({ panels: parsePanels('10 x 10'), candidates: [{ width: 96, height: 48 }] }),
    /at least two sheet sizes/,
  );
});

test('rejects a candidate that is not a real sheet', () => {
  assert.throws(
    () => compareSheetSizes({
      panels: parsePanels('10 x 10'),
      candidates: [{ width: 96, height: 48 }, { width: 0, height: 48 }],
    }),
    /Size 2/,
  );
});
