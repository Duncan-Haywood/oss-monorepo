import { test } from "node:test";
import assert from "node:assert/strict";
import { benchmarkTable, readmeBlock, readmeSection } from "./eval/benchmark.mjs";

// The README's learning-curve table is generated from the benchmark it cites; this
// fails when a change to categorisation moves the numbers and the README was not
// regenerated (quality audits 2026-11-07, -09, -19 and -28 found it stale).
test("README learning-curve table matches node eval/benchmark.mjs --seeds 5", () => {
  const expected = readmeBlock(benchmarkTable(5), 5);
  assert.equal(readmeSection().body, expected, "README benchmark table is stale: run node ventures/ai-bookkeeper/eval/benchmark.mjs --readme");
});

test("the page and llms.txt quote the same months 4-12 counts as the benchmark", async () => {
  const { readFileSync } = await import("node:fs");
  const late = benchmarkTable(5).slice(3), tot = (k) => late.reduce((a, r) => a + r[k], 0);
  const n = (x) => x.toLocaleString("en-US");
  const posted = `${n(tot("auto"))} of ${n(tot("lines"))}`, right = `${n(tot("suggestedRight"))} of ${n(tot("suggested"))}`;
  for (const f of ["index.html", "llms.txt"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(text.includes(posted), `${f} should quote "${posted}" lines posted alone`);
    assert.ok(text.includes(right), `${f} should quote "${right}" review suggestions right`);
  }
});
