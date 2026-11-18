// Names on Russian receipt photos (cdek-ocr/receipt-ocr-ru): does an OCR reading hold the
// labelled seller and item names, and does parseReceipt pick the seller as the merchant?
// The labels come from eval/receipt_ocr_ru_names.py, kept outside the repository (sole
// traders are named by their own full name). Both sides are folded before comparing: upper
// case, Ё as Е, and the Latin letters that look like Cyrillic ones (A B C E H K M O P T X Y,
// and 0 for О) read as Cyrillic, so an engine that prints look-alikes is not marked down for
// them; quotes and punctuation are dropped. A name is "read" when some stretch of one line
// matches it at 80% similarity or better (1 - edit distance / length).
//   node eval/receipt-ru-names.mjs /tmp/names-val.jsonl --ocr <dir> [--misses]
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cleanOcr } from "../cleanocr.mjs";
import { parseReceipt } from "../receipts.mjs";

const LOOK = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У", 0: "О", Ё: "Е" };
export const fold = (s) => String(s ?? "").toUpperCase().replace(/[ABCEHKMOPTXY0Ё]/g, (c) => LOOK[c]).replace(/[^\p{L}\d]+/gu, " ").trim();

export function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const similar = (a, b) => { const x = fold(a), y = fold(b); return x && y ? 1 - distance(x, y) / Math.max(x.length, y.length) : 0; };

// the best match of `name` against any stretch of `line` within two characters of its length
export function bestIn(name, line) {
  const n = fold(name), l = fold(line);
  if (!n || !l) return 0;
  if (l.includes(n)) return 1;
  let best = 0;
  for (let len = Math.max(1, n.length - 2); len <= n.length + 2; len++)
    for (let i = 0; i + len <= Math.max(l.length, len); i++) best = Math.max(best, 1 - distance(n, l.slice(i, i + len)) / Math.max(n.length, len));
  return best;
}

export function scoreNames(rows, dir, { at = 0.8 } = {}) {
  const r = { receipts: 0, seller: { labelled: 0, inText: 0, merchant: 0 }, items: { labelled: 0, inText: 0 }, misses: [] };
  for (const row of rows) {
    const f = `${dir}/${row.id}.txt`;
    if (!existsSync(f)) continue;
    r.receipts++;
    const text = cleanOcr(readFileSync(f, "utf8"));
    const lines = text.split("\n");
    if (row.seller) {
      r.seller.labelled++;
      if (lines.some((l) => bestIn(row.seller, l) >= at)) r.seller.inText++;
      const m = parseReceipt(text).merchant;
      if (similar(row.seller, m) >= at) r.seller.merchant++;
      else r.misses.push({ id: row.id, merchant: m });
    }
    for (const it of row.items ?? []) {
      r.items.labelled++;
      if (lines.some((l) => bestIn(it, l) >= at)) r.items.inText++;
    }
  }
  return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const dir = process.argv[process.argv.indexOf("--ocr") + 1];
  const r = scoreNames(rows, dir);
  const pct = (a, b) => `${a}/${b} (${b ? ((100 * a) / b).toFixed(1) : "0"}%)`;
  console.log(`${dir}: ${r.receipts} receipts`);
  console.log(`seller in the text ${pct(r.seller.inText, r.seller.labelled)}; taken as the merchant ${pct(r.seller.merchant, r.seller.labelled)}`);
  console.log(`item names in the text ${pct(r.items.inText, r.items.labelled)}`);
  // the misses print only what the parser picked, never the labelled seller (a person's name)
  if (process.argv.includes("--misses")) for (const m of r.misses) console.log(m);
}
