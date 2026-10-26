// Scores parseReceipt on SROIE 2019 (ICDAR): real Malaysian shop receipts
// with merchant, date and total labelled by hand. CORD masks merchants and
// dates, so this is where those two are measured. The text is the dataset's
// own word boxes (box/*.csv, one per line of the receipt). Nothing is copied
// into this repository: clone zzzDavid/ICDAR-2019-SROIE (MIT) and point at it.
//   node eval/sroie-receipts.mjs <clone>/data [--misses merchant|date|total] [--ocr <dir>]
// --ocr <dir> reads <dir>/<id>.txt (tesseract output on <clone>/data/img/<id>.jpg,
// e.g. `tesseract img/000.jpg <dir>/000 --psm 6`) instead of the dataset's boxes,
// so the reader meets what an OCR engine prints from a photo, as the CLI does.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { cleanOcr } from "../cleanocr.mjs";
import { parseReceipt } from "../receipts.mjs";
import { labelCents } from "./cord-receipts.mjs";

const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// SROIE dates come as 25/12/2018, 2018-12-25, 25 DEC 2018, 25-Dec-18 ...
export function labelDate(s) {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -,]*(\d{2,4})$/);
  if (m) {
    const mo = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ").indexOf(m[2].toUpperCase()) + 1;
    if (mo) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Word boxes (x1,y1,...,x4,y4,text) joined into printed rows, as an OCR engine
// reports lines: boxes whose vertical centres fall within half a box height
// share a row, left to right. Without this a label and its amount, printed on
// one row, are separate lines and the reader is tested on the dataset's box
// order instead of the receipt.
export function rowsOf(csv) {
  const boxes = [];
  for (const l of csv.split(/\r?\n/)) {
    const m = l.match(/^((?:-?\d+,){8})(.*)$/);
    if (!m || !m[2].trim()) continue;
    const n = m[1].split(",").filter(Boolean).map(Number);
    const xs = [n[0], n[2], n[4], n[6]], ys = [n[1], n[3], n[5], n[7]];
    boxes.push({ x: Math.min(...xs), cy: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(...ys) - Math.min(...ys), t: m[2].trim() });
  }
  boxes.sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const b of boxes) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(b.cy - r.cy) <= Math.max(b.h, r.h) / 2) { r.items.push(b); r.cy = r.items.reduce((s, x) => s + x.cy, 0) / r.items.length; r.h = Math.max(r.h, b.h); }
    else rows.push({ cy: b.cy, h: b.h, items: [b] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((x) => x.t).join("  ")).join("\n");
}

export function load(dir, ocrDir = null) {
  const rows = [];
  for (const f of readdirSync(`${dir}/key`).filter((x) => x.endsWith(".json")).sort()) {
    let key;
    try { key = JSON.parse(readFileSync(`${dir}/key/${f}`, "utf8")); } catch { continue; }
    const id = f.replace(/\.json$/, "");
    if (ocrDir && !existsSync(`${ocrDir}/${id}.txt`)) continue;
    const text = ocrDir ? cleanOcr(readFileSync(`${ocrDir}/${id}.txt`, "utf8")) : rowsOf(readFileSync(`${dir}/box/${id}.csv`, "utf8"));
    rows.push({ id: f.replace(/\.json$/, ""), key, text });
  }
  return rows;
}

export function score(rows) {
  const r = { receipts: rows.length, merchant: { exact: 0, contained: 0, wrong: 0, none: 0 }, date: { labelled: 0, right: 0, wrong: 0, none: 0 }, total: { labelled: 0, right: 0, within5: 0, wrong: 0, none: 0 }, misses: { merchant: [], date: [], total: [] } };
  for (const row of rows) {
    const p = parseReceipt(row.text);
    const want = norm(row.key.company), got = norm(p.merchant);
    if (!got) { r.merchant.none++; r.misses.merchant.push({ id: row.id, want: row.key.company, got: null }); }
    else if (got === want) r.merchant.exact++;
    else if (want && (want.includes(got) || got.includes(want))) r.merchant.contained++;
    else { r.merchant.wrong++; r.misses.merchant.push({ id: row.id, want: row.key.company, got: p.merchant }); }
    const d = labelDate(row.key.date);
    if (d) {
      r.date.labelled++;
      if (p.date === d) r.date.right++;
      else { if (p.date) r.date.wrong++; else r.date.none++; r.misses.date.push({ id: row.id, want: row.key.date, got: p.date }); }
    }
    const t = labelCents(row.key.total);
    if (t !== null) {
      r.total.labelled++;
      if (p.cents === t) r.total.right++;
      else {
        if (p.cents !== null && Math.abs(p.cents - t) <= 5) r.total.within5++; if (p.cents === null) r.total.none++; else r.total.wrong++; r.misses.total.push({ id: row.id, want: t, got: p.cents, line: p.totalLine }); }
    }
  }
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const oi = process.argv.indexOf("--ocr");
  const rows = load(process.argv[2], oi > 0 ? process.argv[oi + 1] : null);
  const r = score(rows);
  const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : "0"}%)`;
  console.log(`${process.argv[2]}: ${r.receipts} receipts`);
  console.log(`merchant exact ${pct(r.merchant.exact, r.receipts)}, name contained either way ${r.merchant.contained}, wrong ${r.merchant.wrong}, none ${r.merchant.none}`);
  console.log(`date  right ${pct(r.date.right, r.date.labelled)}, wrong ${r.date.wrong}, none ${r.date.none}`);
  console.log(`total right ${pct(r.total.right, r.total.labelled)}, off by 5 cents or less (rounding line) ${r.total.within5}, wrong ${r.total.wrong}, none ${r.total.none}`);
  const i = process.argv.indexOf("--misses");
  if (i > 0) for (const m of r.misses[process.argv[i + 1]] ?? []) console.log(JSON.stringify(m));
}
