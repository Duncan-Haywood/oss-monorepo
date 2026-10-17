import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, parseXml, sampleFile, sampleDirectDebit, sampleBrokenFile, buildCreditTransfer,
  parseAmount, parseDecimal, formatScaled, checkIban, maskIban, ibanMod97, checkBic, easterSunday,
  targetHolidays, targetDayInfo, nextTargetDay, transliterate, disallowedChars, findingsCsv, decodeBufferInfo,
  IBAN_LENGTHS,
} from "./calc.mjs";

const TODAY = new Date(Date.UTC(2026, 9, 5)); // Monday 2026-10-05
const run = (xml, opts = {}) => validate(xml, { today: TODAY, ...opts });
const codes = (r) => r.findings.map((f) => f.code);
const has = (r, code) => codes(r).includes(code);
const clean = () => sampleFile({ today: TODAY });
const date = (iso) => new Date(iso + "T00:00:00Z");

// ---- arithmetic -----------------------------------------------------------------------------

test("amounts are summed as exact decimals: 0.1 + 0.2 is 0.30, not 0.30000000000000004", () => {
  assert.equal(0.1 + 0.2 === 0.3, false); // the float trap this tool avoids
  const xml = buildCreditTransfer({ date: "2026-10-07", groups: [{ id: "P1", txs: [
    { e2e: "A", name: "A", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "0.10", ustrd: "x" },
    { e2e: "B", name: "B", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "0.20", ustrd: "x" },
  ] }] });
  const r = run(xml);
  assert.equal(r.summary.errors, 0);
  assert.equal(formatScaled(r.summary.total), "0.30");
});

test("a sum of 100 cents of 0.01 is exactly 1.00 and 999999999.99 survives", () => {
  const txs = Array.from({ length: 100 }, (_, i) => ({ e2e: `E${i}`, name: "N", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "0.01", ustrd: "x" }));
  const r = run(buildCreditTransfer({ date: "2026-10-07", groups: [{ id: "P", txs }] }));
  assert.equal(r.summary.errors, 0);
  assert.equal(formatScaled(r.summary.total), "1.00");
  assert.equal(parseAmount("999999999.99").ok, true);
  assert.equal(formatScaled(parseAmount("999999999.99").scaled * 3n), "2999999999.97");
});

test("parseAmount classifies every malformed amount", () => {
  assert.equal(parseAmount("12.5").ok, true);
  assert.equal(parseAmount("12").ok, true);
  assert.equal(parseAmount("12,50").problem, "comma");
  assert.equal(parseAmount("1 000.00").problem, "format");
  assert.equal(parseAmount("€5").problem, "format");
  assert.equal(parseAmount("-5.00").problem, "negative");
  assert.equal(parseAmount("0.00").problem, "zero");
  assert.equal(parseAmount("1.005").problem, "decimals");
  assert.equal(parseAmount("1000000000.00").problem, "toolarge");
  assert.equal(parseAmount("").problem, "empty");
  assert.equal(parseAmount("1.5e3").problem, "format");
});

test("parseDecimal and formatScaled round-trip", () => {
  assert.equal(formatScaled(parseDecimal("1234.5")), "1234.50");
  assert.equal(formatScaled(parseDecimal("0.005")), "0.005");
  assert.equal(parseDecimal("abc"), null);
  assert.equal(parseDecimal("1.1234567"), null);
});

// ---- clean files ----------------------------------------------------------------------------

test("the clean pain.001.001.03 example has no errors or warnings and the expected shape", () => {
  const r = run(clean());
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.version, "pain.001.001.03");
  assert.equal(r.summary.family, "CT");
  assert.equal(r.summary.transactions, 3);
  assert.equal(formatScaled(r.summary.total), "3640.40");
  assert.ok(has(r, "CLEAN") && has(r, "VERSION"));
});

test("a pain.001.001.09 file with <Dt> and <BICFI> is clean, and .03 rules are rejected in it", () => {
  const nine = buildCreditTransfer({ version: "pain.001.001.09", date: "2026-10-07" });
  const r = run(nine);
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings.filter((f) => f.severity === "error")));
  assert.equal(r.summary.version, "pain.001.001.09");
  const bad = run(nine.replaceAll("BICFI", "BIC"));
  assert.ok(has(bad, "BIC-ELEMENT"));
  const bare = run(nine.replace("<ReqdExctnDt><Dt>2026-10-07</Dt></ReqdExctnDt>", "<ReqdExctnDt>2026-10-07</ReqdExctnDt>"));
  assert.ok(has(bare, "DATE-WRAP"));
});

