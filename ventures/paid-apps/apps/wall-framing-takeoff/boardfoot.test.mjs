import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBoardFoot, validateBoardFoot, boardFootText, parseThickness } from "./boardfoot.mjs";

test("a 2x4x8 is 5.33 bf sold, 3.5 bf milled (hand count)", () => {
  const p = layoutBoardFoot({ lines: [{ thickness: 2, width: 4, length: 8 }] });
  assert.equal(p.ok, true);
  assert.equal(p.boardFeet, 5.33); // 2*4*8/12
  assert.equal(p.milledBoardFeet, 3.5); // 1.5*3.5*8/12
  assert.ok(Math.abs(p.lines[0].milledBfEach - 3.5) < 1e-12);
});
test("actual basis uses the milled size", () => {
  const p = layoutBoardFoot({ basis: "actual", lines: [{ thickness: 2, width: 4, length: 8, count: 10 }] });
  assert.equal(p.boardFeet, 35);
});
test("quarters: 8/4 x 6 x 10 ft = 10 bf; 4/4 = 1 in", () => {
  assert.equal(parseThickness("4/4"), 1); assert.equal(parseThickness("8/4"), 2); assert.equal(parseThickness("5/4"), 1.25);
  assert.ok(Number.isNaN(parseThickness("abc"))); assert.ok(Number.isNaN(parseThickness("3/8")));
  const p = layoutBoardFoot({ lines: [{ thickness: "8/4", width: 6, length: 10 }] });
  assert.equal(p.boardFeet, 10);
});
test("prices: per bf on the sold size, per piece, per foot; waste and average", () => {
  const p = layoutBoardFoot({ waste: 0.1, lines: [
    { thickness: "4/4", width: 8, length: 12, count: 5, pricePerBf: 6 }, // 8 bf each = 40 bf = $240
    { thickness: 2, width: 4, length: 8, count: 10, pricePerPiece: 4.5 }, // 53.33 bf = $45
    { thickness: 1, width: 6, length: 10, pricePerFt: 1.2 }, // 5 bf = $12
  ] });
  assert.equal(p.cost, 297); assert.equal(p.costWithWaste, 326.7);
  assert.equal(p.boardFeet, 98.33);
  assert.equal(p.boardFeetToBuy, 109); // 98.333*1.1 = 108.17
  assert.ok(Math.abs(p.costPerBf - 297 / (40 + 160 / 3 + 5)) < 1e-9);
});
test("unpriced lines leave cost null; partial pricing says so", () => {
  assert.equal(layoutBoardFoot({ lines: [{ thickness: 1, width: 1, length: 12 }] }).cost, null);
  const t = boardFootText(layoutBoardFoot({ lines: [{ thickness: 1, width: 12, length: 12, pricePerBf: 5 }, { thickness: 1, width: 12, length: 12 }] })).join("\n");
  assert.match(t, /1 of 2 priced lines/);
});
test("refuses bad input", () => {
  for (const bad of [null, [], {}, { lines: [] }, { lines: [{ thickness: 0, width: 4, length: 8 }] }, { lines: [{ thickness: 2, width: "4", length: 8 }] },
    { lines: [{ thickness: 2, width: 4, length: 8, count: 1.5 }] }, { lines: [{ thickness: 2, width: 4, length: 8, pricePerBf: 1, pricePerPiece: 2 }] },
    { lines: [{ thickness: 2, width: 4, length: 8, pricePerBf: -1 }] }, { waste: 2, lines: [{ thickness: 2, width: 4, length: 8 }] }, { basis: "x", lines: [{ thickness: 2, width: 4, length: 8 }] },
    { lines: [{ thickness: 2, width: 4, length: 99 }] }]) assert.ok(validateBoardFoot(bad).length, JSON.stringify(bad));
  assert.equal(layoutBoardFoot({ lines: [] }).ok, false);
});
test("odd nominal sizes fall back to the typed size", () => {
  const p = layoutBoardFoot({ lines: [{ thickness: 2, width: 7, length: 8 }] });
  assert.equal(p.lines[0].milledBfEach, null); assert.equal(p.milledBoardFeet, p.boardFeet);
});
test("quarters-typed hardwood is never swapped for a softwood milled size", () => {
  const p = layoutBoardFoot({ basis: "actual", lines: [{ thickness: "8/4", width: 6, length: 10 }] });
  assert.equal(p.lines[0].milledBfEach, null); assert.equal(p.boardFeet, 10);
});
