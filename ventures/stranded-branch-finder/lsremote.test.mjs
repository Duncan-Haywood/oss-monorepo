import test from "node:test";
import assert from "node:assert/strict";
import { parseLsRemote, uncovered, globMatch } from "./lsremote.mjs";

const a = "a".repeat(40), b = "b".repeat(40), c = "c".repeat(40), d = "d".repeat(40);
const sample = [
  `${a}\trefs/heads/main`,
  `${b}\trefs/heads/feature/covered`,
  `${c}\trefs/heads/feature/lonely`,
  `${a}\trefs/heads/spent`,
  `${d}\trefs/heads/dependabot/npm/x`,
  `${b}\trefs/pull/12/head`,
].join("\n");

test("branch whose tip is a PR head is covered; at-base branch is not work", () => {
  const r = uncovered(sample);
  assert.deepEqual(r.map((x) => x.branch), ["dependabot/npm/x", "feature/lonely"]);
});
test("ignore patterns", () => {
  assert.deepEqual(uncovered(sample, { ignore: ["dependabot/*"] }).map((x) => x.branch), ["feature/lonely"]);
});
test("custom base", () => {
  assert.ok(!uncovered(sample, { base: "feature/lonely" }).some((x) => x.branch === "feature/lonely"));
});
test("refuses non-ls-remote text and non-strings", () => {
  assert.throws(() => parseLsRemote("hello"), /No refs\/heads/);
  assert.throws(() => parseLsRemote(null), /Paste/);
});
test("glob escapes regex characters", () => {
  assert.ok(globMatch("a.b*", "a.bc"));
  assert.ok(!globMatch("a.b", "axb"));
});
