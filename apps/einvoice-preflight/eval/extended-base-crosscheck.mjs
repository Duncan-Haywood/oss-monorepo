// Cross-check the extended base sets (plain/extended-ctc-fr-ubl.json, extended-ctc-fr-cii.json,
// facturx-extended-cii.json, run by fontoxpath) against Saxon-JS running FNFE-MPE's own
// compiled XSLT, on FNFE's extended example invoices and on copies of each with one thing
// broken. Reports, per file and mutation, any rule id that fires on one engine and not the other.
//   node eval/extended-base-crosscheck.mjs <France_RFE checkout> <sef dir>
// Needs `npm i --no-save slimdom fontoxpath saxon-js xslt3`. Make the SEF files with xslt3 into
// <sef dir> and copy FACTUR-X_EXTENDED_codedb.xml beside them (the Factur-X stylesheet opens it):
//   npx xslt3 -xsl:<checkout>/FNFE_RFE_INVOICE/UBL/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-UBL.xslt -export:<sef dir>/ext-ubl.sef.json -nogo -relocate:on
//   (CII/EXTENDED-CTC-FR/2xslt/EXTENDED-CTC-FR-CII.xslt -> ext-cii.sef.json,
//    Factur-X/EXTENDED/2xslt/FACTUR-X_EXTENDED.xslt -> fx-ext.sef.json)
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";

const [checkout, sefDir] = process.argv.slice(2);
if (!sefDir) throw new Error("usage: node eval/extended-base-crosscheck.mjs <France_RFE checkout> <sef dir>");
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const { parseXmlDocument } = require("slimdom");
const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
const plain = (f) => JSON.parse(readFileSync(new URL(`../plain/${f}`, import.meta.url)));
const root = join(checkout, "FNFE_RFE_INVOICE/Z.example/TEST");
const GROUPS = [
  { dir: "UBL/EXTENDED-CTC-FR", syntax: "ubl", rules: plain("extended-ctc-fr-ubl.json"), sef: join(sefDir, "ext-ubl.sef.json") },
  { dir: "CII/EXTENDED-CTC-FR", syntax: "cii", rules: plain("extended-ctc-fr-cii.json"), sef: join(sefDir, "ext-cii.sef.json") },
  { dir: "FX/EXTENDED", syntax: "cii", rules: plain("facturx-extended-cii.json"), sef: join(sefDir, "fx-ext.sef.json") },
];

// Each mutation: [name, ubl rewrite, cii rewrite]. A rewrite that changes nothing is skipped.
const first = (re, f) => (x) => x.replace(re, f);
const all = (re, f) => (x) => x.replace(re, f);
const MUTATIONS = [
  ["type-999", first(/(<cbc:(?:InvoiceTypeCode|CreditNoteTypeCode)>)[^<]+/, "$1999"), first(/(<rsm:ExchangedDocument>[\s\S]*?<ram:TypeCode>)[^<]+/, "$1999")],
  ["currency-XXQ", first(/(<cbc:DocumentCurrencyCode>)[^<]+/, "$1XXQ"), first(/(<ram:InvoiceCurrencyCode>)[^<]+/, "$1XXQ")],
  ["unit-ZZQ", first(/(unitCode=")[^"]+/, "$1ZZQ"), first(/(<ram:BilledQuantity unitCode=")[^"]+/, "$1ZZQ")],
  ["country-QQ", first(/(<cbc:IdentificationCode>)[^<]+/, "$1QQ"), first(/(<ram:CountryID>)[^<]+/, "$1QQ")],
  ["vat-category-Q", all(/(<cac:ClassifiedTaxCategory>\s*<cbc:ID>)[^<]+/g, "$1Q"), all(/(<ram:SpecifiedLineTradeSettlement>\s*<ram:ApplicableTradeTax>[\s\S]*?<ram:CategoryCode>)[^<]+/g, "$1Q")],
  ["line-net-plus-10", first(/(<cac:(?:InvoiceLine|CreditNoteLine)>[\s\S]*?<cbc:LineExtensionAmount currencyID="\w+">)([\d.]+)/, (m, a, n) => a + (Number(n) + 10).toFixed(2)), first(/(<ram:SpecifiedLineTradeSettlement>[\s\S]*?<ram:LineTotalAmount>)([\d.]+)/, (m, a, n) => a + (Number(n) + 10).toFixed(2))],
  ["tax-total-plus-1", first(/(<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="\w+">)([\d.]+)/, (m, a, n) => a + (Number(n) + 1).toFixed(2)), first(/(<ram:TaxTotalAmount currencyID="\w+">)([\d.]+)/, (m, a, n) => a + (Number(n) + 1).toFixed(2))],
  ["no-seller-name", first(/(<cac:AccountingSupplierParty>[\s\S]*?)<cbc:RegistrationName>[^<]*<\/cbc:RegistrationName>/, "$1"), first(/(<ram:SellerTradeParty>[\s\S]*?)<ram:Name>[^<]*<\/ram:Name>/, "$1")],
  ["issue-feb-30", first(/(<cbc:IssueDate>)[^<]+/, "$12026-02-30"), first(/(<ram:IssueDateTime>\s*<udt:DateTimeString format="102">)[^<]+/, "$120260230")],
  ["payment-means-QQ", first(/(<cbc:PaymentMeansCode>)[^<]+/, "$1QQ"), first(/(<ram:SpecifiedTradeSettlementPaymentMeans>\s*<ram:TypeCode>)[^<]+/, "$1QQ")],
  ["empty-note", first(/(<cbc:Note>)[^<]*(<\/cbc:Note>)/, "$1$2"), first(/(<ram:IncludedNote>\s*<ram:Content>)[^<]*(<\/ram:Content>)/, "$1$2")],
];