test("a pain.001.001.03 file using <Dt> or <BICFI> is flagged for the older version", () => {
  const three = clean().replace("<ReqdExctnDt>", "<ReqdExctnDt><Dt>").replace("</ReqdExctnDt>", "</Dt></ReqdExctnDt>");
  assert.ok(has(run(three), "DATE-WRAP"));
  assert.ok(has(run(clean().replace(/<BIC>COBADEFFXXX<\/BIC>/, "<BICFI>COBADEFFXXX</BICFI>")), "BIC-ELEMENT"));
});

test("the direct debit example (pain.008.001.02) is clean", () => {
  const r = run(sampleDirectDebit({ today: TODAY }));
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.summary.family, "DD");
  assert.equal(r.summary.transactions, 2);
  assert.equal(formatScaled(r.summary.total), "59.80");
});

test("direct debit rules: sequence type, scheme, mandate id, creditor id, signature date", () => {
  const dd = sampleDirectDebit({ today: TODAY });
  assert.ok(has(run(dd.replace("<SeqTp>RCUR</SeqTp>", "<SeqTp>XXXX</SeqTp>")), "DD-SEQTP"));
  assert.ok(has(run(dd.replace("<SeqTp>RCUR</SeqTp>", "")), "DD-SEQTP"));
  assert.ok(has(run(dd.replace("<Cd>CORE</Cd>", "<Cd>CORX</Cd>")), "DD-LCLINSTRM"));
  assert.ok(has(run(dd.replace("<MndtId>MAND-0001</MndtId>", "")), "DD-MNDTID"));
  assert.ok(has(run(dd.replace("DE98ZZZ09999999999", "99")), "DD-CREDITORID"));
  assert.ok(has(run(dd.replace("<Prtry>SEPA</Prtry>", "<Prtry>OTHER</Prtry>")), "DD-SCHMENM"));
  assert.ok(has(run(dd.replace("2025-03-14", "2027-01-01")), "DD-DTOFSGNTR"));
  assert.ok(has(run(dd.replace(/<ReqdColltnDt>.*?</, "<ReqdColltnDt>2020-01-01<")), "DATE-PAST"));
});

test("pain.008.001.08 uses BICFI and a <Dt> wrapper", () => {
  const dd = sampleDirectDebit({ today: TODAY }).replace("pain.008.001.02", "pain.008.001.08")
    .replace(/<ReqdColltnDt>(.*?)<\/ReqdColltnDt>/, "<ReqdColltnDt><Dt>$1</Dt></ReqdColltnDt>").replace("<BIC>COBADEFFXXX</BIC>", "<BICFI>COBADEFFXXX</BICFI>");
  const r = run(dd);
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.summary.version, "pain.008.001.08");
});

// ---- counters -------------------------------------------------------------------------------

test("GrpHdr NbOfTxs and CtrlSum mismatches are reported with the true values", () => {
  const r = run(clean().replace("<NbOfTxs>3</NbOfTxs>", "<NbOfTxs>4</NbOfTxs>").replace("<CtrlSum>3640.40</CtrlSum>", "<CtrlSum>3640.30</CtrlSum>"));
  const nb = r.findings.find((f) => f.code === "C-NBOFTXS");
  const cs = r.findings.find((f) => f.code === "C-CTRLSUM");
  assert.match(nb.title, /says 4.*has 3/);
  assert.match(cs.title, /3640\.30.*3640\.40/);
  assert.match(cs.cause, /\+0\.10/);
  assert.ok(nb.line > 0 && nb.path.endsWith("/GrpHdr[1]/NbOfTxs"));
});

