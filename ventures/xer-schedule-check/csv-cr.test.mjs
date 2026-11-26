// Every CSV writer here quotes a field holding a carriage return. parseXer
// splits rows on \r?\n, so a lone \r in an activity or calendar name survives
// into the model; written unquoted it ends the spreadsheet row early (RFC
// 4180 quotes CR as well as LF). On 2026-11-26 thirteen writers in twelve
// modules quoted only `"`, `,` and \n (red-team run, calslack.mjs first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { calendarSlackCsv } from "./calslack.mjs";

const here = new URL(".", import.meta.url);

test("no CSV quoting test in this venture leaves out \\r", () => {
  const bad = [];
  for (const f of readdirSync(here).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs"))) {
    readFileSync(new URL(f, here), "utf8").split("\n").forEach((line, i) => {
      // a regex character class holding a quote, a comma and \n: a CSV cell's "needs quoting" test
      for (const m of line.matchAll(/\/\[([^\]\/]*)\]\/\.test\(/g)) {
        const cls = m[1];
        if (cls.includes('"') && cls.includes(",") && cls.includes("\\n") && !cls.includes("\\r")) bad.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("a name with a lone CR from the XER is quoted, so the row stays whole", () => {
  const csv = calendarSlackCsv({ activities: [{ code: "A", name: "Pour\rslab", calendar: "C", tfP6: 0, tf: 8, gain: 8, lateFinishP6: "", lateFinish: "" }] });
  assert.match(csv, /\nA,"Pour\rslab",C,0,8,8,,\n$/);
});
