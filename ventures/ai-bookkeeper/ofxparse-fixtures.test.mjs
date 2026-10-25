// Swept jseutter/ofxparse's tests/fixtures (24 OFX/QFX files, MIT, cloned at run time,
// nothing copied; rows made up): every file with a bank statement read, and the three
// deliberately broken ones were reported, not dropped. These pin that behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const wrap = (trn) => `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n${trn}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`;
const trn = (date, amt) => `<STMTTRN><TRNTYPE>OTHER</TRNTYPE><DTPOSTED>${date}</DTPOSTED><TRNAMT>${amt}</TRNAMT><FITID>1</FITID><NAME>Test</NAME></STMTTRN>`;

test("an empty DTPOSTED is reported, and good rows beside it still import", () => {
  const r = readStatement(wrap(trn("", "200.00") + trn("20140102", "-80.00")));
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2014-01-02", -8000]]);
  assert.equal(r.problems.length, 1);
});

test("an impossible month in DTPOSTED is reported, not guessed", () => {
  const r = readStatement(wrap(trn("201120000000", "120.00")));
  assert.equal(r.rows.length, 0);
  assert.equal(r.problems.length, 1);
});

test("a statement with an empty BANKTRANLIST says so", () => {
  const r = readStatement(wrap(""));
  assert.equal(r.rows.length, 0);
  assert.equal(r.problems.length, 1);
});
