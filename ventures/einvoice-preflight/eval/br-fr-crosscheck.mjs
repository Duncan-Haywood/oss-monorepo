// Cross-check the plain BR-FR sets (plain/cius-fr-*.json, run by fontoxpath) against
// Saxon-JS running FNFE-MPE's own compiled XSLT, on FNFE's example invoices and on
// copies of each with one thing broken. Reports, per file and mutation, any rule id that
// fires on one engine and not the other.
//   node eval/br-fr-crosscheck.mjs <France_RFE checkout> <ubl.sef.json> <cii.sef.json>
// Needs `npm i --no-save slimdom fontoxpath saxon-js` (saxon-js resolvable from here or
// NODE_PATH). Make the SEF files from FNFE's XSLT with xslt3:
//   npx xslt3 -xsl:<checkout>/FNFE_RFE_INVOICE/UBL/EN16931/2xslt/BR-FR-Flux2-Schematron-UBL.xslt -export:ubl.sef.json -nogo -relocate:on
//   (and CII/EN16931/2xslt/BR-FR-Flux2-Schematron-CII.xslt for cii.sef.json)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";

const [checkout, ublSef, ciiSef] = process.argv.slice(2);
if (!ciiSef) throw new Error("usage: node eval/br-fr-crosscheck.mjs <France_RFE checkout> <ubl.sef.json> <cii.sef.json>");
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const { parseXmlDocument } = require("slimdom");
const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
const rules = { ubl: JSON.parse(readFileSync(new URL("../plain/cius-fr-ubl.json", import.meta.url))), cii: JSON.parse(readFileSync(new URL("../plain/cius-fr-cii.json", import.meta.url))) };
const sef = { ubl: ublSef, cii: ciiSef };

// Each mutation: [name, ubl rewrite, cii rewrite]. A rewrite that changes nothing is skipped.
const first = (re, f) => (x) => x.replace(re, f);
const MUTATIONS = [
  ["bt1-space", first(/(<cbc:ID>)([^<]+)(<\/cbc:ID>)/, "$1$2 X.1$3"), first(/(<rsm:ExchangedDocument>\s*<ram:ID>)([^<]+)/, "$1$2 X.1")],
  ["bt1-36-chars", first(/(<cbc:ID>)([^<]+)(<\/cbc:ID>)/, "$1ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$3"), first(/(<rsm:ExchangedDocument>\s*<ram:ID>)([^<]+)/, "$1ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")],
  ["bt23-peppol", first(/(<cbc:ProfileID>)[^<]+/, "$1urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"), first(/(<ram:BusinessProcessSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]+/, "$1urn:fdc:peppol.eu:2017:poacc:billing:01:1.0")],
  ["bt2-feb-30", first(/(<cbc:IssueDate>)[^<]+/, "$12026-02-30"), first(/(<ram:IssueDateTime>\s*<udt:DateTimeString format="102">)[^<]+/, "$120260230")],
  ["bt3-999", first(/(<cbc:(?:InvoiceTypeCode|CreditNoteTypeCode)>)[^<]+/, "$1999"), first(/(<rsm:ExchangedDocument>[\s\S]*?<ram:TypeCode>)[^<]+/, "$1999")],
  ["no-notes", (x) => x.replace(/<cbc:Note>[^<]*<\/cbc:Note>/g, ""), (x) => x.replace(/<ram:IncludedNote>[\s\S]*?<\/ram:IncludedNote>/g, "")],
  ["vat-21", (x) => x.replace(/(<cbc:Percent>)[\d.]+/g, "$121.00"), (x) => x.replace(/(<ram:RateApplicablePercent>)[\d.]+/g, "$121.00")],
  ["siren-scheme-0088", (x) => x.replace(/schemeID="0002"/g, 'schemeID="0088"'), (x) => x.replace(/schemeID="0002"/g, 'schemeID="0088"')],
  ["line-net-plus-10", first(/(<cac:(?:InvoiceLine|CreditNoteLine)>[\s\S]*?<cbc:LineExtensionAmount currencyID="\w+">)([\d.]+)/, (m, a, n) => a + (Number(n) + 10).toFixed(2)), first(/(<ram:SpecifiedLineTradeSettlement>[\s\S]*?<ram:LineTotalAmount>)([\d.]+)/, (m, a, n) => a + (Number(n) + 10).toFixed(2))],
  ["no-status-code", (x) => x.replace(/<cbc:DocumentStatusCode>[^<]*<\/cbc:DocumentStatusCode>/g, ""), (x) => x.replace(/<ram:LineStatusCode>[^<]*<\/ram:LineStatusCode>/g, "")],
];

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const root = join(checkout, "FNFE_RFE_INVOICE/Z.example/TEST");
const files = walk(root).filter((f) => f.endsWith(".xml") && !f.includes("/CDAR/") && !f.includes("/FX/"));

const plainIds = (xml, syntax) => {
  const out = runner.runRules(rules[syntax], parseXmlDocument(xml));
  return { ids: new Set(out.map((f) => f.rule)), skipped: out.skipped };
};
const saxonIds = (xml, syntax) => {
  const res = SaxonJS.transform({ stylesheetFileName: sef[syntax], sourceText: xml, destination: "serialized" });
  return new Set(parseSvrl(res.principalResult).map((f) => f.rule));
};

let runs = 0, agree = 0, fired = 0, skippedTotal = 0;
const disagreements = [];
const perMutation = {};
for (const file of files) {
  const base = readFileSync(file, "utf8");
  const syntax = /CrossIndustryInvoice/.test(base.slice(0, 3000)) ? "cii" : "ubl";
  const cases = [["original", base], ...MUTATIONS.map(([name, u, c]) => [name, (syntax === "ubl" ? u : c)(base)]).filter(([, x]) => x !== base)];
  for (const [name, xml] of cases) {
    const p = plainIds(xml, syntax);
    const s = saxonIds(xml, syntax);
    runs++;
    skippedTotal += p.skipped.length;
    const onlyPlain = [...p.ids].filter((id) => !s.has(id));
    const onlySaxon = [...s].filter((id) => !p.ids.has(id));
    perMutation[name] ??= { runs: 0, fired: 0, agree: 0 };
    perMutation[name].runs++;
    if (s.size) { fired++; perMutation[name].fired++; }
    if (!onlyPlain.length && !onlySaxon.length) { agree++; perMutation[name].agree++; }
    else disagreements.push({ file: file.slice(root.length + 1), mutation: name, onlyPlain, onlySaxon, skipped: p.skipped });
  }
}
console.log(`files: ${files.length}; runs (file x mutation): ${runs}; Saxon reported at least one BR-FR rule on ${fired}; same rule ids on both engines: ${agree}/${runs}; plain rules skipped (engine limit): ${skippedTotal}`);
for (const [name, m] of Object.entries(perMutation)) console.log(`  ${name.padEnd(18)} runs ${String(m.runs).padStart(3)}  fired ${String(m.fired).padStart(3)}  agree ${m.agree}/${m.runs}`);
for (const d of disagreements) console.log(`DIFF ${d.file} [${d.mutation}] only plain: ${d.onlyPlain.join(" ") || "-"}; only Saxon: ${d.onlySaxon.join(" ") || "-"}${d.skipped.length ? `; skipped: ${d.skipped.join(" ")}` : ""}`);
