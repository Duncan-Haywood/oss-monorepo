import test from "node:test";
import assert from "node:assert/strict";
import { splitNegations } from "./negation.mjs";
import { parseCommand } from "./commands.mjs";
import { listen } from "./guide.mjs";

test("a negated stretch is cut to the end of its clause and listed", () => {
  const r = splitNegations("make it white not black, and bigger");
  assert.equal(r.kept.replace(/\s+/g, " ").trim(), "make it white , and bigger");
  assert.deepEqual(r.negated, [{ cue: "not", words: "black" }]);
  assert.equal(r.kept.length, "make it white not black, and bigger".length);
});
test("stop words end the stretch; two-word cues read as one", () => {
  assert.deepEqual(splitNegations("not black but cream").negated, [{ cue: "not", words: "black" }]);
  assert.deepEqual(splitNegations("a hoodie instead of a tee").negated, [{ cue: "instead of", words: "a tee" }]);
  assert.deepEqual(splitNegations("don't make it bigger").negated, [{ cue: "don't", words: "make it bigger" }]);
  assert.equal(splitNegations("no print on the back of the hoodie").negated[0].words.split(" ").length, 4);
});
test("quoted text and false friends are left alone", () => {
  for (const s of ['add the text "No Fear"', "not just for men", "no more than 3 colours", "never mind", "not sure", "nothing else"]) {
    assert.deepEqual(splitNegations(s).negated, [], s);
  }
  assert.equal(splitNegations('write "never again" not in red').negated[0].words, "in red");
});
test("a bare no is dropped without cutting anything else", () => {
  const r = splitNegations("no");
  assert.deepEqual(r.negated, []); assert.equal(r.kept.trim(), "");
});
test("studio: a negated command is declined, never applied", () => {
  const r = parseCommand("don't make it bigger");
  assert.deepEqual(r.steps, []); assert.deepEqual(r.unmatched, []);
  assert.deepEqual(r.declined, [{ words: "don't make it bigger", cue: "don't" }]);
  const s = parseCommand("no embroidery, screen print it");
  assert.deepEqual(s.steps.flatMap(x => x.ops), [{ op: "method", value: "screen" }]);
  assert.equal(parseCommand("not black, make it cream").steps.flatMap(x => x.ops).map(o => o.value).join(), "cream");
  assert.deepEqual(parseCommand("call it Not Today").steps[0].ops, [{ op: "name", value: "Not Today" }]);
});
test("wardrobe: turning down the current answer undoes it and asks again", () => {
  let r = listen("luxury minimal");
  assert.equal(r.profile.tier, "luxury"); assert.ok(!r.askFields.includes("tier"));
  r = listen("not luxury", r.profile, r);
  assert.equal(r.profile.tier, "premium"); assert.ok(r.askFields.includes("tier"));
  assert.deepEqual(r.declined.map(d => [d.field, d.value]), [["tier", "luxury"]]);
  assert.equal(r.profile.style, "minimal");
});
test("wardrobe: a declined occasion comes off the list; all of them falls back and asks", () => {
  assert.deepEqual(listen("not office, weekends").profile.occasions, ["casual"]);
  const r = listen("no evenings", { ...listen("").profile, occasions: ["evening"] }, { answered: ["occasions"] });
  assert.ok(!r.profile.occasions.includes("evening") && r.profile.occasions.length);
  assert.ok(r.askFields.includes("occasions"));
});
test("wardrobe: skip or not sure keeps the answer and moves on", () => {
  let r = listen("luxury minimal");
  assert.equal(r.pending, "ageBand");
  r = listen("not sure", r.profile, r);
  assert.equal(r.profile.ageBand, "25-34"); assert.equal(r.pending, "fit");
  assert.ok(r.heard.some(h => h.field === "ageBand" && h.kept));
  r = listen("skip", r.profile, r);
  assert.ok(!r.askFields.includes("fit"));
});
test("wardrobe: men and women said apart is unisex", () => {
  assert.equal(listen("not just for men, women too").profile.fit, "unisex");
  assert.equal(listen("not for men").profile.fit, "unisex");
});
