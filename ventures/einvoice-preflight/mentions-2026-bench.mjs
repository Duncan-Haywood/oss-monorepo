// The four mentions France made mandatory on invoices from 1 September 2026 (DGFiP FAQ "Je découvre
// la facturation électronique", question 3.4): the customer's SIREN, the category of the operation,
// the option to pay VAT on debits, and the delivery address when it differs from the billing address.
// DGFiP's table of invoice data (MAJ août 2026) maps them to BT-47, BT-23, BT-8 and BT-75 to BT-80.
//
// One B2B invoice that carries all four, written by the creator with the France profile, then one
// mention removed or wrong at a time, each file checked by the preflight. It measures what
// nouvelles-mentions-obligatoires-facture-2026.html says.
//
//   npm i --no-save slimdom fontoxpath   # the official rules (EN 16931 + FNFE-MPE's BR-FR)
//   node mentions-2026-bench.mjs         # prints the table quoted on the page
//
// Two checks per file, as in micro-entrepreneur-bench.mjs:
//   built-in   the preflight's own rules with profile "france" (FR-001..008, INV-0xx). Always runs.
//   official   the published EN 16931 Schematron and the BR-FR rules, run in the plain-JS route.
//              Only when slimdom and fontoxpath are installed; otherwise null.
//
// Made-up parties: SIRENs with valid check digits (123456782, 987654324) and the VAT numbers they
// give. An observation about generated files, not a legal validity claim.
import { pathToFileURL } from "node:url";
import { generateInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

/** A joinery firm supplies and fits windows (M1: goods and services), delivered to the building site. */
export function draft() {
  return {
    number: "F-2026-0412",
    issue_date: "2026-11-20",
    due_date: "2026-12-20",
    delivery_date: "2026-11-18",
    currency: "EUR",
    billing_mode: "M1",
    vat_on_debits: true,
    notes: [
      { subject: "PMD", text: "Pénalités de retard : taux d'intérêt de la BCE majoré de 10 points." },
      { subject: "PMT", text: "Indemnité forfaitaire pour frais de recouvrement : 40 euros." },
      { subject: "AAB", text: "Pas d'escompte pour paiement anticipé." },
    ],
    seller: {
      name: "Menuiserie Exemple SARL", street: "12 rue des Lilas", postal_code: "69003", city: "Lyon", country: "FR",
      legal_id: "123456782", vat_id: "FR11123456782",
      endpoint: { scheme: "0225", id: "123456782" },
    },
    buyer: {
      name: "Atelier Exemple SAS", street: "4 avenue de la République", postal_code: "75011", city: "Paris", country: "FR",
      legal_id: "987654324", vat_id: "FR14987654324",
      endpoint: { scheme: "0225", id: "987654324" },
    },
    delivery_address: { name: "Chantier Les Tilleuls", street: "8 chemin des Vignes", postal_code: "69570", city: "Dardilly", country: "FR" },
    payment: { iban: "FR7630006000011234567890189" },
    lines: [
      { description: "Fenêtre PVC 120 x 100, double vitrage", quantity: 4, unit: "pieces", unit_price: 480, tax_percent: 20 },
      { description: "Pose et réglage", quantity: 6, unit: "hours", unit_price: 55, tax_percent: 20 },
    ],
  };
}

const B2B = { subject: "BAR", text: "B2B" };
// The creator refuses a SIRET as the buyer's SIREN since this bench found BR-FR-32 refusing it; the
// two SIRET cases edit the written file instead, to show what the rules say about another tool's.
const siret = (x) => x.replace('<ram:ID schemeID="0002">987654324</ram:ID>', '<ram:ID schemeID="0002">98765432400019</ram:ID>');
const bar = (x) => x.replace("</ram:IncludedNote>", "</ram:IncludedNote>\n      <ram:IncludedNote><ram:Content>B2B</ram:Content><ram:SubjectCode>BAR</ram:SubjectCode></ram:IncludedNote>");

/**
 * One change at a time. `creator` is what the creator does with the draft; when it refuses, the
 * change is made to the written XML instead (`xml`), so the table shows what the rules say about a
 * file another tool wrote that way. Labels are the page's (French).
 */
export const CASES = [
  { mention: "toutes", label: "facture complète (SIREN du client, M1, débits, adresse de livraison)", draft: () => {} },
  { mention: "SIREN du client", label: "SIREN du client absent (BT-47)", draft: (d) => { delete d.buyer.legal_id; } },
  { mention: "SIREN du client", label: "SIREN du client absent, note BAR « B2B » présente", draft: (d) => { delete d.buyer.legal_id; d.notes.push(B2B); } },
  { mention: "SIREN du client", label: "SIRET du client (14 chiffres) au lieu du SIREN", draft: (d) => { d.buyer.legal_id = "98765432400019"; }, xml: (x) => siret(x) },
  { mention: "SIREN du client", label: "SIRET du client au lieu du SIREN, note BAR « B2B » présente", draft: (d) => { d.buyer.legal_id = "98765432400019"; d.notes.push(B2B); }, xml: (x) => bar(siret(x)) },
  { mention: "catégorie de l'opération", label: "cadre de facturation absent (BT-23)", draft: (d) => { delete d.billing_mode; }, xml: (x) => x.replace(/\s*<ram:BusinessProcessSpecifiedDocumentContextParameter>.*?<\/ram:BusinessProcessSpecifiedDocumentContextParameter>/, "") },
  { mention: "catégorie de l'opération", label: "B1 (biens seuls) au lieu de M1 pour fourniture et pose", draft: (d) => { d.billing_mode = "B1"; } },
  { mention: "TVA sur les débits", label: "option pour les débits non codée (BT-8 absent)", draft: (d) => { delete d.vat_on_debits; } },
  { mention: "TVA sur les débits", label: "BT-8 à 72 (encaissements) alors que l'entreprise a opté", draft: () => {}, xml: (x) => x.replace(/<ram:DueDateTypeCode>5<\/ram:DueDateTypeCode>/g, "<ram:DueDateTypeCode>72</ram:DueDateTypeCode>"), forceXml: true },
  { mention: "TVA sur les débits", label: "BT-8 à 4 (code hors liste)", draft: () => {}, xml: (x) => x.replace(/<ram:DueDateTypeCode>5<\/ram:DueDateTypeCode>/g, "<ram:DueDateTypeCode>4</ram:DueDateTypeCode>"), forceXml: true },
  { mention: "adresse de livraison", label: "adresse de livraison absente (BT-75 à BT-80)", draft: (d) => { delete d.delivery_address; } },
  { mention: "adresse de livraison", label: "pays de livraison seul (BT-80, sans rue ni ville)", draft: (d) => { delete d.delivery_address; d.delivery_country = "FR"; } },
  { mention: "adresse de livraison", label: "adresse de livraison sans pays", draft: (d) => { delete d.delivery_address.country; }, xml: (x) => x.replace(/<ram:CountryID>FR<\/ram:CountryID><\/ram:PostalTradeAddress><\/ram:ShipToTradeParty>/, "</ram:PostalTradeAddress></ram:ShipToTradeParty>") },
];

function split(findings) {
  const blocking = [...new Set(findings.filter(isBlocking).map((f) => f.rule))];
  const other = [...new Set(findings.filter((f) => !isBlocking(f)).map((f) => f.rule))];
  return { blocking, other };
}

async function check(name, source) {
  const builtin = (await preflightDocuments([{ name, source }], { profile: "france" })).reports[0];
  const both = (await preflightDocuments([{ name, source }], { profile: "france", schematron: true })).reports[0];
  const ran = both.schematron === "ok";
  const builtinIds = new Set(builtin.errors.map((f) => f.rule));
  return {
    builtin: split(builtin.errors),
    official: ran ? split(both.errors.filter((f) => !builtinIds.has(f.rule) || f.source)) : null,
  };
}

/** For each case: whether the creator wrote it (or what it said), and the findings on the CII file. */
export async function caseTable() {
  const base = generateInvoice(draft(), { format: "cii", profile: "france" });
  if (!base.ok) throw new Error(`the creator refused the base draft: ${JSON.stringify(base.errors)}`);
  const rows = [];
  for (const c of CASES) {
    const d = draft();
    c.draft(d);
    const made = generateInvoice(d, { format: "cii", profile: "france" });
    let xml = made.ok && !c.forceXml ? made.xml : null;
    if (!xml && c.xml) xml = c.xml(base.xml);
    if (xml === base.xml && c !== CASES[0]) throw new Error(`${c.label}: the change left the file as it was`);
    rows.push({
      mention: c.mention,
      label: c.label,
      creator: c.forceXml ? { wrote: null } : made.ok ? { wrote: true, warnings: made.warnings.map((w) => w.path) } : { wrote: false, errors: made.errors.map((e) => e.path) },
      result: xml ? await check("mentions.xml", xml) : null,
    });
  }
  return rows;
}

/** The complete invoice as UBL too: the same rules, the other syntax. */
export async function ublResult() {
  const made = generateInvoice(draft(), { format: "ubl", profile: "france" });
  if (!made.ok) throw new Error("the creator refused the UBL draft");
  return { xml: made.xml, result: await check("mentions-ubl.xml", made.xml) };
}

/** A rule id as the page prints it, with its link. */
export function ruleLink(id) {
  const fr = id.match(/^(BR-FR-\d+)(?:_(BT-\d+))?(?:_([A-Z]{3}))?$|^(BR-FR-\d+-[A-Z]+)$/);
  if (fr && fr[4]) return `<a href="br-fr-error-codes.html#r-${fr[4]}">${fr[4]}</a>`;
  if (fr) {
    const name = fr[2] ? `${fr[1]}/${fr[2]}` : fr[1];
    return `<a href="br-fr-error-codes.html#r-${fr[1]}${fr[2] ? `-${fr[2]}` : ""}">${name}</a>${fr[3] ? ` (${fr[3]})` : ""}`;
  }
  return id;
}

/** The page's table: one <tr> per case, from caseTable(). */
export function pageRows(rows) {
  return rows.map((r) => {
    const made = r.creator.wrote === null ? "fichier modifié à la main" : r.creator.wrote ? (r.creator.warnings.length ? "écrite, avec un avertissement" : "écrite") : "refusée, avec la règle en cause";
    const off = r.result && r.result.official ? (r.result.official.blocking.map(ruleLink).join(", ") || "aucune erreur") : "n/a";
    return `<tr><td>${r.mention}</td><td>${r.label}</td><td>${made}</td><td>${off}</td></tr>`;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other.map((r) => `${r} (info)`)].join(", ") || "aucune" : "n/a");
  console.log("mention | case | creator | built-in | official");
  const rows = await caseTable();
  for (const r of rows) {
    const made = r.creator.wrote === null ? "xml edit" : r.creator.wrote ? `wrote${r.creator.warnings.length ? ` (warns ${r.creator.warnings.join(", ")})` : ""}` : `refused (${r.creator.errors.join(", ")})`;
    console.log(`${r.mention} | ${r.label} | ${made} | ${r.result ? show(r.result.builtin) : "-"} | ${r.result ? show(r.result.official) : "-"}`);
  }
  if (process.argv.includes("--html")) for (const row of pageRows(rows)) console.log(row);
  const u = await ublResult();
  console.log(`\nUBL, complete invoice | ${show(u.result.builtin)} | ${show(u.result.official)}`);
}
