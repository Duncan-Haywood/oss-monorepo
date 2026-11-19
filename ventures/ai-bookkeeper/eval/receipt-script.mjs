// Scores receiptScript (receipts.mjs), the page's "From the photo" alphabet choice, on folders of
// RapidOCR readings made with the Latin recogniser (eval/rapidocr-photos.py, one <id>.txt per
// photo). Each folder is given with the alphabet its receipts are printed in:
//   node eval/receipt-script.mjs lat-ruval=cyrillic lat-srd=latin
// With --auto <latin dir> <cyrillic dir> <out dir>, it also writes the reading the page would
// keep for each photo (the Cyrillic recogniser's where the Latin reading looks Cyrillic, else the
// Latin one) into <out dir>, for eval/cord-receipts.mjs --ocr to score
// (eval/receipt-script-2026-11-19.md).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { receiptScript } from "../receipts.mjs";

const args = process.argv.slice(2);
const a = args.indexOf("--auto");
if (a >= 0) {
  const [lat, cyr, out] = args.splice(a, 4).slice(1);
  mkdirSync(out, { recursive: true });
  let switched = 0, n = 0;
  for (const f of readdirSync(lat).filter((x) => x.endsWith(".txt"))) {
    n++;
    const c = receiptScript(readFileSync(join(lat, f), "utf8")) === "cyrillic";
    if (c) switched++;
    copyFileSync(join(c ? cyr : lat, f), join(out, f));
  }
  console.log(`--auto: ${switched} of ${n} photos read again in Cyrillic, written to ${out}`);
}
for (const spec of args) {
  const [dir, want] = spec.split("=");
  const files = readdirSync(dir).filter((x) => x.endsWith(".txt"));
  const got = files.map((f) => ({ f, s: receiptScript(readFileSync(join(dir, f), "utf8")) }));
  const right = got.filter((g) => g.s === want).length;
  console.log(`${dir}: ${right} of ${files.length} picked ${want}${right < files.length ? `; other: ${got.filter((g) => g.s !== want).map((g) => g.f).join(", ")}` : ""}`);
}
