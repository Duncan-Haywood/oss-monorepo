import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, clauses, wordsToNumbers, EXAMPLES } from "./commands.mjs";
import { newDesign, History } from "./design.mjs";
import { COLOURS } from "./catalogue.mjs";

const ops = (text, design = newDesign()) => parseCommand(text, design).steps.flatMap(s => s.ops);
const ui = text => parseCommand(text, newDesign()).steps.flatMap(s => s.ui);

test("every example on the page is understood in full", () => {
  for (const e of EXAMPLES) {
    const r = parseCommand(e, newDesign());
    assert.equal(r.unmatched.length, 0, `${e}: ${r.unmatched}`);
    assert.ok(r.steps.length > 0, e);
  }
});

test("garment colour vs ink colour", () => {
  assert.deepEqual(ops("make the shirt navy"), [{ op: "colour", value: "navy" }]);
  assert.deepEqual(ops("make it off white"), [{ op: "colour", value: "off white" }]);
  assert.deepEqual(ops("make the text gold"), [{ op: "ink", value: "gold" }]);
});

test("garment changes need a verb, so a colour change on 'the shirt' stays a colour change", () => {
  assert.deepEqual(ops("switch to a hoodie"), [{ op: "garment", value: "hoodie" }]);
  assert.deepEqual(ops("make it a crewneck"), [{ op: "garment", value: "crewneck" }]);
  assert.deepEqual(ops("make it a long sleeve"), [{ op: "garment", value: "longsleeve" }]);
  assert.ok(!ops("make the shirt black").some(o => o.op === "garment"));
});

test("moves use centimetres, inches and rough words; up is negative y", () => {
  assert.deepEqual(ops("move the print up a bit"), [{ op: "move", dx: 0, dy: -1 }]);
  assert.deepEqual(ops("move it left 3 cm"), [{ op: "move", dx: -3, dy: 0 }]);
  assert.deepEqual(ops("move it down 2 inches"), [{ op: "move", dx: 0, dy: 5.1 }]);
  assert.deepEqual(ops("move it right a lot"), [{ op: "move", dx: 5, dy: 0 }]);
});

test("'left chest' is a placement, not a direction", () => {
  assert.deepEqual(ops("put it on the left chest"), [{ op: "area", value: "chest" }]);
});

test("sizes and rotation", () => {
  assert.deepEqual(ops("make it 20% bigger"), [{ op: "scale", factor: 1.2 }]);
  assert.deepEqual(ops("a bit smaller"), [{ op: "scale", factor: 0.93 }]);
  assert.deepEqual(ops("make it 12 cm wide"), [{ op: "width", value: 12 }]);
  assert.deepEqual(ops("as big as possible"), [{ op: "fill" }]);
  assert.deepEqual(ops("rotate it 15 degrees left"), [{ op: "rotate", deg: -15 }]);
});

test("decoration methods, including the raised '3D' ones", () => {
  assert.deepEqual(ops("embroider it in 3D"), [{ op: "method", value: "3d-puff-embroidery" }]);
  assert.deepEqual(ops("embroider it"), [{ op: "method", value: "embroidery" }]);
  assert.deepEqual(ops("make it a raised 3d print"), [{ op: "method", value: "high-density" }]);
  assert.deepEqual(ops("use puff print"), [{ op: "method", value: "puff" }]);
  assert.deepEqual(ops("sublimate it"), [{ op: "method", value: "sublimation" }]);
  assert.deepEqual(ops("screen print it in 3 colours"), [{ op: "method", value: "screen" }, { op: "inkColours", value: 3 }]);
});

test("fabric and weight", () => {
  assert.deepEqual(ops("use heavyweight cotton, 300 gsm"), [{ op: "fabric", value: "heavyweight-cotton" }, { op: "gsm", value: 300 }]);
  assert.deepEqual(ops("change the fabric to organic cotton"), [{ op: "fabric", value: "organic-cotton" }]);
  assert.deepEqual(ops("use linen"), [{ op: "fabric", value: "linen" }]);
});

test("adding text keeps the quoted words and their case; adding motifs", () => {
  const o = ops('add the text "Ave Maria" in gold');
  assert.deepEqual(o, [{ op: "add", kind: "text", text: "Ave Maria", area: undefined, ink: COLOURS.gold }]);
  const m = ops("add a halo on the back");
  assert.equal(m[0].motif, "halo");
  assert.equal(m[0].area, "back");
  assert.equal(ops("add angel wings")[0].motif, "wings");
});

test("numbers spoken as words, decimals kept whole", () => {
  assert.equal(wordsToNumbers("two hundred and fifty pieces"), "250 pieces");
  assert.deepEqual(ops("i want two hundred and fifty pieces"), [{ op: "quantity", value: 250 }]);
  assert.deepEqual(ops("price it at 39.99"), [{ op: "price", value: 39.99 }]);
  assert.deepEqual(ops("make 150 pieces and sell them for 55 euros"), [{ op: "quantity", value: 150 }, { op: "price", value: 55 }]);
});

test("comparison, history and export are page actions", () => {
  assert.deepEqual(ui("show me three versions"), [{ ui: "variants" }]);
  assert.deepEqual(ui("go with the third one"), [{ ui: "pick", index: 3 }]);
  assert.deepEqual(ui("pick option two"), [{ ui: "pick", index: 2 }]);
  assert.deepEqual(ui("undo"), [{ ui: "undo" }]);
  assert.deepEqual(ui("download the tech pack"), [{ ui: "techpack" }]);
});

test("unknown words are reported, not guessed", () => {
  const r = parseCommand("frobnicate the vibes", newDesign());
  assert.equal(r.steps.length, 0);
  assert.deepEqual(r.unmatched, ["frobnicate the vibes"]);
});

test("clauses split on and/then/commas but not inside quotes or decimals", () => {
  assert.deepEqual(clauses('add the text "salt and light" then make it 12.5 cm wide'), ['add the text "salt and light"', "make it 12.5 cm wide"]);
});

test("a spoken sentence drives a design end to end", () => {
  const h = new History(newDesign());
  for (const s of parseCommand("make it cream, add a halo, embroider it in 3D and move it up 2 cm", h.present).steps) h.apply(s.ops);
  const d = h.present;
  assert.equal(d.colour, COLOURS.cream);
  assert.equal(d.placements.length, 1);
  assert.equal(d.placements[0].method, "3d-puff-embroidery");
  assert.equal(d.placements[0].y, -2);
});
