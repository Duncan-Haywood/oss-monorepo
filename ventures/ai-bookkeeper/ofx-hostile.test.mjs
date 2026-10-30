import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Shapes seen in libofx's doc/ofx_sample_files (fuzzer crashes and spec examples; LGPL, cloned at
// run time, read only, nothing copied). The text below is made up in the same shapes.
const hostile = {
  notOfx: "this is totally not an ofx file\n",
  emptyShells: "<OFX>\n<SIGNONMSGSRSV1>\n<SONRS>\n<DKJHASDSTATUS>\n</dSTATUS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>\n",
  noTransactions: "<OFX>\n<CREDITCARDMSGSRSV1>\n<CCSTMTTRNRS>\n<CCSTMTRS>\n<CCACCTINFO>\n<ACCTID>\n</CCACCTFROM>\n</CCSTMTRS>\n</CCSTMTTRNRS>\n</CREDITCARDMSGSRSV1>\n</OFX>\n",
  brokenTags: "<OFX>\n<SIGNONMSGSRSV1>\n<STATUSCODE>0<OFX\n<<USEDE0\n</SIGNONMSGSRSV1>\n</STATUS>\n<STMTTRN>\n",
};

for (const [name, text] of Object.entries(hostile)) {
  test(`garbled OFX (${name}) neither throws nor books anything`, () => {
    const { rows, problems } = readStatement(text);
    assert.equal(rows.length, 0);
    assert.ok(problems.length > 0);
  });
}

test("SGML OFX with comments after the values reads the same cents", () => {
  const sgml = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CHECK<DTPOSTED>19961004 <!-- Posted on Oct. 4 -->
<TRNAMT>-200.00    <!-- $200.00 -->
<NAME>Check #1000
</STMTTRN>
<STMTTRN><TRNTYPE>ATM<DTPOSTED>19961020
<TRNAMT>-300.00
<NAME>ATM
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const { rows } = readStatement(sgml);
  assert.deepEqual(rows.map((r) => [r.date, r.cents, r.desc]), [["1996-10-04", -20000, "Check #1000"], ["1996-10-20", -30000, "ATM"]]);
});
