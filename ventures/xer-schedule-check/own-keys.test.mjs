// Guard: a lookup table read with text from a stranger's file must read own
// keys only. `TABLE[value]` on a plain object answers "constructor",
// "toString" or "__proto__" with one of Object's own properties, and that
// came out of this tool as a crash (an MSPDI WorkContour "constructor"),
// as "function Object() { [native code] }" in a converted file (a P6
// cost_load_type or notebook entity) and as a sort that tied everything
// (a priority_type). Red-team run 2026-11-22.
//
// So every `UPPER_CASE_TABLE[expression]` read of an object-literal table in
// the shipped modules goes through `own(...)` or `Object.hasOwn(...)` on the
// same line, unless the table and key are listed below as keyed only by this
// code's own values. A new lookup by file text fails here, not in a user's
// browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DIR = new URL("./", import.meta.url);

// file -> tables whose keys never come from a file (checked by hand)
const INTERNAL = {
  "p6xer.mjs": ["KEY", "FIELDS", "MAX"], // P6 table and field names this code writes
  "report.mjs": ["RANK"], // severities this module sets itself
  "msproject.mjs": ["ACCRUE_WORD"], // the accrue value from own(ACCRUE, ..., 3): 1 to 3
  "udf-ranges.mjs": ["UNIT_WORD"], // unitOf() or the page's own unit picker
};

function unguarded(file, src) {
  const tables = [...src.matchAll(/^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{/gm)].map((m) => m[1]);
  const out = [];
  const lines = src.split("\n");
  for (const t of new Set(tables)) {
    if ((INTERNAL[file] || []).includes(t)) continue;
    const re = new RegExp(`(?<![\\w.$])${t}\\[([^\\]]+)\\]`, "g");
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      for (const m of line.matchAll(re)) {
        const key = m[1].trim();
        if (/^(["'`])[^"'`]*\1$|^\d+$/.test(key)) continue; // a literal key
        if (/\bObject\.hasOwn\(|\bown\(|hasOwnProperty/.test(line)) continue;
        out.push(`${file}:${i + 1} ${t}[${key}]`);
      }
    });
  }
  return out;
}

test("lookup tables read with file text use own keys only", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".mjs") && !f.includes(".test."));
  assert.ok(files.length > 20, "the shipped modules were found");
  const bad = files.flatMap((f) => unguarded(f, readFileSync(new URL(f, DIR), "utf8")));
  assert.deepEqual(bad, [], `use own(TABLE, key, default) or Object.hasOwn(TABLE, key):\n${bad.join("\n")}`);
});

test("the guard flags an unguarded lookup and passes a guarded one", () => {
  const src = 'const KIND = { a: 1 };\nconst x = KIND[row.kind] || 0;\nconst y = Object.hasOwn(KIND, k) ? KIND[k] : 0;\nconst z = KIND["a"];\n';
  assert.deepEqual(unguarded("x.mjs", src), ["x.mjs:2 KIND[row.kind]"]);
});
