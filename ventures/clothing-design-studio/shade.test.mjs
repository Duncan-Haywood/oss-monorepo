import test from "node:test";
import assert from "node:assert/strict";
import { readShift, shiftColour, fromLab, labOfHex, clipMove, nearestCatalogue, DIMS } from "./shade.mjs";
import { parseCommand } from "./commands.mjs";
import { newDesign, applyOp, History } from "./design.mjs";
import { COLOURS } from "./catalogue.mjs";
import { HELD, S } from "./eval/shade-edits.mjs";

const L = hex => labOfHex(hex)[0];
const C = hex => DIMS.C(labOfHex(hex));
const W = hex => DIMS.W(labOfHex(hex));

test("Lab to sRGB undoes sRGB to Lab on every catalogue colour", () => {
  for (const hex of Object.values(COLOURS)) {
    const back = fromLab(labOfHex(hex)).map(Math.round);
    const n = parseInt(hex.slice(1), 16);
    assert.deepEqual(back, [(n >> 16) & 255, (n >> 8) & 255, n & 255], hex);
  }
});

test("readShift: words, amounts, and the clauses it leaves alone", () => {
  assert.deepEqual(readShift("make it darker").moves, { L: -1 });
  assert.equal(readShift("make it a bit darker").amount, 0.5);
  assert.equal(readShift("make it a lot lighter").amount, 1.8);
  assert.equal(readShift("two shades darker").amount, 2);
  assert.deepEqual(readShift("tone it down").moves, { C: -1 });
  assert.deepEqual(readShift("warm it up").moves, { W: 1 });
  assert.equal(readShift("use a lighter fabric"), null, "fabric weight");
  assert.equal(readShift("when it was darker"), null, "history, read by refer.mjs");
  assert.equal(readShift("make it bigger"), null);
});

test("shiftColour moves the asked dimension the asked way and keeps the hue", () => {
  const r = shiftColour(COLOURS["royal blue"], readShift("darker"), { baseName: "royal blue" });
  assert.ok(L(r.hex) < L(COLOURS["royal blue"]) - 8);
  assert.equal(r.catalogue, false);
  assert.equal(r.name, "darker royal blue");
  assert.ok(r.nearest.name);
  const up = shiftColour(COLOURS["royal blue"], readShift("a bit lighter"));
  assert.equal(up.name, "blue", "a catalogue colour close to the target is used by name");
  assert.equal(up.catalogue, true);
});

test("a move the screen cannot show is refused, not faked", () => {
  const r = shiftColour("#000000", readShift("darker"), { baseName: "jet" });
  assert.match(r.none, /already as dark/);
  const g = shiftColour("#808080", readShift("more muted"));
  assert.ok(g.none);
});

test("clipping keeps the direction of a warmth move (royal blue made cooler stays cooler)", () => {
  const r = shiftColour(COLOURS["royal blue"], readShift("cooler"));
  assert.ok(!r.none);
  assert.ok(W(r.hex) < W(COLOURS["royal blue"]) - 2);
  const lab = labOfHex(COLOURS["royal blue"]);
  const out = clipMove(lab, [lab[0], lab[1] - 5, lab[2] - 60]);
  assert.ok(DIMS.W(out) < DIMS.W(lab));
});

test("nearestCatalogue finds a colour itself at zero", () => {
  assert.deepEqual(nearestCatalogue(COLOURS.sage), { name: "sage", deltaE: 0 });
});

test("commands: garment, ink, a named colour, and undo", () => {
  let d = applyOp(newDesign(), { op: "colour", value: "navy" });
  d = applyOp(d, { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo" });
  const h = new History(d);
  const r = parseCommand("make the halo a bit warmer", h.present, [h.present]);
  assert.equal(r.steps.length, 1);
  h.apply(r.steps[0].ops);
  assert.ok(W(h.present.placements[0].ink) > W(d.placements[0].ink));
  assert.equal(h.present.colour, d.colour);
  h.undo();
  assert.deepEqual(h.present, d);
  const g = parseCommand("make it a darker green", d).steps[0].ops[0];
  assert.equal(g.op, "colour");
  assert.ok(L(g.value) < L(COLOURS.green));
  const none = parseCommand("make the text lighter", d).steps[0];
  assert.deepEqual(none.ops, []);
  assert.match(none.did, /no text/);
  const declined = parseCommand("don't make it darker", d);
  assert.equal(declined.steps.length, 0);
});

test("the eval's sets all pass (held out first run 13 of 14, see eval/shade-edits-2026-11-19.md)", () => {
  for (const [text, check, from] of [...HELD, ...S]) {
    const start = from ?? null;
    let d = start ?? applyOp(applyOp(newDesign({ name: "Halo tee" }), { op: "colour", value: "royal blue" }), { op: "add", kind: "motif", motif: "halo", label: "Sunburst halo", w: 12 });
    const h = new History(d);
    const r = parseCommand(text, h.present, [h.present]);
    for (const s of r.steps) if (s.ops.length) h.apply(s.ops);
    assert.ok(check({ d: h.present, r }), text);
  }
});
