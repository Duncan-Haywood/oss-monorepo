// Found by reading Kresus's checking.ofx fixture (MIT, cloned at run time, nothing
// copied; rows made up): a bank that sends DTUSER and no DTPOSTED lost the row.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

test("an OFX transaction with only DTUSER takes that date", () => {
  const ofx = "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>INT\n<DTUSER>20120928\n<TRNAMT>19.90\n<FITID>1\n<MEMO>Credit Interest Paid\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20120907\n<DTUSER>20120905\n<TRNAMT>-5.00\n<FITID>2\n<MEMO>Fee\n</STMTTRN>\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n";
  const r = readStatement(ofx);
  assert.equal(r.problems.length, 0);
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2012-09-28", 1990], ["2012-09-07", -500]]);
});
