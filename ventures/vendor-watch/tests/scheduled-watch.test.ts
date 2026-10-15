import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const wf = readFileSync(new URL("../deploy/scheduled-watch.yml", import.meta.url), "utf8");
const list = readFileSync(new URL("../deploy/watchlist.txt", import.meta.url), "utf8");

test("runs on a schedule and by hand, with no secrets", () => {
  assert.match(wf, /schedule:\s*\n\s*- cron: "/);
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /secrets\./);
});

test("permissions are the two it needs and nothing more", () => {
  assert.match(wf, /permissions:\s*\n\s*contents: write\s*\n\s*issues: write\s*\n/);
});

test("changed (1) and inconclusive (3) are reported, usage error (2) fails the run", () => {
  assert.match(wf, /code.*== '1' \|\| .*== '3'/);
  assert.match(wf, /"\$code" -eq 2\ \]; then exit 2/);
});

test("inconclusive is never worded as 'no change'", () => {
  assert.match(wf, /inconclusive/);
  assert.doesNotMatch(wf, /no change/i);
});

test("baselines are committed to the deployer's own repo", () => {
  assert.match(wf, /git add deploy\/baselines\.json/);
});

test("shipped watchlist monitors nothing until the deployer edits it", () => {
  const live = list.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  assert.deepEqual(live, []);
});
