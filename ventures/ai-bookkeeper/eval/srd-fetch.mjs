// Fetches the 200 receipt photos of ExpressExpense's free "large receipt image
// dataset" (SRD; mostly US restaurant and shop receipts on thermal paper, taken
// with a phone) from a public MIT-licensed GitHub copy, pinned to one commit, into
// <out>. The photos are never committed here; only the totals read from them by
// eye are (eval/srd/labels.jsonl).
//   node eval/srd-fetch.mjs <out>
// Then read them with the page's engine and score:
//   node eval/sroie-tesseractjs.mjs <out> <ocr> <node_modules>
//   node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <ocr>/psm6,<ocr>/psm4 --settled
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SRD_REPO = "amannirala13/Bill-Segmentation-OpenCV";
export const SRD_COMMIT = "a98b578ae6032fcf67d64cbbd78dd0e58f457e18";
export const srdUrl = (id) => `https://raw.githubusercontent.com/${SRD_REPO}/${SRD_COMMIT}/Dataset/receipt/p/${id}.jpg`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error("usage: node eval/srd-fetch.mjs <out>"); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const here = dirname(fileURLToPath(import.meta.url));
  const ids = readFileSync(join(here, "srd/labels.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id);
  let got = 0, kept = 0;
  for (const id of ids) {
    const f = join(out, `${id}.jpg`);
    if (existsSync(f)) { kept++; continue; }
    const r = await fetch(srdUrl(id));
    if (!r.ok) { console.error(`${id}: HTTP ${r.status}`); continue; }
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    got++;
  }
  console.log(`${ids.length} photos: ${got} fetched, ${kept} already there`);
}
