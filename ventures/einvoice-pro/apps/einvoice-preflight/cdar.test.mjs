// France's CDAR life-cycle status messages (cdar.mjs, plain/cdar-fr.json from FNFE-MPE's
// BR-FR-CDV Schematron 1.4.0.04) on FNFE's own example messages (fixtures/fr-fnfe/cdar/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { detectSyntax, plainOnlySets } from "./schematron-core.mjs";
import { cdarFindings, cdarGapFindings, cdarJourneys, looksLikeCdar, readCdar, statusName } from "./cdar.mjs";
import { preflightDocuments } from "./report.mjs";

const require = createRequire(import.meta.url);
let ready = existsSync(new URL("./plain/cdar-fr.json", import.meta.url));
try { require.resolve("slimdom"); require.resolve("fontoxpath"); } catch { ready = false; }
const skip = !ready && "needs `npm i --no-save slimdom fontoxpath` and plain/cdar-fr.json";

const dir = new URL("./fixtures/fr-fnfe/cdar/", import.meta.url);
const NAMES = readdirSync(dir).filter((f) => f.endsWith(".xml")).sort();
const msgFile = (name) => readFileSync(new URL(name, dir), "utf8");
const invoice = () => readFileSync(new URL("./fixtures/fr-fnfe/uc1-en16931-ubl.xml", import.meta.url), "utf8");
const REJ = "UC2_F202500004_02-CDV-213_Rejetee.xml";
const APPROVED = "UC1_F202500003_05-CDV-205_Approuvee.xml";

test("a CDAR is recognised (BOM and all) and routed to its own plain set, never the EN 16931 base", () => {
  for (const name of NAMES) {
    const x = msgFile(name);
    assert.ok(looksLikeCdar(x), name);
    assert.equal(detectSyntax(x), "cdar");
    assert.deepEqual(plainOnlySets(x, "cdar"), ["cdar-fr"]);
  }
  assert.equal(looksLikeCdar(invoice()), false);
  assert.equal(detectSyntax(invoice()), "ubl");
});

