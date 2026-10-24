import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// The brokerage OFX layout (INVTRANLIST with BUYSTOCK, INCOME, INVBANKTRAN) was
// checked against a Fidelity-style sample in the ofxparse project's test
// fixtures (MIT; layout only, every value below is made up). Importing it booked
// the INVBANKTRAN cash lines and dropped the dividends without a word.
const ofx = (body) => `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><INVSTMTMSGSRSV1><INVSTMTTRNRS><INVSTMTRS><CURDEF>USD<INVTRANLIST><DTSTART>20240101<DTEND>20240131${body}</INVTRANLIST></INVSTMTRS></INVSTMTTRNRS></INVSTMTMSGSRSV1></OFX>`;
const buy = "<BUYSTOCK><INVBUY><INVTRAN><FITID>1<DTTRADE>20240105<MEMO>YOU BOUGHT</INVTRAN><UNITS>10<UNITPRICE>5<TOTAL>-50.00</INVBUY><BUYTYPE>BUY</BUYSTOCK>";
const div = "<INCOME><INVTRAN><FITID>2<DTTRADE>20240115<MEMO>DIVIDEND RECEIVED</INVTRAN><INCOMETYPE>DIV<TOTAL>+12.34</INCOME>";
const fee = "<INVEXPENSE><INVTRAN><FITID>3<DTTRADE>20240120<MEMO>ADVISORY FEE</INVTRAN><TOTAL>-5.00</INVEXPENSE>";

test("brokerage OFX: dividends and fees are booked, trades are reported as not booked", () => {
  const r = readStatement(ofx(buy + div + fee));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents, x.desc]), [
    ["2024-01-15", 1234, "DIVIDEND RECEIVED"],
    ["2024-01-20", -500, "ADVISORY FEE"],
  ]);
  assert.ok(r.problems.some((p) => /1 brokerage buy\/sell line was not booked/.test(p)));
});

test("brokerage OFX with only trades still says nothing was booked", () => {
  const r = readStatement(ofx(buy));
  assert.equal(r.rows.length, 0);
  assert.ok(r.problems.some((p) => /investment statement/.test(p)));
});
