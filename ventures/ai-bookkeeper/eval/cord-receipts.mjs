// Scores parseReceipt on CORD-v2 (Clova AI, CC BY 4.0): real Indonesian shop
// and restaurant receipts whose total, subtotal and tax were labelled by hand.
// The text is the dataset's own word boxes (hand-corrected OCR), rows top to
// bottom and words left to right, so it tests reading a real layout, not OCR.
// Merchant names and dates are masked in CORD, so only amounts are scored.
//   node eval/cord-receipts.mjs eval/cord/validation.jsonl [--json] [--misses] [--tax-misses]
// --misses lists the receipts whose total was misread; --tax-misses those whose tax was
// (labelled and read wrong or not at all, or read where none is labelled), with the tax line.
// --ocr <dir>[,<dir2>] reads each receipt from <dir>/<id>.txt instead: what an OCR
// engine printed from CORD's own phone photo (eval/cord_images.py writes the photos,
// eval/sroie-tesseractjs.mjs reads them with the page's engine in both modes). With two
// folders it scores parseReceiptPasses; add --settled to score what the page puts in
// the receipts box (photoocr.mjs settleReadings). Receipts with no OCR file are left out.
// --lead: the first folder is a stronger engine's reading (RapidOCR), as the CLI's
// `--rapidocr --four-pass` and the page mark it (receipts.mjs parseReceiptPasses `lead`).
import { readFileSync, existsSync } from "node:fs";
import { cleanOcr } from "../cleanocr.mjs";
import { parseReceipt, parseReceiptPasses } from "../receipts.mjs";
import { settleReadings } from "../photoocr.mjs";
import { pathToFileURL } from "node:url";

// A label in the receipt's own style ("60.000", "28,000", "91000", "1.234,50")
// as a number in minor units. Rupiah are written with no decimals, so a lone
// separator before three digits groups thousands.
// A rate printed in the label ("10% 4,818", "Pb1 10% 7,000": two train taxes) and a
// tax code glued to a digit ("Pb1") are not part of the amount; before 2026-11-18 their
// digits were read into it (10% 4,818 scored as 104,818), so a right read counted wrong.
export function labelCents(v) {
  if (v == null) return null;
  const s = String(v).replace(/\d+(?:[.,]\d+)?\s*%/g, " ").split(/\s+/)
    .filter((w) => !/^[A-Za-z]+\d+$/.test(w)).join(" ").replace(/[^0-9.,]/g, "");
  if (!/\d/.test(s)) return null;
  const m = s.match(/^(.*\d)[.,](\d{1,2})$/);
  const whole = (m ? m[1] : s).replace(/[.,]/g, "");
  const frac = m ? m[2].padEnd(2, "0") : "00";
  return Number(whole) * 100 + Number(frac);
}

// CORD lists a receipt's tax lines when it has several (["9,817.8", "0"]: a 10% line and
// a 0% one; ["10.000%", "546"]: a rate box and its amount), so the tax is their sum; a
// rate-only entry adds nothing. Joining them as one string, as before 2026-11-18, read
// ["10.000%", "546"] as 10,000,546.
export function taxLabelCents(v) {
  if (!Array.isArray(v)) return labelCents(v);
  const parts = v.map(labelCents).filter((c) => c !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

// Swap each row's hand-corrected text for OCR output: `texts` (cleaned) and `raw` when
// two readings are given, as eval/sroie-receipts.mjs load() does.
export function withOcr(rows, ocr) {
  const dirs = String(ocr).split(",");
  return rows.filter((row) => dirs.every((d) => existsSync(`${d}/${row.id}.txt`))).map((row) => {
    const raw = dirs.map((d) => readFileSync(`${d}/${row.id}.txt`, "utf8"));
    const texts = raw.map(cleanOcr);
    return { ...row, text: texts[0], ...(texts.length > 1 ? { texts, raw } : {}) };
  });
}

export function score(rows, { settled = false, lead = false } = {}) {
  const r = { receipts: rows.length, total: { labelled: 0, right: 0, wrong: 0, none: 0 }, tax: { labelled: 0, right: 0, wrong: 0, none: 0, unlabelledRead: 0 }, misses: [], taxMisses: [] };
  for (const row of rows) {
    const s = row.texts && settled ? settleReadings(row.raw, { lead }) : null;
    const p = row.texts ? (s ? parseReceipt(s.text) : parseReceiptPasses(row.texts, { lead })) : parseReceipt(row.text);
    const want = labelCents(row.total);
    if (want !== null) {
      r.total.labelled++;
      if (p.cents === want) { r.total.right++; if (s?.note) r.total.rightWarned = (r.total.rightWarned ?? 0) + 1; }
      else {
        if (p.cents === null) r.total.none++; else r.total.wrong++;
        // --settled: did the page's status line warn about this photo's total?
        if (s && p.cents !== null) r.total[s.note ? "wrongWarned" : "wrongSilent"] = (r.total[s.note ? "wrongWarned" : "wrongSilent"] ?? 0) + 1;
        r.misses.push({ id: row.id, want, got: p.cents, line: p.totalLine });
      }
    }
    const tax = taxLabelCents(row.tax);
    if (tax !== null) {
      r.tax.labelled++;
      if (p.taxCents === tax) r.tax.right++;
      else {
        if (p.taxCents === null) r.tax.none++; else r.tax.wrong++;
        r.taxMisses.push({ id: row.id, want: tax, got: p.taxCents, line: p.taxLine ?? null });
      }
    } else if (p.taxCents !== null) {
      r.tax.unlabelledRead++;
      r.taxMisses.push({ id: row.id, want: null, got: p.taxCents, line: p.taxLine ?? null });
    }
  }
  return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  let rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const oi = process.argv.indexOf("--ocr");
  if (oi > 0) rows = withOcr(rows, process.argv[oi + 1]);
  const r = score(rows, { settled: process.argv.includes("--settled"), lead: process.argv.includes("--lead") });
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ...r, misses: process.argv.includes("--misses") ? r.misses : r.misses.length,
    taxMisses: process.argv.includes("--tax-misses") ? r.taxMisses : r.taxMisses.length }, null, 2));
  else {
    const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : "0"}%)`;
    console.log(`${file}: ${r.receipts} receipts`);
    console.log(`total right ${pct(r.total.right, r.total.labelled)}, wrong ${r.total.wrong}, none ${r.total.none}`);
    if (process.argv.includes("--settled")) console.log(`page warned: on ${r.total.wrongWarned ?? 0} wrong totals and ${r.total.rightWarned ?? 0} right ones; wrong with no warning ${r.total.wrongSilent ?? 0}`);
    console.log(`tax   right ${pct(r.tax.right, r.tax.labelled)}, wrong ${r.tax.wrong}, none ${r.tax.none}; tax read where none labelled ${r.tax.unlabelledRead}`);
    if (process.argv.includes("--misses")) for (const m of r.misses) console.log(m);
    if (process.argv.includes("--tax-misses")) for (const m of r.taxMisses) console.log({ tax: true, ...m });
  }
}
