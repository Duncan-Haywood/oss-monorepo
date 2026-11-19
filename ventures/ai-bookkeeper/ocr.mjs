// Receipt text from a file: plain text as is, a PDF through `pdftotext -layout`
// (poppler), a photo through `tesseract` (or any command named in RECEIPT_OCR_CMD,
// which gets the file path as its last argument and prints text). The tools run on
// your machine; nothing is uploaded. If the tool is missing the error says how to
// get it. `cleanOcr` repairs the digit look-alikes OCR leaves in amounts and dates.
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { cleanOcr } from "./cleanocr.mjs";
import { decodeBytes } from "./textcodec.mjs";
import { xlsxToCsvSync, looksLikeXlsx } from "./xlsx.mjs";
import { xlsToCsv, looksLikeXls } from "./xls.mjs";
import { readStatement, checkRunningBalance } from "./bank.mjs";
import { lightSpread, SHADED_CUT, SHADE_SIDE } from "./photoocr.mjs";
import { needsSellerLook, withBandSeller } from "./receipts.mjs";

export { cleanOcr };

const DEFAULT_OCR = "tesseract {file} stdout --psm 6";

// How the OCR commands run (2026-11-18, eval/ocr-time-limit-2026-11-18.md). tesseract's
// OpenMP build starts a thread per core that spins while it waits; with any other work on
// the machine (a second tesseract, a browser, a build) a 0.9 s read of a Russian receipt
// photo ran past 60 s, and two at once never finished. With OMP_THREAD_LIMIT=1 (tesseract's
// own advice for running several at once) the same read takes 0.85 s alone and twelve at
// once finish in 3 s, with the same text. So every OCR command runs with OMP_THREAD_LIMIT=1
// unless the caller's environment sets it, and with a time limit, OCR_TIMEOUT seconds
// (default 120; 0 for none), so a read that still stalls ends with a message, not a hang.
export const OCR_TIMEOUT_S = 120;
export function ocrRunOptions(env = process.env, extra = {}) {
  const t = Number(env.OCR_TIMEOUT ?? process.env.OCR_TIMEOUT ?? OCR_TIMEOUT_S);
  const limit = env.OMP_THREAD_LIMIT || process.env.OMP_THREAD_LIMIT || "1";
  const o = { encoding: "utf8", ...extra, env: { ...process.env, OMP_THREAD_LIMIT: limit } };
  if (Number.isFinite(t) && t > 0) { o.timeout = Math.round(t * 1000); o.killSignal = "SIGKILL"; }
  return o;
}
function timedOut(r) { return r.error?.code === "ETIMEDOUT"; }
function timeoutError(path, tool, opts) {
  const e = new Error(`could not read ${path}: ${tool} gave no reading within ${opts.timeout / 1000} s and was stopped (set OCR_TIMEOUT to a longer limit in seconds, or 0 for none)`);
  e.timedOut = true;
  return e;
}
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp", ".gif"]);

export function receiptTextFromFile(path, { run = spawnSync, env = process.env, retried = false } = {}) {
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
    const ro = ocrRunOptions(env);
    let r = run(cmd[0], args, ro);
    if (timedOut(r)) throw timeoutError(path, cmd[0], ro);
    // a damaged JPEG (one of SROIE's 626 scans) that tesseract's image library refuses
    // but ImageMagick salvages is read again as a PNG copy
    if (!r.error && r.status !== 0 && !retried) {
      const copy = imageCopyFile(path, run);
      if (copy) try { return receiptTextFromFile(copy.file, { run, env, retried: true }); } catch {} finally { copy.done(); }
    }
    if (r.error || r.status !== 0) throw new Error(`could not read ${path} as an image: ${r.error ? `${cmd[0]} is needed (install tesseract-ocr, or set RECEIPT_OCR_CMD to a command that prints the text)` : `${cmd[0]} failed${r.stderr ? `: ${String(r.stderr).trim().split("\n").pop().slice(0, 120)}` : ""}`}`);
    return cleanOcr(r.stdout);
  }
  return readFileSync(path, "utf8");
}

