import test from "node:test";
import assert from "node:assert/strict";
import { readMt940 } from "./sepa.mjs";

// Layout seen in the Apache-2.0 mt940js test files (Polish banks): ":86:" opens with ">20" directly,
// no three-digit code, and lines wrap at word ends. Rows below are made up.
const file = [
  ":20:REF1", ":25:PL00000000000000000000000000", ":28C:1/1", ":60F:C260101PLN1000,00",
  ":61:260103D12,30FCHGNONREF",
  ":86:>20Faktura 12/2025 za hosting>31>32ACME HOSTING SP Z OO",
  "",
  ":61:260104D3,32FCHGNONREF",
  ":86:>20VB ELECTR. PLATNOSC KARTA 3.32 EUR 1 EUR=",
  "4.5385 PLN GOOGLE *SVCSAPPS>31>32",
  ":61:260105C500,00FCHGNONREF",
  ":86:>20Wplata od klienta>31123456>32JAN KOWALSKI",
  ":62F:C260105PLN1484,38", "",
].join("\r\n");

test("MT940 :86: starting with >20 reads name and purpose, not subfield codes", () => {
  const { rows, problems } = readMt940(file);
  assert.deepEqual(rows.map((r) => r.desc), [
    "ACME HOSTING SP Z OO Faktura 12/2025 za hosting",
    "VB ELECTR. PLATNOSC KARTA 3.32 EUR 1 EUR= 4.5385 PLN GOOGLE *SVCSAPPS",
    "JAN KOWALSKI Wplata od klienta",
  ]);
  assert.deepEqual(rows.map((r) => r.cents), [-1230, -332, 50000]);
  assert.deepEqual(problems, []);
});
