import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePanels, optimizeSheets, formatSheetPlan, compareSheetSizes, formatSheetComparison, sameSheetSize, MAX_PANELS } from './sheet.mjs';

const EPS = 1e-6;

// The two invariants that decide whether a plan is cuttable at all: pieces may
// not overlap, and any two pieces must be far enough apart for the blade to
// pass between them. A packer that violates either produces a layout that
// destroys a sheet of plywood, so every packing test asserts them.
function assertCuttable(result) {
  for (const [index, sheet] of result.sheets.entries()) {
    for (const p of sheet.placements) {
      assert.ok(p.x >= result.trim - EPS, `sheet ${index}: ${p.label} starts left of the trim line`);
      assert.ok(p.y >= result.trim - EPS, `sheet ${index}: ${p.label} starts above the trim line`);
      assert.ok(p.x + p.width <= result.sheetWidth - result.trim + EPS, `sheet ${index}: ${p.label} runs off the right edge`);
      assert.ok(p.y + p.height <= result.sheetHeight - result.trim + EPS, `sheet ${index}: ${p.label} runs off the bottom edge`);
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

test('treats 4×8 and 8×4 as the same sheet', () => {
  assert.equal(sameSheetSize({ width: 96, height: 48 }, { width: 48, height: 96 }), true);
  assert.equal(sameSheetSize({ width: 96, height: 48 }, { width: 60, height: 60 }), false);
});

test('compares common sheet sizes and ranks by purchased area among sizes that fit', () => {
  // One 24×24 tile fits a 4×4 and a 4×8. Buying the 4×8 wastes a half-sheet
  // the shop did not need — that is the decision this comparison exists for.
  const comparison = compareSheetSizes({
    panels: parsePanels('Tile: 24 x 24'),
    kerf: 0,
    unit: 'in',
    current: { width: 96, height: 48 },
  });
  const fourByEight = comparison.rows.find((row) => row.id === '4x8');
  const fourByFour = comparison.rows.find((row) => row.id === '4x4');
  assert.ok(fourByEight.fits && fourByFour.fits);
  assert.equal(fourByEight.sheets, 1);
  assert.equal(fourByFour.sheets, 1);
  assert.ok(fourByFour.buyArea < fourByEight.buyArea);
  assert.equal(fourByEight.current, true);
  assert.equal(comparison.winner.id, '4x4');
  for (const row of comparison.rows) {
    if (!row.fits) assert.ok(comparison.rows.indexOf(row) > comparison.rows.indexOf(comparison.winner));
  }
});

test('a size that cannot take every piece loses to one that can, even with less area', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels('Door: 72 x 24 x 2'),
    kerf: 0,
    unit: 'in',
    current: { width: 96, height: 48 },
  });
  const fourByFour = comparison.rows.find((row) => row.id === '4x4');
  const fourByEight = comparison.rows.find((row) => row.id === '4x8');
  assert.equal(fourByFour.fits, false);
  assert.equal(fourByEight.fits, true);
  assert.equal(comparison.winner.id, fourByEight.id);
  assert.ok(comparison.rows.indexOf(fourByEight) < comparison.rows.indexOf(fourByFour));
});

test('includes a custom current size that is not in the catalog', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels('10 x 10'),
    unit: 'in',
    current: { width: 36, height: 36 },
  });
  const custom = comparison.rows.find((row) => row.id === 'current');
  assert.ok(custom);
  assert.equal(custom.width, 36);
  assert.equal(custom.height, 36);
  assert.equal(custom.current, true);
  assert.equal(custom.fits, true);
});

test('estimates cost from price per square unit, not per sheet', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels('24 x 24 x 4'),
    kerf: 0,
    unit: 'in',
    current: { width: 96, height: 48 },
    pricePerArea: 62 / (96 * 48),
  });
  const fourByEight = comparison.rows.find((row) => row.id === '4x8');
  assert.ok(Math.abs(fourByEight.cost - 62) < 1e-6);
});

test('formats a comparison a shop can read to the yard', () => {
  const comparison = compareSheetSizes({
    panels: parsePanels('Shelf: 30 x 12 x 2'),
    kerf: 0.125,
    unit: 'in',
    current: { width: 96, height: 48 },
    pricePerArea: 62 / (96 * 48),
  });
  const text = formatSheetComparison(comparison, { unit: 'in' });
  assert.match(text, /Sheet size comparison \(in\)/);
  assert.match(text, /4×8 \(the size on the form\)/);
  assert.match(text, /← buy this/);
  assert.match(text, /estimated material/);
  assert.match(text, /Confirm the yard/);
});

test('the same parts list always ranks sizes the same way', () => {
  const run = () => compareSheetSizes({
    panels: parsePanels('A: 30 x 20 x 3\nB: 12 x 8 x 5'),
    kerf: 0.125,
    unit: 'in',
    current: { width: 96, height: 48 },
  });
  assert.deepEqual(run(), run());
});
