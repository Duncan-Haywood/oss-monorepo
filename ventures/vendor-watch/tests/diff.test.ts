import assert from "node:assert/strict";
import { test } from "node:test";
import { diffTokens, diffWords } from "../src/lib/diff";

test("identical text produces a single same chunk", () => {
  const ops = diffWords("these terms are effective immediately", "these terms are effective immediately");
  assert.deepEqual(ops, [{ type: "same", value: "these terms are effective immediately" }]);
});

test("a word changed in the middle is reported as removed+added between same runs", () => {
  const ops = diffWords("you must pay within 30 days", "you must pay within 60 days");
  // Common prefix "you must pay within", differing middle "30" vs "60", common suffix "days".
  assert.deepEqual(ops, [
    { type: "same", value: "you must pay within" },
    { type: "removed", value: "30" },
    { type: "added", value: "60" },
    { type: "same", value: "days" },
  ]);
});

test("appended text at the end shows as an added tail", () => {
  const ops = diffWords("we may update this policy", "we may update this policy at any time");
  assert.deepEqual(ops, [
    { type: "same", value: "we may update this policy" },
    { type: "added", value: "at any time" },
  ]);
});

test("a very large differing middle falls back to a wholesale replacement instead of hanging", () => {
  const bigOld = Array.from({ length: 1000 }, (_, i) => `old${i}`);
  const bigNew = Array.from({ length: 1000 }, (_, i) => `new${i}`);
  const ops = diffTokens(bigOld, bigNew);
  assert.deepEqual(ops, [
    { type: "removed", value: bigOld.join(" ") },
    { type: "added", value: bigNew.join(" ") },
  ]);
});

test("empty strings diff to nothing", () => {
  assert.deepEqual(diffWords("", ""), []);
});
