// Scores the receipt reader's date (and shop name) on ExpressExpense's SRD US
// receipt photos, against the dates read by eye in eval/srd/dates.jsonl. SROIE
// (Malaysian, day-first) was the only place receipt dates were measured; these are
// mostly US receipts, printed month-first, which is what most of the page's users
// photograph. Readings come from eval/sroie-tesseractjs.mjs as for the totals
// (README "US receipt photos"):
//   node eval/srd-dates.mjs eval/srd/dates.jsonl --ocr <ocr>/psm6,<ocr>/psm4,<ocr2>/psm6,<ocr2>/psm4 [--settled] [--lead] [--misses date|merchant] [--half odd|even]
// --settled scores what the page puts in the receipts box (photoocr.mjs settleReadings,
// read by parseReceipt); without it, parseReceiptPasses, as the CLI reads several passes.
// --lead: the first --ocr folder is RapidOCR's reading (rapidocr_rows.py), which leads the
// vote as on the page and with the CLI's --rapidocr --four-pass.
// A label whose date is null (no date printed, cut off, blurred) is not scored for the
// date; "ambiguous" labels (both fields 12 or under, no clue to the country) are
// scored month-first, as labelled, and counted separately.
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cleanOcr } from "../cleanocr.mjs";
import { parseReceipt, parseReceiptPasses } from "../receipts.mjs";
import { settleReadings } from "../photoocr.mjs";

const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function loadLabels(file) {
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// what the reader makes of one photo's readings
export function readPhoto(raw, { settled = false, lead = false } = {}) {
  if (settled) return parseReceipt(settleReadings(raw, { lead }).text);
  const texts = raw.map(cleanOcr);
  return texts.length > 1 ? parseReceiptPasses(texts, { lead }) : parseReceipt(texts[0]);
}

export function scoreDates(labels, readings, { settled = false, lead = false } = {}) {
  const r = { photos: 0, date: { labelled: 0, right: 0, wrong: 0, none: 0, ambiguous: 0, ambiguousRight: 0 }, merchant: { labelled: 0, exact: 0, contained: 0, wrong: 0, none: 0 }, misses: { date: [], merchant: [] } };
  for (const l of labels) {
    const raw = readings(l.id);
    if (!raw || l.duplicate_of) continue;
    r.photos++;
    const p = readPhoto(raw, { settled, lead });
    if (l.date) {
      r.date.labelled++;
      if (l.ambiguous) r.date.ambiguous++;
      if (p.date === l.date) { r.date.right++; if (l.ambiguous) r.date.ambiguousRight++; }
      else { if (p.date) r.date.wrong++; else r.date.none++; r.misses.date.push({ id: l.id, want: l.date, printed: l.printed, got: p.date }); }
    }
    if (l.merchant) {
      r.merchant.labelled++;
      const want = norm(l.merchant), got = norm(p.merchant);
      if (!got) { r.merchant.none++; r.misses.merchant.push({ id: l.id, want: l.merchant, got: null }); }
      else if (got === want) r.merchant.exact++;
      else if (want.includes(got) && got.length >= 4 || got.includes(want)) r.merchant.contained++;
      else { r.merchant.wrong++; r.misses.merchant.push({ id: l.id, want: l.merchant, got: p.merchant }); }
    }
  }
  return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const file = process.argv[2], ocr = arg("--ocr");
  if (!file || !ocr) { console.error("usage: node eval/srd-dates.mjs <dates.jsonl> --ocr <dir>[,<dir>...] [--settled] [--misses date|merchant] [--half odd|even]"); process.exit(2); }
  const dirs = ocr.split(",");
  const half = arg("--half");
  let labels = loadLabels(file);
  if (half) labels = labels.filter((l) => (parseInt(l.id, 10) % 2 === 1) === (half === "odd"));
  // a photo with no grown copy has no file in that folder: read as empty, as the page skips it
  const readings = (id) => {
    if (!existsSync(`${dirs[0]}/${id}.txt`)) return null;
    return dirs.map((d) => (existsSync(`${d}/${id}.txt`) ? readFileSync(`${d}/${id}.txt`, "utf8") : ""));
  };
  const r = scoreDates(labels, readings, { settled: process.argv.includes("--settled"), lead: process.argv.includes("--lead") });
  const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : "0"}%)`;
  console.log(`${r.photos} photos read`);
  console.log(`date     right ${pct(r.date.right, r.date.labelled)}, wrong ${r.date.wrong}, none ${r.date.none} (ambiguous order: ${r.date.ambiguousRight} of ${r.date.ambiguous} right)`);
  console.log(`merchant exact ${pct(r.merchant.exact, r.merchant.labelled)}, contained ${r.merchant.contained}, wrong ${r.merchant.wrong}, none ${r.merchant.none}`);
  const m = arg("--misses");
  if (m) for (const x of r.misses[m] ?? []) console.log(JSON.stringify(x));
}
