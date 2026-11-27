// Pure parts of the official Schematron bridge: no Node imports, so the
// browser build (official-browser.mjs) and the server (schematron.mjs) share them.
import { plainFix } from "./schematron-fixes.mjs";

// Add-on rule sets run after the base rules when the invoice names the profile
// in its CustomizationID (BT-24). Sources: KoSIT xrechnung-schematron (Apache-2.0)
// and OpenPEPPOL peppol-bis-invoice-3 (MPL-2.0), compiled by build-schematron.mjs.
export const FILES = { ubl: "ubl.sef.json", cii: "cii.sef.json" };
export const ADDONS = {
  xrechnung: { source: "xrechnung-schematron", match: /xrechnung/i, files: { ubl: "xrechnung-ubl.sef.json", cii: "xrechnung-cii.sef.json" } },
  // Peppol BIS Billing. A Self-Billing file (BT-24 ...poacc:selfbilling:3.0) names peppol.eu
  // too, but Billing's R004, R007 and P0112 reject every one of them (type code 389 is the
  // self-billed invoice): it gets the Self-Billing set below instead (2026-11-18).
  peppol: { source: "peppol-schematron", match: /^(?![\s\S]*poacc:selfbilling:3\.0)[\s\S]*peppol\.eu/i, files: { ubl: "peppol-ubl.sef.json", cii: "peppol-cii.sef.json" } },
  // Peppol BIS Self-Billing 3.0.2 (in force 2026-08-17), the buyer issuing the invoice for its
  // supplier. UBL only (OpenPeppol publishes no CII form); plain route only. build-plain-rules.mjs.
  "peppol-sb": { source: "peppol-sb-schematron", match: /poacc:selfbilling:3\.0/i, plainOnly: true, files: { ubl: "peppol-sb-ubl.sef.json" } },
  // Romania's national rules (RO e-Factura, ANAF). UBL only; no Saxon form is built, so
  // only the plain route (browser and Node fallback) runs them: build-ro-rules.mjs.
  // CIUS-RO 1.0.9 sits on EN 16931 validation 1.3.8 (phive-rules-cius-ro's basedOn, and
  // ANAF's own bundled EN16931-CIUS_RO-UBL-validation.xslt), not on the current base: the
  // plain route runs that release under it (`base`). 1.3.14 added UBL-SR-51..59, and
  // UBL-SR-53 fails ANAF's own non-VAT buyer (a PartyTaxScheme with an empty TaxScheme).
  "cius-ro": { source: "cius-ro-schematron", match: /CIUS-RO/i, plainOnly: true, files: { ubl: "cius-ro-ubl.sef.json" }, base: { ubl: ["en16931-1.3.8-ubl.json", "en16931-1.3.8"] } },
  // The Netherlands' NLCIUS (SI-UBL 2.0) and its G-account variant. UBL only, plain route
  // only, like Romania: build-nl-rules.mjs. A Peppol BIS file does not match; its NL-R
  // rules already run in the Peppol add-on.
  nlcius: { source: "nlcius-schematron", match: /nen\.nl:(nlcius|gaccount)/i, plainOnly: true, files: { ubl: "nlcius-ubl.sef.json", cii: "nlcius-cii.sef.json" } },
  // Portugal's CIUS-PT (AMA / FEAP), the checks the EU base does not carry. Plain route only: build-pt-rules.mjs.
  "cius-pt": { source: "cius-pt-schematron", match: /CIUS-PT/i, plainOnly: true, files: { ubl: "cius-pt-ubl.sef.json" } },
  // Croatia's HR-CIUS 2025 with the HR extension (Fiskalizacija 2.0, B2B since 1 January 2026):
  // the Porezna uprava's HR-BR rules (OIB check digits, KPD classification, operator, issue
  // time, process P1-P12). UBL only, plain route only: build-hr-rules.mjs.
  "cius-hr": { source: "cius-hr-schematron", match: /urn:mfin\.gov\.hr:/i, plainOnly: true, files: { ubl: "cius-hr-ubl.sef.json" } },
  // France's CTC rules (BR-FR, XP Z12-012, mandatory since 1 September 2026): FNFE-MPE's
  // Schematron, one file per syntax for EN 16931, Extended-CTC-FR and Factur-X alike
  // (build-fr-rules.mjs). A French EN 16931 invoice names plain urn:cen.eu:en16931:2017,
  // so BT-24 alone cannot tell it is French: the set also runs when the caller asks for
  // the French profile (`profile: "france"`, the page's "Also apply the French rules").
  "cius-fr": { source: "cius-fr-schematron", match: /urn\.cpro\.gouv\.fr/i, profile: "france", plainOnly: true, files: { ubl: "cius-fr-ubl.sef.json", cii: "cius-fr-cii.sef.json" } },
};

