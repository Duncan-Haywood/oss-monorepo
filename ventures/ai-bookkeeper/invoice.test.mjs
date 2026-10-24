import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments } from "./accruals.mjs";
import { renderInvoice, setProfile } from "./invoice.mjs";

const csv = "type,number,date,due,party,amount,account,description\n" +
  "invoice,7,2026-03-01,2026-03-31,Acme <Co>,1000.00,4000,Site audit\n" +
  "invoice,7,2026-03-01,2026-03-31,Acme <Co>,80.00,2100,\n" +
  "bill,9,2026-03-02,,Hosting,50.00,6130,\n";
const books = () => setProfile(addDocuments(newBooks(), csv).books, "name", "Studio & Sons");

test("lines, tax, total and balance agree with the document", () => {
  const r = renderInvoice(books(), "7", { asOf: "2026-03-10" });
  assert.equal(r.balance, 108000);
  assert.equal(r.status, "due");
  assert.match(r.html, /Site audit/);
  assert.match(r.html, /Sales tax/);
  assert.match(r.html, /Balance due/);
  assert.match(r.html, /1,080\.00/);
});

test("names are escaped and overdue is flagged with days", () => {
  const r = renderInvoice(books(), "INV-7", { asOf: "2026-04-10" });
  assert.equal(r.status, "overdue");
  assert.match(r.html, /10 days overdue/);
  assert.match(r.html, /Acme &lt;Co&gt;/);
  assert.match(r.html, /Studio &amp; Sons/);
  assert.doesNotMatch(r.html, /<Co>/);
});

test("payments reduce the balance; fully paid shows a paid stamp", () => {
  const b = books();
  b.documents[0].payments = [{ cents: 50000 }];
  assert.equal(renderInvoice(b, "7").balance, 58000);
  b.documents[0].payments = [{ cents: 108000 }];
  const r = renderInvoice(b, "7");
  assert.equal(r.status, "paid");
  assert.doesNotMatch(r.html, /Balance due/);
});

test("a bill or unknown number is refused; bad profile key is refused", () => {
  assert.throws(() => renderInvoice(books(), "BILL-9"), /bill you owe/);
  assert.throws(() => renderInvoice(books(), "99"), /no document/);
  assert.throws(() => setProfile(newBooks(), "colour", "red"), /profile key/);
});