let runs = 0, agree = 0, fired = 0, skippedTotal = 0;
const disagreements = [];
const perMutation = {};
const idsRaised = new Set();
let fileCount = 0;
for (const g of GROUPS) {
  const dir = join(root, g.dir);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    fileCount++;
    const base = readFileSync(join(dir, f), "utf8");
    const cases = [["original", base], ...MUTATIONS.map(([name, u, c]) => [name, (g.syntax === "ubl" ? u : c)(base)]).filter(([, x]) => x !== base)];
    for (const [name, xml] of cases) {
      const out = runner.runRules(g.rules, parseXmlDocument(xml));
      const p = new Set(out.map((x) => x.rule));
      const res = SaxonJS.transform({ stylesheetFileName: g.sef, sourceText: xml, destination: "serialized" });
      const s = new Set(parseSvrl(res.principalResult).map((x) => x.rule));
      runs++;
      skippedTotal += out.skipped.length;
      for (const id of s) idsRaised.add(id);
      const onlyPlain = [...p].filter((id) => !s.has(id));
      const onlySaxon = [...s].filter((id) => !p.has(id));
      const key = `${g.dir.split("/")[0]} ${name}`;
      perMutation[key] ??= { runs: 0, fired: 0, agree: 0 };
      perMutation[key].runs++;
      if (s.size) { fired++; perMutation[key].fired++; }
      if (!onlyPlain.length && !onlySaxon.length) { agree++; perMutation[key].agree++; }
      else disagreements.push({ file: `${g.dir}/${f}`, mutation: name, onlyPlain, onlySaxon, skipped: out.skipped });
    }
  }
}
console.log(`files: ${fileCount}; runs (file x mutation): ${runs}; Saxon reported at least one rule on ${fired}; distinct rule ids Saxon raised: ${idsRaised.size}; same rule ids on both engines: ${agree}/${runs}; plain rules skipped (engine limit): ${skippedTotal}`);
for (const [name, m] of Object.entries(perMutation)) console.log(`  ${name.padEnd(24)} runs ${String(m.runs).padStart(3)}  fired ${String(m.fired).padStart(3)}  agree ${m.agree}/${m.runs}`);
for (const d of disagreements) console.log(`DIFF ${d.file} [${d.mutation}] only plain: ${d.onlyPlain.join(" ") || "-"}; only Saxon: ${d.onlySaxon.join(" ") || "-"}${d.skipped.length ? `; skipped: ${d.skipped.join(" ")}` : ""}`);
console.log(`rule ids raised: ${[...idsRaised].sort().join(" ")}`);
