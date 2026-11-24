// node build-peppol-readiness-page.mjs
// Writes the "What changes in 3.1.0" table into peppol-bis-3-1-0-readiness.html from the
// compiled rule sets in ./plain/ (3.0.22: peppol-ubl/cii.json; 3.1.0: peppol-next-*.json),
// so the page lists exactly what the checker runs. Rerun after build-plain-rules.mjs;
// peppol-readiness.test.mjs fails when the page and the rules disagree.
import { readFileSync, writeFileSync } from "node:fs";
import { ruleChanges } from "./peppol-readiness.mjs";

const here = new URL("./", import.meta.url);
const PAGE = new URL("peppol-bis-3-1-0-readiness.html", here);
const load = (f) => JSON.parse(readFileSync(new URL(`plain/${f}`, here), "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function changesTable() {
  const rows = new Map();
  for (const syntax of ["ubl", "cii"]) {
    for (const c of ruleChanges(load(`peppol-${syntax}.json`), load(`peppol-next-${syntax}.json`))) {
      const key = `${c.id}|${c.change}`;
      const row = rows.get(key) || { ...c, syntaxes: [] };
      row.syntaxes.push(syntax.toUpperCase());
      rows.set(key, row);
    }
  }
  const body = [...rows.values()].map((r) => `<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.syntaxes.join(", "))}</td><td>${esc(r.change)}</td><td class="${r.flag === "fatal" ? "fatal" : "warning"}">${esc(r.flag)}</td><td>${esc(r.text)}</td></tr>`);
  return `<table><thead><tr><th>Rule</th><th>Syntax</th><th>Change</th><th>Severity in 3.1.0</th><th>Rule text (3.1.0)</th></tr></thead><tbody>\n${body.join("\n")}\n</tbody></table>`;
}

export function renderPage(html = readFileSync(PAGE, "utf8")) {
  return html.replace(/<!-- changes:start -->[\s\S]*<!-- changes:end -->/, `<!-- changes:start -->\n${changesTable()}\n<!-- changes:end -->`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(PAGE, renderPage());
  console.log(`Wrote the 3.1.0 change table to ${PAGE.pathname}`);
}
