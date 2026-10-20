// Optional second opinion from the official EN 16931 Schematron (CEN / the
// ConnectingEurope eInvoicing-EN16931 validation artefacts, EUPL-1.2), run in
// Saxon-JS from SEF files built by build-schematron.mjs. Neither saxon-js nor
// the SEF files ship in this folder: `node build-schematron.mjs` fetches and
// compiles them, and without them every call here returns `unavailable`.
// Findings are labelled source "en16931-schematron" and use the official BR-xx
// rule IDs; the built-in INV-nnn rules are unchanged and still run.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plainFix } from "./schematron-fixes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const SEF_DIR = process.env.EINVOICE_SEF_DIR || join(here, "schematron");
const FILES = { ubl: "ubl.sef.json", cii: "cii.sef.json" };

export function schematronAvailable(syntax) {
  return Boolean(FILES[syntax]) && existsSync(join(SEF_DIR, FILES[syntax]));
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Pull failed-asserts and successful reports with flag=fatal|warning out of SVRL.
export function parseSvrl(svrl) {
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
      path: attr("location").replace(/\[namespace-uri\(\)='[^']*'\]/g, "").replace(/\/\*:/g, "/"),
      severity: attr("flag") || "fatal",
      source: "en16931-schematron",
    });
  }
  return out;
}

let saxon;
function loadSaxon() {
  if (saxon !== undefined) return saxon;
  try {
    saxon = createRequire(import.meta.url)("saxon-js");
  } catch {
    saxon = null;
  }
  return saxon;
}

export function detectSyntax(xml) {
  if (/<(?:\w+:)?CrossIndustryInvoice\b/.test(xml)) return "cii";
  if (/<(?:\w+:)?(?:Invoice|CreditNote)\b/.test(xml)) return "ubl";
  return "";
}

// Returns { status: "ok"|"unavailable", syntax, findings }.
export function runSchematron(xml) {
  const syntax = detectSyntax(xml);
  const engine = loadSaxon();
  if (!syntax || !engine || !schematronAvailable(syntax)) return { status: "unavailable", syntax, findings: [] };
  const result = engine.transform({
    stylesheetFileName: join(SEF_DIR, FILES[syntax]),
    sourceText: xml,
    destination: "serialized",
  }, "sync");
  return { status: "ok", syntax, findings: parseSvrl(result.principalResult) };
}
