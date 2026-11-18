// Cross-check the plain BR-FR-CDV set (plain/cdar-fr.json, run by fontoxpath) against
// Saxon-JS running FNFE-MPE's own compiled XSLT, on FNFE's example life-cycle messages
// (CDAR, the "CDV" statuses 200-228 of France's e-invoicing reform) and on copies of each
// with one thing broken. Reports, per file and mutation, any rule id that fires on one
// engine and not the other.
//   node eval/cdar-crosscheck.mjs <France_RFE checkout> <cdar.sef.json>
// Needs `npm i --no-save slimdom fontoxpath saxon-js xslt3` (installed elsewhere, point
// NODE_PATH at that node_modules). Make the SEF file with:
//   npx xslt3 -xsl:<checkout>/FNFE_RFE_INVOICE/CDAR/2xslt/BR-FR-CDV-Schematron-CDAR.xslt -export:cdar.sef.json -nogo -relocate:on
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";
import { cdarGapFindings, readCdar } from "../cdar.mjs";

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
const drop = (re) => (x) => x.replace(re, "");
// The reference-level status (MDT-105) is the first ProcessConditionCode in the message.
const setStatus = (code) => first(/(<ram:ProcessConditionCode>)[^<]+/, `$1${code}`);
// Adds a fragment to the first status detail (MDG-37), making one if the message has none.
const inStatus = (frag) => (x) => /<ram:SpecifiedDocumentStatus>/.test(x)
  ? x.replace(/(<ram:SpecifiedDocumentStatus>\s*(?:<ram:SequenceNumeric>[^<]*<\/ram:SequenceNumeric>)?)/, `$1${frag}`)
  : x.replace(/(<\/ram:ReferenceReferencedDocument>)/, `<ram:SpecifiedDocumentStatus><ram:SequenceNumeric>1</ram:SequenceNumeric>${frag}</ram:SpecifiedDocumentStatus>$1`);
