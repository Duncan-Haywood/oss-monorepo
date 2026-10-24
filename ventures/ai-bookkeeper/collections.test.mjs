import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments } from "./accruals.mjs";
import { setProfile } from "./invoice.mjs";
import { reminders, toneFor } from "./collections.mjs";

const csv = "type,number,date,due,party,amount,account\n" +
  "invoice,1,2026-01-01,2026-01-31,Acme <Co>,500.00,4000\n" +
  "invoice,2,2026-03-01,2026-03-31,Acme <Co>,250.00,4000\n" +
  "invoice,3,2026-04-01,2026-05-01,Bolt Ltd,100.00,4000\n" +
  "invoice,4,2026-04-20,2026-05-20,Cleo,900.00,4000\n" +
  "bill,9,2026-03-02,,Hosting,50.00,6130\n";
const books = () => setProfile(setProfile(addDocuments(newBooks(), csv).books, "name", "Studio & Sons"), "payTo", "IBAN XX00");

test("tone steps up with days late", () => {
  assert.equal(toneFor(3), "friendly");
  assert.equal(toneFor(15), "firm");
  assert.equal(toneFor(45), "final");
  assert.equal(toneFor(20, { firm: 30, final: 60 }), "friendly");
});

test("reminders: one per customer, oldest first, not-yet-due left out, payments reduce", () => {
  const r = reminders(books(), { asOf: "2026-05-10" });
  assert.deepEqual(r.map((x) => x.party), ["Acme <Co>", "Bolt Ltd"]);
  assert.equal(r[0].tone, "final");
  assert.equal(r[0].overdue, 75000);
  assert.equal(r[1].tone, "friendly");
  assert.match(r[0].subject, /^Final reminder: 2 invoices/);
  assert.match(r[1].text, /payment of invoice 3/);
  const b = books();
  b.documents.find((d) => d.number === "1").payments = [{ cents: 50000 }];
  const r2 = reminders(b, { asOf: "2026-05-10" });
  assert.equal(r2.find((x) => x.party === "Acme <Co>").overdue, 25000);
  assert.equal(reminders(books(), { asOf: "2026-05-10", min: 30000 }).length, 1);
});
