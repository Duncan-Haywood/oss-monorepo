// Mercury business downloads (README "Mercury business accounts", 2026-11-14): one file holds
// every account in "Source Account", the merchant category sits beside the owner's own, card
// lines carry the card's last four digits, and Failed charges never moved money. Rows are
// written here under the real header; no real row is copied.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { newBooks, importCsvAccounts, categorize } from "./engine.mjs";
import { suggest } from "./categorize.mjs";

const HEAD = "Date (UTC),Description,Amount,Status,Source Account,Bank Description,Reference,Note,Last Four Digits,Name On Card,Mercury Category,Category,GL Code,Timestamp,Original Currency,Check Number,Tags,Cardholder Email,Tracking ID";
const CSV = [
  HEAD,
  "10-05-2026,Mercury Credit,-31.00,Sent,Mercury Checking xx1111,IO AUTOPAY,,,,,,,,10-05-2026 10:00:00,,,,,",
  "10-05-2026,Mercury Checking xx1111,31.00,Sent,Mercury Credit,IO AUTOPAY,,,,,,,,10-05-2026 10:00:00,,,,,",
  "10-04-2026,Intl. Transaction Fee,-0.62,Sent,Mercury Credit,,,,,,FinancialInstitutionsAndFees,,,10-04-2026 09:00:00,,,,,",
  "10-04-2026,Corner Bistro,-20.80,Sent,Mercury Credit,CORNER BISTRO,,,9876,Pat Example,Restaurants,,,10-04-2026 09:00:00,USD,,,,",
  "10-03-2026,Drive Rentals,-90.00,Sent,Mercury Credit,DRIVE RENTALS,,,9876,Pat Example,CarRental,,,10-03-2026 09:00:00,USD,,,,",
  "10-03-2026,Code Host,-12.00,Sent,Mercury Checking xx1111,CODE HOST,,,5432,Pat Example,Software,Office Supplies,,10-03-2026 09:00:00,USD,,,,",
  "10-02-2026,Code Host,-12.00,Failed,Mercury Checking xx1111,CODE HOST,,,5432,Pat Example,Software,,,10-02-2026 09:00:00,USD,,,,",
  "10-02-2026,Mercury Checking xx1111,-500.00,Sent,Second (Mercury Checking xx2222),Transfer between your Mercury accounts,,,,,,,,10-02-2026 08:00:00,,,,,",
  "10-02-2026,Second (Mercury Checking xx2222,500.00,Sent,Mercury Checking xx1111,Transfer between your Mercury accounts,,,,,,,,10-02-2026 08:00:00,,,,,",
  "10-01-2026,Client Co,1500.00,Received,Mercury Checking xx1111,CLIENT CO,,,,,,,,10-01-2026 08:00:00,,,,,",
].join("\n");

test("Source Account names every account in the file, so the page and CLI split it", () => {
  const r = readStatement(CSV);
  assert.equal(r.bank, "mercury");
  assert.deepEqual(r.accountNames.sort(), ["Mercury Checking xx1111", "Mercury Credit", "Second (Mercury Checking xx2222)"]);
  assert.equal(readStatement(CSV, { onlyAccount: "Mercury Credit" }).rows.length, 4);
});

test("Failed rows are skipped and Received deposits are kept", () => {
  const r = readStatement(CSV);
  assert.equal(r.rows.length, 9);
  assert.ok(r.problems.some((p) => /Failed/.test(p)));
  assert.equal(r.rows.find((x) => x.desc === "Client Co").cents, 150000);
});

test("the owner's Category wins; Mercury's merchant category fills a blank one", () => {
  const rows = readStatement(CSV).rows;
  assert.equal(rows.find((x) => x.desc === "Code Host").bankCat, "Office Supplies");
  assert.equal(rows.find((x) => x.desc === "Corner Bistro").bankCat, "Restaurants");
  assert.equal(rows.find((x) => x.desc === "Intl. Transaction Fee").bankCat, "FinancialInstitutionsAndFees");
});

test("Mercury's fee and car-rental categories name one account; Retail names none", () => {
  const model = { rules: [], memory: new Map(), classifier: { n: 0 } };
  const s = (desc, bankCat) => suggest({ desc, cents: -1000, bankCat }, model);
  assert.equal(s("Zzq Service Charge", "FinancialInstitutionsAndFees").account, "6010");
  assert.equal(s("Zzq Motors", "CarRental").account, "6120");
  assert.equal(s("Zzq Store", "Retail").account ?? null, null);
});

test("each card line keeps the card's last four digits, never the cardholder's name", () => {
  const rows = readStatement(CSV).rows;
  assert.equal(rows.find((x) => x.desc === "Drive Rentals").card, "9876");
  assert.ok(!JSON.stringify(rows).includes("Pat Example"));
});

test("split by account, the card autopay and the transfer between checking accounts pair up", () => {
  const map = { "Mercury Checking xx1111": "1000", "Mercury Credit": "2000", "Second (Mercury Checking xx2222)": "1010" };
  const r = importCsvAccounts(newBooks(), CSV, map);
  assert.equal(r.added, 9);
  const books = categorize(r.books);
  const tr = books.transactions.filter((t) => t.status === "transfer");
  assert.equal(tr.length, 4);
  assert.deepEqual(books.transactions.filter((t) => t.account === "2000").map((t) => t.cents).sort((a, b) => a - b), [-9000, -2080, -62, 3100]);
});
