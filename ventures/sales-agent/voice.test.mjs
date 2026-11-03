import test from "node:test";
import assert from "node:assert/strict";
import { dictationToLines, appendDictation, speakable } from "./voice.mjs";

test("dictation splits on spoken line commands and capitalises", () => {
  assert.deepEqual(dictationToLines("they lose about six hours a week on routing next point I will send the pricing sheet new line next call on Thursday"),
    ["They lose about six hours a week on routing.", "I will send the pricing sheet.", "Next call on Thursday."]);
});
test("spoken punctuation becomes marks, and existing marks are kept", () => {
  assert.deepEqual(dictationToLines("budget is set comma but not approved period new line who signs off question mark"), ["Budget is set, but not approved.", "Who signs off?"]);
});
test("empty or blank speech adds nothing", () => {
  assert.deepEqual(dictationToLines("  "), []);
  assert.equal(appendDictation("keep this", ""), "keep this");
});
test("appending keeps earlier notes and puts each new point on its own line", () => {
  assert.equal(appendDictation("First point.\n", "second point next point third point"), "First point.\nSecond point.\nThird point.");
  assert.equal(appendDictation("", "only one"), "Only one.");
});
test("a dictated 'I will send' line still becomes a promise in the follow-up", async () => {
  const { runFollowUp } = await import("./followup.mjs");
  const notes = appendDictation("", "they lose six hours a week next point I will send the pricing sheet");
  const f = runFollowUp({ email: "dana@example.com", prospects: "email,name,company,status\ndana@example.com,Dana,Acme,interested\n", notes, offer: { name: "Sam", company: "RouteCo" }, today: "2026-11-01" });
  assert.ok(f.draft && /pricing sheet/i.test(f.draft.body), JSON.stringify(f).slice(0, 400));
});
test("speakable drops markup and spells out addresses and links", () => {
  const s = speakable("## Brief\n- **Need**: manual routing | dana@acme.example\n> stop warning\nSee https://x.example/a");
  assert.equal(s, "Brief\nNeed: manual routing , dana at acme dot example\nstop warning\nSee a link");
});