test("per-PmtInf counters are checked separately from the group header", () => {
  const xml = buildCreditTransfer({ date: "2026-10-07", groups: [
    { id: "P1", txs: [{ e2e: "A", name: "A", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "10.00", ustrd: "x" }] },
    { id: "P2", txs: [{ e2e: "B", name: "B", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "20.00", ustrd: "x" }] },
  ] });
  assert.equal(run(xml).summary.errors, 0);
  const bad = run(xml.replace("<NbOfTxs>1</NbOfTxs>\n      <CtrlSum>20.00</CtrlSum>", "<NbOfTxs>2</NbOfTxs>\n      <CtrlSum>25.00</CtrlSum>"));
  const pi = bad.findings.filter((f) => f.path.includes("PmtInf[2]"));
  assert.ok(pi.some((f) => f.code === "C-NBOFTXS") && pi.some((f) => f.code === "C-CTRLSUM"));
  assert.ok(!bad.findings.some((f) => f.code.startsWith("C-") && f.path.includes("GrpHdr")));
});

test("a missing GrpHdr NbOfTxs is an error; a missing CtrlSum is only information", () => {
  assert.ok(has(run(clean().replace("<NbOfTxs>3</NbOfTxs>", "")), "R-NBOFTXS"));
  const r = run(clean().replace("<CtrlSum>3640.40</CtrlSum>\n      <InitgPty>", "<InitgPty>"));
  assert.ok(has(r, "C-CTRLSUM-NONE"));
  assert.equal(r.summary.errors, 0);
});

// ---- IBAN and BIC ---------------------------------------------------------------------------

const GOOD_IBANS = ["DE89370400440532013000", "FR1420041010050500013M02606", "GB82WEST12345698765432", "NL91ABNA0417164300", "ES9121000418450200051332", "IT60X0542811101000000123456", "BE68539007547034", "AT611904300234573201", "CH9300762011623852957", "IE29AIBK93115212345678"];

test("well-known test IBANs pass mod-97 and the length table", () => {
  for (const i of GOOD_IBANS) { assert.equal(ibanMod97(i), 1, i); assert.ok(checkIban(i).ok, i); assert.equal(i.length, IBAN_LENGTHS[i.slice(0, 2)], i); }
});

test("IBAN faults: transposed digits, wrong length, spaces, lowercase, not an IBAN, non-SEPA country", () => {
  assert.ok(checkIban("DE89370400440532013001").problems.some((p) => p.code === "IBAN-CHECKSUM"));
  assert.ok(checkIban("DE8937040044053201300").problems.some((p) => p.code === "IBAN-LENGTH"));
  assert.ok(checkIban("DE89 3704 0044 0532 0130 00").problems.some((p) => p.code === "IBAN-SPACES"));
  assert.ok(checkIban("de89370400440532013000").problems.some((p) => p.code === "IBAN-CASE"));
  assert.ok(checkIban("12345678").problems.some((p) => p.code === "IBAN-FORMAT"));
  assert.ok(checkIban("BR1800360305000010009795493C1").problems.some((p) => p.code === "IBAN-NOT-SEPA"));
  assert.ok(checkIban("ZZ0012345678").problems.some((p) => p.code === "IBAN-COUNTRY"));
});

test("a bad IBAN inside a file is found with its line and path", () => {
  const r = run(clean().replace("NL91ABNA0417164300", "NL91ABNA0417164301"));
  const f = r.findings.find((x) => x.code === "IBAN-CHECKSUM");
  assert.ok(f.line > 0);
  assert.match(f.path, /CdtTrfTxInf\[2\]\/CdtrAcct\/Id\/IBAN$/);
  assert.match(f.fix, /Re-enter/);
});

test("IBANs are masked everywhere in a report and its CSV", () => {
  const broken = clean().replace("NL91ABNA0417164300", "NL91ABNA0417164301").replace("ES9121000418450200051332", "ES91 2100 0418 4502 0005 1332");
  const r = run(broken);
  const blob = JSON.stringify(r.findings) + findingsCsv(r) + JSON.stringify(r.summary.txList, (k, v) => (typeof v === "bigint" ? v.toString() : v));
  for (const full of ["NL91ABNA0417164301", "ES9121000418450200051332", "FR1420041010050500013M02606", "DE89370400440532013000"]) assert.ok(!blob.includes(full), full);
  assert.equal(maskIban("DE89370400440532013000"), "DE89**************3000");
  assert.ok(blob.includes("NL91**********4301"));
});

test("BIC format: 8 and 11 characters pass, lowercase, 9 characters and digits in the bank code fail", () => {
  assert.ok(checkBic("COBADEFFXXX").ok && checkBic("ABNANL2A").ok);
  assert.ok(!checkBic("cobadeffxxx").ok && !checkBic("ABNANL2AX").ok && !checkBic("1BNANL2A").ok);
  const r = run(clean().replace("<BIC>ABNANL2A</BIC>", "<BIC>abnanl2a</BIC>"));
  assert.ok(has(r, "BIC-FORMAT"));
});

