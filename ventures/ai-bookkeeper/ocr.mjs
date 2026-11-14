// Receipt text from a file: plain text as is, a PDF through `pdftotext -layout`
// (poppler), a photo through `tesseract` (or any command named in RECEIPT_OCR_CMD,
// which gets the file path as its last argument and prints text). The tools run on
// your machine; nothing is uploaded. If the tool is missing the error says how to
// get it. `cleanOcr` repairs the digit look-alikes OCR leaves in amounts and dates.
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
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
export function receiptPassesFromFile(path, { run = spawnSync, env = process.env, grow = 0 } = {}) {
  const first = receiptTextFromFile(path, { run, env });
  if (!IMAGE.has(extname(path).toLowerCase())) return [first];
  const base = env.RECEIPT_OCR_CMD || DEFAULT_OCR;
  if (!/^\S*tesseract\b/.test(base) || /--psm\s+4\b/.test(base)) return [first];
  const second = /--psm\s+\d+/.test(base) ? base.replace(/--psm\s+\d+/, "--psm 4") : `${base} --psm 4`;
  let out;
  try { out = [first, receiptTextFromFile(path, { run, env: { ...env, RECEIPT_OCR_CMD: second } })]; } catch { out = [first]; }
  if (!grow) return out;
  // --four-pass: a photo under `grow` pixels on its long side is also read as a grey
  // copy enlarged to `grow` (ImageMagick), in both modes, and the readings vote
  // (receipts.mjs voteTotal), as the page does (photoocr.mjs PASSES). A missing
  // ImageMagick, or a photo already that big, leaves the two readings.
  const copy = greyCopyFile(path, grow, run);
  if (!copy) return out;
  try {
    for (const cmd of [base, second]) {
      try { out.push(receiptTextFromFile(copy.file, { run, env: { ...env, RECEIPT_OCR_CMD: cmd } })); } catch {}
    }
  } finally { copy.done(); }
  return out;
}

// The grey copy the page draws (photoocr.mjs greyCopy), made with ImageMagick:
// grey, enlarged so the long side is `side` pixels. Null when the photo is already
// that big, or when ImageMagick (`magick`, or the older `convert`) is not there.
export function greyCopyFile(path, side, run = spawnSync) {
  let tool = null, size = null;
  for (const t of [["magick", ["identify"]], ["identify", []]]) {
    const r = run(t[0], [...t[1], "-format", "%w %h", `${path}[0]`], { encoding: "utf8" });
    if (!r.error && r.status === 0 && /^\d+ \d+/.test(String(r.stdout).trim())) { tool = t[0] === "magick" ? ["magick", []] : ["convert", []]; size = String(r.stdout).trim().split(/\s+/).map(Number); break; }
  }
  if (!tool || Math.max(...size) >= side) return null;
  const dir = mkdtempSync(join(tmpdir(), "receipt-"));
  const file = join(dir, "grey.png");
  const r = run(tool[0], [...tool[1], `${path}[0]`, "-colorspace", "Gray", "-resize", `${side}x${side}`, file], { encoding: "utf8" });
  if (r.error || r.status !== 0) { rmSync(dir, { recursive: true, force: true }); return null; }
  return { file, done: () => rmSync(dir, { recursive: true, force: true }) };
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
