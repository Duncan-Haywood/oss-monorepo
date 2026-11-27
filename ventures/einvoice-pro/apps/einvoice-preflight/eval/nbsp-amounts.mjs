// INV-065 measured: every number, date or boolean leaf of each UBL or CII file gets
// a non-XML space (no-break space and friends), and the built-in readers
// (ubl.mjs, cii.mjs + checks.mjs) are run before and after the rule.
//   node eval/nbsp-amounts.mjs [--out DIR] dir ...
// "Before" is checkInvoice with INV-065 filtered out: the rule ids a mutant adds
// over its unmutated file, or a reader error. "After" is whether INV-065 names
// the mutated element's path. Text leaves (names, ids, codes) get the same
// spaces as a control: INV-065 must not fire on them.
// --out writes DIR/mutants.jsonl (file, xpath, original, mutated value) for
// eval/nbsp-amounts-saxonc.py, which asks SaxonC-HE whether each value is
// castable (xs:decimal, xs:date, xs:boolean) before and after the mutation.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseXmlTree, parseUblInvoice } from "../ubl.mjs";
import { parseCiiInvoice, looksLikeCii } from "../cii.mjs";
import { checkInvoice } from "../checks.mjs";
import { CASTABLE } from "../xmlvalues.mjs";
import { leaves } from "./xml-leaves.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const dirs = args.length ? args : [new URL("../examples", import.meta.url).pathname];

// Each variant: [name, how the mutated raw text is written, the decoded value].
const VARIANTS = [
  ["trailing U+00A0", (t) => `${t}\u00A0`],
  ["leading U+202F", (t) => `\u202F${t}`],
  ["trailing U+FEFF", (t) => `${t}\uFEFF`],
  ["trailing U+3000", (t) => `${t}\u3000`],
  ["trailing &#160;", (t) => `${t}&#160;`],
];
const decode = (s) => s.replace(/&#160;/g, "\u00A0");
const XML_TRIM = /^[ \t\n\r]+|[ \t\n\r]+$/g;

function read(xml) {
  return looksLikeCii(xml) ? parseCiiInvoice(xml) : parseUblInvoice(xml);
}
function rules(xml) {
  try {
    return { findings: checkInvoice(read(xml)) };
  } catch (error) {
    return { error: String(error.message || error).slice(0, 80) };
  }
}

const tally = {
  files: 0, castableLeaves: 0, mutants: 0,
  before: { silent: 0, newRule: 0, readerError: 0 },
  after: { inv065OnPath: 0, inv065Missing: 0, readerError: 0 },
  control: { mutants: 0, inv065: 0 },
  byVariant: {},
};
const rows = [];
for (const dir of dirs) {
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".xml")).sort()) {
    const xml = readFileSync(join(dir, name), "utf8");
    if (!/<(?:[\w-]+:)?(?:Invoice|CreditNote|CrossIndustryInvoice)[\s>]/.test(xml)) continue;
    const base = rules(xml);
    if (base.error) { console.error(`skip ${name}: ${base.error}`); continue; }
    tally.files++;
    const baseIds = new Set(base.findings.map((f) => f.rule));
    for (const leaf of leaves(xml)) {
      const value = leaf.raw.replace(XML_TRIM, "");
      if (!value || leaf.raw.includes("&")) continue;
      const castable = CASTABLE.test(value);
      if (castable) tally.castableLeaves++;
      for (const [variant, write] of VARIANTS) {
        if (!castable && variant !== "trailing U+00A0") continue;
        const mutatedRaw = write(value);
        const mutated = xml.slice(0, leaf.at) + mutatedRaw + xml.slice(leaf.at + leaf.raw.length);
        const result = rules(mutated);
        if (!castable) {
          tally.control.mutants++;
          if (!result.error && result.findings.some((f) => f.rule === "INV-065")) tally.control.inv065++;
          continue;
        }
        tally.mutants++;
        const v = (tally.byVariant[variant] ||= { mutants: 0, beforeSilent: 0, after: 0 });
        v.mutants++;
        let before;
        let after;
        if (result.error) {
          before = "readerError"; after = "readerError";
        } else {
          const added = result.findings.filter((f) => f.rule !== "INV-065" && !baseIds.has(f.rule));
          before = added.length ? "newRule" : "silent";
          after = result.findings.some((f) => f.rule === "INV-065" && f.message.includes(`(${leaf.path})`)) ? "inv065OnPath" : "inv065Missing";
        }
        tally.before[before]++;
        tally.after[after]++;
        if (before === "silent") v.beforeSilent++;
        if (after === "inv065OnPath") v.after++;
        rows.push({ file: join(dir, name), xpath: leaf.path, element: leaf.name, variant, original: value, mutated: decode(mutatedRaw), before, after, error: result.error || null });
      }
    }
  }
}
console.log(JSON.stringify(tally, null, 2));
const missed = rows.filter((r) => r.after !== "inv065OnPath");
for (const r of missed.slice(0, 20)) console.log(`not INV-065: ${r.file.split("/").pop()} ${r.xpath} ${r.variant}: ${r.error || r.after}`);
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "mutants.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
