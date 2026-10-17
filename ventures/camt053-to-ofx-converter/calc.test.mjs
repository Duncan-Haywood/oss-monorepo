import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, analyze, sampleCamt, sampleMt940, sampleBroken, transactionsCsv, findingsCsv,
  toMinor, money, ibanState, maskAccount, toOfx, toQif, toXeroCsv, exportEntries, accountId,
} from "./calc.mjs";

const codes = (r) => r.findings.map((x) => x.code);

test("both worked examples are clean and hold the same two entries", () => {
  for (const [text, fmt] of [[sampleCamt(), /^camt/], [sampleMt940(), /^MT940$/]]) {
    const r = validate(text);
    assert.deepEqual(codes(r), ["CLEAN"]);
    assert.match(r.summary.format, fmt);
    assert.equal(r.summary.entries, 2);
    assert.deepEqual(r.statements[0].entries.map((e) => e.amount), [150000, -3550]);
  }
});

test("amounts are parsed without floating point and respect the currency's decimals", () => {
  assert.equal(toMinor("1234,56", "EUR"), 123456);
  assert.equal(toMinor("0.1", "EUR"), 10);
  assert.equal(toMinor("1500", "JPY"), 1500);
  assert.equal(toMinor("1500.5", "JPY"), null);
  assert.equal(toMinor("abc", "EUR"), null);
  assert.equal(money(123456789), "1,234,567.89");
  assert.equal(money(-5), "-0.05");
});

test("IBAN state: valid, wrong check digits, wrong length, and not an IBAN at all", () => {
  assert.equal(ibanState("DE89 3704 0044 0532 0130 00").ok, true);
  assert.equal(ibanState("DE89370400440532013001").ok, false);
  assert.match(ibanState("DE8937040044053201300").why, /22 characters/);
  assert.equal(ibanState("37040044/0532013000"), null);
  assert.equal(maskAccount("DE89370400440532013000"), "…3000");
});

test("a hand-edited closing balance is reported with the amount it is off by, in either format", () => {
  const mt = validate(sampleMt940().replace("C261003EUR11464,50", "C261003EUR11564,50"));
  const bal = mt.findings.find((x) => x.code === "BALANCE");
  assert.match(bal.title, /off by 100\.00/);
  const camt = validate(sampleCamt().replace("11464.50", "11000.00"));
  assert.match(camt.findings.find((x) => x.code === "BALANCE").title, /off by -464\.50/);
});

test("a duplicated reference and an impossible date are flagged", () => {
  const c = codes(validate(sampleBroken()));
  assert.ok(c.includes("DUP_REF"));
  assert.ok(c.includes("DATE"));
  assert.ok(c.includes("BALANCE"));
});

test("MT940 reversals flip the sign: RC reduces the balance, RD raises it", () => {
  const t = sampleMt940().replace(":61:2610031003C1500,00", ":61:2610031003RC1500,00").replace("C261003EUR11464,50", "C261003EUR8464,50");
  const r = validate(t);
  assert.equal(r.statements[0].entries[0].amount, -150000);
  assert.deepEqual(codes(r), ["CLEAN"]);
});

test("MT940 entry date across a year end takes the value date's neighbouring year", () => {
  const t = sampleMt940().replace(":61:2610031003C", ":61:2601010101C").replace(":61:2610031003D", ":61:2601020102D");
  const e = analyze(t).statements[0].entries[0];
  assert.equal(e.valueDate, "2026-01-01");
  const t2 = sampleMt940().replace(":61:2610031003C", ":61:2601011231C");
  assert.equal(analyze(t2).statements[0].entries[0].bookDate, "2025-12-31");
});

test("MT940 :86: structured subfields give the counterparty and the remittance text", () => {
  const e = analyze(sampleMt940()).statements[0].entries[0];
  assert.equal(e.counterparty, "Muster Tischlerei GmbH");
  assert.match(e.text, /Rechnung 1041 Oktober/);
});

test("an MT940 wrapped in a SWIFT {4: block with continuation lines still reads", () => {
  const t = `{1:F01BANKDEFFAXXX0000000000}{2:O9400000000000BANKDEFFAXXX00000000000000000000N}{4:\n${sampleMt940().replace("Rechnung 1041 Oktober?32", "Rechnung 1041\nOktober?32")}-}`;
  const r = validate(t);
  assert.equal(r.summary.entries, 2);
  assert.deepEqual(codes(r), ["CLEAN"]);
});