// A photo read twice, for parseReceiptPasses: the OCR command as configured, then
// the same tesseract command with `--psm 4` (one column of text of varying sizes,
// which is what a till slip is). Where the two readings disagree on the total,
// the receipt's own arithmetic picks one (receipts.mjs). An unevenly lit photo
// (photoocr.mjs lightSpread of ImageMagick's 32 x 32 grey thumbnail at or over
// SHADED_CUT: a shadow, a dim room, a slip held in the hand) gets tesseract's local
// (Sauvola) threshold for the second reading instead, `-c thresholding_method=2`,
// which keeps the print on the dark side: on ExpressExpense's 196 US receipt photos
// `--two-pass` went from 113 to 120 totals right and `--four-pass` from 131 to 146
// (README, "Shaded photos: a local threshold"). Without ImageMagick it stays
// `--psm 4`. Text and PDF files, and an OCR command that is not tesseract, have one
// reading. A second pass that fails is dropped, not an error.
export const LOCAL_THRESHOLD = "-c thresholding_method=2";
// A lead reading by a second engine, read before tesseract's readings and voted with them
// (receipts.mjs parseReceiptPasses); a failure there is dropped. `lead` is a function of the
// photo's path (cli.mjs `--rapidocr --four-pass` passes receiptTextRapid), or RECEIPT_OCR_LEAD
// names a command shaped like RECEIPT_OCR_CMD. RapidOCR first, then tesseract's four, with the
// lead's total kept over an unconfirmed majority: on 600 CORD train photos totals 542 of 583
// (tesseract's four 367, RapidOCR alone 539) and tax 209 of 267 (RapidOCR alone 177)
// (README, "RapidOCR's total kept over an unconfirmed tesseract majority").
export function receiptPassesFromFile(path, opts = {}) {
  const { run = spawnSync, env = process.env, lead = null } = opts;
  const image = IMAGE.has(extname(path).toLowerCase());
  const read = lead ?? (env.RECEIPT_OCR_LEAD ? (p) => receiptTextFromFile(p, { run, env: { ...env, RECEIPT_OCR_CMD: env.RECEIPT_OCR_LEAD } }) : null);
  let first = null;
  if (read && image) try { const t = read(path); first = String(t ?? "").trim() ? t : null; } catch {}
  let rest;
  // with the lead's reading in hand, a tesseract that fails or runs out of time leaves the lead's
  try { rest = tesseractPasses(path, opts); } catch (e) { if (!first) throw e; return [first]; }
  if (!first) return rest;
  // marked so the vote knows the first reading is the lead (receipts.mjs parseReceiptPasses `lead`)
  return Object.defineProperty([first, ...rest], "lead", { value: true });
}

function tesseractPasses(path, { run = spawnSync, env = process.env, grow = 0 } = {}) {
  const first = receiptTextFromFile(path, { run, env });
  if (!IMAGE.has(extname(path).toLowerCase())) return [first];
  const base = env.RECEIPT_OCR_CMD || DEFAULT_OCR;
  if (!/^\S*tesseract\b/.test(base) || /--psm\s+4\b/.test(base) || /thresholding_method/.test(base)) return [first];
  const spread = photoSpread(path, run);
  const second = spread !== null && spread >= SHADED_CUT ? `${base} ${LOCAL_THRESHOLD}`
    : /--psm\s+\d+/.test(base) ? base.replace(/--psm\s+\d+/, "--psm 4") : `${base} --psm 4`;
  let out;
  try { out = [first, receiptTextFromFile(path, { run, env: { ...env, RECEIPT_OCR_CMD: second } })]; } catch (e) {
    // a pass that ran out of time: the other passes of the same photo would too
    if (e.timedOut) return [first];
    out = [first];
  }
  if (!grow) return out;
  // --four-pass: the photo is also read as a grey copy with its long side at `grow`
  // pixels (ImageMagick), the same two ways, and the readings vote (receipts.mjs
  // voteTotal), as the page does (photoocr.mjs PASSES). A photo under `grow` is
  // enlarged and read after the original. A bigger one (a full-size phone photo, a
  // flatbed scan) is shrunk, and the copy is read first: on SROIE's 189 scans over
  // 2,000 px that took the total from 144 to 155 right and the date from 149 to 152
  // (README, "Full-size photos"). A missing ImageMagick leaves the two readings.
  const copy = greyCopyFile(path, grow, run);
  if (!copy) return out;
  const more = [];
  try {
    for (const cmd of [base, second]) {
      try { more.push(receiptTextFromFile(copy.file, { run, env: { ...env, RECEIPT_OCR_CMD: cmd } })); } catch (e) { if (e.timedOut) break; }
    }
  } finally { copy.done(); }
  return copy.shrunk ? [...more, ...out] : [...out, ...more];
}

