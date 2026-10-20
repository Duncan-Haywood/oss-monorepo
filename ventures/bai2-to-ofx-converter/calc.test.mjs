import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleFile, sampleBrokenFile, statementsOf, exportEntries, toOfx, toQif, toXeroCsv, accountId } from "./calc.mjs";

const stmts = () => statementsOf(validate(sampleFile()));
const NOW = "2026-10-05T00:00:00Z";

test("sample file reads clean and yields one statement per account block", () => {
  const r = validate(sampleFile());
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  const s = statementsOf(r);
  assert.equal(s.length, 2);
  assert.equal(s[0].entries.length, 6);
  assert.equal(s[0].opening.amount, 1250000);
  assert.equal(s[0].closing.amount, 1541700);
  assert.equal(s[0].date, "2026-10-02");
});

test("credits are positive, debits negative, in decimal dollars", () => {
  const ofx = toOfx(stmts()[0], { now: NOW });
  assert.match(ofx, /<TRNTYPE>CREDIT<DTPOSTED>20261002120000<TRNAMT>4200\.00</);
  assert.match(ofx, /<TRNTYPE>DEBIT<DTPOSTED>20261002120000<TRNAMT>-1900\.00</);
  assert.match(ofx, /<LEDGERBAL><BALAMT>15417\.00<DTASOF>20261002120000<\/LEDGERBAL>/);
});

test("net of exported amounts equals closing minus opening (the file converts what it checked)", () => {
  for (const s of stmts()) {
    const net = exportEntries(s).reduce((a, e) => a + e.signed, 0);
    assert.equal(s.opening.amount + net, s.closing.amount);
  }
});

test("account number is masked unless asked for", () => {
  const s = stmts()[0];
  assert.equal(accountId(s), "XXXX4567");
  assert.equal(accountId(s, { fullAccount: true }), "0001234567");
  assert.match(toOfx(s, { now: NOW }), /<ACCTID>XXXX4567</);
  assert.match(toOfx(s, { now: NOW, fullAccount: true }), /<ACCTID>0001234567</);
});

test("FITIDs are stable across runs and unique for identical same-day entries", () => {
  const a = exportEntries(stmts()[0]).map((e) => e.fitid);
  const b = exportEntries(stmts()[0]).map((e) => e.fitid);
  assert.deepEqual(a, b);
  const dup = { ...stmts()[0] };
  dup.entries = [dup.entries[0], dup.entries[0]];
  const ids = exportEntries(dup).map((e) => e.fitid);
  assert.equal(new Set(ids).size, 2);
  assert.match(ids[1], /-2$/);
});

test("names are at most 32 characters and ASCII; ampersands are escaped", () => {
  const s = { ...stmts()[0], entries: [{ ...stmts()[0].entries[0], text: "CAFÉ & BAR WITH A VERY LONG DESCRIPTION INDEED", custRef: "", bankRef: "" }] };
  const e = exportEntries(s)[0];
  assert.ok(e.name.length <= 32);
  assert.match(e.name, /^[\x20-\x7e]+$/);
  const ofx = toOfx(s, { now: NOW });
  assert.match(ofx, /<NAME>CAFE &amp; BAR WITH A VERY LONG DESC</);
});

test("OFX is SGML-shaped: header, one account, credit-card variant swaps the aggregates", () => {
  const ofx = toOfx(stmts()[0], { now: NOW });
  assert.match(ofx, /^OFXHEADER:100\r\nDATA:OFXSGML/);
  assert.match(ofx, /<BANKACCTFROM><BANKID>000000000<ACCTID>XXXX4567<ACCTTYPE>CHECKING<\/BANKACCTFROM>/);
  const cc = toOfx(stmts()[0], { now: NOW, accountType: "credit" });
  assert.match(cc, /<CREDITCARDMSGSRSV1>/);
  assert.doesNotMatch(cc, /BANKACCTFROM/);
  assert.match(toOfx(stmts()[0], { now: NOW, bankId: "021000021", accountType: "savings" }), /<BANKID>021000021<ACCTID>XXXX4567<ACCTTYPE>SAVINGS/);
});

test("QIF and Xero CSV carry the same entries", () => {
  const s = stmts()[0];
  const qif = toQif(s);
  assert.equal(qif.split("\r\n").filter((l) => l === "^").length, 6);
  assert.match(qif, /^!Type:Bank\r\nD10\/02\/2026\r\nT4200\.00/);
  const csv = toXeroCsv(s, { dateOrder: "dmy" }).trim().split("\r\n");
  assert.equal(csv[0], "*Date,*Amount,Payee,Description,Reference");
  assert.equal(csv.length, 7);
  assert.match(csv[1], /^02\/10\/2026,4200\.00,/);
  assert.match(toXeroCsv(s, { dateOrder: "mdy" }), /\n10\/02\/2026,/);
});

test("CSV cells with commas are quoted", () => {
  const s = { ...stmts()[0], entries: [{ ...stmts()[0].entries[0], text: "ACME, INC", custRef: "R1" }] };
  assert.match(toXeroCsv(s), /"ACME, INC"/);
});

test("non credit/debit codes are set aside, not guessed at", () => {
  const s = statementsOf(validate(sampleFile().replace("16,175,420000", "16,725,420000")));
  assert.equal(s[0].skipped.length, 1);
  assert.equal(s[0].entries.length, 5);
});

test("a hand-edited file still reports its errors and still converts what it can read", () => {
  const r = validate(sampleBrokenFile());
  assert.ok(r.findings.some((f) => f.severity === "error"));
  assert.ok(statementsOf(r).length >= 1);
});

test("an empty or non-BAI2 input yields no statements, not a throw", () => {
  assert.deepEqual(statementsOf(validate("")), []);
  assert.deepEqual(statementsOf(validate("hello world")), []);
});

test("the converter never touches the network", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});

test("a file with no transaction records counts zero transactions, not an empty list", () => {
  // The summary once declared `transactions` twice (0, then []), so the later
  // [] won and a file without 16 records rendered as ",  transactions" on the
  // page. Found by `tsc --checkJs` (TS1117, duplicate object key).
  const noDetail = sampleFile().split(/\r?\n/).filter((l) => !l.startsWith("16,") && !l.startsWith("88,")).join("\n");
  assert.equal(validate(noDetail).summary.transactions, 0);
});
