// Runs the built-in rules over the Factur-X / ZUGFeRD PDFs of the ZUGFeRD
// community corpus (not copied here): the PDF is unwrapped with facturx.mjs,
// then the embedded UBL/CII is read and checked like any other file. Files in
// the corpus's `correct` folders should draw no arithmetic false positives;
// files in `fail` folders are known-bad, so a finding there is expected.
//
//   git clone --depth 1 https://github.com/ZUGFeRD/corpus
//   node eval/facturx-corpus.mjs path/to/corpus
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractEmbeddedInvoice } from "../facturx.mjs";
import { parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice, looksLikeCii } from "../cii.mjs";
import { checkInvoice } from "../checks.mjs";

const root = process.argv[2];
if (!root) { console.error("usage: node eval/facturx-corpus.mjs <ZUGFeRD corpus checkout>"); process.exit(2); }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.toLowerCase().endsWith(".pdf")) yield path;
  }
}

const groups = {};
const tally = {};
for (const path of [...walk(root)].sort()) {
  const rel = path.slice(root.length + 1);
  const group = /\/fail\//.test(rel) ? "fail" : "correct";
  const g = (groups[group] ||= { pdfs: 0, unwrapped: 0, read: 0, clean: 0, noXml: [], unreadable: [] });
  g.pdfs++;
  let payload;
  try { payload = Buffer.from((await extractEmbeddedInvoice(readFileSync(path))).payload).toString("utf8"); }
  catch (e) { g.noXml.push(`${rel}: ${e.message.slice(0, 70)}`); continue; }
  g.unwrapped++;
  let invoice;
  try { invoice = (looksLikeCii(payload) ? parseCiiInvoice : parseUblInvoice)(payload); }
  catch (e) { g.unreadable.push(`${rel}: ${String(e.message).slice(0, 70)}`); continue; }
  g.read++;
  const rules = [...new Set(checkInvoice(invoice).map((x) => x.rule))].sort();
  if (!rules.length) g.clean++;
  if (group === "correct") for (const r of rules) tally[r] = (tally[r] || 0) + 1;
  if (rules.length) console.log(group, rel, rules.join(" "));
}
console.log("\n" + JSON.stringify(groups, null, 1));
console.log("files per rule (correct folders):", JSON.stringify(Object.fromEntries(Object.entries(tally).sort())));
