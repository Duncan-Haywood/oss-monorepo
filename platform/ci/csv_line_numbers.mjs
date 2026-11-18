// Every venture copy of the shared quote-aware parseCsv drops blank lines and
// keeps quoted line breaks inside one field, so a row's index in the table is
// not its line in the file. Until 2026-11-16 forty-one row loops in 34 venture
// analyzers reported a skipped row as "line i + 1": one blank line in an export
// shifted every later line number the page showed (red-team record
// prompts/runs/2026-11-16-session_01EhTJVMmK8A31TEs5kfnuRS.json). Each copy
// now tags a row with a non-enumerable `line`, and each loop reads it.
//
// test_csv_line_numbers.py runs this file (`node csv_line_numbers.mjs`, which
// exits 1 when a test fails), and unwired_checks.py runs that suite on every
// pull request, so a new copy of the parser, or a new loop that goes back to
// `i + 1`, fails CI instead of waiting for a red-team run. Not named
// *.test.mjs: that would need a control-plane line in verify-and-merge.md.
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

// The loop test above knows one shape (`for (let i ...) { line = i + 1`). The
// 2026-11-16 follow-up red-team run found 12 copies it missed: `line: r + 1`
// inline in a push, `table.slice(1).forEach((r, n) => { const line = n + 2`,
// and `parseCsv(raw).forEach((row, i) => ... line: i + 1`. This one finds every
// `line: <v> + 1|2` (or `line = `, `lineNo`) and walks back to the loop that
// binds <v>; unless that loop runs over text split on newlines (where the index
// is the line), the copy must read the row's tag (`… .line ?? v + 1`).
export function indexLineReports(src) {
  const lines = src.split("\n");
  const out = [];
  const use = /\b(?:line|lineNo)\s*[:=]\s*([A-Za-z_$][\w$]*) \+ [12]\b/g;
  lines.forEach((text, n) => {
    for (const m of text.matchAll(use)) {
      if (/\?\?\s*$/.test(text.slice(0, m.index + m[0].indexOf(m[1])))) continue;
      const v = m[1];
      const binds = new RegExp(`for \\(let ${v}\\b|forEach\\(\\(([^)]*,\\s*)?${v}\\s*[,)]`);
      let header = null;
      for (let k = n; k >= Math.max(0, n - 40); k--) if (binds.test(lines[k])) { header = lines[k]; break; }
      if (header && /split\(/.test(header)) continue;
      // `const lines = String(text).split(/\r?\n/); lines.forEach((raw, idx) =>`
      const over = header && header.match(/([A-Za-z_$][\w$]*)\.forEach\(/);
      if (over && new RegExp(`\\b${over[1]} = [^;\\n]*\\.split\\(`).test(src)) continue;
      out.push(`${n + 1}: ${text.trim()}`);
    }
  });
  return out;
}

test("no loop over the parsed table reports an index as the line, in any shape", () => {
  const bad = [];
  for (const { rel, src } of found) for (const hit of indexLineReports(src)) bad.push(`${rel}:${hit}`);
  assert.deepEqual(bad, [], "read the row's tag: `table[r].line ?? r + 1` or `r.line ?? n + 2`");
});

test("the any-shape check rejects each missed shape and accepts the fixes", () => {
  const missed = [
    "  for (let r = 1; r < table.length; r++) {\n    if (!x) { skipped.push({ line: r + 1, reason: \"y\" }); continue; }",
    "  table.slice(1).forEach((r, n) => {\n    const line = n + 2;",
    "  parseCsv(raw, d).forEach((row, i) => {\n    if (row.length < 2) { skipped.push({ line: i + 1, reason: \"y\" }); return; }",
  ];
  for (const s of missed) assert.equal(indexLineReports(s).length, 1, s);
  const fixed = [
    missed[0].replace("line: r + 1", "line: table[r].line ?? r + 1"),
    missed[1].replace("n + 2", "r.line ?? n + 2"),
    missed[2].replace("line: i + 1", "line: row.line ?? i + 1"),
    // A list typed into a textarea: the index of a split line is its line.
    '  String(text ?? "").split(/\\r?\\n/).forEach((raw, i) => {\n    if (!m) { bad.push({ line: i + 1, reason: "y" }); return; }',
    '  const lines = String(text ?? "").split(/\\r?\\n/);\n  lines.forEach((raw, idx) => {\n    if (at <= 0) { errors.push({ line: idx + 1, reason: "y" }); return; }',
  ];
  for (const s of fixed) assert.deepEqual(indexLineReports(s), [], s);
});

test("the guard's loop pattern matches the shape it exists to reject", () => {
  const before = "  for (let i = h + 1; i < table.length; i++) {\n    const line = table[i];\n    const lineNo = i + 1;";
  const loop = /for \(let i = [^;]+; i < table\.length; i\+\+\) \{\n(?:[^\n]*\n)?[^\n]*\b(?:line|lineNo) = i \+ 1;/;
  assert.match(before, loop);
  assert.doesNotMatch(before.replace("i + 1;", "table[i].line ?? i + 1;"), loop);
  assert.ok(existsSync(VENTURES));
});
