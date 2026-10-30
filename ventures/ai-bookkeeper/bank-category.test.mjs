// The bank's own Category column is a weak last-resort hint (rows made up here, Chase card layout).
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement } from "./engine.mjs";
import { suggest } from "./categorize.mjs";

const csv = [
  "Transaction Date,Post Date,Description,Category,Type,Amount",
  "03/01/2026,03/02/2026,QWERTY HOLDINGS 4411,Food & Drink,Sale,-23.40",
  "03/03/2026,03/04/2026,ZZZ PLC 22,Shopping,Sale,-80.00",
  "03/05/2026,03/06/2026,KLM THING 77,Travel,Sale,-310.00",
].join("\n");

test("an unknown merchant falls back to the bank's category, and only for unambiguous labels", () => {
  const books = importStatement(newBooks(), csv, "1010").books;
  const by = (d) => books.transactions.find((t) => t.desc.startsWith(d));
  assert.equal(by("QWERTY").suggestion.account, "6130");
  assert.equal(by("QWERTY").suggestion.source, "bank-category");
  assert.equal(by("QWERTY").status, "review");
  assert.equal(by("ZZZ").suggestion.account, null);
  assert.equal(by("KLM").suggestion.account, "6120");
});
test("a keyword still wins over the bank's category, and money in is never guessed from it", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  assert.equal(suggest({ desc: "STARBUCKS 123", cents: -500, bankCat: "Travel" }, model).source, "built-in");
  assert.equal(suggest({ desc: "MYSTERY CO", cents: 5000, bankCat: "Travel" }, model).account, null);
});

test("interest and business-income labels suggest an income account on money in; a travel label still does not", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  assert.equal(suggest({ desc: "MYSTERY CO", cents: 5000, bankCat: "Interest Income" }, model).account, "4200");
  assert.equal(suggest({ desc: "MYSTERY CO", cents: -5000, bankCat: "Interest Income" }, model).account, null);
  assert.equal(suggest({ desc: "MYSTERY CO", cents: -5000, bankCat: "Fees & Charges" }, model).account, "6010");
});

test("Capital One, Discover and Chase fee, interest, fuel and travel labels map; broad ones do not", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  const acct = (c) => suggest({ desc: "NOBODY KNOWS 9", cents: -1000, bankCat: c }, model).account;
  assert.equal(acct("Fee/Interest Charge"), "6040");
  assert.equal(acct("Fees & Adjustments"), "6010");
  assert.equal(acct("Gas/Automotive"), "6160");
  assert.equal(acct("Gasoline"), "6160");
  assert.equal(acct("Other Travel"), "6120");
  assert.equal(acct("Phone/Cable"), "6140");
  assert.equal(acct("Home Improvement"), "6100");
  for (const c of ["Shopping", "Merchandise", "Services", "Home", "Personal", "Miscellaneous", "Groceries"]) assert.equal(acct(c), null, c);
});
