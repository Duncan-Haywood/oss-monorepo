import { test } from "node:test";
import assert from "node:assert/strict";
import { findSlots, describeSlot } from "./slots.mjs";
import { triage, draftReply, SAMPLE_OFFER } from "./engine.mjs";
const T = "2026-10-21"; // Wednesday

test("weekday and time", () => {
  const [s] = findSlots("How about Tuesday at 2pm?", T);
  assert.deepEqual([s.date, s.time, s.weekday], ["2026-10-27", "14:00", "tuesday"]);
  assert.equal(describeSlot(s), "Tuesday 27 October at 2pm");
});
test("part of day, tomorrow, bare hour", () => {
  assert.equal(findSlots("Friday morning works", T)[0].part, "morning");
  assert.equal(findSlots("free tomorrow at 10:30", T)[0].date, "2026-10-22");
  assert.equal(findSlots("let's do Thursday at 3", T)[0].time, "15:00");
});
test("month day rolls to next year when past", () => {
  assert.equal(findSlots("Nov 12 at 10:30am", T)[0].date, "2026-11-12");
  assert.equal(findSlots("Jan 5 at 4pm", T)[0].date, "2027-01-05");
  assert.equal(findSlots("Feb 30", T).length, 0);
});
test("refused days and no time give nothing", () => {
  assert.equal(findSlots("I can't do Tuesday", T).length, 0);
  assert.equal(findSlots("Thanks, tell me more", T).length, 0);
  assert.equal(findSlots("", T).length, 0);
});
test("draft confirms the offered time, asks zone, invents nothing", () => {
  const body = "Yes, open to a call. How about Tuesday at 2pm or Wednesday morning?";
  const t = triage({ body, subject: "Re: x" }, T);
  assert.equal(t.category, "interested");
  const d = draftReply(t, { first_name: "Dana" }, { subject: "Re: x", body }, SAMPLE_OFFER);
  assert.match(d.body, /Tuesday 27 October at 2pm works for me/);
  assert.match(d.body, /Wednesday 28 October morning/);
  assert.match(d.body, /time zone/);
});
test("without a slot the old draft stands", () => {
  const t = triage({ body: "Sounds interesting, please book a call.", subject: "" }, T);
  const d = draftReply(t, { first_name: "Dana" }, { subject: "x", body: "" }, SAMPLE_OFFER);
  assert.doesNotMatch(d.body, /time zone/);
});
test("next <weekday> inside this week means the following week, and says so", () => {
  const [s] = findSlots("How about next Friday at 2pm?", T); // Wed 2026-10-21; nearest Friday is the 23rd
  assert.deepEqual([s.date, s.alt], ["2026-10-30", "2026-10-23"]);
  assert.equal(findSlots("next Tuesday", T)[0].date, "2026-10-27"); // already next week
  assert.equal(findSlots("Friday at 2pm", T)[0].date, "2026-10-23"); // plain weekday unchanged
  const t = triage({ body: "Yes, let's talk next Friday at 2pm.", subject: "Re: x" }, T);
  const d = draftReply(t, { first_name: "Dana" }, { subject: "x", body: "" }, SAMPLE_OFFER);
  assert.match(d.body, /Friday 30 October at 2pm.*Friday 23 October/s);
});
