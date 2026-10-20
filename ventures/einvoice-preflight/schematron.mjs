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
import { FILES, detectSyntax, matchingAddons, parseSvrl } from "./schematron-core.mjs";

export { detectSyntax, parseSvrl };

const here = dirname(fileURLToPath(import.meta.url));
export const SEF_DIR = process.env.EINVOICE_SEF_DIR || join(here, "schematron");

export function schematronAvailable(syntax) {
  return Boolean(FILES[syntax]) && existsSync(join(SEF_DIR, FILES[syntax]));
}

// Which add-on sets apply to this invoice and are built.
export function addonsFor(xml, syntax) {
  return matchingAddons(xml, syntax).filter(([, a]) => existsSync(join(SEF_DIR, a.files[syntax])));
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

function transform(file, xml, source) {
  const result = loadSaxon().transform({ stylesheetFileName: join(SEF_DIR, file), sourceText: xml, destination: "serialized" }, "sync");
  return parseSvrl(result.principalResult, source);
}

// Returns { status: "ok"|"unavailable", syntax, findings, sets }. `sets` lists
// the rule sets that ran, e.g. ["en16931", "xrechnung"].
export function runSchematron(xml) {
  const syntax = detectSyntax(xml);
  if (!syntax || !loadSaxon() || !schematronAvailable(syntax)) return { status: "unavailable", syntax, findings: [], sets: [] };
  const findings = transform(FILES[syntax], xml, "en16931-schematron");
  const sets = ["en16931"];
  const seen = new Set(findings.map((f) => `${f.rule}|${f.path}`));
  for (const [name, addon] of addonsFor(xml, syntax)) {
    sets.push(name);
    for (const f of transform(addon.files[syntax], xml, addon.source)) {
      if (!seen.has(`${f.rule}|${f.path}`)) findings.push(f);
    }
  }
  return { status: "ok", syntax, findings, sets };
}
