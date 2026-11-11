// Receipt text from a file: plain text as is, a PDF through `pdftotext -layout`
// (poppler), a photo through `tesseract` (or any command named in RECEIPT_OCR_CMD,
// which gets the file path as its last argument and prints text). The tools run on
// your machine; nothing is uploaded. If the tool is missing the error says how to
// get it. `cleanOcr` repairs the digit look-alikes OCR leaves in amounts and dates.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import { cleanOcr } from "./cleanocr.mjs";
import { decodeBytes } from "./textcodec.mjs";
import { xlsxToCsvSync, looksLikeXlsx } from "./xlsx.mjs";
import { xlsToCsv, looksLikeXls } from "./xls.mjs";

export { cleanOcr };

const DEFAULT_OCR = "tesseract {file} stdout --psm 6";
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif"]);

export function receiptTextFromFile(path, { run = spawnSync, env = process.env } = {}) {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") {
    const r = run("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
    if (r.error || r.status !== 0) throw new Error(`could not read ${path} as a PDF: pdftotext (poppler-utils) is needed${r.stderr ? `: ${String(r.stderr).trim().slice(0, 120)}` : ""}`);
    if (!r.stdout.trim()) throw new Error(`${path} has no text layer (a scan); run OCR on it first, or export it as an image so tesseract can read it`);
    return r.stdout;
  }
  if (IMAGE.has(ext)) {
    // --psm 6 (one block of text): on SROIE's 626 receipt scans tesseract's own
    // default (--psm 3, page layout analysis) read the total right on 67.5%, --psm 6
    // on 76.2% (README "Totals checked against the receipt's own arithmetic")
    const cmd = (env.RECEIPT_OCR_CMD || DEFAULT_OCR).split(/\s+/);
    const args = cmd.slice(1).map((a) => (a === "{file}" ? path : a));
    if (!cmd.slice(1).includes("{file}")) args.push(path);
    const r = run(cmd[0], args, { encoding: "utf8" });
    if (r.error || r.status !== 0) throw new Error(`could not read ${path} as an image: ${cmd[0]} is needed (install tesseract-ocr, or set RECEIPT_OCR_CMD to a command that prints the text)`);
    return cleanOcr(r.stdout);
  }
  return readFileSync(path, "utf8");
}

// A photo read twice, for parseReceiptPasses: the OCR command as configured, then
// the same tesseract command with `--psm 4` (one column of text of varying sizes,
// which is what a till slip is). Where the two readings disagree on the total,
// the receipt's own arithmetic picks one (receipts.mjs). Text and PDF files, and
// an OCR command that is not tesseract, have one reading. A second pass that
// fails is dropped, not an error.
export function receiptPassesFromFile(path, { run = spawnSync, env = process.env } = {}) {
  const first = receiptTextFromFile(path, { run, env });
  if (!IMAGE.has(extname(path).toLowerCase())) return [first];
  const base = env.RECEIPT_OCR_CMD || DEFAULT_OCR;
  if (!/^\S*tesseract\b/.test(base) || /--psm\s+4\b/.test(base)) return [first];
  const second = /--psm\s+\d+/.test(base) ? base.replace(/--psm\s+\d+/, "--psm 4") : `${base} --psm 4`;
  try { return [first, receiptTextFromFile(path, { run, env: { ...env, RECEIPT_OCR_CMD: second } })]; } catch { return [first]; }
}

// A bank statement that is a PDF file: the same pdftotext route as a receipt, and
// the text goes to the pasted-statement reader. Other files are read as they are.
export function statementTextFromFile(path, { run = spawnSync } = {}) {
  if (extname(path).toLowerCase() !== ".pdf") {
    const bytes = readFileSync(path);
    // an Excel export (.xlsx, or the older .xls) is read to CSV in-process
    return looksLikeXlsx(bytes) ? xlsxToCsvSync(bytes) : looksLikeXls(bytes) ? xlsToCsv(bytes) : decodeBytes(bytes);
  }
  const r = run("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`could not read ${path} as a PDF: pdftotext (poppler-utils) is needed${r.stderr ? `: ${String(r.stderr).trim().slice(0, 120)}` : ""}`);
  if (!r.stdout.trim()) throw new Error(`${path} has no text layer (a scan); statements are not OCR'd, download the bank's CSV or OFX instead`);
  return r.stdout;
}
