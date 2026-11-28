// A Belgian Peppol invoice, checked by the preflight with one common mistake at a time. It measures
// what peppol-factuur-controleren.html says: which mistakes in a Belgian Peppol BIS invoice the
// checker catches, under which rule id, and whether the finding blocks.
//
//   node belgium-peppol-bench.mjs          # prints the table quoted on the page
//
// The invoice is written by the creator (generate.mjs) as Peppol BIS Billing 3.0 UBL, between two
// Belgian companies addressed by their enterprise number (KBO/BCE, Peppol scheme 0208). The
// numbers are the usual made-up example (0123456749) and two others with valid check digits
// (0765432146, 0456789034); they are not meant to name any real company.
//
// Two checks per file:
//   built-in   the preflight's own rules with the Peppol profile. Always runs.
//   official   the published EN 16931 (CEN) and Peppol BIS 3.0 Schematron, picked by the file's
//              own specification identifier (BT-24). Runs only when slimdom and fontoxpath are
//              installed (`npm i --no-save slimdom fontoxpath`); otherwise null.
//   next       the same, with Peppol BIS 3.1.0 (the release access points enforce from
//              24 February 2027; its rules are from the release-candidate branch, see index.html).
//
// An observation about generated files, not a legal validity claim, and not a Peppol directory
// lookup: a well-formed number can still be one no access point is registered for.
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

/** The base draft: a Ghent seller invoicing an Antwerp buyer, 21% and 6% VAT. */
export function draft() {
  return {
    number: "F-2026-0042",
    issue_date: "2026-11-20",
    due_date: "2026-12-20",
    delivery_date: "2026-11-18",
    currency: "EUR",
    buyer_reference: "PO-2026-118",
    seller: {
      name: "Voorbeeld Installaties BV", street: "Veldstraat 10", postal_code: "9000", city: "Gent", country: "BE",
      vat_id: "BE0123456749",
      endpoint: { scheme: "0208", id: "0123456749" },
      contact: { name: "An Peeters", email: "facturen@voorbeeld.example" },
    },
    buyer: {
      name: "Klant Logistiek NV", street: "Meir 5", postal_code: "2000", city: "Antwerpen", country: "BE",
      vat_id: "BE0765432146",
      endpoint: { scheme: "0208", id: "0765432146" },
    },
    payment: { iban: "BE71096123456769" },
    lines: [
      { description: "Onderhoud installatie", quantity: 4, unit: "hours", unit_price: 65, tax_percent: 21 },
      { description: "Renovatiewerk woning", quantity: 1, unit: "pieces", unit_price: 1200, tax_percent: 6 },
    ],
  };
}

/** One mistake at a time. Labels are the page's (Dutch). */
export const MISTAKES = [
  ["geen fout", () => {}],
  ["ondernemingsnummer met BE ervoor (BE0765432146)", (d) => { d.buyer.endpoint.id = "BE0765432146"; }],
  ["ondernemingsnummer met puntjes (0765.432.146)", (d) => { d.buyer.endpoint.id = "0765.432.146"; }],
  ["ondernemingsnummer zonder voorloopnul (765432146)", (d) => { d.buyer.endpoint.id = "765432146"; }],
  ["tikfout in het ondernemingsnummer (0765432164)", (d) => { d.buyer.endpoint.id = "0765432164"; }],
  ["ander ondernemingsnummer als afzender (0456789034)", (d) => { d.seller.endpoint.id = "0456789034"; }],
  ["btw-nummer van de klant met een tikfout (BE0765432164)", (d) => { d.buyer.vat_id = "BE0765432164"; }],
  ["geen referentie van de klant en geen bestelnummer", (d) => { delete d.buyer_reference; }],
  ["IBAN met een tikfout (BE71096123456768)", (d) => { d.payment.iban = "BE71096123456768"; }],
];

function split(findings) {
  const blocking = findings.filter(isBlocking).map((f) => f.rule);
  const other = findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`);
  return { blocking, other };
}

async function check(xml) {
  const doc = [{ name: "x.xml", source: xml }];
  const builtin = (await preflightDocuments(doc, { profile: "peppol" })).reports[0];
  const withOfficial = (await preflightDocuments(doc, { profile: "peppol", schematron: true })).reports[0];
  const withNext = (await preflightDocuments(doc, { profile: "peppol", schematron: true, peppolNext: true })).reports[0];
  const ran = withOfficial.schematron && withOfficial.schematron !== "unavailable";
  const builtinIds = new Set(builtin.errors.map((f) => f.rule));
  const officialOnly = (r) => split(r.errors.filter((f) => !builtinIds.has(f.rule) || f.source));
  return {
    builtin: split(builtin.errors),
    official: ran ? officialOnly(withOfficial) : null,
    next: ran ? officialOnly(withNext) : null,
  };
}

/** For each mistake: the findings on the Peppol BIS UBL file. */
export async function mistakeTable() {
  const rows = [];
  for (const [label, apply] of MISTAKES) {
    const d = draft();
    apply(d);
    const out = generateInvoice(d, { format: "ubl", profile: "peppol" });
    if (!out.ok) {
      rows.push({ label, refused: out.errors.map((e) => e.message ?? String(e)) });
      continue;
    }
    rows.push({ label, ...(await check(out.xml)) });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking.map((r) => `${r} (blocks)`), ...c.other].join(", ") || "geen" : "n/a");
  console.log("mistake | built-in | official 3.0.22 | official 3.1.0");
  for (const r of await mistakeTable()) {
    if (r.refused) console.log(`${r.label} | creator refused: ${r.refused.join("; ")}`);
    else console.log(`${r.label} | ${show(r.builtin)} | ${show(r.official)} | ${show(r.next)}`);
  }
}