test("two MT940 statements on one account must join up", () => {
  const second = sampleMt940().replace("STARTUMS", "NEXT").replace(":60F:C261002EUR10000,00", ":60F:C261003EUR11000,00").replace("C261003EUR11464,50", "C261003EUR12464,50");
  const r = validate(sampleMt940() + second);
  assert.ok(codes(r).includes("CONTINUITY"));
  const ok = sampleMt940().replace("STARTUMS", "NEXT").replace(":60F:C261002EUR10000,00", ":60F:C261003EUR11464,50").replace(":62F:C261003EUR11464,50", ":62F:C261003EUR12929,00");
  const joined = validate(sampleMt940() + ok);
  assert.ok(!codes(joined).includes("CONTINUITY"));
});

test("camt: a reversal indicator flips the sign and pending entries stay out of the balance", () => {
  const rev = sampleCamt().replace("<Sts>BOOK</Sts>\n        <BookgDt><Dt>2026-10-03</Dt></BookgDt>\n        <ValDt><Dt>2026-10-03</Dt></ValDt>\n        <AcctSvcrRef>BK0002", "<RvslInd>true</RvslInd><Sts>BOOK</Sts>\n        <BookgDt><Dt>2026-10-03</Dt></BookgDt>\n        <ValDt><Dt>2026-10-03</Dt></ValDt>\n        <AcctSvcrRef>BK0002");
  assert.equal(analyze(rev).statements[0].entries[1].amount, 3550);
  const pend = sampleCamt().replace("<Sts>BOOK</Sts>", "<Sts>PDNG</Sts>");
  const r = validate(pend);
  assert.ok(codes(r).includes("PENDING"));
  assert.ok(codes(r).includes("BALANCE"));
});

test("camt: malformed XML and a non-camt document are reported, not thrown", () => {
  assert.ok(codes(validate("<Document><BkToCstmrStmt><Stmt></Document>")).includes("XML"));
  assert.ok(codes(validate("<Document><Other/></Document>")).includes("STRUCTURE"));
  assert.ok(codes(validate("")).includes("EMPTY"));
  assert.ok(codes(validate("hello there")).includes("STRUCTURE"));
});

test("camt: a bad IBAN on the statement is a warning", () => {
  assert.ok(codes(validate(sampleCamt().replace("DE89370400440532013000", "DE89370400440532013001"))).includes("IBAN"));
});

test("the transactions CSV masks accounts by default, signs amounts and neutralises formulas", () => {
  const t = sampleMt940().replace("Rechnung 1041 Oktober", "=SUM(A1)");
  const csv = transactionsCsv(validate(t));
  assert.doesNotMatch(csv, /DE89370400440532013000/);
  assert.match(csv, /,-35\.50,EUR/);
  assert.match(csv, /"'=SUM\(A1\)"/);
  assert.match(transactionsCsv(validate(t), { maskAccounts: false }), /DE89370400440532013000/);
});

test("the findings CSV never contains an unmasked account", () => {
  const csv = findingsCsv(validate(sampleBroken()));
  assert.doesNotMatch(csv, /DE89370400440532013000/);
});

const stmt = (text = sampleCamt()) => validate(text).statements[0];
const NOW = "2026-10-05T00:00:00";

test("OFX has the SGML header, one STMTTRN per booked entry, signs, and the closing balance", () => {
  const ofx = toOfx(stmt(), { now: NOW });
  assert.match(ofx, /^OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102/);
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 2);
  assert.match(ofx, /<CURDEF>EUR/);
  assert.match(ofx, /<TRNTYPE>CREDIT<DTPOSTED>20261003120000<TRNAMT>1500\.00/);
  assert.match(ofx, /<TRNTYPE>DEBIT<DTPOSTED>20261003120000<TRNAMT>-35\.50/);
  assert.match(ofx, /<LEDGERBAL><BALAMT>11464\.50<DTASOF>20261003120000/);
  assert.ok(ofx.endsWith("</OFX>\r\n"));
});

test("the same statement from camt and MT940 gives the same entries and IDs", () => {
  const a = exportEntries(stmt(sampleCamt())), b = exportEntries(stmt(sampleMt940()));
  assert.deepEqual(a.map((e) => [e.date, e.amount]), b.map((e) => [e.date, e.amount]));
});

