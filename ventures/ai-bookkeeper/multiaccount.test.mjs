// One CSV that names the account on every row (the Mint export shape, seen in
// the MIT-licensed csv2ofx project's sample file, which also uses bare CR line
// breaks). Rows here are rewritten in that shape, not a real download.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { newBooks, importStatement, importCsvAccounts } from "./engine.mjs";

const mint = [
  "Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels,Notes",
  '6/12/15,Transfer to Savings,Account Transfer,"1,000.00",debit,Transfer,Checking,,',
  '6/12/15,Transfer from Checking,Account Transfer,"1,000.00",credit,Transfer,Savings,,',
  "6/13/15,Staples,STAPLES 123,45.10,debit,Office Supplies,Visa Card,,",
  '6/14/15,Client payment,ACH CLIENT,"2,500.00",credit,Income,Checking,,',
].join("\r");

test("a Mint-shaped file with bare CR breaks reads signs from the type column and names its accounts", () => {
  const r = readStatement(mint);
  assert.deepEqual(r.accountNames, ["Checking", "Savings", "Visa Card"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-100000, 100000, -4510, 250000]);
});

test("a single-account file reports no account names", () => {
  assert.equal(readStatement("Date,Description,Amount,Account\n2026-01-02,Coffee,-4.50,Checking\n").accountNames, undefined);
});

test("importCsvAccounts splits by account name and pairs the transfer", () => {
  const r = importCsvAccounts(newBooks(), mint, { Checking: "1000", Savings: "1010", "Visa Card": "2000" });
  assert.equal(r.added, 4);
  assert.deepEqual(r.books.transactions.filter((t) => t.account === "1000").map((t) => t.cents), [-100000, 250000]);
  assert.equal(r.books.transactions.filter((t) => t.status === "transfer").length, 2);
  const again = importCsvAccounts(r.books, mint, { Checking: "1000", Savings: "1010", "Visa Card": "2000" });
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 4);
});

test("a name left out of the map is not imported and is reported", () => {
  const r = importCsvAccounts(newBooks(), mint, { Checking: "1000" });
  assert.equal(r.added, 2);
  assert.ok(r.problems.some((p) => p.includes("Visa Card")));
  assert.ok(importStatement(newBooks(), mint, "1000", { onlyAccount: "Savings" }).added === 1);
});

test("a Quicken QIF with several !Account sections splits per account and pairs transfers", async () => {
  const { splitQif } = await import("./bank.mjs");
  const { importQifAccounts, newBooks } = await import("./engine.mjs");
  const qif = [
    "!Option:AutoSwitch", "!Account", "NChecking", "TBank", "^",
    "!Type:Bank", "D03/01/2026", "T-200.00", "PTransfer to Visa", "^", "D03/02/2026", "T-12.50", "PCoffee Shop", "^",
    "!Account", "NVisa Card", "TCCard", "^",
    "!Type:CCard", "D03/01/2026", "T200.00", "PPayment thank you", "^", "",
  ].join("\r\n");
  const parts = splitQif(qif);
  assert.deepEqual(parts.map((p) => p.id), ["Checking", "Visa Card"]);
  assert.equal(parts[0].type, "Bank");
  const r = importQifAccounts(newBooks({}), qif, { Checking: "1000", "Visa Card": "2000" });
  assert.equal(r.added, 3);
  assert.equal(r.books.transactions.filter((t) => t.account === "2000").length, 1);
  const part = importQifAccounts(newBooks({}), qif, { Checking: "1000" });
  assert.equal(part.added, 2);
  assert.ok(part.problems.some((p) => /Visa Card/.test(p)));
  assert.deepEqual(splitQif("!Type:Bank\nD03/01/2026\nT-1\n^\n"), []);
});
