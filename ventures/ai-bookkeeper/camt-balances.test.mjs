// Found by running MugenLab/ledgerbridge's tests/fixtures (MIT, cloned at run time,
// nothing copied; entries made up): a pending CAMT entry was booked, a reversal
// was booked backwards, and rows that miss the statement's own balances passed silently.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const bal = (cd, amt, ind = "CRDT") => `<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${amt}</Amt><CdtDbtInd>${ind}</CdtDbtInd><Dt><Dt>2026-04-30</Dt></Dt></Bal>`;
const ntry = (amt, ind, extra = "", sts = "<Sts><Cd>BOOK</Cd></Sts>") => `<Ntry><Amt Ccy="EUR">${amt}</Amt><CdtDbtInd>${ind}</CdtDbtInd>${sts}${extra}<BookgDt><Dt>2026-04-07</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>x</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
const doc = (...parts) => `<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt>${parts.join("")}</Stmt></BkToCstmrStmt></Document>`;

test("a reversal keeps the direction the entry states", () => {
  const r = readStatement(doc(bal("OPBD", "500.00"), bal("CLBD", "355.00"), ntry("120.00", "DBIT"), ntry("25.00", "DBIT", "<RvslInd>true</RvslInd>")));
  assert.deepEqual(r.rows.map((x) => x.cents), [-12000, -2500]);
  assert.equal(r.problems.length, 0);
});

test("a pending entry is not booked", () => {
  const r = readStatement(doc(bal("OPBD", "100.00"), bal("CLBD", "90.00"), ntry("10.00", "DBIT"), ntry("999.99", "DBIT", "", "<Sts><Cd>PDNG</Cd></Sts>")));
  assert.deepEqual(r.rows.map((x) => x.cents), [-1000]);
  assert.ok(r.problems.some((p) => /pending/.test(p)));
  assert.ok(!r.problems.some((p) => /add up/.test(p)));
});

test("rows that miss the statement's opening and closing balance are flagged", () => {
  const r = readStatement(doc(bal("OPBD", "100.00"), bal("CLBD", "40.00"), ntry("10.00", "DBIT")));
  assert.ok(r.problems.some((p) => /do not add up.*difference of -50\.00/.test(p)), r.problems.join("|"));
});

test("MT940 rows are checked against :60F: and :62F:", () => {
  const f = (close) => `:20:X\n:25:NL01BANK0123456789\n:28C:1\n:60F:C260401EUR100,00\n:61:2604070407D10,00NTRFNONREF\n:86:Coffee\n:62F:C260430EUR${close}\n`;
  assert.equal(readStatement(f("90,00")).problems.length, 0);
  assert.ok(readStatement(f("40,00")).problems.some((p) => /do not add up/.test(p)));
});

test("a reversal written in its original direction is flipped when only that balances", () => {
  const r = readStatement(doc(bal("OPBD", "500.00"), bal("CLBD", "355.00"), ntry("120.00", "DBIT"), ntry("25.00", "CRDT", "<RvslInd>true</RvslInd>")));
  assert.deepEqual(r.rows.map((x) => x.cents), [-12000, -2500]);
  assert.equal(r.problems.length, 0);
});
