// Every venture copy of the shared quote-aware parseCsv drops blank lines and
// keeps quoted line breaks inside one field, so a row's index in the table is
// not its line in the file. Until 2026-11-16 forty-one row loops in 34 venture
// analyzers reported a skipped row as "line i + 1": one blank line in an export
// shifted every later line number the page showed (red-team record
// prompts/runs/2026-11-16-session_01EhTJVMmK8A31TEs5kfnuRS.json). Each copy
// now tags a row with a non-enumerable `line`, and each loop reads it.
//
// This suite runs from unwired_checks.py (every platform/**/*.test.mjs no
// workflow names), so a new copy of the parser, or a new loop that goes back
// to `i + 1`, fails a pull request instead of waiting for a red-team run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENTURES = join(ROOT, "ventures");
// The old body and the fixed one; other parsers (ai-bookkeeper's `ln`,
// shopify-inventory-reorder-planner's own `line`) number rows their own way.
const MARKS = ['if (row.some((f) => f.trim() !== "")) rows.push(row);', 'rows.push(Object.defineProperty(row, "line", { value: start }))'];

function copies() {
  const out = [];
  for (const v of readdirSync(VENTURES)) {
    const dir = join(VENTURES, v);
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith(".mjs") || n.endsWith(".test.mjs")) continue;
      const p = join(dir, n);
      const src = readFileSync(p, "utf8");
      if (src.includes("export function parseCsv") && MARKS.some((m) => src.includes(m))) out.push({ p, src, rel: `ventures/${v}/${n}` });
    }
  }
  return out;
}

const found = copies();

test("the shared parser still has copies to check", () => {
  assert.ok(found.length >= 40, `only ${found.length} copies found: has the parser moved?`);
});

test("every copy tags each row with the file line it starts on", async () => {
  // Line 1 header, 2 blank, 3 row, 4-5 one quoted field over two lines,
  // 6 blank (CRLF), 7 last row with no trailing newline.
  const text = 'h\n\nr3\n"r4\nstill r4"\r\n\r\nr7';
  const bad = [];
  for (const { p, rel } of found) {
    const { parseCsv } = await import(pathToFileURL(p).href);
    const rows = parseCsv(text);
    const lines = rows.map((r) => r.line);
    if (JSON.stringify(lines) !== JSON.stringify([1, 3, 4, 7])) bad.push(`${rel}: ${JSON.stringify(lines)}`);
    // Non-enumerable, so deepEqual on rows and JSON output are unchanged.
    if (Object.keys(rows[0]).includes("line")) bad.push(`${rel}: line is enumerable`);
  }
  assert.deepEqual(bad, []);
});

test("no row loop over the parsed table reports its index as the line number", () => {
  const loop = /for \(let i = [^;]+; i < table\.length; i\+\+\) \{\n(?:[^\n]*\n)?[^\n]*\b(?:line|lineNo) = i \+ 1;/g;
  const bad = [];
  for (const { rel, src } of found) {
    for (const m of src.matchAll(loop)) bad.push(`${rel}: ${m[0].split("\n").pop().trim()}`);
  }
  assert.deepEqual(bad, [], "use `table[i].line ?? i + 1`");
});

test("the guard's loop pattern matches the shape it exists to reject", () => {
  const before = "  for (let i = h + 1; i < table.length; i++) {\n    const line = table[i];\n    const lineNo = i + 1;";
  const loop = /for \(let i = [^;]+; i < table\.length; i\+\+\) \{\n(?:[^\n]*\n)?[^\n]*\b(?:line|lineNo) = i \+ 1;/;
  assert.match(before, loop);
  assert.doesNotMatch(before.replace("i + 1;", "table[i].line ?? i + 1;"), loop);
  assert.ok(existsSync(VENTURES));
});
