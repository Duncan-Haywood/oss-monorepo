// Gutschrift, Rechnungskorrektur, Storno: the creator's example XRechnung (generate.mjs) as an
// invoice and as a credit note, then one common mistake with the document type, its type code
// (BT-3), the reference to the corrected invoice (BT-25) or the sign of the amounts, put in at a
// time. It measures what gutschrift-e-rechnung.html says: which of these the official rules
// catch, which only this tool's own checks catch, and which nothing catches.
//
//   node gutschrift-bench.mjs          # prints the table quoted on the page
//
// Two checks per file, both with the XRechnung profile, as in leitweg-id-bench.mjs:
//   built-in   the preflight's own rules (INV-033 missing original invoice, INV-034 type and
//              code disagree, XR-007 a type code XRechnung does not allow, and the rest).
//   official   the published EN 16931 (CEN) and XRechnung (KoSIT) Schematron, picked by the
//              file's specification identifier (BT-24). Runs only when slimdom and fontoxpath
//              are installed (`npm i --no-save slimdom fontoxpath`); otherwise null.
//
// The variants are made by editing the generated XML, because the creator writes only 380 and
// 381 and refuses negative prices. An observation about generated files, not a legal claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

export const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);
const draft = () => JSON.parse(readFileSync(DRAFT, "utf8"));

export const ORIGINAL = "RE-2026-001";

/** The example invoice (380) and the same lines as a credit note (381) naming it in BT-25. */
export function baseFiles() {
  const inv = generateInvoice(draft(), { format: "ubl", profile: "xrechnung" });
  const cd = draft();
  cd.document_type = "credit_note";
  cd.number = "GS-2026-001";
  cd.original_invoice = ORIGINAL;
  delete cd.due_date;
  const cn = generateInvoice(cd, { format: "ubl", profile: "xrechnung" });
  if (!inv.ok || !cn.ok) throw new Error("the creator refused the example draft");
  return { invoice: inv.xml, credit: cn.xml };
}

const AMOUNT_TAGS = "InvoicedQuantity|CreditedQuantity|LineExtensionAmount|TaxableAmount|TaxAmount|TaxExclusiveAmount|TaxInclusiveAmount|PayableAmount";
/** Every quantity and amount made negative; unit prices stay positive (BR-27 forbids negative). */
export const negate = (xml) => xml.replace(new RegExp(`(<cbc:(?:${AMOUNT_TAGS})(?: [^>]*)?>)(?!-)`, "g"), "$1-");
const typeCode = (xml, code) => xml.replace(/(<cbc:(?:Invoice|CreditNote)TypeCode>)\d+(<)/, `$1${code}$2`);
const dropReference = (xml) => xml.replace(/ *<cac:BillingReference>.*?<\/cac:BillingReference>\n/s, "");
const addReference = (xml) => xml.replace(
  "  <cac:AccountingSupplierParty>",
  `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${ORIGINAL}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>\n  <cac:AccountingSupplierParty>`,
);

/** One case at a time. Labels are the page's (German). */
export const CASES = [
  ["Rechnung (380), richtig", (f) => f.invoice],
  ["Rechnungskorrektur als Gutschriftsanzeige (381) mit Bezug auf die Rechnung, richtig", (f) => f.credit],
  ["381 ohne Bezug auf die ursprüngliche Rechnung (BT-25 fehlt)", (f) => dropReference(f.credit)],
  ["381 mit negativen Beträgen (doppelt negativ)", (f) => negate(f.credit)],
  ["Storno als Rechnung (380) mit negativen Beträgen und Bezug", (f) => addReference(negate(f.invoice))],
  ["Storno als Rechnung (380) mit negativen Beträgen, ohne Bezug", (f) => negate(f.invoice)],
  ["korrigierte Rechnung (384) ohne Bezug", (f) => typeCode(f.invoice, "384")],
  ["korrigierte Rechnung (384) mit Bezug", (f) => addReference(typeCode(f.invoice, "384"))],
  ["Gutschrift im Sinne des UStG (389, Abrechnung durch den Kunden)", (f) => typeCode(f.invoice, "389")],
  ["Belastungsanzeige (383)", (f) => typeCode(f.invoice, "383")],
  ["Gutschriftsanzeige-Datei (CreditNote) mit Typcode 380", (f) => typeCode(f.credit, "380")],
  ["Rechnungs-Datei (Invoice) mit Typcode 381", (f) => typeCode(f.invoice, "381")],
];

function split(findings) {
  const blocking = findings.filter(isBlocking).map((f) => f.rule);
  const other = findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`);
  return { blocking: [...new Set(blocking)], other: [...new Set(other)] };
}

async function check(xml) {
  const profile = "xrechnung";
  const builtin = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile })).reports[0];
  const withOfficial = (await preflightDocuments([{ name: "x.xml", source: xml }], { profile, schematron: true })).reports[0];
  const ran = withOfficial.schematron && withOfficial.schematron !== "unavailable";
  const builtinIds = new Set(builtin.errors.map((f) => f.rule));
  return {
    builtin: split(builtin.errors),
    official: ran ? split(withOfficial.errors.filter((f) => !builtinIds.has(f.rule) || f.source)) : null,
  };
}

/** For each case: its type code, whether BT-25 is there, the amount due, and both checks. */
export async function caseTable() {
  const files = baseFiles();
  const rows = [];
  for (const [label, make] of CASES) {
    const xml = make(files);
    rows.push({
      label,
      code: /<cbc:(?:Invoice|CreditNote)TypeCode>(\d+)</.exec(xml)[1],
      root: /<(Invoice|CreditNote)\s/.exec(xml)[1],
      reference: xml.includes("<cac:BillingReference>"),
      payable: /<cbc:PayableAmount[^>]*>([^<]+)</.exec(xml)[1],
      result: await check(xml),
    });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other].join(", ") || "keine" : "n/a");
  console.log("case | root | BT-3 | BT-25 | payable | built-in | official");
  for (const r of await caseTable()) {
    console.log(`${r.label} | ${r.root} | ${r.code} | ${r.reference} | ${r.payable} | ${show(r.result.builtin)} | ${show(r.result.official)}`);
  }
}
