// Runs the arithmetic repair over real, already-valid e-invoices: UBL and CII
// XML files and Factur-X / ZUGFeRD PDFs from public test suites (read from a
// checkout, never copied here). Every file in a `correct`/valid folder passes
// its official validator, so any change the repair makes to one of them has to
// be justified by a real inconsistency, and a change to the amount due is a
// change to what the seller billed.
//
//   git clone --depth 1 https://github.com/ZUGFeRD/corpus
//   git clone --depth 1 https://github.com/ZUGFeRD/mustangproject
//   git clone --depth 1 https://github.com/itplr-kosit/xrechnung-testsuite
//   git clone --depth 1 https://github.com/ConnectingEurope/eInvoicing-EN16931
//   node eval/repair-real-files.mjs <checkout> [<checkout> ...] [--out DIR]
//
// --out DIR writes each repaired PDF there, so an outside reader (qpdf --check,
// pdfinfo, pikepdf) can open it; eval/repair-seeded-facturx.py runs qpdf on seeded ones.
// The tally line per file: what changed, whether the amount due moved, and
// whether the rewritten PDF still unwraps to exactly the repaired XML.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { repairUbl } from "../repair-ubl.mjs";
import { repairCii } from "../repair-cii.mjs";
import { repairFacturX } from "../repair-facturx.mjs";
import { extractEmbeddedInvoice } from "../facturx.mjs";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const outDir = outAt === -1 ? null : args.splice(outAt, 2)[1];
if (!args.length) { console.error("usage: node eval/repair-real-files.mjs <checkout> [...] [--out DIR]"); process.exit(2); }
if (outDir) mkdirSync(outDir, { recursive: true });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(xml|pdf)$/i.test(name)) yield path;
  }
}

const isFail = (rel) => /(^|\/)(fail|invalid|negative|error)s?(\/|_)/i.test(rel) || /^(invalid|not_validating)/i.test(basename(rel));
const tally = { files: 0, read: 0, changed: 0, dueMoved: 0, linesRewritten: 0, pdfRewritten: 0, pdfRoundTrip: 0, failFolder: 0 };
const rows = [];

for (const root of args) {
  for (const path of [...walk(root)].sort()) {
    const rel = `${basename(root)}/${path.slice(root.length + 1)}`;
    if (isFail(rel)) { tally.failFolder++; continue; }
    const bytes = readFileSync(path);
    if (bytes.length > 2_000_000) continue;
    let r, kind;
    try {
      if (/\.pdf$/i.test(path)) { kind = "pdf"; r = await repairFacturX(bytes); }
      else {
        const text = bytes.toString("utf8");
        if (/<(?:[\w.-]+:)?CrossIndustryInvoice[\s>]/.test(text)) { kind = "cii"; r = repairCii(text); }
        else if (/<(?:[\w.-]+:)?(?:Invoice|CreditNote)[\s>]/.test(text) && text.includes("oasis:names:specification:ubl")) { kind = "ubl"; r = repairUbl(text); }
        else continue;
      }
    } catch { continue; }
    tally.files++;
    tally.read++;
    if (!r.repaired) continue;
    tally.changed++;
    const due = r.changes.some((c) => c.path === "/totals/due");
    const lines = r.changes.filter((c) => /^\/lines\/\d+\/net$/.test(c.path)).length;
    if (due) tally.dueMoved++;
    if (lines) tally.linesRewritten++;
    let trip = "";
    if (kind === "pdf" && r.pdfRewritten) {
      tally.pdfRewritten++;
      const back = Buffer.from((await extractEmbeddedInvoice(r.pdf)).payload).toString("utf8");
      const ok = back === r.xml;
      if (ok) tally.pdfRoundTrip++;
      trip = ok ? " pdf-roundtrip-ok" : " PDF-ROUNDTRIP-DIFFERS";
      if (outDir) writeFileSync(join(outDir, createHash("sha1").update(rel).digest("hex").slice(0, 12) + ".pdf"), r.pdf);
    }
    const summary = r.changes.map((c) => `${c.path} ${c.from}->${c.to}`).join("; ");
    rows.push(`${kind} ${rel}: ${r.changes.length} change(s)${due ? ", DUE MOVED" : ""}${trip} | ${summary.slice(0, 220)}`);
  }
}
for (const row of rows) console.log(row);
console.log("\n" + JSON.stringify(tally));
