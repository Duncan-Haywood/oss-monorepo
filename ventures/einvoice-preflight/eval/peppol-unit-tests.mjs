// Run OpenPeppol's own unit tests (rules/unit-*/ in OpenPEPPOL/peppol-bis-invoice-3)
// against a compiled plain Peppol rule set, the way OpenPeppol's vefa validator reads
// them: each <test> holds one document and <assert> lines naming a rule that must
// pass (<success>), fail as an error (<error>) or fail as a warning (<warning>).
//
//   node eval/peppol-unit-tests.mjs <peppol-bis-invoice-3 checkout> [plain-dir]
//
// Needs `npm i --no-save slimdom fontoxpath`. Only the Peppol add-on runs (not the
// EN 16931 base), since the unit snippets are deliberately partial documents.
// Prints one line per disagreement and a summary per folder; exit 1 on any.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { createPlainRunner } from "../plain-schematron.mjs";

const require = createRequire(import.meta.url);
const { parseXmlDocument, serializeToWellFormedString } = require("slimdom");
const fontoxpath = require("fontoxpath");
const { runRules } = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument });

const [checkout, plainDir = new URL("../plain/", import.meta.url).pathname] = process.argv.slice(2);
if (!checkout) { console.error("usage: node eval/peppol-unit-tests.mjs <peppol-bis-invoice-3 checkout> [plain-dir]"); process.exit(2); }
const rules = {
  ubl: JSON.parse(readFileSync(join(plainDir, "peppol-ubl.json"), "utf8")),
  cii: JSON.parse(readFileSync(join(plainDir, "peppol-cii.json"), "utf8")),
};
const unitRoot = resolve(checkout, "rules");
const kids = (n, name) => [...n.childNodes].filter((c) => c.nodeType === 1 && (!name || c.localName === name));

let bad = 0;
const totals = {};
for (const dir of readdirSync(unitRoot).filter((d) => /^unit-(UBL|CII)-/.test(d)).sort()) {
  const syntax = dir.startsWith("unit-UBL") ? "ubl" : "cii";
  const t = (totals[dir] = { asserts: 0, agree: 0, skipped: 0 });
  for (const file of readdirSync(join(unitRoot, dir)).filter((f) => f.endsWith(".xml")).sort()) {
    const set = parseXmlDocument(readFileSync(join(unitRoot, dir, file), "utf8")).documentElement;
    kids(set, "test").forEach((test, i) => {
      const body = kids(test).find((c) => c.localName !== "assert");
      if (!body) return;
      // Re-parse the document on its own so absolute paths (/*/cbc:...) start at it.
      const doc = parseXmlDocument(serializeToWellFormedString(body));
      const raw = runRules(rules[syntax], doc);
      const fired = new Map();
      for (const f of raw) fired.set(f.rule, f.flag);
      for (const a of kids(test, "assert")) {
        for (const e of kids(a)) {
          const id = e.textContent.trim();
          if (!id) continue;
          t.asserts++;
          if (raw.skipped.includes(id)) { t.skipped++; console.log(`SKIPPED ${dir}/${file} #${i + 1} ${id}`); bad++; continue; }
          const got = fired.get(id);
          const ok = e.localName === "success" ? got === undefined
            : e.localName === "error" ? got === "fatal"
            : e.localName === "warning" ? got === "warning"
            : true;
          if (ok) t.agree++;
          else { bad++; console.log(`DIFF ${dir}/${file} #${i + 1} expected ${e.localName} ${id}, got ${got ?? "pass"}`); }
        }
      }
    });
  }
}
for (const [dir, t] of Object.entries(totals)) console.log(`${dir.padEnd(16)} ${t.agree}/${t.asserts} agree${t.skipped ? `, ${t.skipped} skipped` : ""}`);
const sum = Object.values(totals).reduce((a, t) => ({ asserts: a.asserts + t.asserts, agree: a.agree + t.agree }), { asserts: 0, agree: 0 });
console.log(`TOTAL ${sum.agree}/${sum.asserts} asserts agree`);
process.exit(bad ? 1 : 0);