// The next Peppol BIS Billing release, run in place of the current one when the caller asks
// (`peppolNext: true`; the API's ?peppol=next, the page's "Preview Peppol BIS 3.1.0"). Compiled
// by build-plain-rules.mjs from OpenPeppol's release branch; plain route only (no Saxon form).
// When the release lands on OpenPeppol's master and is in force, it becomes `peppol` and this
// entry moves to the release after it.
export const PEPPOL_NEXT = {
  release: "3.1.0",
  current: "3.0.22",
  published: "2026-11-23",
  mandatory: "2027-02-24",
  source: "peppol-3.1.0-schematron",
  files: { ubl: "peppol-next-ubl.json", cii: "peppol-next-cii.json" },
  // Self-Billing 3.1.0 comes out the same day on the same dates (branch selfbilling-2026-Q4-QA2).
  selfBilling: { release: "3.1.0", current: "3.0.2", source: "peppol-sb-3.1.0-schematron", files: { ubl: "peppol-sb-next-ubl.json" } },
};

// Peppol PINT profiles (Singapore InvoiceNow, Australia/New Zealand). Their
// rules replace the EN 16931 base and the Peppol BIS add-on rather than
// following them: PINT uses its own tax category codes (GST: SR, ZR, NG...),
// which the EU base rules reject. UBL only; OpenPeppol publishes no CII form.
// Compiled by build-pint-rules.mjs from the phive-rules-peppol artefact.
export const PROFILES = {
  "pint-sg": { source: "pint-sg-schematron", match: /poacc:billing:international:sg:/i, files: { ubl: ["pint-sg-en16931-ubl.json", "pint-sg-peppol-ubl.json", "pint-sg-billing3-ubl.json"] } },
  "pint-aunz": { source: "pint-aunz-schematron", match: /poacc:billing:international:aunz:/i, files: { ubl: ["pint-aunz-en16931-ubl.json", "pint-aunz-peppol-ubl.json"] } },
  // Saudi Arabia (ZATCA / Fatoora). The KSA invoice names no CustomizationID profile: its marker is
  // the UBL ProfileID "reporting:1.0" (simplified) or "clearance:1.0" (standard). ZATCA ships its
  // own cut of the EN 16931 rules beside the KSA ones, so the EU base steps aside. build-zatca-rules.mjs.
  zatca: { source: "zatca-schematron", match: /(?!)/, profileId: /^\s*(?:reporting|clearance):1\.0\s*$/i, files: { ubl: ["zatca-en16931-ubl.json", "zatca-ksa-ubl.json"] } },
  "pint-aunz-sb": { source: "pint-aunz-schematron", match: /poacc:selfbilling:international:aunz:/i, files: { ubl: ["pint-aunz-en16931-ubl.json", "pint-aunz-sb-peppol-ubl.json"] } },
  // The current PINT releases (SG 1.4.1, A-NZ 1.1.3) name the profile as
  // urn:peppol:pint:billing-1@sg-1 / @aunz-1 / selfbilling-1@aunz-1, which the patterns
  // above do not match: OpenPeppol's own examples for them got the EU base instead.
  "pint-sg-1": { source: "pint-sg-schematron", match: /^\s*urn:peppol:pint:billing-1@sg-1\b/i, files: { ubl: ["pint1-sg-ubl.json", "pint1-sg-jur-ubl.json"] } },
  "pint-aunz-1": { source: "pint-aunz-schematron", match: /^\s*urn:peppol:pint:billing-1@aunz-1\b/i, files: { ubl: ["pint1-aunz-ubl.json", "pint1-aunz-jur-ubl.json"] } },
  "pint-aunz-sb-1": { source: "pint-aunz-schematron", match: /^\s*urn:peppol:pint:selfbilling-1@aunz-1\b/i, files: { ubl: ["pint1-aunz-sb-ubl.json", "pint1-aunz-sb-jur-ubl.json"] } },
  // Japan (JP 1.1.3, plus its non-tax-registered seller and self-billing profiles), Malaysia
  // (MY 1.3.1), the UAE (AE 2026.5) and Oman (OM 1.0.1), added 2026-11-12: before then their
  // ids fell to the EU base, which rejects a JPY consumption-tax or MYR SST invoice for EU
  // reasons. Billing releases that ship the shared PINT-UBL stylesheet byte for byte use
  // pint1-sg-ubl.json (build-pint-rules.mjs checks and records `sameAs` in the manifest).
  "pint-jp-1": { source: "pint-jp-schematron", match: /^\s*urn:peppol:pint:billing-1@jp-1\b/i, files: { ubl: ["pint1-sg-ubl.json", "pint1-jp-jur-ubl.json"] } },
  "pint-jp-ntr-1": { source: "pint-jp-schematron", match: /^\s*urn:peppol:pint:nontaxinvoice-1@jp-1\b/i, files: { ubl: ["pint1-jp-ntr-ubl.json", "pint1-jp-ntr-jur-ubl.json"] } },
  "pint-jp-sb-1": { source: "pint-jp-schematron", match: /^\s*urn:peppol:pint:selfbilling-1@jp-1\b/i, files: { ubl: ["pint1-jp-sb-ubl.json", "pint1-jp-sb-jur-ubl.json"] } },
  "pint-my-1": { source: "pint-my-schematron", match: /^\s*urn:peppol:pint:billing-1@my-1\b/i, files: { ubl: ["pint1-sg-ubl.json", "pint1-my-jur-ubl.json"] } },
  "pint-my-sb-1": { source: "pint-my-schematron", match: /^\s*urn:peppol:pint:selfbilling-1@my-1\b/i, files: { ubl: ["pint1-my-sb-ubl.json", "pint1-my-sb-jur-ubl.json"] } },
  "pint-ae-1": { source: "pint-ae-schematron", match: /^\s*urn:peppol:pint:billing-1@ae-1\b/i, files: { ubl: ["pint1-ae-ubl.json", "pint1-ae-jur-ubl.json"] } },
  "pint-ae-sb-1": { source: "pint-ae-schematron", match: /^\s*urn:peppol:pint:selfbilling-1@ae-1\b/i, files: { ubl: ["pint1-ae-sb-ubl.json", "pint1-ae-jur-ubl.json"] } },
  "pint-om-1": { source: "pint-om-schematron", match: /^\s*urn:peppol:pint:billing-1@om-1\b/i, files: { ubl: ["pint1-sg-ubl.json", "pint1-om-jur-ubl.json"] } },
  "pint-om-sb-1": { source: "pint-om-schematron", match: /^\s*urn:peppol:pint:selfbilling-1@om-1\b/i, files: { ubl: ["pint1-om-sb-ubl.json", "pint1-om-sb-jur-ubl.json"] } },
};

