// A French micro-entrepreneur's e-invoice (franchise en base de TVA, art. 293 B du CGI), written
// by the creator with the France profile and checked by the preflight with the French rules, one
// mistake at a time. It measures what facture-electronique-micro-entrepreneur.html says.
//
//   npm i --no-save slimdom fontoxpath   # the official rules (EN 16931 + FNFE-MPE's BR-FR)
//   node micro-entrepreneur-bench.mjs    # prints the table quoted on the page
//
// Two checks per file:
//   built-in   the preflight's own rules with profile "france" (FR-001..008, INV-0xx). Always runs.
//   official   the published EN 16931 Schematron and the BR-FR rules, run in the plain-JS route.
//              Only when slimdom and fontoxpath are installed; otherwise null.
//
// The made-up seller and buyer carry SIRENs with valid check digits (123456782, 987654324) and the
// VAT numbers those SIRENs give. An observation about generated files, not a legal validity claim.
import { pathToFileURL } from "node:url";
import { generateInvoice, toCii, toUbl, buildInvoice } from "./generate.mjs";
import { isBlocking, preflightDocuments } from "./report.mjs";

/** The micro-entrepreneur's draft: one service line, exempt (E) under the franchise en base. */
export function draft() {
  return {
    number: "F-2026-014",
    issue_date: "2026-11-20",
    due_date: "2026-12-20",
    delivery_date: "2026-11-19",
    currency: "EUR",
    billing_mode: "S1",
    notes: [
      { subject: "PMD", text: "Pénalités de retard : taux d'intérêt de la BCE majoré de 10 points." },
      { subject: "PMT", text: "Indemnité forfaitaire pour frais de recouvrement : 40 euros." },
      { subject: "AAB", text: "Pas d'escompte pour paiement anticipé." },
    ],
    seller: {
      name: "Camille Martin EI", street: "12 rue des Lilas", postal_code: "69003", city: "Lyon", country: "FR",
      legal_id: "123456782", vat_id: "FR11123456782",
      endpoint: { scheme: "0225", id: "123456782" },
    },
    buyer: {
      name: "Atelier Exemple SARL", street: "4 avenue de la République", postal_code: "75011", city: "Paris", country: "FR",
      legal_id: "987654324", vat_id: "FR14987654324",
      endpoint: { scheme: "0225", id: "987654324" },
    },
    payment: { iban: "FR7630006000011234567890189" },
    lines: [
      { description: "Création d'un site vitrine", quantity: 1, unit: "pieces", unit_price: 1200, tax_percent: 0, tax_category: "E", tax_reason: "TVA non applicable, art. 293 B du CGI" },
    ],
  };
}

const noteless = (d, code) => { d.notes = d.notes.filter((n) => n.subject !== code); };

/**
 * One change at a time. `creator` is what the creator does with the draft; when it refuses, the
 * change is made to the written XML instead (`xml`), so the table shows what the rules say about a
 * file another tool wrote that way. Labels are the page's (French).
 */
