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

// Actual Budget's mocks/files/utf-8-bom.csv (MIT; fetched at run time, not
// copied) is a Hungarian bank export with a "Partner név" header, dotted dates
// and a UTF-8 BOM; its only two rows have no partner. Header kept, rows made up.
test("Hungarian export with 'Partner név' and dotted dates names the payee", () => {
  const head = ["Felhasználónév", "Számlaszám", "Könyvelés dátuma", "Összeg", "Devizanem", "Partner név", "Közlemény"];
  const csv = [head, ["x", "1160-0006", "2025.12.04", "-1250", "HUF", "Tesco Budapest", ""], ["x", "1160-0006", "2025.12.01", "90000", "HUF", "Acme Kft", ""]]
    .map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const r = readStatement("﻿" + csv);
  assert.deepEqual(r.rows.map((x) => [x.date, x.desc, x.cents]), [
    ["2025-12-04", "Tesco Budapest", -125000],
    ["2025-12-01", "Acme Kft", 9000000],
  ]);
});
