import test from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { compare } from "./compare.mjs";
import { lookahead } from "./lookahead.mjs";
import { narrative, narrativeText, narrativeHtml } from "./narrative.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";

const cur = parseXer(EXAMPLE_XER), prev = parseXer(EXAMPLE_PREV_XER);
const cmp = compare(prev, cur);
const n = narrative(cmp, { lookahead: lookahead(cur, { weeks: 4 }) });
const text = narrativeText(n);

test("status: finish movement, contract variance and half-step split come from the comparison", () => {
  assert.equal(cmp.finish.vsMustFinish, -4);
  assert.equal(cmp.finish.prevVsMustFinish, -19);
  assert.equal(cmp.finish.prevVsMustFinish + cmp.finish.moved, cmp.finish.vsMustFinish);
  assert.match(text, /forecast completion is 2026-07-27, 15 working days later than the previous update's 2026-07-06/);
  assert.match(text, /4 working days ahead of the contract completion date of 2026-07-31 \(the previous update was 19 working days ahead of it\)/);
  assert.match(text, /progress during the period moved the finish 8 working days later, and the changes made to the schedule 7 working days later/);
});

test("every change the comparison found is listed with a reason fill-in", () => {
  const changes = n.sections.find((s) => s.id === "changes").bullets;
  const expected = cmp.durations.origChanged.length + cmp.progress.remainingUp.length + cmp.logic.deleted.filter((r) => r.bothRemain).length
    + cmp.logic.added.length + cmp.logic.typeChanged.length + cmp.logic.lagChanged.length + cmp.constraints.length + cmp.calendars.length
    + cmp.activities.added.length + cmp.activities.deleted.length + cmp.activities.renamed.length;
  assert.equal(changes.length, expected);
  for (const c of changes) if (!/renamed/.test(c)) assert.match(c, /Reason: \[FILL IN: /);
  assert.ok(changes.some((c) => /A1150 Paint changed from 10 to 8 days \(critical\)/.test(c)));
  assert.ok(changes.some((c) => /A1050 -> A1060 changed from FS to SS \+3d/.test(c)));
});

test("planned work missed: one line per activity, a cause each", () => {
  const missed = n.sections.find((s) => s.id === "missed").bullets;
  const codes = missed.map((b) => b.split(" ")[0]);
  assert.equal(new Set(codes).size, codes.length, "an activity forecast to start and finish appears once");
  const want = new Set([...cmp.progress.plannedNotFinished, ...cmp.progress.plannedNotStarted].map((r) => r.code));
  assert.deepEqual(new Set(codes), want);
  assert.ok(missed.find((b) => b.startsWith("A1060")).includes("forecast to start 2026-03-30 and finish 2026-04-03"));
  for (const b of missed) assert.match(b, /Cause: \[FILL IN: cause\]$/);
});

test("work done, critical path and the next period are facts, not fill-ins", () => {
  const done = n.sections.find((s) => s.id === "progress");
  assert.deepEqual(done.bullets, [
    "Finished: A1020 Shop drawings: partitions and ceilings, 2026-03-20 (3 working days after the previous forecast)",
    "Started: A1030 Submittal review, 2026-03-23",
    "Started: A1050 Demolition, level 1, 2026-03-30",
  ]);
  assert.match(text, /critical \(driving\) path to completion runs through 6 open activities: A1110/);
  const next = n.sections.find((s) => s.id === "next");
  assert.ok(next.bullets.length >= 6);
  assert.ok(next.bullets.every((b) => /^(Start|Continue): /.test(b)));
});

test("a corrected actual is flagged for explanation; the slip asks for cause and recovery", () => {
  assert.match(text, /A1010 Site survey and as-built check: actual finish changed from 2026-03-04 to 2026-03-05 after it was reported/);
  assert.match(text, /Corrective action to recover the 15 working days lost this period: \[FILL IN:/);
  assert.match(text, /Cause of the slip .*\[FILL IN:/);
});

test("fill-ins are counted, and nothing else in the text is a placeholder", () => {
  const found = text.match(/\[FILL IN: /g).length;
  assert.equal(found, n.fillIns);
  assert.match(text, new RegExp(`\\(${n.fillIns} fill-ins left`));
});

test("no change, no slip: the narrative says so and asks for no recovery plan", () => {
  const same = narrative(compare(cur, cur));
  const t = narrativeText(same);
  assert.match(t, /unchanged from the previous update/);
  assert.match(t, /No logic, duration, constraint, calendar or activity changes/);
  assert.doesNotMatch(t, /Corrective action to recover/);
  assert.doesNotMatch(t, /Cause of the slip/);
});

test("no must-finish date in the file: the contract variance is a fill-in, not a guess", () => {
  const strip = (x) => ({ ...x, tables: { ...x.tables, PROJECT: x.tables.PROJECT.map((p) => ({ ...p, plan_end_date: "" })) } });
  const c2 = compare(strip(prev), strip(cur));
  assert.equal(c2.finish.vsMustFinish, null);
  assert.match(narrativeText(narrative(c2)), /variance against the contract completion date is \[FILL IN: /);
});

test("HTML escapes activity names from the file and highlights each fill-in", () => {
  const evil = parseXer(EXAMPLE_XER.replace("Submittal review", "<script>alert(1)</script>"));
  const h = narrativeHtml(narrative(compare(prev, evil)), { by: "Acme & Sons" });
  assert.doesNotMatch(h, /<script>alert/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /Acme &amp; Sons/);
  const html = narrativeHtml(n);
  assert.equal((html.match(/<mark class="fill">/g) || []).length, n.fillIns);
});
