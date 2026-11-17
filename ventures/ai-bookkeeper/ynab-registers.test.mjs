// YNAB register exports (eval/ynab-registers.mjs, 2026-11-15). The lines below are made up in
// YNAB's register layout; the real registers are fetched at run time and never committed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { suggest, buildMemory } from "./categorize.mjs";
import { hideCategories, plainCategory, scoredRows, YNAB_MAP } from "./eval/ynab-registers.mjs";

const cold = (desc, cents = -2500) => suggest({ desc, cents }, { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null });

const REGISTER = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","05/02/2025","Seattle Public Utilities","Bills: 💡 Utilities","Bills","💡 Utilities","",$84.10,$0.00,"Cleared"
"Card","","05/03/2025","Transfer : Car Loan","Needs: 🚙 Car Payment","Needs","🚙 Car Payment","",$209.20,$0.00,"Cleared"
"Card","","05/04/2025","Uptown Espresso","Fun: Coffee Shop & Pastries","Fun","Coffee Shop & Pastries","",$6.25,$0.00,"Cleared"
"Checking","","05/05/2025","Paycheck","Inflow: Ready to Assign","Inflow","Ready to Assign","",$0.00,$1500.00,"Cleared"
`;

test("every column that names the category is blanked before the reader sees the register", () => {
  const { text, labels } = hideCategories(REGISTER);
  assert.ok(!/Bills|Coffee Shop|Car Payment|Ready to Assign/.test(text.split("\n").slice(1).join("\n")));
  assert.deepEqual(labels.slice(1, 4), ["Utilities", "Car Payment", "Coffee Shop & Pastries"]);
  const read = readStatement(text);
  assert.equal(read.rows.length, 4);
  assert.ok(read.rows.every((r) => !r.bankCat));
});

test("emoji in front of a household category are dropped before the lookup", () => {
  assert.equal(plainCategory("🏋️‍♂️ Gym Membership"), "Gym Membership");
  assert.equal(plainCategory("\u{1F6DC} Wifi"), "Wifi");
  assert.deepEqual(YNAB_MAP[plainCategory("🍽️ Dining out")], ["6130"]);
});

test("transfers between the household's own accounts are not scored", () => {
  const read = readStatement(hideCategories(REGISTER).text);
  assert.deepEqual(scoredRows(read.rows).map((r) => r.desc), ["Seattle Public Utilities", "Uptown Espresso", "Paycheck"]);
});

test("cleaned payee names the built-in keywords now know", () => {
  for (const [desc, want] of [
    ["Seattle Public Utilities", "6140"], ["Seattle City Light", "6140"], ["Uptown Espresso", "6130"],
    ["WSDOT Good To Go", "6160"], ["Impark", "6160"], ["YNAB", "6060"], ["HLU*HULUPLUS", "6060"],
    ["ComEd", "6140"], ["Ventra", "6120"], ["Maverik", "6160"], ["Tires.com", "6160"], ["Utah DMV", "6110"],
    ["RealPage Resident Payment", "6080"],
  ]) assert.equal(cold(desc).account, want, desc);
});

test("streaming and personal subscriptions still wait for a person", () => {
  for (const d of ["Netflix", "Audible", "Youtube", "Peloton", "Apple iTunes", "Amazon Prime Membership"]) assert.equal(cold(d).account, null, d);
});

test("a fuel brand's convenience store is not sent to fuel by the YNAB rules", () => {
  assert.notEqual(cold("CONOCO - CITYMART CONO").account, "6160");
});
