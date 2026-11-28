// XRechnung or ZUGFeRD? The same invoice written both ways by the creator
// (generate.mjs, facturx-pdf.mjs), each checked by the preflight, with one field
// left out at a time. It measures what xrechnung-oder-zugferd.html says: which
// fields XRechnung requires on top of EN 16931, and how large each file is.
//
//   node xrechnung-zugferd-bench.mjs          # prints the tables quoted on the page
//
// Two checks per file:
//   built-in   the preflight's own rules; with profile "xrechnung" for the XRechnung file
//              (XR-001..009) and the plain EN 16931 rules for the ZUGFeRD one. Always runs.
//   official   the published EN 16931 (CEN) and XRechnung (KoSIT) Schematron, picked by the
//              file's own specification identifier (BT-24). Runs only when slimdom and
//              fontoxpath are installed (`npm i --no-save slimdom fontoxpath`); otherwise null.
//
// An observation about two generated files, not a legal validity claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { generateFacturX } from "./facturx-pdf.mjs";
import { readFontsSync } from "./facturx-pdf-node.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

export const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);

/** The example draft (a German seller and buyer, two VAT rates). */
export const draft = () => JSON.parse(readFileSync(DRAFT, "utf8"));

/** One field left out of the draft at a time. Labels are the page's (German). */
export const OMISSIONS = [
  ["nothing left out", () => {}],
  ["Käuferreferenz / Leitweg-ID (BT-10)", (d) => { delete d.buyer_reference; }],
  ["Kontakt des Verkäufers (BG-6)", (d) => { delete d.seller.contact; }],
  ["nur die Telefonnummer des Verkäufers (BT-42)", (d) => { delete d.seller.contact.phone; }],
  ["Zahlungsanweisungen, IBAN (BG-16)", (d) => { delete d.payment; }],
  ["Ort des Käufers (BT-52)", (d) => { delete d.buyer.city; }],
  ["Liefer- oder Leistungsdatum (BT-72)", (d) => { delete d.delivery_date; }],
];

/** Rule ids of the findings that block (fatal) and of the ones that only inform. */
function split(findings) {
  const blocking = findings.filter(isBlocking).map((f) => f.rule);
  const other = findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`);
  return { blocking, other };
}

async function check(xml, profile) {
  const builtin = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile })).reports[0];
  const withOfficial = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile, schematron: true })).reports[0];
  const ran = withOfficial.schematron && withOfficial.schematron !== "unavailable";
  const builtinIds = new Set(builtin.errors.map((f) => f.rule));
  return {
    builtin: split(builtin.errors),
    official: ran ? split(withOfficial.errors.filter((f) => !builtinIds.has(f.rule) || f.source)) : null,
  };
}

/**
 * For each omission: the findings on the XRechnung CII file (checked with the XRechnung rules)
 * and on the ZUGFeRD EN 16931 CII file (checked with the EN 16931 rules).
 */
export async function omissionTable() {
  const rows = [];
  for (const [label, drop] of OMISSIONS) {
    const d = draft();
    drop(d);
    const xr = generateInvoice(d, { format: "cii", profile: "xrechnung" });
    const zf = generateInvoice(d, { format: "cii", profile: "en16931" });
    if (!xr.ok || !zf.ok) throw new Error(`${label}: the creator refused the draft`);
    rows.push({ label, xrechnung: await check(xr.xml, "xrechnung"), zugferd: await check(zf.xml, "") });
  }
  return rows;
}

/** The four files a German seller can send for the same invoice, with their size in bytes. */
export function fileSizes() {
  const d = draft();
  const fonts = readFontsSync();
  const date = new Date("2026-11-28T00:00:00Z");
  const xml = (format) => Buffer.byteLength(generateInvoice(d, { format, profile: "xrechnung" }).xml);
  const pdf = (profile) => generateFacturX(d, { profile, fonts, date }).pdf.byteLength;
  return [
    { file: "XRechnung, UBL (XML)", bytes: xml("ubl") },
    { file: "XRechnung, CII (XML)", bytes: xml("cii") },
    { file: "ZUGFeRD EN 16931 (PDF/A-3 mit CII)", bytes: pdf("en16931") },
    { file: "ZUGFeRD XRECHNUNG (PDF/A-3 mit CII)", bytes: pdf("xrechnung") },
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other].join(", ") || "keine" : "n/a");
  console.log("left out | XRechnung built-in | XRechnung official | ZUGFeRD EN 16931 built-in | ZUGFeRD official");
  for (const r of await omissionTable()) {
    console.log(`${r.label} | ${show(r.xrechnung.builtin)} | ${show(r.xrechnung.official)} | ${show(r.zugferd.builtin)} | ${show(r.zugferd.official)}`);
  }
  console.log("\nfile | bytes");
  for (const f of fileSizes()) console.log(`${f.file} | ${f.bytes}`);
}