const setReason = (r) => (x) => /<ram:ReasonCode>/.test(x) ? x.replace(/(<ram:ReasonCode>)[^<]+/g, `$1${r}`) : inStatus(`<ram:ReasonCode>${r}</ram:ReasonCode>`)(x);
const b2gSender = first(/(<ram:SenderTradeParty>)/, '$1<ram:GlobalID schemeID="0238">9999</ram:GlobalID>');
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
  // Second round (2026-11-17), aimed at the 26 rule ids the first fourteen never reached.
  // Missing mandatory parts. Several rules put the element itself in the context and test
  // "." so they cannot fire when it is absent; these runs show it on both engines.
  ["no-guideline", drop(/<ram:GuidelineSpecifiedDocumentContextParameter>[\s\S]*?<\/ram:GuidelineSpecifiedDocumentContextParameter>/)],
  ["no-doc-id", drop(/(?<=<rsm:ExchangedDocument>\s*)<ram:ID>[^<]*<\/ram:ID>/)],
  ["no-issue-datetime", drop(/(?<=<rsm:ExchangedDocument>[\s\S]*?)<ram:IssueDateTime>[\s\S]*?<\/ram:IssueDateTime>/)],
  ["no-sender", drop(/<ram:SenderTradeParty>[\s\S]*?<\/ram:SenderTradeParty>/)],
  ["no-sender-role", drop(/(?<=<ram:SenderTradeParty>\s*)<ram:RoleCode>[^<]*<\/ram:RoleCode>/)],
  ["no-invoice-id", drop(/(?<=<ram:ReferenceReferencedDocument>\s*)<ram:IssuerAssignedID>[^<]*<\/ram:IssuerAssignedID>/)],
  ["no-invoice-date", drop(/<ram:FormattedIssueDateTime>[\s\S]*?<\/ram:FormattedIssueDateTime>/)],
  ["no-status", drop(/(?<=<ram:ReferenceReferencedDocument>[\s\S]*?)<ram:ProcessConditionCode>[^<]*<\/ram:ProcessConditionCode>/)],
  ["no-status-seq", drop(/<ram:SequenceNumeric>[^<]*<\/ram:SequenceNumeric>/g)],
  ["no-issuer-global-id", drop(/(?<=<rsm:ExchangedDocument>[\s\S]*?<ram:IssuerTradeParty>\s*)<ram:GlobalID[^>]*>[^<]*<\/ram:GlobalID>/)],
  // Parties and roles.
  ["ack-type-305", first(/(<rsm:AcknowledgementDocument>[\s\S]*?<ram:TypeCode>)\d+/, "$1305")],
  ["issuer-role-xx", first(/(<rsm:ExchangedDocument>[\s\S]*?<ram:IssuerTradeParty>[\s\S]*?<ram:RoleCode>)[^<]+/, "$1XX")],
  ["recipient-role-xx", first(/(<rsm:ExchangedDocument>[\s\S]*?<ram:RecipientTradeParty>[\s\S]*?<ram:RoleCode>)[^<]+/, "$1XX")],
  ["ref-issuer-role-xx", first(/(<ram:ReferenceReferencedDocument>[\s\S]*?<ram:IssuerTradeParty>)/, "$1<ram:RoleCode>XX</ram:RoleCode>")],
  ["ref-recipient-role-xx", first(/(<\/ram:ReferenceReferencedDocument>)/, "<ram:RecipientTradeParty><ram:RoleCode>XX</ram:RoleCode></ram:RecipientTradeParty>$1")],
  ["ref-recipient-role-by", first(/(<\/ram:ReferenceReferencedDocument>)/, "<ram:RecipientTradeParty><ram:RoleCode>BY</ram:RoleCode></ram:RecipientTradeParty>$1")],
  // Status details (MDG-37): inner status, action codes, the 212 amount blocks.
  ["detail-status-999", inStatus("<ram:ProcessConditionCode>999</ram:ProcessConditionCode>")],
  ["action-code-xxx", inStatus("<ram:RequestedActionCode>XXX</ram:RequestedActionCode>")],
  ["action-code-noa", inStatus("<ram:RequestedActionCode>NOA</ram:RequestedActionCode>")],
  ["characteristic-xxx", all(/(<ram:SpecifiedDocumentCharacteristic>\s*<ram:TypeCode>)[^<]+/g, "$1XXX")],
  ["212-no-percent", drop(/<ram:ValuePercent>[^<]*<\/ram:ValuePercent>/g)],
  ["212-men-to-mpa", (x) => (/>212</.test(x) ? x.replace(/(<ram:SpecifiedDocumentCharacteristic>\s*<ram:TypeCode>)MEN/g, "$1MPA") : x)],
  // Reason lists per status: a code outside each list, and one inside it as a control.
  ...["200", "206", "208", "221", "501"].map((code) => [`reason-${code}-bogus`, (x) => setReason("PAS_UN_MOTIF")(setStatus(code)(x))]),
  ["reason-200-ok", (x) => setReason("NON_TRANSMISE")(setStatus("200")(x))],
  ["reason-221-ok", (x) => setReason("ROUTAGE_ERR")(setStatus("221")(x))],
  // B2G refusals: the sender is the PPF (0238 9999), so the B2G list applies instead of the 210 one.
  ["reason-210-b2g-bogus", (x) => setReason("PAS_UN_MOTIF")(setStatus("210")(b2gSender(x)))],
  ["reason-210-b2g-ok", (x) => setReason("RETRAIT_MAN_SERV")(setStatus("210")(b2gSender(x)))],
  ["reason-210-b2b-b2g-code", (x) => setReason("RETRAIT_MAN_SERV")(setStatus("210")(x))],
  // Multi-reference message: a second reference at 501 (Irrecevable) while the first loses
  // its invoice date. BR-FR-CDV-11 tests the 501 exemption with an absolute path, so any
  // reference at 501 lets every other reference go without a date.
  ["multi-ref-501-no-date", (x) => {
    const m = x.match(/<ram:ReferenceReferencedDocument>[\s\S]*?<\/ram:ReferenceReferencedDocument>/);
    if (!m) return x;
    const second = setStatus("501")(m[0]);
    const firstNoDate = m[0].replace(/<ram:FormattedIssueDateTime>[\s\S]*?<\/ram:FormattedIssueDateTime>/, "");
    return x.replace(m[0], firstNoDate + second).replace(/(<ram:MultipleReferencesIndicator>\s*<udt:Indicator>)false/, "$1true");
  }],
];

