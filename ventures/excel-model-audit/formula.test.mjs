import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, shiftFormula, signature, annotate } from "./formula.mjs";

const types = (f) => tokenize(f).filter((t) => t.type !== "ws").map((t) => `${t.type}:${t.text}`);

test("references in every written form are recognised", () => {
  assert.deepEqual(types("SUM($B$2:B9)"), ["func:SUM", "open:(", "ref:$B$2:B9", "close:)"]);
  assert.deepEqual(types("'My Sheet'!A1+Data!B:B+3:3"), ["ref:'My Sheet'!A1", "op:+", "ref:Data!B:B", "op:+", "ref:3:3"]);
  assert.deepEqual(types("[1]Prices!$C$4"), ["ref:[1]Prices!$C$4"]);
  assert.deepEqual(types("Jan:Dec!B5"), ["ref:Jan:Dec!B5"]);
  assert.deepEqual(types("Sheet1!#REF!*2"), ["ref:Sheet1!#REF!", "op:*", "num:2"]);
});

test("names, functions, structured references, strings and errors are not references", () => {
  assert.deepEqual(types('LOG10(A1)&"B2"'), ["func:LOG10", "open:(", "ref:A1", "close:)", "op:&", 'str:"B2"']);
  assert.deepEqual(types("TaxRate*Table1[@Price]"), ["name:TaxRate", "op:*", "structref:Table1[@Price]"]);
  assert.deepEqual(types("IFERROR(A1,#N/A)"), ["func:IFERROR", "open:(", "ref:A1", "sep:,", "err:#N/A", "close:)"]);
  assert.deepEqual(types("A1:INDEX(B:B,3)"), ["ref:A1", "op::", "func:INDEX", "open:(", "ref:B:B", "sep:,", "num:3", "close:)"]);
  // XFD is the last column; XFE1 is past it, so it can only be a name.
  assert.deepEqual(types("XFD1+XFE1"), ["ref:XFD1", "op:+", "name:XFE1"]);
  assert.equal(tokenize("_xlfn.XLOOKUP(A1,B:B,C:C)")[0].name, "XLOOKUP");
});

test("copying a formula moves relative parts only, as Excel's fill does", () => {
  // Hand check: =B2*$C$1+B$3 filled one right and two down is =C4*$C$1+C$3.
  assert.equal(shiftFormula("B2*$C$1+B$3", 2, 1), "C4*$C$1+C$3");
  assert.equal(shiftFormula("SUM(A:A)+SUM(2:2)", 1, 1), "SUM(B:B)+SUM(3:3)");
  assert.equal(shiftFormula("'Q 1'!A1", 0, 1), "'Q 1'!B1");
  assert.equal(shiftFormula("A1", -1, 0), "#REF!");
});

test("R1C1 signatures are equal exactly for copies", () => {
  const sig = (f, r, c) => signature(tokenize(f), r, c).sig;
  assert.equal(sig("B2*B3", 4, 2), sig("C2*C3", 4, 3));
  assert.notEqual(sig("B2*B3", 4, 2), sig("C2*B3", 4, 3));
  assert.equal(signature(tokenize("C2*B3"), 4, 3).shape, signature(tokenize("C2*C3"), 4, 3).shape);
  assert.equal(sig("$A$1+1", 5, 5), sig("$A$1+1", 9, 2));
});

test("each literal knows the function argument it sits in", () => {
  const nums = annotate(tokenize("ROUND(A1*1.2,2)")).filter((a) => a.tok.type === "num").map((a) => [a.tok.text, a.func, a.arg]);
  assert.deepEqual(nums, [["1.2", "ROUND", 0], ["2", "ROUND", 1]]);
});