test("IBAN-only payments (Othr/NOTPROVIDED, or no creditor agent) are accepted", () => {
  const r = run(clean().replace("<BIC>ABNANL2A</BIC>", "<Othr><Id>NOTPROVIDED</Id></Othr>").replace(/<CdtrAgt>.*?CdtrAgt>\n/s, ""));
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
});

// ---- SEPA rules -----------------------------------------------------------------------------

test("currency must be EUR and EqvtAmt is rejected", () => {
  assert.ok(has(run(clean().replace('Ccy="EUR">89.90', 'Ccy="USD">89.90')), "SEPA-CCY"));
  assert.ok(has(run(clean().replace(' Ccy="EUR">89.90', ">89.90")), "SEPA-CCY"));
  assert.ok(has(run(clean().replace("<Amt><InstdAmt", '<Amt><EqvtAmt><Amt Ccy="USD">1.00</Amt></EqvtAmt><InstdAmt')), "SEPA-EQVTAMT"));
});

test("amount faults are reported on the right line without touching other findings", () => {
  for (const [amt, code] of [["89,90", "AMT-COMMA"], ["89.905", "AMT-DECIMALS"], ["-1.00", "AMT-NEGATIVE"], ["0.00", "AMT-ZERO"], ["1000000000.00", "AMT-TOOLARGE"], ["EUR 5", "AMT-FORMAT"], ["", "AMT-EMPTY"]]) {
    const r = run(clean().replace(">89.90<", `>${amt}<`));
    assert.ok(has(r, code), `${amt} -> ${codes(r)}`);
  }
});

test("charge bearer must be SLEV and service level SEPA", () => {
  assert.ok(has(run(clean().replace("<ChrgBr>SLEV</ChrgBr>", "<ChrgBr>DEBT</ChrgBr>")), "SEPA-CHRGBR"));
  const none = run(clean().replace("      <ChrgBr>SLEV</ChrgBr>\n", ""));
  assert.ok(has(none, "SEPA-CHRGBR-MISSING"));
  assert.equal(none.summary.errors, 0);
  assert.ok(has(run(clean().replace("<Cd>SEPA</Cd>", "<Cd>URGP</Cd>")), "SEPA-SVCLVL"));
  assert.ok(has(run(clean().replace("<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>", "")), "SEPA-SVCLVL"));
  assert.ok(has(run(clean().replace("<PmtMtd>TRF</PmtMtd>", "<PmtMtd>CHK</PmtMtd>")), "R-PMTMTD"));
});

test("missing debtor and creditor names, missing accounts and amounts are required-element errors", () => {
  assert.ok(has(run(clean().replace("<Dbtr><Nm>Example Trading Ltd</Nm></Dbtr>", "<Dbtr></Dbtr>")), "R-NAME"));
  const noName = run(clean().replace("<Cdtr><Nm>Jan de Vries</Nm></Cdtr>", "<Cdtr><Nm> </Nm></Cdtr>"));
  assert.ok(has(noName, "R-EMPTY"));
  assert.ok(has(run(clean().replace(/<CdtrAcct>.*?NL91ABNA0417164300.*?<\/CdtrAcct>/s, "")), "R-ACCT"));
  assert.ok(has(run(clean().replace(/<Amt>.*?89\.90.*?<\/Amt>/s, "")), "R-AMOUNT"));
  assert.ok(has(run(clean().replace(/<DbtrAcct>.*?<\/DbtrAcct>/s, "<DbtrAcct><Id><Othr><Id>123</Id></Othr></Id></DbtrAcct>")), "IBAN-MISSING"));
  assert.ok(has(run(clean().replace(/<GrpHdr>.*?<\/GrpHdr>/s, "")), "R-GRPHDR"));
  assert.ok(has(run(clean().replace("<MsgId>MSG-2026-0001</MsgId>", "")), "R-MISSING"));
});

test("only one Ustrd is allowed", () => {
  assert.ok(has(run(clean().replace("<Ustrd>Refund order 8841</Ustrd>", "<Ustrd>a</Ustrd><Ustrd>b</Ustrd>")), "SEPA-USTRD"));
});

// ---- characters and lengths -----------------------------------------------------------------

