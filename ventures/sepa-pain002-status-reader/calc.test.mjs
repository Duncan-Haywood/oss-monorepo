import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readReport, resubmissionCsv, findingsCsv, parseXml, formatScaled, parseDecimal, maskIban, STATUS, REASONS, CATEGORY,
  sampleRejectedReport, sampleAcceptedReport, sampleFileRejectedReport, decodeBufferInfo,
} from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);

test("amounts are exact decimals", () => {
  assert.equal(formatScaled(parseDecimal("0.10") + parseDecimal("0.20")), "0.30");
  assert.equal(parseDecimal("1,5"), null);
  assert.equal(maskIban("DE89370400440532013000"), "DE89**************3000");
});

test("a partly rejected report is read per payment with reason, action and rejected total", () => {
  const r = readReport(sampleRejectedReport());
  assert.equal(r.summary.version, "pain.002.001.03");
  assert.equal(r.summary.groupStatus, "PART");
  assert.equal(r.summary.originalMsgId, "MSG-2026-0001");
  assert.equal(r.summary.txs.length, 5);
  assert.equal(r.summary.rejectedCount, 3);
  assert.equal(r.summary.acceptedCount, 2);
  assert.equal(formatScaled(r.summary.rejectedTotal), "5850.00");
  assert.deepEqual(r.summary.counts, { ACCP: 1, RJCT: 3, ACSP: 1 });
  const ac04 = r.findings.find((f) => f.title.includes("INV-1002"));
  assert.match(ac04.title, /AC04 Closed account number \(2300.00 EUR\)/);
  assert.match(ac04.fix, /new account details/);
  assert.match(ac04.cause, /Account closed 2026-09-30/);
});