// A photo read by RapidOCR (rapidocr_rows.py next to this file: PaddleOCR's models through
// ONNX Runtime, on this machine) instead of tesseract, for `receipts FILE --rapidocr`. Runs
// `python3`, or the interpreter in RAPIDOCR_PYTHON. One reading: on 200 CORD train photos it
// read 172 totals right where tesseract's four readings and their vote read 122 (README, "A
// second OCR engine for photos"). Text and PDF files go the usual way.
export const RAPIDOCR_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "rapidocr_rows.py");
export function receiptTextRapid(path, { run = spawnSync, env = process.env } = {}) {
  if (!IMAGE.has(extname(path).toLowerCase())) return receiptTextFromFile(path, { run, env });
  const py = env.RAPIDOCR_PYTHON || "python3";
  const ro = ocrRunOptions(env, { maxBuffer: 1 << 24 });
  const r = run(py, [RAPIDOCR_SCRIPT, path], ro);
  if (timedOut(r)) throw timeoutError(path, "RapidOCR", ro);
  if (r.error) throw new Error(`could not read ${path} with RapidOCR: ${py} is needed (or set RAPIDOCR_PYTHON)`);
  if (r.status !== 0) throw new Error(`could not read ${path} with RapidOCR: ${String(r.stderr || "").trim().split("\n").pop().slice(0, 160) || `${py} failed`}`);
  const text = cleanOcr(r.stdout);
  // A Russian slip whose reading names no seller is read again as three bands enlarged twice
  // (rapidocr_rows.py --bands), and a seller found there leads the text (receipts.mjs
  // withBandSeller); a second look that fails or runs out of time keeps the first reading.
  if (!needsSellerLook(text)) return text;
  const b = run(py, [RAPIDOCR_SCRIPT, "--bands", path], ro);
  return !b || b.error || b.status !== 0 || timedOut(b) ? text : withBandSeller(text, cleanOcr(b.stdout));
}

// The grey copy the page draws (photoocr.mjs greyCopy), made with ImageMagick:
// grey, resized so the long side is `side` pixels, enlarged or shrunk (`shrunk`
// says which). Null when the photo is exactly that size, or when ImageMagick
// (`magick`, or the older `convert`) is not there.
export function greyCopyFile(path, side, run = spawnSync) {
  const size = imageSize(path, run);
  const long = size ? Math.max(size.w, size.h) : 0;
  if (!size || long === side) return null;
  const copy = magickCopy(path, ["-colorspace", "Gray", "-resize", `${side}x${side}`], "grey.png", size.tool, run);
  return copy && { ...copy, shrunk: long > side };
}