export const CASES = [
  { label: "facture correcte (numéro de TVA, SIREN, mentions codées)", draft: () => {} },
  { label: "sans numéro de TVA intracommunautaire", draft: (d) => { delete d.seller.vat_id; }, xml: (x) => x.replace(/\s*<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR11123456782<\/ram:ID><\/ram:SpecifiedTaxRegistration>/, "") },
  { label: "sans SIREN du vendeur (BT-30)", draft: (d) => { delete d.seller.legal_id; }, xml: (x) => x.replace(/\s*<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">123456782<\/ram:ID><\/ram:SpecifiedLegalOrganization>/, "") },
  { label: "SIRET (14 chiffres) au lieu du SIREN", draft: (d) => { d.seller.legal_id = "12345678200010"; }, xml: (x) => x.replace('<ram:ID schemeID="0002">123456782</ram:ID></ram:SpecifiedLegalOrganization>', '<ram:ID schemeID="0002">12345678200010</ram:ID></ram:SpecifiedLegalOrganization>') },
  { label: "mention « TVA non applicable » absente (catégorie E sans motif ni code)", draft: (d) => { delete d.lines[0].tax_reason; }, xml: (x) => x.replace(/\s*<ram:ExemptionReason>[^<]*<\/ram:ExemptionReason>/, "").replace(/\s*<ram:ExemptionReasonCode>[^<]*<\/ram:ExemptionReasonCode>/, "") },
  { label: "TVA à 0 % en catégorie S au lieu de E", draft: (d) => { d.lines[0].tax_category = "S"; delete d.lines[0].tax_reason; }, xml: (x) => x.replace(/<ram:CategoryCode>E<\/ram:CategoryCode>/g, "<ram:CategoryCode>S</ram:CategoryCode>").replace(/\s*<ram:ExemptionReason>[^<]*<\/ram:ExemptionReason>/, "").replace(/\s*<ram:ExemptionReasonCode>[^<]*<\/ram:ExemptionReasonCode>/, "") },
  { label: "pénalités de retard non codées (PMD)", draft: (d) => noteless(d, "PMD"), xml: (x) => x.replace(/<ram:SubjectCode>PMD<\/ram:SubjectCode>/, "") },
  { label: "indemnité de 40 euros absente (PMT)", draft: (d) => noteless(d, "PMT"), xml: (x) => x.replace(/\s*<ram:IncludedNote><ram:Content>Indemnité[^<]*<\/ram:Content><ram:SubjectCode>PMT<\/ram:SubjectCode><\/ram:IncludedNote>/, "") },
  { label: "mode de facturation absent (BT-23)", draft: (d) => { delete d.billing_mode; }, xml: (x) => x.replace(/\s*<ram:BusinessProcessSpecifiedDocumentContextParameter>.*?<\/ram:BusinessProcessSpecifiedDocumentContextParameter>/, "") },
  { label: "adresse électronique du client absente (BT-49)", draft: (d) => { delete d.buyer.endpoint; } },
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
    let xml = made.ok ? made.xml : null;
    if (!xml && c.xml) xml = c.xml(base.xml);
    if (xml === base.xml && c !== CASES[0]) throw new Error(`${c.label}: the XML edit matched nothing`);
    rows.push({
      label: c.label,
      creator: made.ok ? { wrote: true, warnings: made.warnings.map((w) => w.path) } : { wrote: false, errors: made.errors.map((e) => e.path) },
      result: xml ? await check("micro.xml", xml) : null,
    });
  }
  return rows;
}

/** The correct invoice as UBL too: the same rules, the other syntax. */
export async function ublResult() {
  const made = generateInvoice(draft(), { format: "ubl", profile: "france" });
  if (!made.ok) throw new Error("the creator refused the UBL draft");
  return check("micro-ubl.xml", made.xml);
}

/** The same draft under the plain EN 16931 profile, before this profile existed: what it lacked. */
export async function withoutFranceProfile() {
  const d = draft();
  delete d.billing_mode;
  const notes = d.notes;
  delete d.notes;
  d.note = notes.map((n) => n.text).join(" ");
  const sellerLegal = d.seller.legal_id; const buyerLegal = d.buyer.legal_id;
  delete d.seller.legal_id; delete d.buyer.legal_id;
  d.seller.company_id = sellerLegal; d.buyer.company_id = buyerLegal;
  const made = generateInvoice(d, { format: "cii", profile: "en16931" });
  if (!made.ok) throw new Error("the creator refused the EN 16931 draft");
  return check("micro-en16931.xml", made.xml);
}

/** A rule id as the page prints it, with its link: BR-FR-05_BT-22_PMD -> BR-FR-05/BT-22 (PMD). */
export function ruleLink(id) {
  const fr = id.match(/^(BR-FR-\d+)(?:_(BT-\d+))?(?:_([A-Z]{3}))?$|^(BR-FR-\d+-[A-Z]+)$/);
  if (fr && fr[4]) return `<a href="br-fr-error-codes.html#r-${fr[4]}">${fr[4]}</a>`;
  if (fr) {
    const name = fr[2] ? `${fr[1]}/${fr[2]}` : fr[1];
    return `<a href="br-fr-error-codes.html#r-${fr[1]}${fr[2] ? `-${fr[2]}` : ""}">${name}</a>${fr[3] ? ` (${fr[3]})` : ""}`;
  }
  if (["BR-E-10", "BR-CO-26"].includes(id)) return `<a href="rules/fr/${id.toLowerCase()}.html">${id}</a>`;
  return id;
}

/** The page's table: one <tr> per case, from caseTable(). */
export function pageRows(rows) {
  return rows.map((r) => {
    const made = r.creator.wrote ? (r.creator.warnings.length ? "écrite, avec un avertissement" : "écrite") : "refusée, avec la règle en cause";
    const off = r.result && r.result.official ? (r.result.official.blocking.map(ruleLink).join(", ") || "aucune erreur") : "n/a";
    return `<tr><td>${r.label}</td><td>${made}</td><td>${off}</td></tr>`;
  });
}

export { buildInvoice, toCii, toUbl };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const show = (c) => (c ? [...c.blocking, ...c.other.map((r) => `${r} (info)`)].join(", ") || "aucune" : "n/a");
  console.log("case | creator | built-in | official");
  for (const r of await caseTable()) {
    const made = r.creator.wrote ? `wrote${r.creator.warnings.length ? ` (warns ${r.creator.warnings.join(", ")})` : ""}` : `refused (${r.creator.errors.join(", ")})`;
    console.log(`${r.label} | ${made} | ${r.result ? show(r.result.builtin) : "-"} | ${r.result ? show(r.result.official) : "-"}`);
  }
  if (process.argv.includes("--html")) for (const row of pageRows(await caseTable())) console.log(row);
  const u = await ublResult();
  console.log(`\nUBL, correct invoice | ${show(u.builtin)} | ${show(u.official)}`);
  const e = await withoutFranceProfile();
  console.log(`EN 16931 profile, same invoice | ${show(e.builtin)} | ${show(e.official)}`);
}
