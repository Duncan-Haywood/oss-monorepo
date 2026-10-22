// Receipt text from a file: plain text as is, a PDF through `pdftotext -layout`
// (poppler), a photo through `tesseract` (or any command named in RECEIPT_OCR_CMD,
// which gets the file path as its last argument and prints text). The tools run on
// your machine; nothing is uploaded. If the tool is missing the error says how to
// get it. `cleanOcr` repairs the digit look-alikes OCR leaves in amounts and dates.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import { cleanOcr } from "./cleanocr.mjs";

export { cleanOcr };

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
    const cmd = (env.RECEIPT_OCR_CMD || "tesseract {file} stdout").split(/\s+/);
    const args = cmd.slice(1).map((a) => (a === "{file}" ? path : a));
    if (!cmd.slice(1).includes("{file}")) args.push(path);
    const r = run(cmd[0], args, { encoding: "utf8" });
    if (r.error || r.status !== 0) throw new Error(`could not read ${path} as an image: ${cmd[0]} is needed (install tesseract-ocr, or set RECEIPT_OCR_CMD to a command that prints the text)`);
    return cleanOcr(r.stdout);
  }
  return readFileSync(path, "utf8");
}