// photoocr.mjs lightSpread of the photo's 32 x 32 grey thumbnail (ImageMagick, each
// pixel the average of its patch, aspect ignored, as the page's canvas draws it), or
// null without ImageMagick.
export function photoSpread(path, run = spawnSync) {
  for (const tool of ["magick", "convert"]) {
    const r = run(tool, [`${path}[0]`, "-colorspace", "Gray", "-resize", `${SHADE_SIDE}x${SHADE_SIDE}!`, "-depth", "8", "gray:-"], { maxBuffer: 1 << 20 });
    if (r.error || r.status !== 0 || !r.stdout || r.stdout.length !== SHADE_SIDE * SHADE_SIDE) continue;
    return lightSpread(r.stdout);
  }
  return null;
}

// A plain PNG copy of a photo, made by ImageMagick; null without it.
export function imageCopyFile(path, run = spawnSync) {
  const size = imageSize(path, run);
  return size ? magickCopy(path, [], "copy.png", size.tool, run) : null;
}

function imageSize(path, run) {
  for (const [cmd, pre, tool] of [["magick", ["identify"], "magick"], ["identify", [], "convert"]]) {
    const r = run(cmd, [...pre, "-format", "%w %h", `${path}[0]`], { encoding: "utf8" });
    const m = !r.error && r.status === 0 && String(r.stdout).trim().match(/^(\d+) (\d+)/);
    if (m) return { w: +m[1], h: +m[2], tool };
  }
  return null;
}

