import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, analyze, sampleCamt, sampleMt940, sampleBroken, transactionsCsv, findingsCsv,
  toMinor, money, ibanState, maskAccount,
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
