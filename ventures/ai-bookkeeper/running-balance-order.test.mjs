// A statement whose rows are in neither file order still has a running balance
// that chains: same-day rows listed newest-first inside an oldest-first file.
// Rows are made up (amounts echo the layout of csv2ofx's Schwab balance-test
// sample, MIT, read only).
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const head = `"Date","Status","Type","CheckNumber","Description","Withdrawal","Deposit","RunningBalance"\n`;
const csv = (lines) => head + lines.join("\n") + "\n";

test("same-day rows listed the other way round still chain", () => {
  const r = readStatement(csv([
    `"08/17/2022","Posted","DEPOSIT","","Deposit","","$20.00","$878.47"`,
    `"08/17/2022","Posted","ATM","","Cash out","$103.00","","$858.47"`,
    `"08/04/2022","Posted","ACH","","Transfer","$57.27","","$1,036.47"`,
    `"08/09/2022","Posted","CHECK","558","Check","$75.00","","$961.47"`,
  ]), {});
  const c = checkRunningBalance(r.rows);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.reordered, true);
  assert.equal(c.opening, 109374);
  assert.equal(c.closing, 87847);
});

test("a file in plain order is not marked reordered", () => {
  const r = readStatement(csv([
    `"08/04/2022","Posted","ACH","","Transfer","$57.27","","$1,036.47"`,
    `"08/09/2022","Posted","CHECK","558","Check","$75.00","","$961.47"`,
  ]), {});
  const c = checkRunningBalance(r.rows);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.reordered, undefined);
});

test("a missing row still breaks, however the rows are ordered", () => {
  const r = readStatement(csv([
    `"08/17/2022","Posted","DEPOSIT","","Deposit","","$20.00","$878.47"`,
    `"08/17/2022","Posted","ATM","","Cash out","$103.00","","$858.47"`,
    `"08/04/2022","Posted","ACH","","Transfer","$57.27","","$1,036.47"`,
    `"08/09/2022","Posted","CHECK","558","Check","$5.00","","$961.47"`,
  ]), {});
  const c = checkRunningBalance(r.rows);
  assert.ok(c.breaks.length > 0);
  assert.equal(c.reordered, undefined);
});
