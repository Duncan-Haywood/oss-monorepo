import test from "node:test";
import assert from "node:assert/strict";
import { NET, FIRST_PERSON, FOOTER, score } from "./eval/optout-recall.mjs";

// The candidate net must be wider than the rules: it has to catch every way people asked off a list in real mail,
// including the ones the rules miss, or the recall figure only measures the rules against themselves.
test("the net catches opt-out phrasings, including ones the rules do not use", () => {
  for (const s of [
    "Please take me off this list.",
    "Please remove me from the distribution.",
    "Could you drop my name from the mailing list?",
    "I no longer need to receive these reports.",
    "Please stop sending me these.",
    "Don't copy me on these anymore.",
    "I do not want to be on this list.",
    "Unsubscribe",
  ]) assert.ok(NET.test(s), s);
});

test("score counts recall over labelled opt-outs and unsubscribes over the rest", () => {
  const cands = [
    { id: "a", category: "unsubscribe" }, { id: "b", category: "unclear" }, { id: "c", category: "unsubscribe" },
    { id: "d", category: "question" }, { id: "e", category: "unclear" },
  ];
  const s = score(cands, [{ id: "a", label: "optout" }, { id: "b", label: "optout" }, { id: "c", label: "not" }, { id: "d", label: "not" }, { id: "e", label: "ambiguous" }]);
  assert.equal(s.optout.n, 2);
  assert.equal(s.optout.caught, 1);
  assert.deepEqual(s.optout.missed, [{ id: "b", got: "unclear" }]);
  assert.equal(s.not.unsubscribed, 1);
  assert.equal(s.ambiguous, 1);
});

test("the first-person filter keeps the writer's own removal and drops footer instructions", () => {
  const keep = (s) => FIRST_PERSON.test(s) && !FOOTER.test(s);
  assert.ok(keep("Please take me off this list."));
  assert.ok(keep("Please do not send me these charts."));
  assert.ok(!keep("To unsubscribe from this group, send an email to list-unsubscribe@example.test"));
  assert.ok(!keep("Could you get me the numbers by Friday?"));
});
