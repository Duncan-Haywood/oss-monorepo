// Chase business card downloads (a "Card" column per employee card), spend by card, and two
// fixes found on real downloads read 2026-11-14 (README "Chase business cards and a US Bank
// checking download"). Rows are written here under the real headers; no real row is copied.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStatement } from "./bank.mjs";
import { newBooks, importStatement, categorize, confirm } from "./engine.mjs";
import { suggest } from "./categorize.mjs";
import { cardSpend, cardLinesCsv, merchantName } from "./cards.mjs";

const CSV = [
  "Card,Transaction Date,Post Date,Description,Category,Type,Amount,Memo",
  "1111,03/31/2026,03/31/2026,Payment Thank You-Mobile,,Payment,900.00,",
  "1111,03/28/2026,03/29/2026,AMAZON MKTPL*AB12CD34E,Merchandise & Inventory,Sale,-40.00,",
  "1111,03/20/2026,03/21/2026,AMAZON MKTPL*ZZ98YY76X,Merchandise & Inventory,Sale,-60.00,",
  "2222,03/18/2026,03/19/2026,SQ *CORNER CAFE,Food & Drink,Sale,-12.50,",
  "2222,03/18/2026,03/19/2026,SQ *CORNER CAFE,Food & Drink,Sale,-12.50,",
  "2222,03/15/2026,03/16/2026,SHELL OIL 57444,Gas,Sale,-45.10,",
  "2222,03/12/2026,03/13/2026,SHELL OIL 57444,Gas,Return,5.10,",
  "XXXX-XXXX-XXXX-3333,03/10/2026,03/11/2026,DATAFEED API,Professional Services,Sale,-99.00,",
  ",03/31/2026,03/31/2026,PURCHASE INTEREST CHARGE,Fees & Adjustments,Fee,-7.25,",
].join("\n");

test("the business layout is named and each line keeps only its card's last four digits", () => {
  const r = readStatement(CSV);
  assert.equal(r.bank, "chase-business-card");
  assert.equal(r.rows.length, 9);
  assert.deepEqual(r.rows.map((x) => x.card ?? null), ["1111", "1111", "1111", "2222", "2222", "2222", "2222", "3333", null]);
  // The personal card layout (no Card column) is unchanged and carries no card.
  const p = readStatement("Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n03/18/2026,03/19/2026,SQ *CORNER CAFE,Food & Drink,Sale,-12.50,");
  assert.equal(p.bank, "chase-card");
  assert.equal(p.rows[0].card, undefined);
});

test("spend by card: charges, refunds and what still waits per card; the payment and account-level interest stay out", () => {
  let books = categorize(importStatement(newBooks(), CSV, "2000").books);
  assert.equal(books.transactions.length, 9, "two identical cafe lines on one card are both kept");
  const r = cardSpend(books);
  const by = Object.fromEntries(r.cards.map((c) => [c.card, c]));
  assert.deepEqual(Object.keys(by).sort(), ["1111", "2222", "3333"]);
  assert.equal(by["1111"].spend, 10000);
  assert.equal(by["1111"].lines, 2, "the payment row is not a cardholder's spend");
  assert.equal(by["2222"].spend, 7010);
  assert.equal(by["2222"].refunds, 510);
  assert.equal(by["2222"].net, 6500);
  assert.equal(by["1111"].merchants[0].name, "AMAZON MKTPL");
  assert.equal(by["1111"].merchants[0].lines, 2, "order numbers after the star do not split one merchant");
  assert.equal(r.payments, 1);
  assert.equal(r.unassigned.length, 1);
  assert.equal(r.unassigned[0].cents, 725);
  assert.ok(r.warnings.some((w) => /1 line on .* name no card \(\$7\.25\)/.test(w)));
  // Filing a line moves it from waiting to filed under its account.
  const fuel = books.transactions.find((t) => t.desc.startsWith("SHELL") && t.cents < 0);
  books = confirm(books, { [fuel.id]: "6160" });
  const after = cardSpend(books, { card: "2222" });
  assert.equal(after.cards.length, 1);
  assert.deepEqual(after.cards[0].filed.map((f) => [f.code, f.cents]), [["6160", 4510]]);
  assert.equal(after.cards[0].waiting.lines, 3);
  const csv = cardLinesCsv(books, { card: "2222" }).trim().split("\n");
  assert.equal(csv[0], "Card,Date,Description,Amount,Filed to,Status");
  assert.equal(csv.length, 5);
  assert.ok(csv.some((l) => /^2222,2026-03-15,SHELL OIL 57444,45\.10,6160 Vehicle and fuel,filed$/.test(l)), csv.join("\n"));
});

test("books with no card column say so instead of showing an empty report", () => {
  const books = importStatement(newBooks(), "Date,Description,Amount\n2026-03-01,COFFEE,-4.00\n2026-03-02,LUNCH,-9.00", "1000").books;
  const r = cardSpend(books);
  assert.equal(r.cards.length, 0);
  assert.match(r.warnings[0], /No bank line names a card/);
});

test("merchant names drop processor prefixes, order numbers and store numbers", () => {
  assert.equal(merchantName("SQ *FLOW TEA LLC"), "FLOW TEA LLC");
  assert.equal(merchantName("AMAZON MKTPL*5J45R8MC3"), "AMAZON MKTPL");
  assert.equal(merchantName("WALGREENS #5599"), "WALGREENS");
  assert.equal(merchantName("O'REILLY 1938"), "O'REILLY");
});

test("Chase's 'Professional Services' label no longer suggests legal and professional fees; 'Legal' still does", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  assert.equal(suggest({ desc: "DATAFEED API", cents: -9900, bankCat: "Professional Services" }, model).account, null);
  assert.equal(suggest({ desc: "NOBODY KNOWS 9", cents: -9900, bankCat: "Legal" }, model).account, "6050");
});

test("US Bank checking's card payments are transfers; other web payments are not", () => {
  const model = { rules: [], codes: null, classifier: { n: 0 } };
  const acct = (d) => suggest({ desc: d, cents: -10000 }, model).account;
  assert.equal(acct("INTERNET BANKING PAYMENT TO CREDIT CARD 1234"), "transfer");
  assert.equal(acct("WEB AUTHORIZED PMT AMERICANEXPRESS"), "transfer");
  assert.equal(acct("WEB AUTHORIZED PMT PAYPAL"), null);
  assert.equal(acct("WEB AUTHORIZED PMT DISCOVERY PLACE"), null, "a business named Discovery is not the card");
});

test("cli: cards prints spend per card and --csv the lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "cards-"));
  const f = join(dir, "biz.csv"), b = join(dir, "books.json");
  writeFileSync(f, CSV);
  execFileSync(process.execPath, ["cli.mjs", "import", f, "--account", "2000", "--books", b], { cwd: import.meta.dirname });
  const out = execFileSync(process.execPath, ["cli.mjs", "cards", "--books", b], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.match(out, /card 1111: 2 lines, spend \$100\.00/);
  assert.match(out, /card 2222: 4 lines, spend \$70\.10, refunds \$5\.10, net \$65\.00/);
  const csv = execFileSync(process.execPath, ["cli.mjs", "cards", "--books", b, "--csv", "--card", "3333"], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.equal(csv.trim().split("\n").length, 2);
});
