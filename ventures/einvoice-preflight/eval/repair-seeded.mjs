// Seeded-fault check for the UBL repair (repair-ubl.mjs) on files that are known
// to be right: every amount the repair is allowed to recompute is pushed off by
// a fixed delta, one at a time, and the repaired file is compared byte for byte
// with the original. A file the publisher lists as valid should also come back
// unchanged when nothing was seeded.
//
//   node eval/repair-seeded.mjs <folder of UBL files> [--delta 7] [--json] [--rules]
//
// --rules also runs the whole preflight (built-in checks and the official rule
// sets on the plain route) on the original, the seeded and the repaired file, and
// counts repaired files that draw any rule id the original does not.
// The plain route needs `npm i --no-save slimdom fontoxpath`; without them the
// official sets report "unavailable" and only the built-in checks are counted.
//
// Run of 2026-11-12 on ZATCA's 19 good cases (phive-rules commit dfa902d,
// phive-rules-zatca/src/test/resources/external/test-files/3.4.6; not copied
// here, each keeps its publisher's licence): see README "Repair a UBL file".
//
// Facts the repair must never change (unit prices, allowance amounts, the
// prepaid amount, the prepayment taxable amount KSA-31, payable rounding, an
// amount in another currency) are not seeded: there is nothing to recompute
// them from.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { repairUbl } from "../repair-ubl.mjs";
import { preflightDocuments } from "../report.mjs";
import { plainAvailable } from "../plain-node.mjs";

const root = process.argv[2];
if (!root) { console.error("usage: node eval/repair-seeded.mjs <folder> [--delta 7] [--json]"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const delta = Number(arg("--delta", "7"));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// Offsets of every amount element, labelled by where it sits.
export function seedSites(xml) {
  const sites = [];
  const re = /<((?:[\w.-]+:)?(Amount|LineExtensionAmount|TaxAmount|RoundingAmount|TaxableAmount|TaxExclusiveAmount|TaxInclusiveAmount|AllowanceTotalAmount|ChargeTotalAmount|PayableAmount))(\s[^>]*)?>([^<]*)<\/\1>/g;
  const docCur = /<(?:[\w.-]+:)?DocumentCurrencyCode[^>]*>\s*([A-Z]{3})/.exec(xml)?.[1];
  // PINT Malaysia's ItemPriceExtension amount is a fact, not arithmetic: LHDN's samples
  // write 100.00 on 5,000.00 and 6,000.00 lines and 0.00 on a 100.00 line, and their
  // comment says it is "not part of Schematron calculations". Nothing to restore it from.
  const my = /<(?:[\w.-]+:)?CustomizationID[^>]*>[^<]*@my-1[^<]*</.test(xml);
  for (const m of xml.matchAll(re)) {
    const name = m[2];
    const cur = /currencyID\s*=\s*"([^"]*)"/.exec(m[3] || "")?.[1];
    if (docCur && cur && cur !== docCur) continue; // another currency: needs an exchange rate
    const head = xml.slice(0, m.index);
    const open = (t) => (head.match(new RegExp(`<(?:[\\w.-]+:)?${t}[\\s>]`, "g")) || []).length - (head.match(new RegExp(`</(?:[\\w.-]+:)?${t}>`, "g")) || []).length > 0;
    const inLine = open("InvoiceLine") || open("CreditNoteLine") || open("DebitNoteLine");
    const inSub = open("TaxSubtotal");
    const inTT = open("TaxTotal");
    const inExt = open("ItemPriceExtension");
    let label;
    // PINT line amounts in ItemPriceExtension: Oman BTOM-016 VAT and BTOM-017 amount with VAT, UAE BTAE-08.
    if (inLine && inExt && inTT && name === "TaxAmount") label = "line VAT, ItemPriceExtension";
    else if (inLine && inExt && !inTT && name === "Amount" && my) continue;
    else if (inLine && inExt && !inTT && name === "Amount") label = "line with VAT, ItemPriceExtension";
    else if (name === "Amount") continue; // allowance, charge and other amounts are facts
    else if (inLine && inSub && name === "TaxAmount") label = "KSA-32 prepayment VAT";
    else if (inLine && inSub) continue; // KSA-31 is a fact
    else if (inLine && inTT && name === "TaxAmount") label = "KSA-11 line VAT";
    else if (inLine && inTT && name === "RoundingAmount") label = "KSA-12 line with VAT";
    else if (inLine && name === "LineExtensionAmount") label = "line net";
    else if (inLine) continue;
    else if (inSub) label = `subtotal ${name}`;
    else if (inTT && name === "TaxAmount") {
      const from = head.search(/<(?:[\w.-]+:)?TaxTotal[\s>](?![\s\S]*<(?:[\w.-]+:)?TaxTotal[\s>])/);
      const to = xml.indexOf("TaxTotal>", m.index);
      label = /TaxSubtotal[\s>]/.test(xml.slice(from, to)) ? "document tax (BT-110)" : "BT-111 same-currency repeat";
    }
    else if (open("LegalMonetaryTotal")) label = `total ${name}`;
    else continue;
    const start = m.index + m[0].indexOf(">") + 1;
    sites.push({ label, start, end: start + m[4].length, value: m[4] });
  }
  return sites;
}