test("an unknown reason code is reported as unknown, not guessed at", () => {
  const r = readReport(sampleRejectedReport());
  assert.ok(codes(r).includes("REASON-UNKNOWN"));
  const t = r.summary.txs.find((x) => x.e2e === "INV-1004");
  assert.equal(t.reasons[0].known, false);
  assert.equal(t.reasons[0].category, "unknown");
  assert.match(t.reasons[0].action, /bank's documentation/);
});

test("rejected payments are grouped by reason and by what to do about them", () => {
  const r = readReport(sampleRejectedReport());
  assert.deepEqual(r.summary.byReason.map((x) => x.code).sort(), ["AC04", "AM04", "XY99"]);
  const cats = Object.fromEntries(r.summary.byCategory.map((c) => [c.category, formatScaled(c.total)]));
  assert.equal(cats.account, "2300.00");
  assert.equal(cats.funds, "450.00");
  assert.equal(cats.unknown, "3100.00");
});

test("a whole-file rejection is an error with the reason and its fix", () => {
  const r = readReport(sampleFileRejectedReport());
  const f = r.findings.find((x) => x.code === "GRP-REJECTED");
  assert.equal(f.severity, "error");
  assert.match(f.cause, /AM10/);
  assert.match(f.fix, /CtrlSum/);
  assert.equal(r.summary.txs.length, 0);
});

test("an accepted file has no errors and no warnings", () => {
  const r = readReport(sampleAcceptedReport());
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.deepEqual(codes(r).sort(), ["GRP-ACCEPTED", "NO-TX-LINES"]);
});

test("the payment file you sent is recognised as the wrong file", () => {
  const r = readReport('<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn/></Document>');
  assert.deepEqual(codes(r), ["NS-NOT-PAIN002"]);
  assert.match(r.findings[0].cause, /payment file you sent/);
  assert.match(r.findings[0].fix, /pain\.001 validator/);
});

test("non-XML text, empty input and a truncated file do not throw", () => {
  assert.ok(readReport("").summary.errors >= 1);
  assert.ok(readReport("hello").summary.errors >= 1);
  const cut = sampleRejectedReport().slice(0, 700);
  const r = readReport(cut);
  assert.ok(r.summary.errors >= 1);
  assert.ok(r.parseErrors.some((e) => e.code === "WF-UNCLOSED"));
});

test("a DTD is refused and never expanded", () => {
  const evil = '<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03"><CstmrPmtStsRpt><GrpHdr><MsgId>&b;</MsgId></GrpHdr></CstmrPmtStsRpt></Document>';
  const r = readReport(evil);
  assert.ok(codes(r).includes("XML-DTD"));
  assert.ok(!r.summary.msgId.includes("aaaa"));
});

test("a report listing more payments than the original file had is flagged", () => {
  const x = sampleRejectedReport().replace("<OrgnlNbOfTxs>5</OrgnlNbOfTxs>", "<OrgnlNbOfTxs>3</OrgnlNbOfTxs>");
  assert.ok(codes(readReport(x)).includes("COUNT-DIFFERS"));
  assert.equal(readReport(x).findings.find((f) => f.code === "COUNT-DIFFERS").severity, "warning");
});

test("a shorter list than the original file is informational, as banks list only exceptions", () => {
  const x = sampleRejectedReport().replace("<OrgnlNbOfTxs>5</OrgnlNbOfTxs>", "<OrgnlNbOfTxs>50</OrgnlNbOfTxs>");
  assert.equal(readReport(x).findings.find((f) => f.code === "COUNT-DIFFERS").severity, "info");
});

test("a rejected payment without a repeated amount makes the rejected total a lower bound", () => {
  const x = sampleRejectedReport().replace('<Amt><InstdAmt Ccy="EUR">450.00</InstdAmt></Amt>', "");
  const r = readReport(x);
  assert.equal(r.summary.rejectedUnreadable, 1);
  assert.equal(formatScaled(r.summary.rejectedTotal), "5400.00");
  assert.ok(codes(r).includes("AMT-UNREADABLE"));
});

test("a rejection with no reason is reported as such with the action 'ask your bank'", () => {
  const x = sampleRejectedReport().replace(/<StsRsnInf>\s*<Rsn><Cd>AM04<\/Cd><\/Rsn>\s*<\/StsRsnInf>/, "");
  const r = readReport(x);
  const t = r.summary.txs.find((y) => y.e2e === "INV-1003");
  assert.equal(t.reasons.length, 0);
  const f = r.findings.find((y) => y.title.includes("INV-1003"));
  assert.match(f.title, /no reason given/);
  assert.match(f.fix, /Ask your bank/);
  assert.match(resubmissionCsv(r), /"No reason given"/);
});

test("duplicate EndToEndId inside one block is a warning", () => {
  const x = sampleRejectedReport().replace("INV-1003", "INV-1002");
  assert.ok(codes(readReport(x)).includes("E2E-DUP"));
});

test("a block summary that disagrees with the listed payments is flagged", () => {
  const x = sampleRejectedReport().replace("</PmtInfSts>", "</PmtInfSts>").replace("<PmtInfSts>PART</PmtInfSts>", "<PmtInfSts>PART</PmtInfSts>\n      <NbOfTxsPerSts><DtldNbOfTxs>9</DtldNbOfTxs><DtldSts>RJCT</DtldSts></NbOfTxsPerSts>");
  assert.ok(codes(readReport(x)).includes("PERSTS-MISMATCH"));
});

test("IBANs are masked everywhere in the output", () => {
  const r = readReport(sampleRejectedReport());
  const out = JSON.stringify(r.summary.txs, (k, v) => (typeof v === "bigint" ? v.toString() : v)) + resubmissionCsv(r) + findingsCsv(r);
  assert.doesNotMatch(out, /DE75512108001245126199|DE02120300000000202051|FR1420041010050500013M02606/);
  assert.match(out, /DE75\*+6199/);
});

test("the CSV lists only rejected payments and neutralises spreadsheet formulas", () => {
  const x = sampleRejectedReport().replace("Beta Logistik AG", "=HYPERLINK(&quot;x&quot;)");
  const csv = resubmissionCsv(readReport(x));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 4);
  assert.ok(lines.every((l) => !/INV-1001|INV-1005/.test(l)));
  assert.match(csv, /"'=HYPERLINK/);
});

test("pain.002.001.10 style names are accepted via the namespace", () => {
  const x = sampleAcceptedReport().replace("pain.002.001.03", "pain.002.001.10");
  assert.equal(readReport(x).summary.version, "pain.002.001.10");
});

test("every reason has a name, a known category, a meaning and an action; every status a kind", () => {
  for (const [code, row] of Object.entries(REASONS)) {
    assert.match(code, /^[A-Z0-9]{4}$/);
    assert.equal(row.length, 4);
    assert.ok(row.every((s) => typeof s === "string" && s.length > 3), code);
    assert.ok(row[1] in CATEGORY, code);
  }
  for (const s of Object.values(STATUS)) assert.ok(["ok", "warn", "bad"].includes(s.kind));
});

test("windows-1252 files are decoded", () => {
  const bytes = new Uint8Array([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
  const d = decodeBufferInfo(bytes);
  assert.equal(d.encoding, "windows-1252");
  assert.equal(d.text, "Müller");
});

test("parseXml gives line numbers", () => {
  const p = parseXml("<a>\n<b>1</b>\n</a>");
  assert.equal(p.root.children[0].line, 2);
});
