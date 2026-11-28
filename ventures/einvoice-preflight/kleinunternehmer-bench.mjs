// E-Rechnung für Kleinunternehmer: a § 19 UStG invoice written by the creator
// (generate.mjs) as XRechnung (CII) and as ZUGFeRD EN 16931 (CII), then one thing
// changed at a time and each file checked by the preflight. It measures what
// e-rechnung-kleinunternehmer.html says: which Kleinunternehmer mistakes the official
// rules reject, and which one they let through.
//
//   node kleinunternehmer-bench.mjs          # prints the table quoted on the page
//
// Two checks per file, as in xrechnung-zugferd-bench.mjs:
//   built-in   the preflight's own rules (profile "xrechnung" for the XRechnung file).
//   official   the published EN 16931 (CEN) and XRechnung (KoSIT) Schematron, picked by the
//              file's BT-24. Runs only when slimdom and fontoxpath are installed
//              (`npm i --no-save slimdom fontoxpath`); otherwise null.
//
// The creator refuses most of these mistakes itself (BR-CO-26 since 2026-11-28), so the
// variants that it refuses are made by editing its XML afterwards: they stand for files
// written by other software. An observation about generated files, not a legal claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);
export const REASON = "Kleinunternehmer gemäß § 19 UStG";

/** The example draft turned into a Kleinunternehmer's invoice: no VAT ID, a Steuernummer,
 * a seller identifier, one line exempt under § 19 UStG. */
export function draft({ category = "E", reason = REASON } = {}) {
  const d = JSON.parse(readFileSync(DRAFT, "utf8"));
  d.seller.name = "Erika Muster Webdesign";
  delete d.seller.vat_id;
  d.seller.tax_number = "12/345/67890";
  d.seller.company_id = "HRB 12345";
  d.lines = [{ description: "Webdesign", quantity: 10, unit: "hours", unit_price: 60, tax_percent: 0, tax_category: category, tax_reason: reason }];
  return d;
}

const strip = (re) => (xml) => {
  const out = xml.replace(re, "");
  if (out === xml) throw new Error(`nothing removed by ${re}`);
  return out;
};

/** [page label, draft options, edit of the generated XML]. Labels are the page's (German). */
export const VARIANTS = [
  ["nichts (Steuernummer, Verkäuferkennung, Kategorie E mit Hinweis auf § 19 UStG)", {}, null],
  ["nur die Steuernummer, keine Verkäuferkennung (BT-29/BT-30)", {}, strip(/\s*<ram:ID>HRB 12345<\/ram:ID>/)],
  ["Hinweis auf die Steuerbefreiung fehlt (BT-120)", {}, strip(/\s*<ram:ExemptionReason>[^<]*<\/ram:ExemptionReason>/g)],
  ["Steuernummer fehlt (BT-32)", {}, strip(/\s*<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">[^<]*<\/ram:ID><\/ram:SpecifiedTaxRegistration>/)],
  ["Kategorie O (nicht steuerbar) statt E", { category: "O" }, null],
  // Added 2026-11-28 (PR #20033): three more ways other software writes a § 19 invoice.
  ["„0 % USt“ als Normalsatz (Kategorie S)", {}, (x) => strip(/\s*<ram:ExemptionReason>[^<]*<\/ram:ExemptionReason>/g)(x).replaceAll("<ram:CategoryCode>E</ram:CategoryCode>", "<ram:CategoryCode>S</ram:CategoryCode>")],
  ["Kategorie Z (Nullsatz) statt E, mit Hinweis auf § 19 UStG", {}, (x) => x.replaceAll("<ram:CategoryCode>E</ram:CategoryCode>", "<ram:CategoryCode>Z</ram:CategoryCode>")],
  ["Steuernummer im Feld der USt-IdNr. (BT-31)", {}, (x) => { const out = x.replace('schemeID="FC"', 'schemeID="VA"'); if (out === x) throw new Error("no FC scheme"); return out; }],
  ["Kategorie Z (Nullsatz) statt E, ohne Hinweis auf § 19 UStG", { category: "Z", reason: "" }, null],
];

function split(findings) {
  return {
    blocking: findings.filter(isBlocking).map((f) => f.rule),
    other: findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`),
  };
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

/** For each variant: findings on the XRechnung CII and the ZUGFeRD EN 16931 CII file. */
export async function variantTable() {
  const rows = [];
  for (const [label, opts, edit] of VARIANTS) {
    const d = draft(opts);
    const xr = generateInvoice(d, { format: "cii", profile: "xrechnung" });
    const zf = generateInvoice(d, { format: "cii", profile: "en16931" });
    if (!xr.ok || !zf.ok) throw new Error(`${label}: the creator refused the draft: ${JSON.stringify(xr.errors || zf.errors)}`);
    const fix = edit || ((x) => x);
    rows.push({ label, xrechnung: await check(fix(xr.xml), "xrechnung"), zugferd: await check(fix(zf.xml), "") });
  }
  return rows;
}

/** What the creator itself says when the seller has a Steuernummer and nothing else. */
export function creatorRefusal() {
  const d = draft();
  delete d.seller.company_id;
  return generateInvoice(d, { format: "cii", profile: "xrechnung" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other].join(", ") || "keine" : "n/a");
  console.log("variant | XRechnung built-in | XRechnung official | ZUGFeRD built-in | ZUGFeRD official");
  for (const r of await variantTable()) {
    console.log(`${r.label} | ${show(r.xrechnung.builtin)} | ${show(r.xrechnung.official)} | ${show(r.zugferd.builtin)} | ${show(r.zugferd.official)}`);
  }
  console.log("\ncreator, Steuernummer only:", JSON.stringify(creatorRefusal().errors));
}
