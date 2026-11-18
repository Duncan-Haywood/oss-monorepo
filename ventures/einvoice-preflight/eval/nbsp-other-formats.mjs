// INV-065 in the national readers: FatturaPA (fatturapa.mjs), KSeF FA(3) (fa3.mjs),
// Facturae (facturae.mjs), NAV Online Számla InvoiceData (hungary-nav.mjs) and
// ISDOC (isdoc.mjs + checks.mjs). The UBL/CII run is eval/nbsp-amounts.mjs; this is
// the same mutation, one leaf at a time:
//   node eval/nbsp-other-formats.mjs [--out DIR] path ...   (files or folders, walked)
// Every number, date or boolean leaf gets a no-break space or one of its relatives
// (literal, and as &#160;). "Before" is the reader's findings with INV-065 left out:
// the rule ids a mutant adds over its unmutated file, or a reader error. "After" is
// whether INV-065 names the mutated leaf's path. Text leaves get a trailing U+00A0 as
// a control: INV-065 must not fire on them. --out writes DIR/mutants.jsonl in the
// format eval/nbsp-amounts-saxonc.py reads, and DIR/leaves.jsonl, every distinct leaf
// value with whether CASTABLE takes it, for eval/castable-coverage-saxonc.py (2026-11-17,
// xs:dateTime run: eval/datetime-leaves-2026-11-18.md).
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { checkFatturaPa, looksLikeFatturaPa } from "../fatturapa.mjs";
import { checkFa3, looksLikeFa3 } from "../fa3.mjs";
import { checkFacturae, looksLikeFacturae } from "../facturae.mjs";
import { checkNavInvoiceData } from "../hungary-nav.mjs";
import { parseIsdocInvoice } from "../isdoc.mjs";
import { checkInvoice } from "../checks.mjs";
import { CASTABLE } from "../xmlvalues.mjs";
import { leaves } from "./xml-leaves.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const here = (p) => new URL(`../${p}`, import.meta.url).pathname;
const inputs = args.length ? args : [here("examples"), here("fixtures/facturae"), here("fixtures/hungary-nav")];

// Fixed "today" so date-window rules (FA(3) issue date in the future, Facturae
// signing dates) say the same on every run.
const TODAY = "2026-11-17";
const FORMATS = [
  ["FatturaPA", (x) => looksLikeFatturaPa(x), (x) => checkFatturaPa(x).findings],
  ["FA(3)", (x) => looksLikeFa3(x), (x) => checkFa3(x, { today: TODAY }).findings],
  ["Facturae", (x) => looksLikeFacturae(x), (x) => checkFacturae(x, { today: TODAY }).findings],
  ["NAV", (x) => /<(?:[\w-]+:)?InvoiceData[\s>]/.test(x.slice(0, 4096)), (x) => checkNavInvoiceData(x, { reportDate: TODAY }).findings],
  ["ISDOC", (x) => /isdoc\.cz\/namespace/.test(x.slice(0, 4096)), (x) => checkInvoice(parseIsdocInvoice(x))],
];

const VARIANTS = [
  ["trailing U+00A0", (t) => `${t} `],
  ["leading U+202F", (t) => ` ${t}`],
  ["trailing U+FEFF", (t) => `${t}\uFEFF`],
  ["trailing U+3000", (t) => `${t}　`],
  ["trailing &#160;", (t) => `${t}&#160;`],
];
const decode = (s) => s.replace(/&#160;/g, " ");
const XML_TRIM = /^[ \t\n\r]+|[ \t\n\r]+$/g;

function* walk(p) {
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p).sort()) yield* walk(join(p, n));
  } else if (/\.(xml|isdoc)$/i.test(p)) yield p;
}

function run(check, xml) {
  try {
    return { findings: check(xml) };
  } catch (error) {
    return { error: String(error.message || error).slice(0, 80) };
  }
}

const tally = { byFormat: {}, control: { mutants: 0, inv065: 0 } };
const rows = [];
const leafValues = new Map();
for (const input of inputs) {
  for (const file of walk(input)) {
    const xml = readFileSync(file, "utf8");
    const format = FORMATS.find(([, looks]) => looks(xml));
    if (!format) continue;
    const [fname, , check] = format;
    const base = run(check, xml);
    if (base.error) { console.error(`skip ${basename(file)}: ${base.error}`); continue; }
    const t = (tally.byFormat[fname] ||= { files: 0, baseInv065: 0, castableLeaves: 0, mutants: 0, beforeSilent: 0, beforeNewRule: 0, beforeReaderError: 0, after: 0, byVariant: {} });
    t.files++;
    if (base.findings.some((f) => f.rule === "INV-065")) t.baseInv065++;
    const baseIds = new Set(base.findings.map((f) => f.rule));
    for (const leaf of leaves(xml)) {
      const value = leaf.raw.replace(XML_TRIM, "");
      if (!value || leaf.raw.includes("&")) continue;
      const castable = CASTABLE.test(value);
      const key = `${fname}\u0000${leaf.name}\u0000${value}`;
      if (!leafValues.has(key)) leafValues.set(key, { format: fname, element: leaf.name, value, castable, file: basename(file) });
      if (castable) t.castableLeaves++;
      for (const [variant, write] of VARIANTS) {
        if (!castable && variant !== "trailing U+00A0") continue;
        const mutatedRaw = write(value);
        const result = run(check, xml.slice(0, leaf.at) + mutatedRaw + xml.slice(leaf.at + leaf.raw.length));
        if (!castable) {
          tally.control.mutants++;
          if (!result.error && result.findings.some((f) => f.rule === "INV-065")) tally.control.inv065++;
          continue;
        }
        t.mutants++;
        const v = (t.byVariant[variant] ||= { mutants: 0, beforeSilent: 0, after: 0 });
        v.mutants++;
        let before;
        let after = false;
        if (result.error) {
          before = "readerError";
        } else {
          const added = result.findings.filter((f) => f.rule !== "INV-065" && !baseIds.has(f.rule));
          before = added.length ? "newRule" : "silent";
          after = result.findings.some((f) => f.rule === "INV-065" && f.message.includes(`(${leaf.path})`));
        }
        if (before === "silent") { t.beforeSilent++; v.beforeSilent++; }
        if (before === "newRule") t.beforeNewRule++;
        if (before === "readerError") t.beforeReaderError++;
        if (after) { t.after++; v.after++; }
        rows.push({ kind: /T|^\d{2}:/.test(value) && /:/.test(value) ? "time" : "other", file, format: fname, xpath: leaf.path, element: leaf.name, variant, original: value, mutated: decode(mutatedRaw), before, after: after ? "inv065OnPath" : "inv065Missing", error: result.error || null });
      }
    }
  }
}
console.log(JSON.stringify(tally, null, 2));
const missed = rows.filter((r) => r.after !== "inv065OnPath");
for (const r of missed.slice(0, 20)) console.log(`not INV-065: ${basename(r.file)} ${r.xpath} ${r.variant}: ${r.error || r.before}`);
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "mutants.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(outDir, "leaves.jsonl"), [...leafValues.values()].map((r) => JSON.stringify(r)).join("\n") + "\n");
}
