import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeEntities } from "./xmlent.mjs";
import { readStatement } from "./bank.mjs";
import { readCamt } from "./sepa.mjs";

test("named, decimal and hex references decode in one pass", () => {
  assert.equal(decodeEntities("AT&amp;T &lt;X&gt; &#35;99 &#x23;1 &quot;q&quot; &apos;"), `AT&T <X> #99 #1 "q" '`);
  assert.equal(decodeEntities("&amp;lt; once, &lt; twice"), "&lt; once, < twice");
  assert.equal(decodeEntities("&bogus; &#0; &#99999999; &#xD800;"), "&bogus; &#0; &#99999999; &#xD800;");
});

test("an OFX payee with a numeric reference reads as written by the bank", () => {
  const ofx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-12.50<FITID>1<NAME>AT&amp;T BILL &#35;99</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  assert.equal(readStatement(ofx, {}).rows[0].desc, "AT&T BILL #99");
});

test("a camt.053 remittance text is not decoded twice", () => {
  const x = `<Document><BkToCstmrStmt><Stmt><Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-01-31</Dt></Dt></Bal><Ntry><Amt Ccy="EUR">5.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-01-05</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>Use &amp;lt;b&amp;gt; &#35;7</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>`;
  assert.equal(readCamt(x).rows[0].desc, "Use &lt;b&gt; #7");
});

test("an OFX payee the bank escaped twice reads as its intended text", () => {
  const ofx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-1.00<FITID>1<NAME>TPAY &amp;lt;DEFTPYMT&amp;gt;<MEMO>B.C. HYDRO &amp;amp; POWER</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  assert.equal(readStatement(ofx, {}).rows[0].desc, "TPAY <DEFTPYMT> B.C. HYDRO & POWER");
});
