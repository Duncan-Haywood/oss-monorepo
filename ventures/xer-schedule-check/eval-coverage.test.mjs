import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// The numbers in eval/*.md back claims in the README, llms.txt and posts. A
// script no test runs can drift from the code it measures with nothing failing
// (red team 2026-11-26: eight seeded faults in eval/open-critical.mjs, none
// caught). Ratchet: every eval/*.mjs is named by a *.test.mjs, or listed in
// eval/UNTESTED.txt, and the list only shrinks.
const here = new URL(".", import.meta.url);
const tests = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).map((f) => readFileSync(new URL(f, here), "utf8")).join("\n");
const scripts = readdirSync(new URL("eval/", here)).filter((f) => f.endsWith(".mjs"));
const listed = readFileSync(new URL("eval/UNTESTED.txt", here), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const covered = (f) => tests.includes(`eval/${f}`) || tests.includes(`eval/${f.replace(/\.mjs$/, "")}"`);

test("every eval script is run by a test or listed in eval/UNTESTED.txt", () => {
  const missing = scripts.filter((f) => !covered(f) && !listed.includes(f));
  assert.deepEqual(missing, [], "add a test that runs these on a hand-worked file (open-critical.test.mjs shows how), or list them in eval/UNTESTED.txt with a reason");
});

test("eval/UNTESTED.txt holds no script a test covers or that no longer exists", () => {
  assert.deepEqual(listed.filter((f) => covered(f)), [], "now covered by a test: delete these lines from eval/UNTESTED.txt");
  assert.deepEqual(listed.filter((f) => !scripts.includes(f)), [], "no such script: delete these lines from eval/UNTESTED.txt");
});
