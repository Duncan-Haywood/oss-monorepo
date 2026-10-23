import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { xlsxToCsvSync } from "./xlsx.mjs";
import { readStatement } from "./bank.mjs";

// fixtures/otp-hu.xlsx: written with openpyxl in the layout of the OTP netbank
// export as the ofxstatement-otp plugin describes it (sheet "Tranzakciók",
// metadata rows, then Számlaszám / Ellenoldali számlaszám / ... / Összeg /
// Pénznem). Rows made up; header words other than the first two are my guess.
test("OTP-style Hungarian workbook: booking date, partner and signed amount are found under the preamble", () => {
  const r = readStatement(xlsxToCsvSync(readFileSync(new URL("./fixtures/otp-hu.xlsx", import.meta.url))));
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [
    ["2026-01-04", "KFC Budapest", -459000],
    ["2026-01-05", "Nagy Péter", -15000000],
    ["2026-01-09", "Acme Kft", 32000000],
  ]);
});
