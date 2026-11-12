// eval/model.mjs: rules, model alone and merged triage scored on the same replies, from cached answers (eval/README.md).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { scoreSet, replyKey } from "./eval/model.mjs";

const rows = [
  { label: "unsubscribe", subject: "Re: hi", body: "Please remove me from your list." },
  { label: "not_interested", subject: "Re: hi", body: "Not interested." },
  { label: "interested", subject: "Re: hi", body: "Sure, does Thursday at 2pm work for a call?" },
];

test("a missing answer falls back to the rules, so model and merged equal the rules", () => {
  const s = scoreSet(rows, {});
  assert.equal(s.modelErrors, 3);
  assert.deepEqual(s.model, s.rules);
  assert.deepEqual(s.merged, s.rules);
});

test("the merge keeps an opt-out the model misses and blocks a move to more contact", () => {
  const answers = {
    [replyKey(rows[0])]: { category: "question" },     // the model misses the opt-out
    [replyKey(rows[1])]: { category: "interested" },   // the model would draft to a plain no
    [replyKey(rows[2])]: { category: "interested" },
  };
  const s = scoreSet(rows, answers);
  assert.equal(s.modelErrors, 0);
  assert.equal(s.model.unsubMissed, 1);
  assert.equal(s.model.overreach, 2);                   // question for an opt-out, interested for a no
  assert.equal(s.merged.unsubMissed, 0);                // the rules' opt-out stands
  assert.equal(s.merged.right, 3);                       // question -> interested is allowed: both end in a draft
  assert.ok(s.blocked >= 1);
});

test("an error answer counts as a model error, not a category", () => {
  const s = scoreSet(rows.slice(0, 1), { [replyKey(rows[0])]: { error: "the model did not return JSON" } });
  assert.equal(s.modelErrors, 1);
  assert.equal(s.model.right, s.rules.right);
});

test("every cached answer file holds categories only, no reply text", () => {
  const dir = new URL("./eval/model-answers/", import.meta.url);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const a = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
    for (const [k, v] of Object.entries(a)) {
      assert.match(k, /^[0-9a-f]{16}$/);
      for (const key of Object.keys(v)) assert.ok(["category", "subtype", "return_date", "error"].includes(key), `${f}: ${key}`);
    }
  }
});