test("Max35Text, Max70Text and Max140Text limits are enforced on the right fields", () => {
  const long = (n) => "A".repeat(n);
  assert.ok(!has(run(clean().replace("INV-0001", long(35))), "TXT-LENGTH"));
  assert.ok(has(run(clean().replace("INV-0001", long(36))), "TXT-LENGTH"));
  assert.ok(has(run(clean().replace("PMT-0001", long(36))), "TXT-LENGTH"));
  assert.ok(has(run(clean().replace("MSG-2026-0001", long(36))), "TXT-LENGTH"));
  assert.ok(!has(run(clean().replace("Jan de Vries", long(70))), "TXT-LENGTH"));
  assert.ok(has(run(clean().replace("Jan de Vries", long(71))), "TXT-LENGTH"));
  assert.ok(!has(run(clean().replace("Refund order 8841", long(140))), "TXT-LENGTH"));
  const over = run(clean().replace("Refund order 8841", long(141)));
  assert.match(over.findings.find((f) => f.code === "TXT-LENGTH").title, /141 characters, maximum 140/);
});

test("disallowed characters are listed with a suggested replacement", () => {
  const r = run(clean().replace("Jan de Vries", "Jürgen Müller & Co @ Zoë_1"));
  const f = r.findings.find((x) => x.code === "TXT-CHARS");
  assert.match(f.cause, /"ü" \(suggest "ue"\)/);
  assert.match(f.cause, /"&" \(suggest "\+"\)/);
  assert.match(f.cause, /"@" \(suggest "\(at\)"\)/);
  assert.match(f.cause, /"_" \(suggest "-"\)/);
});

test("the SEPA character set accepts its own punctuation and nothing else", () => {
  assert.deepEqual(disallowedChars("aZ09/-?:().,'+ "), []);
  assert.deepEqual(disallowedChars("a&b").map((x) => x.ch), ["&"]);
  assert.equal(transliterate("Straße Ärger Œuvre Łódź café ñ"), "Strasse AErger OEuvre Lodz cafe n");
  assert.equal(transliterate("50% off #1 €5 “hi” – ok"), "50  off  1 EUR5 'hi' - ok");
  assert.equal(transliterate("日本"), "..");
  assert.equal(transliterate("a\tb\nc"), "a b c");
});

test("reference ids with a leading, trailing or doubled slash get a warning", () => {
  assert.ok(has(run(clean().replace("INV-0001", "/INV1")), "TXT-SLASH"));
  assert.ok(has(run(clean().replace("INV-0001", "INV//1")), "TXT-SLASH"));
  assert.ok(!has(run(clean().replace("INV-0001", "INV/1")), "TXT-SLASH"));
});

// ---- duplicates -----------------------------------------------------------------------------

test("duplicate EndToEndId, PmtInfId and (with a prior list) MsgId are reported", () => {
  assert.ok(has(run(clean().replace("INV-0002", "INV-0001")), "DUP-E2E"));
  assert.ok(!has(run(clean().replaceAll(/<EndToEndId>INV-000\d<\/EndToEndId>/g, "<EndToEndId>NOTPROVIDED</EndToEndId>")), "DUP-E2E"));
  const two = buildCreditTransfer({ date: "2026-10-07", groups: [
    { id: "SAME", txs: [{ e2e: "A", name: "A", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "1.00", ustrd: "x" }] },
    { id: "SAME", txs: [{ e2e: "B", name: "B", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: "1.00", ustrd: "x" }] },
  ] });
  assert.ok(has(run(two), "DUP-PMTINFID"));
  assert.ok(has(run(clean(), { previousMsgIds: ["X", "MSG-2026-0001"] }), "DUP-MSGID-PRIOR"));
  assert.ok(!has(run(clean(), { previousMsgIds: ["X"] }), "DUP-MSGID-PRIOR"));
});

// ---- calendar -------------------------------------------------------------------------------

test("Easter and the TARGET2 closing days come out right for several years", () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
  assert.equal(easterSunday(2025).toISOString().slice(0, 10), "2025-04-20");
  assert.equal(easterSunday(2024).toISOString().slice(0, 10), "2024-03-31");
  const h = targetHolidays(2026);
  assert.equal(h.get("2026-04-03"), "Good Friday");
  assert.equal(h.get("2026-04-06"), "Easter Monday");
  assert.ok(h.has("2026-01-01") && h.has("2026-05-01") && h.has("2026-12-25") && h.has("2026-12-26"));
  assert.equal(h.size, 6);
});