test("reader: status, reason, invoice reference and parties of FNFE's 213 Rejetée example", () => {
  const m = readCdar(msgFile(REJ));
  assert.equal(m.profile, "urn.cpro.gouv.fr:1p0:CDV:invoice");
  assert.equal(m.refs.length, 1);
  assert.deepEqual({ ...m.refs[0], reasons: m.refs[0].reasons.map((r) => r.code) }, {
    invoiceId: "F202500004", typeCode: "380", invoiceDate: "2025-07-01", receivedAt: "2025-07-01 16:10:00",
    status: "213", statusText: "Rejetée", sellerSiren: "100000009", sellerScheme: "0002", reasons: ["DOUBLON"],
  });
  assert.deepEqual(m.recipients.map((r) => r.role), ["SE", "BY", "DFH"]);
  assert.match(statusName("213"), /Rejetée/);
  assert.match(statusName("206"), /both ways round/);
  assert.match(statusName("999"), /not in FNFE-MPE's list/);
});

test("paired with its invoice: type, date and seller SIREN compared (FR-CDV-101..103)", () => {
  const m = readCdar(msgFile(APPROVED));
  const parse = async (xml) => (await import("./report.mjs")).inspectInvoiceSource("inv.xml", xml);
  return (async () => {
    const good = (await parse(invoice())).invoice;
    let r = cdarFindings(m, [{ name: "inv.xml", invoice: good }]);
    assert.deepEqual(r.pairs.map((p) => p.name), ["inv.xml"]);
    assert.deepEqual(r.findings.map((f) => f.rule), ["FR-CDV-100"]);
    const bad = (await parse(invoice().replace("<cbc:IssueDate>2025-07-01", "<cbc:IssueDate>2025-07-02").replace("<cbc:InvoiceTypeCode>380", "<cbc:InvoiceTypeCode>389").replaceAll('schemeID="0002">100000009', 'schemeID="0002">100000017'))).invoice;
    r = cdarFindings(m, [{ name: "inv.xml", invoice: bad }]);
    assert.deepEqual(r.findings.map((f) => f.rule).sort(), ["FR-CDV-100", "FR-CDV-101", "FR-CDV-102", "FR-CDV-103"]);
    // another invoice number: not paired, nothing compared
    r = cdarFindings(readCdar(msgFile(REJ)), [{ name: "inv.xml", invoice: good }]);
    assert.deepEqual(r.pairs, []);
  })();
});

test("gaps in the official set (FR-CDV-105..107): FNFE's examples raise none, broken copies do", () => {
  for (const name of NAMES) assert.deepEqual(cdarGapFindings(readCdar(msgFile(name))).map((f) => f.rule), [], name);
  const gaps = (xml) => cdarGapFindings(readCdar(xml)).map((f) => f.rule);
  const ok = msgFile(APPROVED);
  // no creation date-time (BR-FR-CDV-04 cannot fire), or 30 February in it
  assert.deepEqual(gaps(ok.replace(/(<rsm:ExchangedDocument>[\s\S]*?)<ram:IssueDateTime>[\s\S]*?<\/ram:IssueDateTime>/, "$1")), ["FR-CDV-105"]);
  assert.deepEqual(gaps(ok.replace(/(<rsm:ExchangedDocument>[\s\S]*?format="204">)\d{8}/, "$120250230")), ["FR-CDV-105"]);
  // no invoice number (BR-FR-CDV-10 cannot fire)
  assert.deepEqual(gaps(ok.replace(/<ram:IssuerAssignedID>[^<]*<\/ram:IssuerAssignedID>/, "")), ["FR-CDV-106"]);
  // two references, the second 501: the first may then drop its invoice date under BR-FR-CDV-11
  const ref = ok.match(/<ram:ReferenceReferencedDocument>[\s\S]*?<\/ram:ReferenceReferencedDocument>/)[0];
  const multi = ok.replace(ref, ref.replace(/<ram:FormattedIssueDateTime>[\s\S]*?<\/ram:FormattedIssueDateTime>/, "") + ref.replace(/(<ram:ProcessConditionCode>)\d+/, "$1501"));
  assert.deepEqual(gaps(multi), ["FR-CDV-107"]);
  // without a 501 elsewhere a missing date is BR-FR-CDV-11's to report, not ours
  assert.deepEqual(gaps(ok.replace(/<ram:FormattedIssueDateTime>[\s\S]*?<\/ram:FormattedIssueDateTime>/, "")), []);
});

test("journey: the batch's statuses for one invoice in time order", () => {
  const msgs = NAMES.map((file) => ({ file, msg: readCdar(msgFile(file)) }));
  const j = cdarJourneys(msgs).find((x) => x.invoiceId === "F202500003");
  assert.deepEqual(j.steps.map((s) => s.status), ["200", "205", "212"]);
});

test("preflight batch: each CDAR reported with its status, the invoice paired, no read errors", async () => {
  const inputs = [...NAMES.map((name) => ({ name, source: msgFile(name) })), { name: "uc1.xml", source: invoice() }];
  const r = await preflightDocuments(inputs);
  assert.deepEqual(r.readErrors, []);
  const approved = r.reports.find((x) => x.file === APPROVED);
  assert.match(approved.envelope, /205 Approuvée/);
  assert.deepEqual(approved.cdar.pairedWith, ["uc1.xml"]);
  assert.ok(approved.errors.some((f) => f.rule === "FR-CDV-104"));
  assert.ok(!approved.errors.some((f) => f.severity === "error"));
  const rej = r.reports.find((x) => x.file === REJ);
  assert.deepEqual(rej.cdar.refs, [{ invoiceId: "F202500004", status: "213", reasons: ["DOUBLON"] }]);
});

test("FNFE's examples pass every BR-FR-CDV rule; broken copies fail the rule FNFE's XSLT names", { skip }, async () => {
  const { runPlain } = await import("./plain-node.mjs");
  for (const name of NAMES) {
    const r = await runPlain(msgFile(name));
    assert.equal(r.status, "ok", name);
    assert.deepEqual(r.sets, ["cdar-fr"]);
    assert.deepEqual(r.findings.map((f) => f.rule), [], name);
    assert.deepEqual(r.skipped, [], name);
  }
  const ids = async (xml) => (await runPlain(xml)).findings.map((f) => f.rule);
  const rej = msgFile(REJ);
  // Expected ids from Saxon-JS on FNFE's compiled XSLT (eval/cdar-crosscheck.mjs).
  assert.ok((await ids(rej.replace("<ram:ReasonCode>DOUBLON", "<ram:ReasonCode>PAS_UN_MOTIF"))).includes("BR-FR-CDV-CL-09_MDT-113"));
  assert.ok((await ids(rej.replace("<ram:ProcessConditionCode>213", "<ram:ProcessConditionCode>999"))).includes("BR-FR-CDV-CL-06_MDT-105"));
  const ok = msgFile(APPROVED);
  assert.ok((await ids(ok.replace("<ram:ProcessConditionCode>205", "<ram:ProcessConditionCode>213"))).includes("BR-FR-CDV-15_MDT-113"), "213 without a reason");
  assert.ok((await ids(ok.replace("urn.cpro.gouv.fr:1p0:CDV:invoice", "urn:cen.eu:en16931:2017"))).includes("BR-FR-CDV-02_MDT-3"));
  // Second round (eval/cdar-crosscheck-2026-11-17.md): ids Saxon raised on the same copies.
  assert.ok((await ids(ok.replace("<ram:ProcessConditionCode>205", "<ram:ProcessConditionCode>221").replace("</ram:ReferenceReferencedDocument>", "<ram:SpecifiedDocumentStatus><ram:SequenceNumeric>1</ram:SequenceNumeric><ram:ReasonCode>PAS_UN_MOTIF</ram:ReasonCode></ram:SpecifiedDocumentStatus></ram:ReferenceReferencedDocument>"))).includes("BR-FR-CDV-CL-09_MDT-113_221"));
  assert.ok((await ids(ok.replace("</ram:ReferenceReferencedDocument>", "<ram:SpecifiedDocumentStatus><ram:SequenceNumeric>1</ram:SequenceNumeric><ram:RequestedActionCode>XXX</ram:RequestedActionCode></ram:SpecifiedDocumentStatus></ram:ReferenceReferencedDocument>"))).includes("BR-FR-CDV-CL-10_MDT-121"));
  assert.ok((await ids(ok.replace(/<ram:FormattedIssueDateTime>[\s\S]*?<\/ram:FormattedIssueDateTime>/, ""))).includes("BR-FR-CDV-11_MDG-35"));
  // Dead rules: no BR-FR-CDV id on a message missing its invoice number or creation date-time.
  assert.deepEqual(await ids(ok.replace(/<ram:IssuerAssignedID>[^<]*<\/ram:IssuerAssignedID>/, "")), []);
  assert.deepEqual(await ids(ok.replace(/(<rsm:ExchangedDocument>[\s\S]*?)<ram:IssueDateTime>[\s\S]*?<\/ram:IssueDateTime>/, "$1")), []);
});

test("preflight with official rules: a reasonless 213 is caught by BR-FR-CDV on the plain route", { skip }, async () => {
  const bad = msgFile(APPROVED).replace("<ram:ProcessConditionCode>205", "<ram:ProcessConditionCode>213");
  const r = await preflightDocuments([{ name: "s.xml", source: bad }], { schematron: true });
  assert.equal(r.reports[0].schematron, "ok");
  assert.ok(r.reports[0].errors.some((f) => f.rule === "BR-FR-CDV-15_MDT-113" && f.source === "cdar-fr-schematron"));
});
