// Reads real .xlsx workbooks with sheet.mjs and compares every cell with a
// reference reading (eval/excel-workbooks-ref.py, openpyxl 3.1), as the text
// Excel shows: dates as ISO 8601, numbers to 15 significant digits, booleans
// true/false. Results: eval/excel-workbooks-2026-11-19.md.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/apache/poi.git poi
//   (cd poi && git sparse-checkout set test-data/spreadsheet)
//   node eval/excel-workbooks.mjs read poi/test-data/spreadsheet ours.jsonl
//   python3 eval/excel-workbooks-ref.py poi/test-data/spreadsheet ours.jsonl ref.jsonl
//   node eval/excel-workbooks.mjs compare ours.jsonl ref.jsonl
//
// SHEET=path/to/sheet.mjs reads with another copy (the "before" column).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const [mode, a, b] = process.argv.slice(2);
if (mode === "read") {
  const { sheetToRows } = await import(process.env.SHEET ? pathToFileURL(process.env.SHEET).href : "../sheet.mjs");
  const lines = [];
  for (const f of readdirSync(a).filter((x) => /\.xlsx$/i.test(x)).sort()) {
    const bytes = new Uint8Array(readFileSync(`${a}/${f}`));
    try {
      const rows = await sheetToRows(bytes, (x) => inflateRawSync(x));
      lines.push(JSON.stringify({ f, n: rows.length, rows: rows.slice(0, 500).map((r) => r.slice(0, 40).map((c) => (c.length > 2000 ? c.slice(0, 2000) : c))) }));
    } catch (e) { lines.push(JSON.stringify({ f, error: String(e.message || e).slice(0, 200) })); }
  }
  writeFileSync(b, lines.join("\n"));
} else if (mode === "compare") {
  const ours = new Map(readFileSync(a, "utf8").split("\n").map((l) => JSON.parse(l)).map((o) => [o.f, o]));
  const excel15 = (v) => String(Number(Number(v).toPrecision(15))).replace(/e\+?/, "E");
  const out = { files: 0, filesSame: 0, excelFiles: 0, excelFilesSame: 0, cells: 0, same: 0, byType: {}, differByType: {}, examples: [] };
  for (const line of readFileSync(b, "utf8").trim().split("\n")) {
    const r = JSON.parse(line);
    if (r.error) continue;
    const o = ours.get(r.f);
    if (!o || o.error) continue;
    out.files++;
    const excel = /Microsoft/.test(r.app || "");
    if (excel) out.excelFiles++;
    let bad = 0;
    r.rows.forEach((row, i) => row.forEach((c, j) => {
      if (!c) return;
      const [type, v] = c;
      out.cells++;
      out.byType[type] = (out.byType[type] || 0) + 1;
      const got = o.rows[i]?.[j] ?? "";
      // An XML parser reads a literal CR LF in a part as LF; openpyxl's str() keeps it when written _x000D_.
      const want = type === "num" ? excel15(v) : type === "str" ? v.replace(/\r\n?/g, "\n") : v;
      if (got.replace(/\r\n?/g, "\n") === want) { out.same++; return; }
      bad++;
      out.differByType[type] = (out.differByType[type] || 0) + 1;
      if (out.examples.length < 40) out.examples.push(`${r.f} ${i + 1}:${j + 1} ours=${JSON.stringify(got).slice(0, 60)} ref=${JSON.stringify(want).slice(0, 60)}`);
    }));
    if (!bad) { out.filesSame++; if (excel) out.excelFilesSame++; }
  }
  out.unread = [...ours.values()].filter((o) => o.error).map((o) => `${o.f}: ${o.error.slice(0, 90)}`);
  console.log(JSON.stringify(out, null, 1));
} else {
  console.error("usage: excel-workbooks.mjs read <dir> <out.jsonl> | compare <ours.jsonl> <ref.jsonl>");
  process.exit(2);
}