// Extended profiles whose own base set stands in for the EN 16931 base (added 2026-11-17).
// An extended file may carry what EN 16931 forbids (more than one seller on a multi-vendor
// invoice, sub-lines, more lines and allowances); the EU base rejected every one of FNFE's
// fifteen extended examples (4 to 16 findings each, fatal BR-CO-10, BR-22, BR-26 ...).
// FNFE-MPE publishes the bases: EXTENDED-CTC-FR (UBL and CII, derived from EN 16931 1.3.16)
// and Factur-X 1.09.2 EXTENDED (CII, the profile ZUGFeRD 2.x EXTENDED names too).
// Plain route only (build-fr-rules.mjs). National add-ons (BR-FR) still run after them.
export const EXTENDED_BASES = {
  "extended-ctc-fr": { source: "extended-ctc-fr-schematron", match: /urn\.cpro\.gouv\.fr:1p0:extended-ctc-fr/i, files: { ubl: "extended-ctc-fr-ubl.json", cii: "extended-ctc-fr-cii.json" } },
  "facturx-extended": { source: "facturx-extended-schematron", match: /urn:(?:factur-x\.eu:1p0|zugferd\.de:2p0):extended\b/i, files: { cii: "facturx-extended-cii.json" } },
};

export function matchingExtendedBase(xml, syntax) {
  const id = customizationId(xml);
  return Object.entries(EXTENDED_BASES).find(([, b]) => b.match.test(id) && b.files[syntax]) || null;
}

export function matchingProfile(xml, syntax) {
  const id = customizationId(xml);
  const profileId = xml.match(/<(?:\w+:)?ProfileID\b[^>]*>([^<]*)</)?.[1] ?? "";
  return Object.entries(PROFILES).find(([, p]) => (p.match.test(id) || p.profileId?.test(profileId)) && p.files[syntax]) || null;
}

