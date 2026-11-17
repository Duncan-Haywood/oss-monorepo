import { test } from "node:test";
import assert from "node:assert/strict";
import { readQuestion, resolveReference, changedAttributes } from "./refer.mjs";
import { parseCommand, parseClause } from "./commands.mjs";
import { newDesign, applyOp, History } from "./design.mjs";

function session() {
  let d = applyOp(newDesign(), { op: "add", kind: "motif", motif: "halo", label: "Halo", method: "high-density", colours: 1, w: 12 });
  const h = new History(d);
  h.apply([{ op: "colour", value: "cream" }]);
  h.apply([{ op: "garment", value: "hoodie" }]);
  h.apply([{ op: "colour", value: "navy" }]);
  h.apply([{ op: "method", value: "screen" }]);
  return h;
}
const line = h => [...h.past, h.present];

test("questions: suggestions are tried, information questions are not orders", () => {
  assert.deepEqual(readQuestion("isn't navy better"), { kind: "suggest", body: "navy" });
  assert.deepEqual(readQuestion("what about a hoodie"), { kind: "suggest", body: "a hoodie" });
  assert.deepEqual(readQuestion("wouldn't it look better in sage"), { kind: "suggest", body: "sage" });
  assert.deepEqual(readQuestion("could we make it bigger"), { kind: "suggest", body: "make it bigger" });
  assert.equal(readQuestion("is embroidery more expensive").kind, "ask");
  assert.equal(readQuestion("is embroidery more expensive").topic, "cost");
  assert.equal(readQuestion("make it navy"), null);
  assert.equal(readQuestion("can you make it navy"), null, "polite order");
  assert.equal(readQuestion("do it in navy"), null, "imperative do");
  assert.equal(readQuestion("maybe make the whole thing a bit bigger and move it"), null, "a long hedged order without ? is an order");
  assert.equal(readQuestion("navy", true).kind, "ask", "a bare word with ? is asked, not ordered");
});

test("parseCommand: an information question changes nothing and is listed", () => {
  const r = parseCommand("is embroidery more expensive?");
  assert.equal(r.steps.length, 0);
  assert.deepEqual(r.questions, [{ words: "is embroidery more expensive", topic: "cost" }]);
  const w = parseCommand("which is cheaper, dtg or screen print?");
  assert.equal(w.steps.length, 0);
  assert.equal(w.questions.length, 1, "the comma inside the question does not split it");
  assert.match(w.questions[0].words, /dtg or screen print/);
});

test("parseCommand: a suggestion is applied and marked", () => {
  const r = parseCommand("isn't navy better?");
  assert.deepEqual(r.steps[0].ops, [{ op: "colour", value: "navy" }]);
  assert.equal(r.steps[0].suggested, true);
  assert.equal(r.declined.length, 0, "isn't is not a refusal here");
});

test("references: go back to a named value keeps the rest of the design", () => {
  const h = session();
  const r = resolveReference("go back to the cream", line(h), parseClause);
  assert.deepEqual(r.ops, [{ op: "colour", value: "cream" }]);
  assert.match(r.did, /2 changes ago/);
  assert.match(resolveReference("back to the purple", line(h), parseClause).did, /not seen earlier/);
});

test("references: previous and original attribute values", () => {
  const h = session();
  const prev = resolveReference("the previous colour", line(h), parseClause);
  assert.deepEqual(prev.ops, [{ op: "colour", value: h.past[1].colour, name: "cream" }]);
  const orig = resolveReference("go back to the original colour", line(h), parseClause);
  assert.equal(orig.ops[0].name, "black");
  const m = resolveReference("the previous method", line(h), parseClause);
  assert.deepEqual(m.ops, [{ op: "select", id: 1 }, { op: "method", value: "high-density" }]);
  assert.equal(resolveReference("the old position was too high", line(h), parseClause), null, "a complaint, not a request");
  assert.match(resolveReference("the previous size", line(h), parseClause).did, /has not changed/);
});

test("references: the other one reverts only what the last change touched", () => {
  const h = session();
  assert.deepEqual(changedAttributes(h.past.at(-1), h.present).map(a => a.key), ["method"]);
  const r = resolveReference("the other one", line(h), parseClause);
  assert.deepEqual(r.ops, [{ op: "select", id: 1 }, { op: "method", value: "high-density" }]);
});

test("references: undo counts and the first version", () => {
  const h = session();
  assert.deepEqual(resolveReference("undo the last two", line(h), parseClause).ui, [{ ui: "undo", count: 2 }]);
  assert.deepEqual(resolveReference("undo twice", line(h), parseClause).ui, [{ ui: "undo", count: 2 }]);
  assert.deepEqual(resolveReference("go back 3 steps", line(h), parseClause).ui, [{ ui: "undo", count: 3 }]);
  assert.deepEqual(resolveReference("start over", line(h), parseClause).ui, [{ ui: "restore", index: 0 }]);
  assert.equal(resolveReference("go back", line(h), parseClause), null, "plain undo stays with the parser");
  assert.deepEqual(parseCommand("go back", h.present, line(h)).steps[0].ui, [{ ui: "undo" }]);
});

test("parseCommand with a timeline: the restored state is what the words asked for", () => {
  const h = session();
  for (const step of parseCommand("go back to the cream and the previous method", h.present, line(h)).steps) h.apply(step.ops);
  assert.equal(h.present.colourName, "cream");
  assert.equal(h.present.garment, "hoodie");
  assert.equal(h.present.placements[0].method, "high-density");
});
