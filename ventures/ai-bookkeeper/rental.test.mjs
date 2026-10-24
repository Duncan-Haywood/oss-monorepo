import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, parseSplit } from "./engine.mjs";
import { addRentalAccounts, addProperty, tagProperty, scheduleE, scheduleECsv } from "./rental.mjs";

const CSV = `Date,Description,Amount
2026-01-01,RENT OAK ST TENANT,1500.00
2026-01-01,RENT ELM ST TENANT,1200.00
2026-01-05,PLUMBER OAK ST,-300.00
2026-01-06,STATE FARM LANDLORD POLICY,-100.00
2026-01-07,MORTGAGE INTEREST ELM,-400.00
2026-01-08,LAWN CARE,-50.00
`;
function setup() {
  let { books } = importStatement(addRentalAccounts(newBooks()), CSV, "1000");
  const id = (s) => books.transactions.find((t) => t.desc.includes(s)).id;
  books = confirm(books, { [id("OAK ST TENANT")]: "4300", [id("ELM ST TENANT")]: "4300", [id("PLUMBER")]: "6090", [id("STATE FARM")]: "6030", [id("MORTGAGE")]: "6210", [id("LAWN")]: "6230" });
  books = addProperty(addProperty(books, { id: "oak", name: "12 Oak St" }), { id: "elm", name: "9 Elm St" });
  return books;
}

test("lines are tagged by text and land in each property's column", () => {
  let books = setup();
  books = tagProperty(books, "oak", { match: "oak st" }).books;
  books = tagProperty(books, "elm", { match: "elm" }).books;
  const se = scheduleE(books);
  const oak = se.properties.find((p) => p.id === "oak"), elm = se.properties.find((p) => p.id === "elm");
  assert.equal(oak.rents, 150000);
  assert.equal(oak.net, 150000 - 30000);
  assert.equal(elm.rents, 120000);
  assert.equal(elm.lines.find((l) => l.line === "12").cents, 40000);
  const un = se.properties.find((p) => p.id === "(unassigned)");
  assert.equal(un.totalExpenses, 15000, "insurance and lawn care are untagged");
  assert.ok(se.warnings.some((w) => /not tagged/.test(w)));
  assert.equal(se.total.net, 270000 - 85000);
});

test("a single property takes everything untagged", () => {
  let books = setup();
  books.properties = [books.properties[0]];
  const se = scheduleE(books);
  assert.equal(se.properties.length, 1);
  assert.equal(se.properties[0].rents, 270000);
  assert.ok(!se.warnings.some((w) => /not tagged/.test(w)));
});

test("tagging by account, removal and bad input", () => {
  let books = setup();
  const r = tagProperty(books, "oak", { account: "6090" });
  assert.equal(r.tagged, 1);
  assert.equal(tagProperty(r.books, null, { account: "6090" }).tagged, 1);
  assert.throws(() => tagProperty(books, "nope", { match: "x" }), /No property/);
  assert.throws(() => tagProperty(books, "oak", {}), /Say which lines/);
  assert.throws(() => addProperty(books, { id: "bad id" }), /property id/);
});

test("a split line carries its part's property, and the CSV lists accounts", () => {
  let { books } = importStatement(addRentalAccounts(newBooks()), "Date,Description,Amount\n2026-02-01,HARDWARE STORE,-200.00\n", "1000");
  books = addProperty(addProperty(books, { id: "a", name: "A" }), { id: "b", name: "B" });
  const t = books.transactions[0];
  books = confirm(books, { [t.id]: parseSplit("6100:-120.00,6100:-80.00") });
  books.transactions[0].split[0].property = "a";
  books.transactions[0].split[1].property = "b";
  const se = scheduleE(books);
  assert.equal(se.properties.find((p) => p.id === "a").totalExpenses, 12000);
  assert.equal(se.properties.find((p) => p.id === "b").totalExpenses, 8000);
  assert.match(scheduleECsv(se), /^Property,Line,Description,Account,Amount\nA,15,Supplies,6100 Supplies and materials,120.00/);
});

test("an unknown expense account goes to line 19 and is flagged", () => {
  let { books } = importStatement(addRentalAccounts(newBooks()), "Date,Description,Amount\n2026-02-01,PEST CO,-90.00\n", "1000");
  books.accounts.push({ code: "6777", name: "Pest control", type: "expense" });
  books = confirm(books, { [books.transactions[0].id]: "6777" });
  books = addProperty(books, { id: "a", name: "A" });
  const se = scheduleE(books);
  assert.deepEqual(se.unmapped.map((u) => u.code), ["6777"]);
  assert.equal(se.properties[0].other[0].cents, 9000);
  assert.equal(scheduleE(books, { map: { 6777: "14" } }).unmapped.length, 0);
});