test("FITIDs are stable across runs and distinct for identical same-day payments", () => {
  const s = stmt();
  const again = exportEntries(s).map((e) => e.fitid);
  assert.deepEqual(exportEntries(s).map((e) => e.fitid), again);
  const twin = { ...s, entries: [s.entries[1], { ...s.entries[1] }] };
  const ids = exportEntries(twin).map((e) => e.fitid);
  assert.equal(new Set(ids).size, 2);
  assert.match(ids[1], /-2$/);
});

test("account id is masked by default and the last 22 characters when full is chosen", () => {
  assert.equal(accountId(stmt()), "XXXX3000");
  assert.equal(accountId(stmt(), { fullAccount: true }), "DE89370400440532013000");
  assert.equal(accountId({ account: "" }), "UNKNOWN");
  assert.doesNotMatch(toOfx(stmt(), { now: NOW }), /DE89370400/);
});

test("pending entries are left out unless asked for", () => {
  const s = stmt();
  s.entries.push({ ...s.entries[0], status: "PDNG", amount: 100, ref: "P1", bankRef: "P1" });
  assert.equal(exportEntries(s).length, 2);
  assert.equal(exportEntries(s, { includePending: true }).length, 3);
});

test("OFX text is escaped, ASCII, and NAME is at most 32 characters", () => {
  const s = stmt();
  s.entries[0] = { ...s.entries[0], counterparty: "Müller & Söhne <Bäckerei> Zürich Straße 12 GmbH & Co KG", text: "Rechnung <1> & Ärger" };
  const ofx = toOfx(s, { now: NOW });
  const name = /<NAME>(.*?)<MEMO>/.exec(ofx)[1];
  assert.equal(name, "Muller &amp; Sohne &lt;Backerei&gt; Zurich");
  assert.ok(!/&[a-z]*$/.test(name), "an entity is never cut in half");
  assert.doesNotMatch(ofx, /[^\x00-\x7f]/);
  assert.match(ofx, /Rechnung &lt;1&gt; &amp; Arger/);
});

test("credit-card type writes the CC message set without a bank id", () => {
  const ofx = toOfx(stmt(), { now: NOW, accountType: "credit" });
  assert.match(ofx, /<CREDITCARDMSGSRSV1>/);
  assert.doesNotMatch(ofx, /<BANKID>/);
});

test("QIF uses MM/DD/YYYY, a signed amount, a payee line and a terminator per entry", () => {
  const qif = toQif(stmt());
  assert.match(qif, /^!Type:Bank\r\nD10\/03\/2026\r\nT1500\.00\r\nPMuster Tischlerei GmbH\r\nMRechnung 1041 Oktober\r\n\^/);
  assert.equal((qif.match(/\^/g) || []).length, 2);
});

test("Xero CSV has the starred headers, the chosen date order, and unquoted numbers", () => {
  const lines = toXeroCsv(stmt(), { dateOrder: "dmy" }).trim().split("\r\n");
  assert.equal(lines[0], '"*Date","*Amount","Payee","Description","Reference"');
  assert.equal(lines[1], '03/10/2026,1500.00,"Muster Tischlerei GmbH","Rechnung 1041 Oktober","RE-2026-1041"');
  assert.match(lines[2], /^03\/10\/2026,-35\.50,/);
  assert.match(toXeroCsv(stmt(), { dateOrder: "mdy" }), /\n10\/03\/2026,/);
  assert.match(toXeroCsv(stmt()), /\n2026-10-03,/);
});

test("Xero CSV neutralises a payee that starts with a formula character and drops placeholder references", () => {
  const s = stmt();
  s.entries[1] = { ...s.entries[1], counterparty: "=HYPERLINK(\"x\")", ref: "NOTPROVIDED" };
  const csv = toXeroCsv(s);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /,"BK0002"\r\n$/);
});

test("zero-decimal currencies keep whole amounts in OFX", () => {
  const s = stmt();
  s.currency = "JPY";
  s.entries = s.entries.map((e) => ({ ...e, currency: "JPY", amount: e.amount > 0 ? 1500 : -35 }));
  s.closing = { ...s.closing, currency: "JPY", amount: 11465 };
  const ofx = toOfx(s, { now: NOW });
  assert.match(ofx, /<TRNAMT>1500</);
  assert.match(ofx, /<TRNAMT>-35</);
});

test("an empty statement still yields a well-formed OFX", () => {
  const s = { ...stmt(), entries: [] };
  const ofx = toOfx(s, { now: NOW });
  assert.match(ofx, /<BANKTRANLIST><DTSTART>20261003|<BANKTRANLIST><DTSTART>20261005/);
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 0);
});