const rules = process.argv.includes("--rules");
if (rules && !plainAvailable()) console.error("warning: slimdom/fontoxpath not installed, so --rules counts the built-in checks only (npm i --no-save slimdom fontoxpath)");
async function ids(source) {
  const { reports } = await preflightDocuments([{ name: "x.xml", source }], { schematron: true, maxBytes: 5_000_000 });
  return [...new Set((reports[0]?.errors || []).map((e) => e.rule))].sort();
}
const files = walk(root).filter((f) => f.endsWith(".xml") && /urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(readFileSync(f, "utf8")));
const rows = [];
for (const f of files) {
  const xml = readFileSync(f, "utf8");
  const clean = repairUbl(xml);
  const row = { file: relative(root, f), clean_unchanged: clean.xml === xml, clean_changes: clean.changes.length, clean_skipped: clean.skipped, seeds: [] };
  for (const s of seedSites(xml)) {
    const v = Number(s.value);
    if (!Number.isFinite(v)) continue;
    // The seed keeps the decimals the file wrote (at least 2): PINT UAE's 532.1645
    // seeded as 539.16 would lose what the repair has to restore.
    const dp = Math.max(2, /\.(\d+)/.exec(s.value.trim())?.[1].length ?? 0);
    const bad = xml.slice(0, s.start) + (v + delta).toFixed(dp) + xml.slice(s.end);
    const r = repairUbl(bad);
    const seed = { label: s.label, restored: r.xml === xml, changes: r.changes.length, sameNumbers: r.changes.length > 0 && numbersOnlyDiffer(r.xml, xml) };
    if (rules) {
      const base = row.baseIds ??= await ids(xml);
      const seeded = await ids(bad);
      const after = await ids(r.xml);
      seed.seedCaught = seeded.some((i) => !base.includes(i));
      seed.newAfter = after.filter((i) => !base.includes(i));
    }
    row.seeds.push(seed);
  }
  rows.push(row);
}
// True when the repaired file differs from the original only in how a number is written
// (2300 vs 2300.00): the repair writes two decimals for what it recomputes.
function numbersOnlyDiffer(a, b) {
  const split = (s) => s.split(/(>[-0-9.]+<)/);
  const x = split(a), y = split(b);
  if (x.length !== y.length) return false;
  return x.every((p, i) => p === y[i] || (/^>[-0-9.]+<$/.test(p) && /^>[-0-9.]+<$/.test(y[i]) && Number(p.slice(1, -1)) === Number(y[i].slice(1, -1))));
}

if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
const byLabel = new Map();
for (const r of rows) for (const s of r.seeds) {
  const e = byLabel.get(s.label) || { n: 0, exact: 0, value: 0, caught: 0 };
  e.n++; if (s.restored) e.exact++; else if (s.sameNumbers) e.value++;
  if (s.seedCaught) e.caught++;
  byLabel.set(s.label, e);
}
console.log(`files: ${rows.length}; unchanged when nothing is seeded: ${rows.filter((r) => r.clean_unchanged).length}; reached the tax recompute: ${rows.filter((r) => !r.clean_skipped.some((s) => /not recomputed/.test(s))).length}`);
let n = 0, ok = 0, val = 0;
for (const [label, e] of [...byLabel].sort()) {
  console.log(`  ${label.padEnd(28)} ${e.exact + e.value}/${e.n} restored (${e.exact} byte for byte, ${e.value} same value, other spelling)${rules ? `; seed flagged ${e.caught}/${e.n}` : ""}`);
  n += e.n; ok += e.exact; val += e.value;
}
console.log(`seeded faults: ${n}; restored ${ok + val} (${ok} byte for byte, ${val} same values written with two decimals); not restored ${n - ok - val}`);
if (rules) {
  const all = rows.flatMap((r) => r.seeds);
  console.log(`with --rules: the seed drew a new finding in ${all.filter((s) => s.seedCaught).length}/${all.length}; the repaired file drew a rule id the original did not in ${all.filter((s) => s.newAfter.length).length}/${all.length}`);
  for (const r of rows) for (const s of r.seeds) if (s.newAfter.length) console.log(`  new after repair: ${r.file} :: ${s.label}: ${s.newAfter.join(", ")}`);
}
for (const r of rows) for (const s of r.seeds) if (!s.restored && !s.sameNumbers) console.log(`  not restored: ${r.file} :: ${s.label}`);
