import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, alternatives } from "./answers.mjs";
import { parseCommand, parseClause } from "./commands.mjs";
import { newDesign, applyOp } from "./design.mjs";
import { unitCost } from "./costing.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";

const design = applyOp(newDesign(), { op: "add", kind: "motif", motif: "halo", label: "Halo", method: "screen", colours: 2, w: 20 });
const ask = t => parseCommand(t, design).questions[0];

test("alternatives: one per chunk of the question", () => {
  const a = alternatives("which is cheaper, dtg or screen print", design, parseClause);
  assert.deepEqual(a.map(x => x.ops[0]), [{ op: "method", value: "dtg" }, { op: "method", value: "screen" }]);
});

test("cost answers match the costing of the changed design, and change nothing", () => {
  const before = JSON.stringify(design);
  const r = answerQuestion(ask("is embroidery more expensive?"), design, { parse: parseClause, sheet: EXAMPLE_SUPPLIER });
  const want = unitCost(applyOp(design, { op: "method", value: "embroidery" }), EXAMPLE_SUPPLIER).landed;
  assert.equal(r.rows.length, 1);
  assert.ok(Math.abs(r.rows[0].landed - want) < 1e-9);
  assert.ok(Math.abs(r.rows[0].diff - (want - unitCost(design, EXAMPLE_SUPPLIER).landed)) < 1e-9);
  assert.match(r.text, /nothing was changed/);
  assert.equal(JSON.stringify(design), before);
});

test("which is cheaper names the cheapest alternative", () => {
  const r = answerQuestion(ask("which is cheaper, dtg or screen print?"), design, { parse: parseClause, sheet: EXAMPLE_SUPPLIER });
  const cheapest = r.rows.reduce((a, b) => (b.landed < a.landed ? b : a));
  assert.match(r.text, new RegExp(`Cheapest of those: ${cheapest.label}`));
});

test("other topics: colours, fabric and method pairing, lead time", () => {
  assert.match(answerQuestion(ask("what colours do you have"), design, { parse: parseClause }).text, /sage/);
  assert.match(answerQuestion(ask("does fleece work with embroidery?"), design, { parse: parseClause }).text, /^Embroidery on brushed fleece/);
  assert.match(answerQuestion(ask("how long does embroidery take"), design, { parse: parseClause }).text, /timeline\.html/);
  assert.match(answerQuestion({ words: "who designed this", topic: null }, design, { parse: parseClause }).text, /nothing was changed/);
});
