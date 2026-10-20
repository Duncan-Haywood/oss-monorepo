// Optional second opinion from the official EN 16931 Schematron (CEN / the
// ConnectingEurope eInvoicing-EN16931 validation artefacts, EUPL-1.2), run in
// Saxon-JS from SEF files built by build-schematron.mjs. Neither saxon-js nor
// the SEF files ship in this folder: `node build-schematron.mjs` fetches and
// compiles them, and without them every call here returns `unavailable`.
// Findings are labelled source "en16931-schematron" and use the official BR-xx
// rule IDs; the built-in INV-nnn rules are unchanged and still run.
// The XRechnung add-on rules (KoSIT xrechnung-schematron, Apache-2.0, with the
// Peppol BIS rules merged in) run as a second set, xr-ubl / xr-cii.sef.json,
// when the invoice names an XRechnung specification or the caller asks for it.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plainFix } from "./schematron-fixes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const SEF_DIR = process.env.EINVOICE_SEF_DIR || join(here, "schematron");
const FILES = { ubl: "ubl.sef.json", cii: "cii.sef.json" };
const XR_FILES = { ubl: "xr-ubl.sef.json", cii: "xr-cii.sef.json" };
const SOURCES = { base: "en16931-schematron", xrechnung: "xrechnung-schematron" };

export function schematronAvailable(syntax, set = "base") {
  const file = (set === "xrechnung" ? XR_FILES : FILES)[syntax];
  return Boolean(file) && existsSync(join(SEF_DIR, file));
}

// True when the invoice's specification identifier (BT-24) names an XRechnung CIUS.
export function declaresXrechnung(xml) {
  return /xeinkauf\.de:kosit:(?:extension:)?xrechnung/i.test(xml);
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// Pull failed-asserts and successful reports with flag=fatal|warning out of SVRL.
export function parseSvrl(svrl, source = SOURCES.base) {
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
      path: attr("location").replace(/\[namespace-uri\(\)='[^']*'\]/g, "").replace(/\/\*:/g, "/").replace(/\/Q\{[^}]*\}/g, "/"),
      severity: attr("flag") || "fatal",
      source,
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

// Returns { status: "ok"|"unavailable", syntax, rulesets, findings }. `xrechnung`
// forces the add-on set on; otherwise it runs when the invoice declares XRechnung.
// If the add-on files are missing the base set still runs and "xrechnung" is absent from rulesets.
export function runSchematron(xml, { xrechnung = false } = {}) {
  const syntax = detectSyntax(xml);
  const engine = loadSaxon();
  if (!syntax || !engine || !schematronAvailable(syntax)) return { status: "unavailable", syntax, rulesets: [], findings: [] };
  const sets = [["base", FILES[syntax]]];
  if ((xrechnung || declaresXrechnung(xml)) && schematronAvailable(syntax, "xrechnung")) sets.push(["xrechnung", XR_FILES[syntax]]);
  const findings = [];
  const seen = new Set();
  for (const [set, file] of sets) {
    const result = engine.transform({
      stylesheetFileName: join(SEF_DIR, file),
      sourceText: xml,
      destination: "serialized",
    }, "sync");
    for (const f of parseSvrl(result.principalResult, SOURCES[set])) {
      const key = `${f.rule}|${f.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(f);
    }
  }
  return { status: "ok", syntax, rulesets: sets.map(([set]) => set), findings };
}
