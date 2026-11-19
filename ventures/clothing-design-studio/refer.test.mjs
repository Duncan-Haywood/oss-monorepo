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

// ------------------------------------------------ a whole earlier version
import { describedVersion, versionFeatures } from "./refer.mjs";
import { session as haloSession } from "./eval/whole-versions.mjs";

const wline = () => { const h = haloSession(); return [...h.past, h.present]; };

test("whole versions: the one with / without something restores that version", () => {
  const l = wline();
  assert.deepEqual(resolveReference("the one with the halo", l, parseClause).ui, [{ ui: "restore", index: 2 }]);
  assert.deepEqual(resolveReference("the one without the text", l, parseClause).ui, [{ ui: "restore", index: 1 }]);
  assert.deepEqual(resolveReference("the tee with the wings", l, parseClause).ui, [{ ui: "restore", index: 4 }]);
  assert.deepEqual(resolveReference("revert to the version with the halo on the front", l, parseClause).ui, [{ ui: "restore", index: 2 }]);
  assert.equal(resolveReference("the version with the halo on the back", l, parseClause).ui.length, 0, "the halo was never on the back");
});

test("whole versions: before a change", () => {
  const l = wline();
  assert.deepEqual(resolveReference("before I added the wings", l, parseClause).ui, [{ ui: "restore", index: 3 }]);
  assert.deepEqual(resolveReference("the one before we made it navy", l, parseClause).ui, [{ ui: "restore", index: 5 }]);
  assert.match(resolveReference("before the text", l, parseClause).did, /Back to the version before the text/);
});

test("whole versions: nothing changes when the present already matches or nothing did", () => {
  const l = wline();
  const has = resolveReference("the one with the wings", l, parseClause);
  assert.deepEqual([has.ops, has.ui], [[], []]);
  assert.match(has.did, /already has the angel wings/);
  assert.match(resolveReference("the one with the crown", l, parseClause).did, /No earlier version/);
  assert.equal(describedVersion("the other one", l), null, "no description: left to the older rules");
  assert.equal(describedVersion("back to the cream one", l), null, "a value, not a version: restores the colour only");
});

test("whole versions: parseCommand no longer adds a second halo", () => {
  const h = haloSession();
  const r = parseCommand("the one with the halo", h.present, [...h.past, h.present]);
  assert.equal(r.steps.length, 1);
  assert.deepEqual(r.steps[0].ops, []);
  assert.deepEqual(r.steps[0].ui, [{ ui: "restore", index: 2 }]);
  assert.deepEqual(parseCommand("when it still had the halo", h.present, [...h.past, h.present]).steps[0].ui, [{ ui: "restore", index: 2 }]);
  assert.equal(parseCommand("when it still had the halo?", h.present, [...h.past, h.present]).questions.length, 1, "with ? it is asked");
  assert.equal(parseCommand("add a halo", h.present).steps[0].ops[0].op, "add");
});

test("versionFeatures reads what is and is not there", () => {
  const f = versionFeatures("where it was a cream tee with the wings on the back without any text");
  assert.ok(f.some(x => x.motif === "wings" && x.area === "back"));
  assert.ok(f.some(x => x.garment === "tee"));
  assert.ok(f.some(x => x.colour === "cream"));
  assert.ok(f.some(x => x.kind === "text" && x.absent));
});

// ------------------------------------------------- versions by comparison
import { comparedVersion } from "./refer.mjs";

function sizeSession() {
  let d = applyOp(newDesign(), { op: "add", kind: "motif", motif: "halo", label: "Halo", method: "high-density", colours: 1, w: 12 });
  const h = new History(d);
  h.apply([{ op: "width", value: 20 }]);            // 1
  h.apply([{ op: "colour", value: "cream" }]);      // 2
  h.apply([{ op: "move", dy: -4 }]);                // 3
  h.apply([{ op: "price", value: 55 }]);            // 4
  h.apply([{ op: "width", value: 9 }]);             // 5
  h.apply([{ op: "gsm", value: 180 }]);             // 6
  h.apply([{ op: "price", value: 39 }]);            // 7, the present
  return h;
}

