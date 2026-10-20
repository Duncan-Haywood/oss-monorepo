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
};

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

