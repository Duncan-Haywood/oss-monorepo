// Pure parts of the official Schematron bridge: no Node imports, so the
// browser build (official-browser.mjs) and the server (schematron.mjs) share them.
import { plainFix } from "./schematron-fixes.mjs";

// Add-on rule sets run after the base rules when the invoice names the profile
// in its CustomizationID (BT-24). Sources: KoSIT xrechnung-schematron (Apache-2.0)
// and OpenPEPPOL peppol-bis-invoice-3 (MPL-2.0), compiled by build-schematron.mjs.
export const FILES = { ubl: "ubl.sef.json", cii: "cii.sef.json" };
export const ADDONS = {
  xrechnung: { source: "xrechnung-schematron", match: /xrechnung/i, files: { ubl: "xrechnung-ubl.sef.json", cii: "xrechnung-cii.sef.json" } },
  peppol: { source: "peppol-schematron", match: /peppol\.eu/i, files: { ubl: "peppol-ubl.sef.json", cii: "peppol-cii.sef.json" } },
  // Romania's national rules (RO e-Factura, ANAF). UBL only; no Saxon form is built, so
  // only the plain route (browser and Node fallback) runs them: build-ro-rules.mjs.
  "cius-ro": { source: "cius-ro-schematron", match: /CIUS-RO/i, files: { ubl: "cius-ro-ubl.sef.json" } },
  // The Netherlands' NLCIUS (SI-UBL 2.0) and its G-account variant. UBL only, plain route
  // only, like Romania: build-nl-rules.mjs. A Peppol BIS file does not match; its NL-R
  // rules already run in the Peppol add-on.
  nlcius: { source: "nlcius-schematron", match: /nen\.nl:(nlcius|gaccount)/i, files: { ubl: "nlcius-ubl.sef.json", cii: "nlcius-cii.sef.json" } },
  // Portugal's CIUS-PT (AMA / FEAP), the checks the EU base does not carry. Plain route only: build-pt-rules.mjs.
  "cius-pt": { source: "cius-pt-schematron", match: /CIUS-PT/i, files: { ubl: "cius-pt-ubl.sef.json" } },
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
};

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

// Add-on sets whose BT-24 pattern matches, as [name, addon], before checking the SEF is built.
export function matchingAddons(xml, syntax) {
  const id = customizationId(xml);
  return Object.entries(ADDONS).filter(([, a]) => a.match.test(id) && a.files[syntax]);
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
      severity: attr("flag") || "fatal",
      source,
    });
  }
  return out;
}

export function detectSyntax(xml) {
  if (/<(?:\w+:)?CrossIndustryInvoice\b/.test(xml)) return "cii";
  if (/<(?:\w+:)?(?:Invoice|CreditNote)\b/.test(xml)) return "ubl";
  return "";
}