test("compared versions: the latest earlier version that compared that way, restored whole", () => {
  const l = line(sizeSession());
  const at = t => comparedVersion(t, l)?.ui?.[0]?.index;
  assert.equal(at("the one where the halo was bigger"), 4);
  assert.equal(at("the version with the larger halo"), 4);
  assert.equal(at("the one where the halo was lower"), 2);
  assert.equal(at("when it was more expensive"), 6);
  assert.equal(at("when the shirt cost more"), 6);
  assert.equal(at("the one where the fabric was heavier"), 5);
  assert.equal(at("the most expensive version"), 6, "superlative: latest of the equal extremes");
  assert.equal(at("the one where the halo was biggest"), 4);
  assert.match(comparedVersion("the one where the halo was bigger", l).did, /20 cm wide; now 9 cm wide/);
});

test("compared versions: nothing changes when no version compared that way", () => {
  const l = line(sizeSession());
  for (const t of ["the one where the halo was smaller", "the cheapest one", "the version where the print was higher", "the one with the lighter fabric"]) {
    const r = comparedVersion(t, l);
    assert.ok(r, t);
    assert.deepEqual([r.ops, r.ui], [[], []], t);
    assert.match(r.did, /nothing changed/, t);
  }
  assert.match(comparedVersion("the one where the wings were bigger", l).did, /No version in this session had the angel wings/);
});

test("compared versions: edits and variant picks stay edits", () => {
  const l = line(sizeSession());
  for (const t of ["make it bigger", "make the halo higher", "the bigger the better", "go with the bigger one", "the bigger one", "the one with the halo"]) {
    assert.equal(comparedVersion(t, l), null, t);
  }
  const h = sizeSession();
  assert.equal(parseCommand("when was the halo bigger?", h.present, l).questions.length, 1, "asked with question order and ?");
  const r = parseCommand("the one where the price was higher", h.present, l);
  assert.deepEqual(r.steps[0].ui, [{ ui: "restore", index: 6 }]);
  assert.deepEqual(r.steps[0].ops, [], "before: moved the print up and set the price to 1");
});

test("raising the price does not move the artwork", () => {
  const h = sizeSession();
  for (const t of ["raise the price", "the price is higher than I want", "lower the run"]) {
    const r = parseCommand(t, h.present);
    assert.ok(!r.steps.some(s => s.ops.some(o => o.op === "move")), t);
  }
  assert.equal(parseCommand("move it up", h.present).steps[0].ops[0].op, "move");
  assert.equal(parseCommand("raise the print a bit", h.present).steps[0].ops[0].op, "move");
});

test("colour comparisons: the eval's dev and held-out sets all read right", async () => {
  const ev = await import("./eval/colour-versions.mjs");
  const h0 = ev.session();
  const LINE = [...h0.past, h0.present];
  for (const [text, check, want] of [...ev.S, ...ev.HELD]) {
    const h = ev.session();
    const r = parseCommand(text, h.present, [...h.past, h.present]);
    for (const step of r.steps) {
      for (const u of step.ui) {
        if (u.ui === "undo") for (let i = 0; i < (u.count ?? 1); i++) h.undo();
        else if (u.ui === "restore") h.replace(LINE[u.index]);
      }
      if (step.ops.length) h.apply(step.ops);
    }
    assert.ok(check({ d: h.present, r, h }), `${text}: want ${want}`);
  }
});

test("colour comparisons: lightness, vividness and warmth with the colour named", async () => {
  const ev = await import("./eval/colour-versions.mjs");
  const h = ev.session();
  const l = [...h.past, h.present];
  assert.match(comparedVersion("when it was darker", l).did, /lightness .*9\.8, black; now 17\.3, navy/);
  assert.match(comparedVersion("the one where the halo was duller", l).did, /ink vividness .*navy; now 63\.8, red/);
  // "the lighter one" and "the lighter fabric" stay fabric weight; "make it darker" is an edit.
  assert.match(comparedVersion("the lighter one", l).did, /fabric/);
  assert.match(comparedVersion("the one with the lighter fabric", l).did, /fabric/);
  assert.equal(comparedVersion("make it darker", l), null);
  assert.equal(comparedVersion("when the price was darker", l), null);
});

test("colour comparisons: an uploaded image has no ink to compare", () => {
  let d = newDesign({ name: "Image tee" });
  d = applyOp(d, { op: "add", kind: "image", src: "data:image/png;base64,AA", label: "Painting", w: 20 });
  const h = new History(d);
  h.apply([{ op: "colour", value: "cream" }]);
  const r = comparedVersion("when the print was darker", [...h.past, h.present]);
  assert.deepEqual([r.ops, r.ui], [[], []]);
  assert.match(r.did, /own colours/);
});
