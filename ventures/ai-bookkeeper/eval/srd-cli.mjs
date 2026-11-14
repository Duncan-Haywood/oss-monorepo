// Reads every photo in <photos> the way the CLI's `receipts FILE --four-pass` does
// (ocr.mjs receiptPassesFromFile with grow 2000: tesseract --psm 6 and 4 on the
// photo, then on an ImageMagick grey copy at 2,000 px) and writes the readings to
// <out>/psm6, psm4, g6 and g4 (<id>.txt; an empty file where a reading was not made),
// so eval/cord-receipts.mjs can score them:
//   node eval/srd-cli.mjs <photos> <out> [shard of shards, e.g. 1/4]
//   node eval/cord-receipts.mjs eval/srd/labels.jsonl --ocr <out>/psm6,<out>/psm4,<out>/g6,<out>/g4
// Needs the tesseract binary and ImageMagick on PATH. Photos: eval/srd-fetch.mjs.
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { receiptPassesFromFile } from "../ocr.mjs";

const [dir, out, shard = "1/1"] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: node eval/srd-cli.mjs <photos> <out> [k/n]"); process.exit(2); }
const [k, n] = shard.split("/").map(Number);
const names = ["psm6", "psm4", "g6", "g4"];
for (const d of names) mkdirSync(join(out, d), { recursive: true });
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().filter((_, i) => i % n === k - 1);
let done = 0;
for (const f of files) {
  const id = f.replace(/\.[^.]+$/, "");
  if (existsSync(join(out, "g4", `${id}.txt`))) continue;
  const texts = receiptPassesFromFile(join(dir, f), { env: {}, grow: 2000 });
  names.forEach((d, i) => writeFileSync(join(out, d, `${id}.txt`), texts[i] ?? ""));
  if (++done % 10 === 0) console.error(`${shard}: ${done} of ${files.length}`);
}
console.log(`${shard}: ${files.length} photos read`);