function magickCopy(path, ops, name, tool, run) {
  const dir = mkdtempSync(join(tmpdir(), "receipt-"));
  const file = join(dir, name);
  const r = run(tool, [`${path}[0]`, ...ops, file], { encoding: "utf8" });
  if (r.error || r.status !== 0) { rmSync(dir, { recursive: true, force: true }); return null; }
  return { file, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// A bank statement that is a PDF file: the same pdftotext route as a receipt, and
// the text goes to the pasted-statement reader. Other files are read as they are.
export function statementTextFromFile(path, opts = {}) {
  return readStatementFile(path, opts).text;
}

const STATEMENT_OCR = "tesseract {file} stdout --psm 6";

// -> { text, ocr: null | { pages, tool, passes, score } }. A PDF with no text layer
// (a scan), or a photo of a statement page, is read by OCR: pdftoppm draws each page
// at 300 dpi in grey and tesseract reads it as one block of text (--psm 6 keeps each
// statement row on one line), or STATEMENT_OCR_CMD if set. The text then goes
// through cleanOcr's digit look-alike repair. OCR misreads digits, so the reading is
// checked against the statement's own arithmetic (`statementScore`: running-balance
// breaks, and whether opening plus the rows reaches the closing balance). When that
// check fails and the reader is tesseract, the pages are read again as one column
// (--psm 4) and the reading with fewer faults is kept, the way a receipt photo is
// read twice (receipts.mjs). Nothing is uploaded.
export function readStatementFile(path, { run = spawnSync, env = process.env, dayFirst = false, decimalComma = false, year, maxPasses = 2 } = {}) {
  const ext = extname(path).toLowerCase();
  if (!IMAGE.has(ext) && ext !== ".pdf") {
    const bytes = readFileSync(path);
    // an Excel export (.xlsx, or the older .xls) is read to CSV in-process
    return { text: looksLikeXlsx(bytes) ? xlsxToCsvSync(bytes) : looksLikeXls(bytes) ? xlsToCsv(bytes) : decodeBytes(bytes), ocr: null };
  }
  let dir = null, pages = [path];
  try {
    if (ext === ".pdf") {
      const r = run("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
      if (r.error || r.status !== 0) throw new Error(`could not read ${path} as a PDF: pdftotext (poppler-utils) is needed${r.stderr ? `: ${String(r.stderr).trim().slice(0, 120)}` : ""}`);
      if (r.stdout.trim()) return { text: r.stdout, ocr: null };
      // a scan: no text layer
      dir = mkdtempSync(join(tmpdir(), "statement-"));
      const p = run("pdftoppm", ["-r", "300", "-gray", "-png", path, join(dir, "p")], { encoding: "utf8" });
      if (p.error || p.status !== 0) throw new Error(`${path} has no text layer (a scan), and pdftoppm (poppler-utils) could not draw its pages for OCR${p.stderr ? `: ${String(p.stderr).trim().slice(0, 120)}` : ""}`);
      pages = readdirSync(dir).filter((f) => /^p-\d+\.png$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).map((f) => join(dir, f));
      if (!pages.length) throw new Error(`${path} has no text layer and no pages to read`);
    }
    const base = env.STATEMENT_OCR_CMD || STATEMENT_OCR;
    const readAll = (cmd) => pages.map((f) => ocrPage(f, cmd, run, env)).join("\n\f\n");
    const text = readAll(base);
    if (!text.trim()) throw new Error(`${path} is a scan and OCR found no text on it`);
    const opts = { dayFirst, decimalComma, year };
    const score = statementScore(text, opts);
    const info = { pages: pages.length, tool: base.split(/\s+/)[0], passes: 1, score };
    if (!score || maxPasses < 2 || !/^\S*tesseract\b/.test(base) || /--psm\s+4\b/.test(base)) return { text, ocr: info };
    const second = /--psm\s+\d+/.test(base) ? base.replace(/--psm\s+\d+/, "--psm 4") : `${base} --psm 4`;
    let other;
    try { other = readAll(second); } catch { return { text, ocr: info }; }
    const s2 = statementScore(other, opts);
    info.passes = 2;
    if (s2 !== null && s2 < score) return { text: other, ocr: { ...info, score: s2, chose: "--psm 4" } };
    return { text, ocr: info };
  } finally { if (dir) rmSync(dir, { recursive: true, force: true }); }
}

// How far a statement reading is from adding up, read the way an OCR reading is
// (rows repaired from the running balance where the evidence is two-sided):
// running-balance breaks, plus one if opening plus the rows misses the closing
// balance, plus one per unreadable amount, plus a half per repaired row. 0 means every check it carries passes; null means it carries no check
// (no running balance, no opening and closing), so nothing can be judged.
export function statementScore(text, opts = {}) {
  const r = readStatement(text, { ...opts, ocr: true });
  if (!r.rows?.length) return null;
  const bc = checkRunningBalance(r.rows);
  const flipped = bc.checked ? checkRunningBalance(r.rows.map((x) => ({ ...x, balance: x.balance === null ? null : -x.balance }))) : null;
  // most rows carry a balance and some lost theirs: each one that lost it is a fault
  const withBal = r.rows.filter((x) => x.balance !== null).length;
  const lost = withBal >= r.rows.length / 2 && withBal < r.rows.length ? r.rows.length - withBal : 0;
  const breaks = bc.checked ? Math.min(bc.breaks.length, flipped.breaks.length) : lost || null;
  const total = r.check ? (r.check.ok ? 0 : 1) : null;
  if (breaks === null && total === null) return null;
  // a row put back from the running balance (statementtext.mjs repairByBalance) is
  // half a fault: a reading that needed no repair beats one that did
  return (breaks ?? 0) + (total ?? 0) + (r.problems ?? []).filter((p) => /unreadable amount/.test(p)).length + 0.5 * (r.repaired?.length ?? 0);
}

function ocrPage(file, command, run, env = process.env) {
  const cmd = command.split(/\s+/);
  const args = cmd.slice(1).map((a) => (a === "{file}" ? file : a));
  if (!cmd.slice(1).includes("{file}")) args.push(file);
  const ro = ocrRunOptions(env, { maxBuffer: 64 << 20 });
  const r = run(cmd[0], args, ro);
  if (timedOut(r)) throw timeoutError(file, cmd[0], ro);
  if (r.error || r.status !== 0) throw new Error(`could not OCR ${file}: ${r.error ? `${cmd[0]} is needed (install tesseract-ocr, or set STATEMENT_OCR_CMD to a command that prints the text)` : `${cmd[0]} failed${r.stderr ? `: ${String(r.stderr).trim().split("\n").pop().slice(0, 120)}` : ""}`}`);
  return cleanOcr(String(r.stdout));
}
