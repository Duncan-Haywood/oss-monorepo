// E-Rechnung für Kleinunternehmer: a § 19 UStG invoice written by the creator (generate.mjs)
// as XRechnung (CII) and as ZUGFeRD EN 16931 (CII), then the mistakes small businesses make on
// it, each checked by the preflight. It measures what e-rechnung-kleinunternehmer.html says.
//
//   node kleinunternehmer-bench.mjs          # prints the table quoted on the page
//
// The creator refuses most of these mistakes outright (S at 0 %, E without a reason, a seller
// with neither a VAT ID nor a tax number), so each one is made by editing the generated XML,
// the way another program or a hand edit would produce it.
//
// Two checks per file, as in xrechnung-zugferd-bench.mjs:
//   built-in   the preflight's own rules (profile "xrechnung" for the XRechnung). Always runs.
//   official   the published EN 16931 (CEN) and XRechnung (KoSIT) Schematron, picked by the
//              file's specification identifier (BT-24). Runs only when slimdom and fontoxpath
//              are installed (`npm i --no-save slimdom fontoxpath`); otherwise null.
//
// An observation about generated files, not a legal validity claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

export const DRAFT = new URL("./examples/draft-invoice.json", import.meta.url);
export const REASON = "Kleinunternehmer gemäß § 19 UStG";
export const TAX_NUMBER = "30/123/45678";
/** BT-29, the seller identifier BR-CO-26 asks for when there is no VAT ID. */
export const SELLER_ID = "Lieferant 4711";

/**
 * The creator's example draft turned into a Kleinunternehmer invoice: the seller has a
 * Steuernummer (BT-32), a seller identifier (BT-29) and no VAT ID, and every line is exempt
 * (E, 0 %) with the § 19 note.
 */
export function draft() {
  const d = JSON.parse(readFileSync(DRAFT, "utf8"));
  d.seller.name = "Muster Grafikdesign";
  delete d.seller.vat_id;
  d.seller.tax_number = TAX_NUMBER;
  d.seller.company_id = SELLER_ID;
  for (const l of d.lines) Object.assign(l, { tax_percent: 0, tax_category: "E", tax_reason: REASON });
  return d;
}

const dropReason = (x) => x.replace(/\s*<ram:ExemptionReason>[^<]*<\/ram:ExemptionReason>/g, "");
const category = (c) => (x) => x.replaceAll("<ram:CategoryCode>E</ram:CategoryCode>", `<ram:CategoryCode>${c}</ram:CategoryCode>`);

/** Each mistake as an edit of the generated CII. Labels are the page's (German). */
export const MISTAKES = [
  ["keiner (Kategorie E, 0 %, Hinweis auf § 19, Steuernummer und Verkäuferkennung)", (x) => x],
  ["nur die Steuernummer, keine Verkäuferkennung (BT-29)", (x) => x.replace(/\s*<ram:ID>Lieferant 4711<\/ram:ID>/, "")],
  ["Hinweis auf § 19 UStG fehlt (BT-120)", dropReason],
  ["„0 % USt“ als Normalsatz (Kategorie S)", (x) => category("S")(dropReason(x))],
  ["Kategorie Z (Nullsatz) statt E, ohne Hinweis", (x) => category("Z")(dropReason(x))],
  ["Kategorie Z (Nullsatz) statt E, mit Hinweis", category("Z")],
  ["weder Steuernummer noch USt-IdNr. (BT-31, BT-32)", (x) => x.replace(/\s*<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">[^<]*<\/ram:ID><\/ram:SpecifiedTaxRegistration>/, "")],
  ["Steuernummer im Feld der USt-IdNr. (BT-31)", (x) => x.replace('schemeID="FC"', 'schemeID="VA"')],
];

function split(findings) {
  const blocking = [...new Set(findings.filter(isBlocking).map((f) => f.rule))];
  const other = [...new Set(findings.filter((f) => !isBlocking(f)).map((f) => `${f.rule} (${f.severity})`))];
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

/** The two clean files the mistakes start from. */
export function files() {
  const d = draft();
  const xr = generateInvoice(d, { format: "cii", profile: "xrechnung" });
  const zf = generateInvoice(d, { format: "cii", profile: "en16931" });
  if (!xr.ok || !zf.ok) throw new Error(`the creator refused the Kleinunternehmer draft: ${JSON.stringify([...(xr.errors || []), ...(zf.errors || [])])}`);
  return { xrechnung: xr.xml, zugferd: zf.xml };
}

/** For each mistake: the findings on the XRechnung and on the ZUGFeRD EN 16931 file. */
export async function mistakeTable() {
  const base = files();
  const rows = [];
  for (const [label, edit] of MISTAKES) {
    const xr = edit(base.xrechnung);
    const zf = edit(base.zugferd);
    if (label !== MISTAKES[0][0] && (xr === base.xrechnung || zf === base.zugferd)) throw new Error(`${label}: the edit changed nothing`);
    rows.push({ label, xrechnung: await check(xr, "xrechnung"), zugferd: await check(zf, "") });
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other].join(", ") || "keine" : "n/a");
  console.log("mistake | XRechnung built-in | XRechnung official | ZUGFeRD EN 16931 built-in | ZUGFeRD official");
  for (const r of await mistakeTable()) {
    console.log(`${r.label} | ${show(r.xrechnung.builtin)} | ${show(r.xrechnung.official)} | ${show(r.zugferd.builtin)} | ${show(r.zugferd.official)}`);
  }
}
