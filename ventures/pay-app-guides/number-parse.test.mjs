// Class guard (red team 2026-11-25): Number() on typed text reads "1e1" as 10, "0x7" as 7 and " " as 0.
// Seven inputs in this venture were read that way. Every Number( call in a module here must sit next
// to (same line, or the line before or after) a regex .test( that admits plain digits only, or the
// file must be one that never sees user input (template.mjs builds the xlsx from the fixed sample).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("./", import.meta.url);
const NO_USER_INPUT = new Set(["template.mjs"]);

test("every Number( on input is guarded by a plain-number regex", () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && !NO_USER_INPUT.has(n))) {
    const lines = readFileSync(new URL(f, DIR), "utf8").split("\n");
    lines.forEach((l, i) => {
      if (/^\s*\/\//.test(l) || !/\bNumber\(/.test(l)) return;
      const near = [lines[i - 1], l, lines[i + 1]].filter(Boolean).filter((x) => !/^\s*\/\//.test(x));
      if (!near.some((x) => /\.test\(/.test(x))) bad.push(`${f}:${i + 1}: ${l.trim()}`);
    });
  }
  assert.deepEqual(bad, [], "Read typed numbers with a regex first (see wholeNumber in calc.mjs); Number() accepts 1e1, 0x7 and blanks.");
});
