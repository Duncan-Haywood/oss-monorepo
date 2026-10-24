import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments, aging, settle } from "./accruals.mjs";
import { statement, renderStatement, customers } from "./statement.mjs";
import { setProfile } from "./invoice.mjs";

const csv = "type,number,date,due,party,amount,account,against\n" +
  "invoice,1,2026-01-05,2026-02-04,Acme <Co>,1000.00,4000,\n" +
  "invoice,2,2026-02-10,2026-03-12,Acme <Co>,500.00,4000,\n" +
  "credit note,1,2026-02-15,,Acme <Co>,100.00,4000,1\n" +
  "invoice,3,2026-02-01,2026-03-01,Other Ltd,70.00,4000,\n";
function books() {
  const b = addDocuments(newBooks(), csv).books;
  b.transactions.push({ id: "t1", date: "2026-02-20", desc: "ACME payment INV-1", cents: 90000, status: "new" });
  return settle(b);
}

test("running balance agrees with the aging table", () => {
  const b = books();
  const s = statement(b, "acme <co>", { asOf: "2026-04-01" });
  assert.deepEqual(s.rows.map((r) => r.kind), ["invoice", "invoice", "credit note", "payment"]);
  assert.equal(s.closing, 50000);
  assert.equal(s.overdue, 50000);
  const a = aging(b, "2026-04-01");
  assert.equal(a.receivable.total - 7000, s.closing);
});

test("a start date rolls earlier activity into a brought-forward balance", () => {
  const s = statement(books(), "Acme <Co>", { from: "2026-02-12", asOf: "2026-04-01" });
  assert.equal(s.opening, 150000);
  assert.deepEqual(s.rows.map((r) => r.kind), ["credit note", "payment"]);
  assert.equal(s.closing, 50000);
});

test("rendered page escapes names and shows payTo", () => {
  const b = setProfile(books(), "payTo", "IBAN 123");
  const r = renderStatement(b, "Acme <Co>", { asOf: "2026-04-01" });
  assert.match(r.html, /Acme &lt;Co&gt;/);
  assert.doesNotMatch(r.html, /<Co>/);
  assert.match(r.html, /Balance due/);
  assert.match(r.html, /IBAN 123/);
});

test("customers lists what each owes; unknown party is refused", () => {
  const c = customers(books());
  assert.equal(c.length, 2);
  assert.equal(c[0].party, "Acme <Co>");
  assert.equal(c[0].owed, 50000);
  assert.throws(() => statement(books(), "Nobody"), /no invoices/);
});
