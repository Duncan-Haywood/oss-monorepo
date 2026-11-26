// The CII repair with header allowances and charges (BG-20/BG-21), on real files.
//
// Until 2026-11-14 repair-cii.mjs declined any CII document with a header
// SpecifiedTradeAllowanceCharge (66 of the 358 seeded Factur-X PDFs in
// eval/repair-real-files-2026-11-14.md). This takes every CII invoice in the
// checkouts, as XML or embedded in a Factur-X / ZUGFeRD 2 PDF, that has one, and:
//
//   1. unseeded: repairs it as it is. A valid file must come back unchanged.
//   2. seeded: breaks one total at a time (+7.00) and repairs it. The repaired
//      file's totals and tax breakdown must equal the original's, numerically.
//
//   git clone --depth 1 https://github.com/ZUGFeRD/corpus
//   git clone --depth 1 https://github.com/ZUGFeRD/mustangproject
//   git clone --depth 1 https://github.com/itplr-kosit/xrechnung-testsuite
//   git clone --depth 1 https://github.com/ConnectingEurope/eInvoicing-EN16931
//   node eval/cii-header-allowances.mjs <checkout> [...] [--list]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { repairCii } from "../repair-cii.mjs";
import { parseCiiInvoice } from "../cii.mjs";
import { extractEmbeddedInvoice } from "../facturx.mjs";
import { tagRe } from "../repair-ubl.mjs";

const args = process.argv.slice(2);
const list = args.includes("--list");
const roots = args.filter((a) => a !== "--list");
if (!roots.length) { console.error("usage: node eval/cii-header-allowances.mjs <checkout> [...] [--list]"); process.exit(2); }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(xml|pdf)$/i.test(name)) yield path;
  }
}
const isFail = (rel) => /(^|\/)(fail|invalid|negative|error)s?(\/|_)/i.test(rel) || /^(invalid|not_validating)/i.test(basename(rel));

const P = "(?:[\\w.-]+:)?";
const headerSettlement = (xml) => [...xml.matchAll(tagRe("ApplicableHeaderTradeSettlement"))];
const hasHeaderAdjust = (xml) => {
  const hs = headerSettlement(xml);
  return hs.length === 1 && new RegExp(`<${P}(?:SpecifiedTradeAllowanceCharge|SpecifiedLogisticsServiceCharge)[\\s>]`).test(hs[0][3]);
};

// Numbers that the repair owns: totals and the tax breakdown.
const n = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
const owned = (xml) => {
  const inv = parseCiiInvoice(xml);
  const t = inv.totals || {};
  return JSON.stringify({
    totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === "string" && /^-?[\d.]+$/.test(v.trim()) ? n(v) : v])),
    breakdown: (inv.tax_breakdown || []).map((r) => ({ c: r.tax_category, p: n(r.tax_percent), b: n(r.taxable), t: n(r.tax) })),
  });
};

// Add 7 to the value of the first <name> inside the summation (or the first header tax block).
function seed(xml, where, name) {
  const hs = headerSettlement(xml)[0];
  const hsOpen = hs.index + hs[0].indexOf(">") + 1;
  const block = where === "sum"
    ? [...hs[3].matchAll(tagRe("SpecifiedTradeSettlementHeaderMonetarySummation"))][0]
    : [...hs[3].matchAll(tagRe("ApplicableTradeTax"))][0];
  if (!block) return null;
  const m = tagRe(name, "").exec(block[3]);
  if (!m) return null;
  const v = Number(m[3].trim());
  if (Number.isNaN(v)) return null;
  const at = hsOpen + block.index + block[0].indexOf(">") + 1 + m.index + m[0].indexOf(">") + 1;
  return xml.slice(0, at) + (v + 7).toFixed(2) + xml.slice(at + m[3].length);
}
const SEEDS = [
  ["sum", "AllowanceTotalAmount"],
  ["sum", "ChargeTotalAmount"],
  ["sum", "TaxBasisTotalAmount"],
  ["sum", "TaxTotalAmount"],
  ["sum", "GrandTotalAmount"],
  ["tax", "BasisAmount"],
  ["tax", "CalculatedAmount"],
];

const tally = { files: 0, unique: 0, unseededUnchanged: 0, unseededChanged: 0, unseededDeclined: 0, seeded: 0, restored: 0, declined: 0, wrong: 0 };
const declinedWhy = new Map();
const seen = new Set();
const rows = [];

for (const root of roots) {
  for (const path of [...walk(root)].sort()) {
    const rel = `${basename(root)}/${path.slice(root.length + 1)}`;
    if (isFail(rel)) continue;
    const bytes = readFileSync(path);
    if (bytes.length > 5_000_000) continue;
    let xml;
    try {
      if (/\.pdf$/i.test(path)) {
        const e = await extractEmbeddedInvoice(bytes);
        if (!e?.payload) continue;
        xml = new TextDecoder("utf-8", { ignoreBOM: true }).decode(e.payload);
      } else xml = bytes.toString("utf8");
    } catch { continue; }
    if (!/<(?:[\w.-]+:)?CrossIndustryInvoice[\s>]/.test(xml) || !hasHeaderAdjust(xml)) continue;
    tally.files++;
    const h = createHash("sha1").update(xml).digest("hex");
    if (seen.has(h)) continue;
    seen.add(h);
    tally.unique++;

    const r0 = repairCii(xml);
    const allowanceSkip = r0.skipped.find((s) => /Tax and totals were not recomputed|Tax was not recomputed|nothing was recomputed|header allowance or charge has no readable/.test(s));
    if (r0.repaired) { tally.unseededChanged++; rows.push(`UNSEEDED CHANGED ${rel}: ${r0.changes.map((c) => `${c.path} ${c.from}->${c.to}`).join("; ")}`); }
    else if (allowanceSkip) { tally.unseededDeclined++; if (list) rows.push(`unseeded declined ${rel}: ${allowanceSkip}`); }
    else tally.unseededUnchanged++;

    const want = owned(xml);
    for (const [where, name] of SEEDS) {
      const bad = seed(xml, where, name);
      if (!bad || bad === xml) continue;
      tally.seeded++;
      const r = repairCii(bad);
      if (!r.repaired) {
        tally.declined++;
        const why = (r.skipped.find((s) => /not recomputed|no readable/.test(s)) || r.skipped[0] || "(no reason)").replace(/\d+/g, "N");
        declinedWhy.set(why, (declinedWhy.get(why) || 0) + 1); if (list) rows.push(`seeded declined ${rel} ${name}: ${r.skipped.join(" | ")}`);
        continue;
      }
      if (owned(r.xml) === want) tally.restored++;
      else { tally.wrong++; rows.push(`WRONG ${rel} seed ${name}: ${r.changes.map((c) => `${c.path} ${c.from}->${c.to}`).join("; ")}`); }
    }
  }
}
for (const row of rows) console.log(row);
for (const [why, c] of [...declinedWhy].sort((a, b) => b[1] - a[1])) console.log(`declined x${c}: ${why}`);
console.log("\n" + JSON.stringify(tally));
