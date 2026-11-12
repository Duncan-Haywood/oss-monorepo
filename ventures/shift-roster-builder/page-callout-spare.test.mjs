// The call-out page's second column (a spare part-timer added), as eval/callout-cover-study.mjs computes it. Its
// own file so it runs beside page-callout.test.mjs rather than after it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { study, WITH_SPARE } from "./eval/callout-cover-study.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("call-out page's table is what the engine returns for the sample cafe with a spare part-timer", () => {
  const b = study(WITH_SPARE());
  assert.deepEqual([b.cases, b.patched, b.covered, Math.min(...b.moves), Math.max(...b.moves)], [32, 0, 20, 9, 21]);
  const html = page("how-to-cover-a-shift-when-someone-calls-out.html");
  for (const t of ["32", "9 to 21", "20 of 32"]) assert.ok(html.includes(t), t);
});
