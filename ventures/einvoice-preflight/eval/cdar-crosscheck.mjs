// Cross-check the plain BR-FR-CDV set (plain/cdar-fr.json, run by fontoxpath) against
// Saxon-JS running FNFE-MPE's own compiled XSLT, on FNFE's example life-cycle messages
// (CDAR, the "CDV" statuses 200-228 of France's e-invoicing reform) and on copies of each
// with one thing broken. Reports, per file and mutation, any rule id that fires on one
// engine and not the other.
//   node eval/cdar-crosscheck.mjs <France_RFE checkout> <cdar.sef.json>
// Needs `npm i --no-save slimdom fontoxpath saxon-js xslt3`. Make the SEF file with:
//   npx xslt3 -xsl:<checkout>/FNFE_RFE_INVOICE/CDAR/2xslt/BR-FR-CDV-Schematron-CDAR.xslt -export:cdar.sef.json -nogo -relocate:on
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";

const [checkout, sef] = process.argv.slice(2);
if (!sef) throw new Error("usage: node eval/cdar-crosscheck.mjs <France_RFE checkout> <cdar.sef.json>");
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const { parseXmlDocument } = require("slimdom");
const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
const rules = JSON.parse(readFileSync(new URL("../plain/cdar-fr.json", import.meta.url)));

const first = (re, f) => (x) => x.replace(re, f);
const all = (re, f) => (x) => x.replace(re, f);
const REF = /(<ram:ReferenceReferencedDocument>[\s\S]*?)/;
export const MUTATIONS = [
  ["status-999", all(/(<ram:ProcessConditionCode>)\d+/g, "$1999")],
  ["status-213-no-reason", (x) => (/<ram:ReasonCode>/.test(x) ? x : x.replace(/(<ram:ReferenceReferencedDocument>[\s\S]*?<ram:ProcessConditionCode>)\d+/, "$1213"))],
  ["reason-bogus", all(/(<ram:ReasonCode>)[^<]+/g, "$1PAS_UN_MOTIF")],
  ["sender-role-xx", first(/(<ram:SenderTradeParty>\s*<ram:RoleCode>)[^<]+/, "$1XX")],
  ["profile-en16931", first(/(<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]+/, "$1urn:cen.eu:en16931:2017")],
  ["process-other", first(/(<ram:BusinessProcessSpecifiedDocumentContextParameter>\s*<ram:ID>)[^<]+/, "$1OTHER")],
  ["doc-id-space", first(/(<rsm:ExchangedDocument>\s*<ram:ID>)([^<]+)/, "$1$2 X")],
  ["issue-feb-30", first(/(<rsm:ExchangedDocument>[\s\S]*?<udt:DateTimeString format="204">)\d{8}/, "$120250230")],
  ["object-type-999", first(new RegExp(REF.source + /(<ram:TypeCode>)\d+/.source), "$1$2999")],
  ["ack-type-999", first(/(<rsm:AcknowledgementDocument>[\s\S]*?<ram:TypeCode>)\d+/, "$1999")],
  ["status-code-99", all(/(<ram:StatusCode>)[^<]+/g, "$199")],
  ["bt1-space", first(/(<ram:IssuerAssignedID>)([^<]+)/, "$1$2 .1")],
  ["no-recipient-uri", all(/<ram:URIUniversalCommunication>[\s\S]*?<\/ram:URIUniversalCommunication>/g, "")],
  ["no-issuer-siren", first(new RegExp(REF.source + /(<ram:IssuerTradeParty>\s*)<ram:GlobalID[^>]*>[^<]*<\/ram:GlobalID>/.source), "$1$2")],
];

const root = join(checkout, "FNFE_RFE_INVOICE/Z.example/TEST/CDAR");
const files = readdirSync(root).filter((f) => f.endsWith(".xml")).sort();
const strip = (x) => x.replace(/^﻿/, "");
const plainIds = (xml) => {
  const out = runner.runRules(rules, parseXmlDocument(xml));
  return { ids: new Set(out.map((f) => f.rule)), skipped: out.skipped };
};
const saxonIds = (xml) => {
  const res = SaxonJS.transform({ stylesheetFileName: sef, sourceText: xml, destination: "serialized" });
  return new Set(parseSvrl(res.principalResult).map((f) => f.rule));
};

let runs = 0, agree = 0, fired = 0, skippedTotal = 0;
const disagreements = [];
const perMutation = {};
const idsSeen = new Set();
for (const file of files) {
  const base = strip(readFileSync(join(root, file), "utf8"));
  const cases = [["original", base], ...MUTATIONS.map(([name, f]) => [name, f(base)]).filter(([, x]) => x !== base)];
  for (const [name, xml] of cases) {
    const p = plainIds(xml);
    const s = saxonIds(xml);
    runs++;
    skippedTotal += p.skipped.length;
    s.forEach((id) => idsSeen.add(id));
    const onlyPlain = [...p.ids].filter((id) => !s.has(id));
    const onlySaxon = [...s].filter((id) => !p.ids.has(id));
    perMutation[name] ??= { runs: 0, fired: 0, agree: 0 };
    perMutation[name].runs++;
    if (s.size) { fired++; perMutation[name].fired++; }
    if (!onlyPlain.length && !onlySaxon.length) { agree++; perMutation[name].agree++; }
    else disagreements.push({ file, mutation: name, onlyPlain, onlySaxon, skipped: p.skipped });
  }
}
console.log(`files: ${files.length}; runs (file x mutation): ${runs}; Saxon reported at least one BR-FR-CDV rule on ${fired}; distinct rule ids Saxon raised: ${idsSeen.size}; same rule ids on both engines: ${agree}/${runs}; plain rules skipped (engine limit): ${skippedTotal}`);
for (const [name, m] of Object.entries(perMutation)) console.log(`  ${name.padEnd(22)} runs ${String(m.runs).padStart(3)}  fired ${String(m.fired).padStart(3)}  agree ${m.agree}/${m.runs}`);
console.log(`rule ids raised: ${[...idsSeen].sort().join(" ")}`);
for (const d of disagreements) console.log(`DIFF ${d.file} [${d.mutation}] only plain: ${d.onlyPlain.join(" ") || "-"}; only Saxon: ${d.onlySaxon.join(" ") || "-"}${d.skipped.length ? `; skipped: ${d.skipped.join(" ")}` : ""}`);
