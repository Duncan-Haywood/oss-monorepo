#!/usr/bin/env node
// node generate-cli.mjs draft.json [--format ubl|cii|facturx] [--profile xrechnung|peppol|en16931|hr] [-o out.xml]
// Reads a draft (see examples/draft-invoice.json), writes the e-invoice XML to
// -o (or stdout), prints errors and warnings to stderr. Exit 0 written, 1 draft
// has errors, 2 usage.
import { readFileSync, writeFileSync } from "node:fs";
import { generateInvoice } from "./generate.mjs";
import { generateFacturX } from "./facturx-pdf.mjs";
import { readFontsSync } from "./facturx-pdf-node.mjs";

const args = process.argv.slice(2);
const flag = (name, short) => {
  const i = args.findIndex((a) => a === name || a === short);
  if (i < 0) return null;
  const [, v] = args.splice(i, 2);
  return v ?? null;
};
const format = flag("--format", "-f") || "ubl";
const facturx = format === "facturx" || format === "pdf";
const profile = flag("--profile", "-p") || (facturx ? "en16931" : "xrechnung");
const out = flag("--output", "-o");
const file = args.find((a) => !a.startsWith("-"));
if (!file) {
  console.error("usage: node generate-cli.mjs draft.json [--format ubl|cii|facturx] [--profile xrechnung|peppol|en16931|hr] [-o out.xml]");
  process.exit(2);
}
let draft;
try {
  draft = JSON.parse(file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Cannot read draft: ${e.message}`);
  process.exit(2);
}
const r = facturx ? generateFacturX(draft, { profile, fonts: readFontsSync() }) : generateInvoice(draft, { format, profile });
for (const w of r.warnings) console.error(`warning  ${w.path}: ${w.message}`);
for (const e of r.errors) console.error(`error    ${e.path}: ${e.message}`);
if (!r.ok) process.exit(1);
const body = facturx ? r.pdf : r.xml;
if (out) writeFileSync(out, body);
else process.stdout.write(body);
console.error(`ok: ${r.filename}, net ${r.totals.net}, VAT ${r.totals.tax}, due ${r.totals.due}${out ? ` -> ${out}` : ""}. Run it through the preflight checker and your network's validator before sending.`);
