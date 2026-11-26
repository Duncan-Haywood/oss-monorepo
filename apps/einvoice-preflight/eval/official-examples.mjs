// Runs the built-in rules over the example invoices of the CEN EN 16931 test
// repository and prints which rules fire. Those examples are well-formed
// business documents (they pass the official Schematron), so a built-in rule
// that fires on one is either a real inconsistency in the example's data or a
// false positive of ours. Used 2026-10-24 to find and fix the false positives
// listed in the README ("Measured on the official examples").
//
//   git clone --depth 1 https://github.com/ConnectingEurope/eInvoicing-EN16931
//   node eval/official-examples.mjs path/to/eInvoicing-EN16931
//
// The same script reads the KoSIT XRechnung test suite (Apache-2.0, not copied
// here), whose business cases are valid XRechnung documents:
//   git clone --depth 1 https://github.com/itplr-kosit/xrechnung-testsuite
//   node eval/official-examples.mjs path/to/xrechnung-testsuite/src/test/business-cases
// Set PATH_FILTER to a substring to limit which files are read (default: any
// path containing "examples" or "business-cases"). Files over 1 MB are skipped
// unless MAX_CHARS is set (the repository ships a 3.3 MB UBL invoice with an
// embedded attachment; MAX_CHARS=5000000 reads it).
// The examples are EUPL-licensed and not copied into this repository.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice, looksLikeCii } from "../cii.mjs";
import { checkInvoice } from "../checks.mjs";

const root = process.argv[2];
if (!root) { console.error("usage: node eval/official-examples.mjs <eInvoicing-EN16931 checkout>"); process.exit(2); }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.endsWith(".xml") && (process.env.PATH_FILTER ? path.includes(process.env.PATH_FILTER) : /examples|business-cases/.test(path))) yield path;
  }
}

const tally = {};
let clean = 0, checked = 0, unreadable = 0, skipped = 0;
for (const path of [...walk(root)].sort()) {
  const source = readFileSync(path, "utf8");
  if (source.length > Number(process.env.MAX_CHARS || 1_000_000)) { skipped++; continue; }
  let invoice;
  try { invoice = (looksLikeCii(source) ? parseCiiInvoice : parseUblInvoice)(source); }
  catch { unreadable++; continue; }
  checked++;
  const rules = [...new Set(checkInvoice(invoice).map((e) => e.rule))].sort();
  if (!rules.length) clean++;
  for (const r of rules) tally[r] = (tally[r] || 0) + 1;
  if (rules.length) console.log(path.split(/examples\/|business-cases\//).pop(), rules.join(" "));
}
console.log(`\n${checked} invoices read (${unreadable} not UBL/CII, ${skipped} over 1 MB skipped), ${clean} with no finding`);
console.log("files per rule:", JSON.stringify(Object.fromEntries(Object.entries(tally).sort())));
