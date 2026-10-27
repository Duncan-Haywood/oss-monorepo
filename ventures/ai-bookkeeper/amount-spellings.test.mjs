// Amount spellings found in exports from other locales and spreadsheets: each
// must read the same cents as plain -4.50 / 2500.00 / -1234.56 (rows made up).
// Probed 2026-10-27; no fault found, so this pins behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

const mk = (a, b, c) => `Date,Description,Amount\n2026-03-01,COFFEE SHOP,"${a}"\n2026-03-01,COFFEE SHOP,"${a}"\n2026-03-02,PAYROLL,"${b}"\n2026-03-03,BIG BUY,"${c}"\n`;
const cents = (t) => readStatement(t).rows.map((r) => r.cents);
const want = [-450, -450, 250000, -123456];

const FORMS = {
  "unicode minus": ["−4.50", "2500.00", "−1 234.56".replace(" ", "")],
  "Swiss apostrophe": ["-4.50", "2'500.00", "-1'234.56"],
  "no-break space": ["-4.50", "2 500.00", "-1 234.56"],
  "narrow no-break space": ["-4.50", "2 500.00", "-1 234.56"],
  "plus sign": ["-4.50", "+2500.00", "-1234.56"],
  "euro prefix": ["-€4.50", "€2500.00", "-€1234.56"],
  "ISO code suffix": ["-4.50 USD", "2500.00 USD", "-1234.56 USD"],
  "DR/CR suffix": ["4.50 DR", "2500.00 CR", "1234.56 DR"],
  "dollar in parentheses": ["($4.50)", "$2,500.00", "($1,234.56)"],
  "currency code prefix": ["USD -4.50", "USD 2,500.00", "USD -1,234.56"],
  "European decimals": ["-4,50", "2.500,00", "-1.234,56"],
  "European with euro suffix": ["-4,50 €", "2.500,00 €", "-1.234,56 €"],
};
for (const [name, f] of Object.entries(FORMS)) test(`amount spelled with ${name}`, () => assert.deepEqual(cents(mk(...f)), want));

test("Indian lakh grouping reads as one number", () => {
  assert.equal(cents(mk("-4.50", "25,00,000.00", "-1,234.56"))[2], 250000000);
});
