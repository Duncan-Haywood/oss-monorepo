// English text for FNFE-MPE's French BR-FR and BR-FR-CDV messages.
//   node br-fr-en.mjs        adds `en` to every check of plain/cius-fr-{ubl,cii}.json and plain/cdar-fr.json
// build-fr-rules.mjs calls addEnglish() too, so a rebuild keeps the English. The table
// (plain/br-fr-en.json) maps each French message, exactly as FNFE publishes it, to an English
// translation made for this tool (not FNFE's own text). A message the table lacks keeps no
// `en`, the report shows the French, and br-fr-en.test.mjs fails until it is translated.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const BR_FR_SETS = ["cius-fr-ubl", "cius-fr-cii", "cdar-fr"];
export const loadTable = () => JSON.parse(readFileSync(join(here, "plain", "br-fr-en.json"), "utf8"));

// Adds check.en from the table; returns the French messages it had no English for.
export function addEnglish(rules, table = loadTable()) {
  const missing = [];
  for (const p of rules.patterns) for (const r of p.rules) for (const c of r.checks) {
    if (Object.hasOwn(table, c.text)) c.en = table[c.text];
    else { delete c.en; missing.push(c.text); }
  }
  return missing;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const table = loadTable();
  for (const name of BR_FR_SETS) {
    const file = join(here, "plain", `${name}.json`);
    const rules = JSON.parse(readFileSync(file, "utf8"));
    const missing = addEnglish(rules, table);
    writeFileSync(file, JSON.stringify(rules) + "\n");
    console.log(`${name}: ${missing.length ? `${missing.length} messages without English` : "every message has English"}`);
  }
}
