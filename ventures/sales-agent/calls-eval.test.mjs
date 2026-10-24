import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scorePrep, scoreFollowUp } from "./eval/calls.mjs";

const rows = (n) => readFileSync(new URL(`./eval/${n}`, import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("tuned call-note sets stay at their floor", () => {
  assert.equal(scoreFollowUp(rows("calls-followup.jsonl")).right, 44);
  assert.ok(scorePrep(rows("calls-prep.jsonl")).exact >= 28);
});

test("fresh call-note sets do not regress below the first scored result", () => {
  assert.ok(scoreFollowUp(rows("calls-followup-fresh.jsonl")).right >= 25);
  const p = scorePrep(rows("calls-prep-fresh.jsonl"));
  assert.ok(p.exact >= 12 && p.precision >= 0.8);
});
