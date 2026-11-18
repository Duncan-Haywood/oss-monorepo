import test from "node:test";
import assert from "node:assert/strict";
import { eprFee, LINES } from "./eprfr.mjs";

test("hand-worked: 1000 men's tees at 0.0396 = 39.60 detailed, 527.10 simplified", () => {
  const r = eprFee({ rows: [{ line: "tee-men", units: 1000 }] });
  assert.equal(r.detailed, 39.6); assert.equal(r.simplified, 527.1); assert.equal(r.best, "detailed"); assert.equal(r.saving, 487.5);
});
test("overrides win over the typed line rate and a custom line works", () => {
  const r = eprFee({ rows: [{ line: "tee-men", units: 100, eurPerPiece: 0.1 }, { line: "custom", units: 50, eurPerPiece: 0.2 }], simplifiedEur: 0.05 });
  assert.equal(r.detailed, 20); assert.equal(r.simplified, 7.5); assert.equal(r.best, "simplified"); assert.equal(r.pieces, 150);
});
test("share of landed cost note", () => {
  const r = eprFee({ rows: [{ line: "tee-men", units: 100 }], landedPerPiece: 12 });
  assert.match(r.notes[0], /0\.0396 EUR a piece, 0\.33%/);
});
test("bad input is refused, not thrown", () => {
  assert.equal(eprFee({ rows: [] }).ok, false);
  assert.match(eprFee({ rows: [{ line: "tee-men", units: -1 }] }).error, /pieces/);
  assert.match(eprFee({ rows: [{ line: "nope", units: 1 }] }).error, /pick a line/);
  assert.equal(eprFee({ rows: [{ line: "tee-men", units: "abc" }] }).ok, false);
  assert.equal(eprFee({ rows: [{ line: "tee-men", units: 1 }], simplifiedEur: NaN }).ok, false);
});
test("every typed line has a positive rate and a source", () => {
  for (const l of Object.values(LINES)) { assert.ok(l.eur > 0); assert.ok(l.source); }
});