const root = join(checkout, "FNFE_RFE_INVOICE/Z.example/TEST/CDAR");
const files = readdirSync(root).filter((f) => f.endsWith(".xml")).sort();
const strip = (x) => x.replace(/^\uFEFF/, "");
const plainIds = (xml) => {
  const out = runner.runRules(rules, parseXmlDocument(xml));
  return { ids: new Set(out.map((f) => f.rule)), skipped: out.skipped };
};
const saxonIds = (xml) => {
  const res = SaxonJS.transform({ stylesheetFileName: sef, sourceText: xml, destination: "serialized" });
  return new Set(parseSvrl(res.principalResult).map((f) => f.rule));
};

let runs = 0, agree = 0, fired = 0, skippedTotal = 0;
const byRule = [];
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
    byRule.push({ mutation: name, ids: s });
    const onlyPlain = [...p.ids].filter((id) => !s.has(id));
    const onlySaxon = [...s].filter((id) => !p.ids.has(id));
    perMutation[name] ??= { runs: 0, fired: 0, agree: 0, gapOnly: 0 };
    perMutation[name].runs++;
    // cdar.mjs's own FR-CDV-105..107 on a run where neither engine raised anything.
    if (!s.size && cdarGapFindings(readCdar(xml)).length) perMutation[name].gapOnly++;
    if (s.size) { fired++; perMutation[name].fired++; }
    if (!onlyPlain.length && !onlySaxon.length) { agree++; perMutation[name].agree++; }
    else disagreements.push({ file, mutation: name, onlyPlain, onlySaxon, skipped: p.skipped });
  }
}
console.log(`files: ${files.length}; runs (file x mutation): ${runs}; Saxon reported at least one BR-FR-CDV rule on ${fired}; distinct rule ids Saxon raised: ${idsSeen.size}; same rule ids on both engines: ${agree}/${runs}; plain rules skipped (engine limit): ${skippedTotal}`);
for (const [name, m] of Object.entries(perMutation)) console.log(`  ${name.padEnd(22)} runs ${String(m.runs).padStart(3)}  fired ${String(m.fired).padStart(3)}  agree ${m.agree}/${m.runs}${m.gapOnly ? `  caught only by FR-CDV-105..107 ${m.gapOnly}` : ""}`);
console.log(`rule ids raised: ${[...idsSeen].sort().join(" ")}`);
const allIds = rules.patterns.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.id)));
const perRule = {};
for (const d of byRule) for (const id of d.ids) (perRule[id] ??= new Set()).add(d.mutation);
console.log(`plain rule ids: ${allIds.length}; raised by Saxon on some run: ${allIds.filter((id) => idsSeen.has(id)).length}`);
for (const id of allIds) console.log(`  ${idsSeen.has(id) ? "hit " : "MISS"} ${id.padEnd(32)} ${[...(perRule[id] ?? [])].join(" ")}`);
for (const d of disagreements) console.log(`DIFF ${d.file} [${d.mutation}] only plain: ${d.onlyPlain.join(" ") || "-"}; only Saxon: ${d.onlySaxon.join(" ") || "-"}${d.skipped.length ? `; skipped: ${d.skipped.join(" ")}` : ""}`);