// BT-24 is cbc:CustomizationID in UBL and the ID inside
// GuidelineSpecifiedDocumentContextParameter in CII.
export function customizationId(xml) {
  return xml.match(/<(?:\w+:)?CustomizationID\b[^>]*>([^<]*)</)?.[1]
    ?? xml.match(/<(?:\w+:)?GuidelineSpecifiedDocumentContextParameter\b[^>]*>\s*<(?:\w+:)?ID\b[^>]*>([^<]*)</)?.[1] ?? "";
}

// Add-on sets whose BT-24 pattern matches, or whose `profile` the caller asked for, as
// [name, addon], before checking the SEF is built.
export function matchingAddons(xml, syntax, { profile = "" } = {}) {
  const id = customizationId(xml);
  return Object.entries(ADDONS).filter(([, a]) => (a.match.test(id) || (profile && a.profile === profile)) && a.files[syntax]);
}

// Rule sets this file needs that have no Saxon form. build-schematron.mjs compiles the EU
// base, XRechnung and Peppol BIS only; the PINT and ZATCA sets (which replace the EU base)
// and the national add-ons marked plainOnly (CIUS-RO on its 1.3.8 base, NLCIUS, CIUS-PT)
// ship as ./plain/ JSON alone. A Saxon runner given such a file would check it against
// the current EU base and nothing else, so it hands the file to the plain route instead.
export function plainOnlySets(xml, syntax, opts = {}) {
  if (!syntax) return [];
  if (syntax === "cdar") return ["cdar-fr"];
  if (syntax === "flux10") return ["flux10-fr"];
  const profile = matchingProfile(xml, syntax);
  if (profile) return [profile[0]];
  const extended = matchingExtendedBase(xml, syntax);
  const addons = matchingAddons(xml, syntax, opts);
  const next = !opts.peppolNext ? [] : addons.some(([name]) => name === "peppol") ? ["peppol-next"]
    : addons.some(([name]) => name === "peppol-sb") ? ["peppol-sb-next"] : [];
  return (extended ? [extended[0]] : []).concat(addons.filter(([, a]) => a.plainOnly).map(([name]) => name), next);
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Pull failed-asserts and successful reports with flag=fatal|warning out of SVRL.
export function parseSvrl(svrl, source = "en16931-schematron") {
  const out = [];
  const re = /<svrl:failed-assert\b([^>]*)>\s*<svrl:text>([\s\S]*?)<\/svrl:text>/g;
  for (const m of svrl.matchAll(re)) {
    const attrs = m[1];
    const attr = (name) => decodeXml(attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
    const text = decodeXml(m[2]).replace(/\s+/g, " ").trim();
    const withId = text.match(/^\[([^\]]+)\]-?\s*(.*)$/);
    const rule = attr("id") || withId?.[1] || "SCH";
    out.push({
      rule,
      message: withId ? withId[2] : text,
      fix: plainFix(rule),
      path: attr("location").replace(/\[namespace-uri\(\)='[^']*'\]/g, "").replace(/\/Q\{[^}]*\}/g, "/").replace(/\/\*:/g, "/"),
      severity: attr("flag") || attr("role") || "fatal",
      source,
    });
  }
  return out;
}

export function detectSyntax(xml) {
  // France's e-reporting file (Flux 10, root Report > ReportDocument): its own rule set. Checked
  // first, since its transactions report holds <Invoice> elements of its own (not UBL).
  if (/^(?:\uFEFF)?\s*(?:<(?:\?[^?]*(?:\?(?!>)[^?]*)*\?>|!--[^-]*(?:-(?!->)[^-]*)*-->)\s*)*<Report\b[^>]*>\s*(?:<!--[^-]*(?:-(?!->)[^-]*)*-->\s*)*<ReportDocument\b/.test(xml)) return "flux10";
  // France's life-cycle status message (CDAR, "CDV" 200-228): its own rule set, no EN 16931 base.
  if (/<(?:\w+:)?CrossDomainAcknowledgementAndResponse\b/.test(xml)) return "cdar";
  if (/<(?:\w+:)?CrossIndustryInvoice\b/.test(xml)) return "cii";
  if (/<(?:\w+:)?(?:Invoice|CreditNote)\b/.test(xml)) return "ubl";
  return "";
}

