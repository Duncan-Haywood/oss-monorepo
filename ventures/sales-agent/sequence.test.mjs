import test from "node:test";
import assert from "node:assert/strict";
import { checkSequence, newWordShare } from "./sequence.mjs";

const foot = "\n\nIf this is not for you, reply stop and I won't write again.\nSam Lee, Brightline Ltd, 221 Baker Street, Springfield 62704";
const s1 = { day: 0, subject: "Quick question about Acme's onboarding", body: "Hi Dana,\n\nI'm Sam at Brightline. Your team hires field staff; how do you track onboarding paperwork?" + foot };
const s2 = { day: 4, subject: "A smaller ask on onboarding", body: "Dana, one concrete thing: crews that moved paperwork to a phone checklist cut first-week delays at two builders I work with. Would a ten minute look at your form help you?" + foot };
const opts = { country: "US", fromName: "Sam Lee" };
const rules = (r) => [...r.errors, ...r.warnings].map((x) => x.rule);

test("a spaced two-step sequence with new content passes", () => {
  const r = checkSequence([s1, s2], opts);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.touches, 2);
  assert.equal(r.spanDays, 4);
});
test("a follow-up without opt-out or address is an error on that step", () => {
  const r = checkSequence([s1, { ...s2, body: "Dana, what do you think of my idea about your onboarding forms? Worth a look?" }], opts);
  assert.ok(r.errors.some((x) => x.step === 2 && x.rule === "opt-out"));
  assert.equal(r.ok, false);
});
test("a bare bump is flagged", () => {
  const r = checkSequence([s1, { ...s2, body: "Hi Dana, just bumping this to the top of your inbox. Any thoughts?" + foot }], opts);
  assert.ok(rules(r).includes("bump-only"));
});
test("an almost identical follow-up is flagged as a repeat", () => {
  const r = checkSequence([s1, { ...s1, day: 5 }], opts);
  assert.ok(rules(r).includes("repeat"));
});
test("spacing: too close and too far both warn; non-increasing days are an error", () => {
  assert.ok(checkSequence([s1, { ...s2, day: 1 }], opts).warnings.some((x) => x.rule === "spacing"));
  assert.ok(checkSequence([s1, { ...s2, day: 40 }], opts).warnings.some((x) => x.rule === "spacing"));
  assert.ok(checkSequence([s1, { ...s2, day: 0 }], opts).errors.some((x) => x.rule === "order"));
});
test("more than the maximum touches warns", () => {
  const many = [0, 4, 9, 15, 22].map((d, i) => ({ ...s2, day: d, subject: "Step " + i, body: s2.body + " " + "alpha beta gamma delta epsilon zeta".split(" ")[i] + " widget" + i }));
  assert.ok(checkSequence(many, opts).warnings.some((x) => x.rule === "touches"));
});
test("same subject on a later step warns; missing day is noted, not fatal", () => {
  assert.ok(checkSequence([s1, { ...s2, subject: s1.subject }], opts).warnings.some((x) => x.rule === "same-subject"));
  const r = checkSequence([s1, { ...s2, day: undefined }], opts);
  assert.ok(r.warnings.some((x) => x.rule === "timing"));
});
test("empty or non-array input fails cleanly", () => {
  assert.equal(checkSequence([]).ok, false);
  assert.equal(checkSequence(null).ok, false);
});
test("newWordShare", () => {
  assert.equal(newWordShare("alpha beta gamma", "alpha beta gamma"), 0);
  assert.equal(newWordShare("alpha", "delta epsilon"), 1);
  assert.equal(newWordShare("x", ""), 0);
});