test("an execution date on a weekend or TARGET holiday names the reason and the next TARGET day", () => {
  assert.equal(targetDayInfo(date("2026-10-10")).reason, "a Saturday");
  assert.equal(targetDayInfo(date("2026-10-11")).reason, "a Sunday");
  assert.equal(targetDayInfo(date("2026-10-06")).open, true);
  assert.equal(nextTargetDay(date("2026-10-10")).toISOString().slice(0, 10), "2026-10-12");
  assert.equal(nextTargetDay(date("2026-12-24")).toISOString().slice(0, 10), "2026-12-24");
  assert.equal(nextTargetDay(date("2026-12-25")).toISOString().slice(0, 10), "2026-12-28");
  assert.equal(nextTargetDay(date("2026-04-03")).toISOString().slice(0, 10), "2026-04-07");
  const sat = run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>2026-10-10<"));
  const f = sat.findings.find((x) => x.code === "DATE-CLOSED");
  assert.match(f.title, /2026-10-10 is a Saturday/);
  assert.match(f.fix, /2026-10-12/);
  const xmas = run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>2026-12-25<"));
  assert.match(xmas.findings.find((x) => x.code === "DATE-CLOSED").title, /Christmas Day/);
});

test("a past execution date is flagged with the next TARGET day from today; a bad date is an error", () => {
  const past = run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>2026-10-02<"));
  const f = past.findings.find((x) => x.code === "DATE-PAST");
  assert.match(f.fix, /2026-10-05/);
  assert.ok(has(run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>2026-02-30<")), "FMT-DATE"));
  assert.ok(has(run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>05.10.2026<")), "FMT-DATE"));
  assert.ok(has(run(clean().replace(/<ReqdExctnDt>.*?<\/ReqdExctnDt>/, "")), "R-DATE"));
  assert.ok(!has(run(clean().replace(/<ReqdExctnDt>.*?</, "<ReqdExctnDt>2026-10-05<")), "DATE-PAST"));
});

// ---- namespace and well-formedness ----------------------------------------------------------

test("namespace and version detection, including unsupported and wrong-message cases", () => {
  assert.ok(has(run(clean().replace(/ xmlns="[^"]*"/, "")), "NS-MISSING"));
  const v5 = run(clean().replace("pain.001.001.03", "pain.001.001.05"));
  assert.ok(has(v5, "NS-VERSION"));
  assert.ok(has(run(clean().replace("pain.001.001.03", "pain.002.001.03")), "NS-NOT-INITIATION"));
  assert.ok(has(run(clean().replace("pain.001.001.03", "pain.008.001.02")), "R-BODY"));
  assert.ok(has(run(clean().replace("<Document", "<Doc").replace("</Document>", "</Doc>")), "NS-ROOT"));
});

test("a prefixed namespace (ns2:Document, as some ERP exports write it) is read correctly", () => {
  const x = clean().replace(/<(\/?)([A-Za-z]+)/g, (m, s, n) => `<${s}ns2:${n}`).replace('xmlns="', 'xmlns:ns2="');
  const r = run(x);
  assert.equal(r.summary.version, "pain.001.001.03");
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings.filter((f) => f.severity === "error")));
});

test("real-world shape: BOM, xsi:schemaLocation, comments, CDATA and entities parse cleanly", () => {
  const x = "﻿" + clean()
    .replace('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"', '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd"')
    .replace("<GrpHdr>", "<!-- exported by ERP -->\n    <GrpHdr>")
    .replace("Invoice 2026-0412", "<![CDATA[Invoice 2026-0412]]>")
    .replace("Acme Supplies GmbH", "Smith &amp; Sons");
  const r = run(x);
  // Everything parses; the one finding is the real one: "&" is outside the SEPA character set.
  assert.deepEqual(r.findings.filter((f) => f.severity === "error").map((f) => f.code), ["TXT-CHARS"]);
  assert.equal(r.summary.wellFormed, true);
  assert.ok(r.summary.txList.some((t) => t.name === "Smith & Sons"));
});

test("well-formedness errors carry line numbers: mismatched tag, unclosed element, bad entity, stray text, two roots", () => {
  const lineOf = (r, code) => r.findings.find((f) => f.code === code).line;
  const mismatch = run(clean().replace("</Nm></Cdtr>", "</Cdtr>"));
  assert.ok(has(mismatch, "WF-MISMATCH"));
  assert.equal(lineOf(mismatch, "WF-MISMATCH"), 27);
  assert.ok(has(run(clean().slice(0, -40)), "WF-UNCLOSED"));
  assert.ok(has(run(clean().replace("Acme Supplies GmbH", "Acme & Sons")), "WF-AMP"));
  assert.ok(has(run(clean().replace("Acme Supplies GmbH", "A &nbsp; B")), "WF-ENTITY"));
  assert.ok(has(run("junk" + clean()), "WF-OUTSIDE"));
  assert.ok(has(run(clean() + clean().replace(/<\?xml.*?\?>\n/, "")), "WF-ROOTS"));
  assert.ok(has(run("\n" + clean()), "WF-DECL-POS"));
  assert.ok(has(run(clean().replace('Ccy="EUR">89.90', "Ccy=EUR>89.90")), "WF-ATTR-QUOTE"));
  assert.ok(has(run(clean().replace("Acme", "Ac\u0001me")), "WF-CHAR"));
  assert.ok(has(run("hello"), "WF-EMPTY"));
  assert.equal(run(clean()).summary.wellFormed, true);
  assert.equal(mismatch.summary.wellFormed, false);
});

test("a DTD is refused and never expanded", () => {
  const evil = clean().replace("<Document", '<!DOCTYPE d [<!ENTITY x "boom">]>\n<Document').replace("Acme Supplies GmbH", "&x;");
  const r = run(evil);
  assert.ok(has(r, "XML-DOCTYPE"));
  assert.ok(!r.summary.txList.some((t) => t.name.includes("boom")));
});

test("a non-UTF-8 declaration is a warning; decodeBufferInfo falls back for Latin-1 bytes", () => {
  assert.ok(has(run(clean().replace('encoding="UTF-8"', 'encoding="ISO-8859-1"')), "ENC-DECL"));
  const bytes = Uint8Array.from([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72]);
  const d = decodeBufferInfo(bytes.buffer);
  assert.equal(d.encoding, "windows-1252");
  assert.equal(d.text, "Müller");
  assert.equal(decodeBufferInfo(new TextEncoder().encode("Müller").buffer).encoding, "utf-8");
});

// ---- broken example and repair --------------------------------------------------------------

test("the broken example trips the faults the page advertises", () => {
  const r = run(sampleBrokenFile({ today: TODAY }));
  for (const c of ["C-NBOFTXS", "C-CTRLSUM", "SEPA-CHRGBR", "TXT-CHARS", "SEPA-CCY", "IBAN-CHECKSUM", "DATE-CLOSED", "DUP-E2E"]) assert.ok(has(r, c), c);
  assert.ok(r.findings.every((f) => f.severity === "info" || f.title));
  assert.ok(r.findings.filter((f) => f.severity !== "info").every((f) => f.cause && f.fix !== undefined));
});

test("repair rebuilds NbOfTxs and CtrlSum and transliterates, and changes nothing else", () => {
  const broken = sampleBrokenFile({ today: TODAY });
  const fix = repair(broken);
  assert.equal(fix.error, null);
  assert.ok(fix.changes.some((c) => /GrpHdr NbOfTxs: 4 -> 3/.test(c.what)));
  assert.ok(fix.changes.some((c) => /GrpHdr CtrlSum: 3640\.40 -> 3649\.40/.test(c.what)));
  assert.ok(fix.changes.some((c) => /PmtInf CtrlSum/.test(c.what)));
  assert.ok(fix.changes.some((c) => /Mueller \+ Soehne GmbH/.test(c.what)));
  assert.ok(fix.text.includes("<Nm>Mueller + Soehne GmbH</Nm>"));
  const after = run(fix.text);
  for (const c of ["C-NBOFTXS", "C-CTRLSUM", "TXT-CHARS"]) assert.ok(!has(after, c), c);
  // never touches IBANs, amounts, currencies, dates or ids
  const grab = (x, re) => [...x.matchAll(re)].map((m) => m[0]);
  for (const re of [/<IBAN>.*?<\/IBAN>/g, /<InstdAmt[^>]*>.*?<\/InstdAmt>/g, /<EndToEndId>.*?<\/EndToEndId>/g, /<ReqdExctnDt>.*?<\/ReqdExctnDt>/g, /<BIC>.*?<\/BIC>/g, /<ChrgBr>.*?<\/ChrgBr>/g]) assert.deepEqual(grab(fix.text, re), grab(broken, re), String(re));
  // only lines that were reported as changed differ
  const a = broken.split("\n"), b = fix.text.split("\n");
  assert.equal(a.length, b.length);
  const changed = new Set(fix.changes.map((c) => c.line));
  a.forEach((l, i) => { if (l !== b[i]) assert.ok(changed.has(i + 1), `line ${i + 1} changed without being listed`); });
  // still reports the faults repair must not fix
  assert.ok(has(after, "IBAN-CHECKSUM") && has(after, "SEPA-CCY") && has(after, "DATE-CLOSED"));
});

test("repair is idempotent and leaves a clean file byte-identical", () => {
  const c = clean();
  assert.equal(repair(c).text, c);
  assert.deepEqual(repair(c).changes, []);
  const once = repair(sampleBrokenFile({ today: TODAY }));
  const twice = repair(once.text);
  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.changes, []);
});

test("repair refuses to rebuild a CtrlSum when an amount is unreadable, and says so", () => {
  const x = clean().replace(">89.90<", ">89.905<").replace("<NbOfTxs>3</NbOfTxs>", "<NbOfTxs>9</NbOfTxs>");
  const fix = repair(x);
  assert.ok(fix.skipped.length >= 1);
  assert.ok(fix.text.includes("<CtrlSum>3640.40</CtrlSum>"));
  assert.ok(fix.text.includes("<NbOfTxs>3</NbOfTxs>")); // counts do not need amounts
  assert.ok(fix.text.includes(">89.905<")); // the amount itself is never rounded
});

test("repair refuses a file that is not well-formed XML", () => {
  const fix = repair(clean().replace("</Nm></Cdtr>", "</Cdtr>"));
  assert.equal(fix.text, null);
  assert.match(fix.error, /not well-formed/);
});

test("repair works on a direct debit file and on pain.001.001.09", () => {
  const dd = sampleDirectDebit({ today: TODAY }).replace("<CtrlSum>59.80</CtrlSum>", "<CtrlSum>60.00</CtrlSum>").replace("Jan de Vries", "Jan de Vries Ø");
  const fix = repair(dd);
  assert.ok(fix.text.includes("<CtrlSum>59.80</CtrlSum>") && fix.text.includes("Jan de Vries OE"));
  const nine = buildCreditTransfer({ version: "pain.001.001.09", date: "2026-10-07" }).replace("<NbOfTxs>3</NbOfTxs>", "<NbOfTxs>2</NbOfTxs>");
  assert.ok(repair(nine).text.includes("<NbOfTxs>3</NbOfTxs>"));
});

test("repair keeps XML escaping valid when it rewrites a name", () => {
  const x = clean().replace("Acme Supplies GmbH", "Acme &amp; Söhne").replace("Jan de Vries", "R&amp;D «x»");
  const fix = repair(x);
  assert.equal(parseXml(fix.text).errors.length, 0);
  assert.ok(fix.text.includes("Acme + Soehne"));
});

// ---- export ---------------------------------------------------------------------------------

test("findings CSV has a header, quotes embedded commas, and neutralises formula cells", () => {
  const r = run(clean().replace("Jan de Vries", "=SUM(A1) Jürgen, Co"));
  const csv = findingsCsv(r);
  assert.match(csv.split("\n")[0], /^severity,code,line,path,title,cause,fix$/);
  assert.ok(!/(^|,)"=SUM/.test(csv));
  assert.ok(csv.split("\n").length > 2);
});

test("a large file validates quickly and the totals stay exact", () => {
  const txs = Array.from({ length: 5000 }, (_, i) => ({ e2e: `E${i}`, name: "Name", iban: "NL91ABNA0417164300", bic: "ABNANL2A", amt: `${(i % 97) + 1}.${String(i % 100).padStart(2, "0")}`, ustrd: "x" }));
  const t0 = Date.now();
  const r = run(buildCreditTransfer({ date: "2026-10-07", groups: [{ id: "BIG", txs }] }));
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.transactions, 5000);
  assert.ok(Date.now() - t0 < 5000);
});
