#!/usr/bin/env node
// Writes Factur-X PDFs from varied drafts and, given a veraPDF command, runs
// veraPDF (PDF/A-3b, flavour from the XMP) over them and the repo's own
// reader (embedded XML equal to the CII written, envelope checks).
//
//   node eval/facturx-pdf-verapdf.mjs <out-dir> [verapdf-command]
//
// veraPDF from Maven Central (org.verapdf.apps:cli; the GreenfieldCliWrapper
// main class) works from a cloud session; software.verapdf.org does not.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateFacturX } from "../facturx-pdf.mjs";
import { readFontsSync } from "../facturx-pdf-node.mjs";
import { extractEmbeddedInvoiceXml } from "../facturx.mjs";
import { preflightDocuments, buildJsonReport } from "../report.mjs";

const base = JSON.parse(readFileSync(new URL("../examples/draft-invoice.json", import.meta.url), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const cases = [];
const add = (name, profile, edit = (d) => d) => cases.push({ name, profile, draft: edit(clone(base)) });

add("plain-en16931", "en16931");
add("plain-xrechnung", "xrechnung");
add("credit-note", "en16931", (d) => ({ ...d, document_type: "credit_note", original_invoice: "RE-2026-000" }));
add("eighty-lines", "en16931", (d) => ({
  ...d,
  lines: Array.from({ length: 80 }, (_, i) => ({ description: `Line ${i + 1}: ${"maintenance window and remote support ".repeat(1 + (i % 3))}`, quantity: 1 + (i % 4), unit: "hours", unit_price: 85.5, tax_percent: i % 5 ? 19 : 7 })),
}));
add("polish-greek-cyrillic", "en16931", (d) => ({
  ...d,
  seller: { ...d.seller, name: "Zakład Usług Łączności Sp. z o.o.", street: "ul. Świętokrzyska 12", city: "Łódź", postal_code: "90-001", country: "PL", vat_id: "PL5260250995" },
  buyer: { ...d.buyer, name: "Ελληνική Εταιρεία Α.Ε. / ООО «Север»", street: "Οδός Αθηνάς 5", city: "Αθήνα", country: "GR" },
  note: "Zażółć gęślą jaźń. Ευχαριστούμε. Спасибо за заказ.",
}));
add("outside-font", "en16931", (d) => ({ ...d, note: "Order 注文 番号 42 — 漢字 is outside the embedded font and prints as ?" }));
add("exempt-and-reverse", "en16931", (d) => ({
  ...d,
  buyer: { ...d.buyer, country: "FR", vat_id: "FR40303265045" },
  lines: [
    { description: "Software licence (reverse charge)", quantity: 1, unit: "pieces", unit_price: 1200, tax_percent: 0, tax_category: "AE", tax_reason: "Reverse charge" },
    { description: "Training (exempt)", quantity: 2, unit: "days", unit_price: 600, tax_percent: 0, tax_category: "E", tax_reason: "Exempt under Article 132 of Directive 2006/112/EC" },
  ],
}));
add("no-delivery-date", "en16931", (d) => { delete d.delivery_date; return d; });
add("service-period-xrechnung", "xrechnung", (d) => { delete d.delivery_date; d.period = { start: "2026-10-01", end: "2026-10-31" }; return d; });
add("prepaid-long-note", "en16931", (d) => ({ ...d, prepaid: 100, note: "Thank you for your order. ".repeat(40) }));

const out = process.argv[2];
const vera = process.argv[3];
if (!out) { console.error("usage: node eval/facturx-pdf-verapdf.mjs <out-dir> [verapdf-command]"); process.exit(2); }
mkdirSync(out, { recursive: true });
const fonts = readFontsSync();
const files = [];
let ownProblems = 0;
for (const c of cases) {
  const r = generateFacturX(c.draft, { profile: c.profile, fonts, date: new Date("2026-11-14T12:00:00Z") });
  if (!r.ok) { console.log(`${c.name}: draft refused: ${JSON.stringify(r.errors)}`); ownProblems++; continue; }
  const file = join(out, `${c.name}.pdf`);
  writeFileSync(file, r.pdf);
  files.push(file);
  const xml = new TextDecoder().decode(await extractEmbeddedInvoiceXml(r.pdf));
  const report = buildJsonReport(await preflightDocuments([{ name: `${c.name}.pdf`, source: r.pdf }]));
  const same = xml === r.xml;
  if (!same || report.errors.length) ownProblems++;
  const pages = (new TextDecoder("latin1").decode(r.pdf).match(/\/Count (\d+)/) || [])[1];
  console.log(`${c.name}: ${r.pdf.length} bytes, ${pages} page(s), embedded XML ${same ? "identical" : "DIFFERENT"}, findings ${report.errors.map((f) => f.rule).join(",") || "none"}`);
}
if (vera) {
  let text;
  try {
    text = execFileSync(vera, ["--format", "text", "-v", ...files], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    text = e.stdout || "";
  }
  const lines = text.split("\n").filter((l) => /^(PASS|FAIL)|^\s+FAIL/.test(l));
  for (const l of lines) console.log(`veraPDF ${l.replace(out + "/", "")}`);
  const pass = lines.filter((l) => l.startsWith("PASS")).length;
  console.log(`veraPDF: ${pass} of ${files.length} PASS`);
  if (pass !== files.length) process.exitCode = 1;
}
if (ownProblems) process.exitCode = 1;
