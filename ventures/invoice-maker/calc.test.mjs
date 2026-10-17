import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, lineAmount, computeTotals, dueDate, addDays, lateFee, status, nextNumber, duplicateNumbers, receivables, invoicesToCsv, termsSentence, validate, percentOf, daysBetween } from "./calc.mjs";

test("cents conversion is exact for awkward floats", () => {
  assert.equal(toCents("1.005"), 101);
  assert.equal(toCents("$1,234.50"), 123450);
  assert.equal(toCents("abc"), 0);
  assert.equal(lineAmount({ qty: 3, rate: "19.99" }), 5997);
  assert.equal(lineAmount({ qty: 0.1, rate: "0.30" }), 3);
});

test("totals: discount before tax, non-taxable lines excluded", () => {
  const t = computeTotals({
    lines: [{ qty: 10, rate: 100, taxable: true }, { qty: 1, rate: 100, taxable: false }],
    discountType: "percent", discountValue: 10, taxRate: 8, shipping: 5, paid: 100,
  });
  assert.equal(t.subtotal, 110000);
  assert.equal(t.discount, 11000);
  assert.equal(t.taxableBase, 90000); // 100000 - 10% of the taxable lines
  assert.equal(t.tax, 7200);
  assert.equal(t.total, 110000 - 11000 + 7200 + 500);
  assert.equal(t.balance, t.total - 10000);
});

test("flat discount cannot exceed subtotal", () => {
  const t = computeTotals({ lines: [{ qty: 1, rate: 50 }], discountType: "amount", discountValue: 80, taxRate: 10 });
  assert.equal(t.discount, 5000);
  assert.equal(t.total, 0);
});

test("percentOf rounds half away from zero", () => {
  assert.equal(percentOf(1050, 10), 105);
  assert.equal(percentOf(1005, 10), 101);
  assert.equal(percentOf(-1005, 10), -101);
});

test("due dates cross month and leap boundaries", () => {
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(dueDate("2026-10-06", "net30"), "2026-11-05");
  assert.equal(dueDate("2026-12-20", "net15"), "2027-01-04");
  assert.equal(dueDate("2026-10-06", "custom", 10), "2026-10-16");
  assert.equal(dueDate("2026-10-06", "due_on_receipt"), "2026-10-06");
  assert.equal(addDays("not-a-date", 3), "");
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
});

test("late fee: flat plus whole months of percentage", () => {
  assert.deepEqual(lateFee(100000, 0, { flat: 25 }), { fee: 0, months: 0 });
  assert.deepEqual(lateFee(100000, 1, { flat: 25, monthlyPct: 1.5 }), { fee: 2500 + 1500, months: 1 });
  assert.deepEqual(lateFee(100000, 31, { monthlyPct: 1.5 }), { fee: 3000, months: 2 });
  assert.deepEqual(lateFee(0, 40, { flat: 25 }), { fee: 0, months: 0 });
});

const inv = (o) => ({ number: "INV-0001", lines: [{ qty: 1, rate: 100 }], taxRate: 0, ...o });

test("status lifecycle", () => {
  assert.equal(status(inv({}), "2026-10-06"), "draft");
  assert.equal(status(inv({ sent: true, due: "2026-10-10" }), "2026-10-06"), "sent");
  assert.equal(status(inv({ sent: true, due: "2026-10-01" }), "2026-10-06"), "overdue");
  assert.equal(status(inv({ sent: true, due: "2026-10-10", paid: 40 }), "2026-10-06"), "partial");
  assert.equal(status(inv({ sent: true, paid: 100 }), "2026-10-06"), "paid");
  assert.equal(status(inv({ sent: true, void: true }), "2026-10-06"), "void");
});

test("numbering continues and keeps zero padding", () => {
  assert.equal(nextNumber([]), "INV-0001");
  assert.equal(nextNumber([{ number: "INV-0009" }, { number: "INV-0012" }, { number: "OTHER-3" }]), "INV-0013");
  assert.equal(nextNumber([{ number: "A-00099" }], "A-"), "A-00100");
  assert.deepEqual(duplicateNumbers([{ number: "X1" }, { number: "X1" }, { number: "X2" }]), ["X1"]);
});

test("receivables ages from the due date and ignores drafts and paid", () => {
  const today = "2026-10-06";
  const r = receivables([
    inv({ number: "1", sent: true, due: "2026-10-20", clientName: "A" }),
    inv({ number: "2", sent: true, due: "2026-09-20", clientName: "A" }),
    inv({ number: "3", sent: true, due: "2026-06-01", clientName: "B" }),
    inv({ number: "4", clientName: "C" }),
    inv({ number: "5", sent: true, issued: "2026-02-01", paid: 100, clientName: "C" }),
  ], today);
  assert.equal(r.outstanding, 30000);
  assert.equal(r.buckets.current, 10000);
  assert.equal(r.buckets.d1_30, 10000);
  assert.equal(r.buckets.d90plus, 10000);
  assert.equal(r.byClient.A, 20000);
  assert.equal(r.paidYtd, 10000);
});

test("csv escapes quotes and neutralises spreadsheet formulas", () => {
  const csv = invoicesToCsv([inv({ clientName: '=HYPERLINK("x"),"Bob"', issued: "2026-10-01", due: "2026-10-31" })], "2026-10-06");
  assert.match(csv, /"'=HYPERLINK\(""x""\),""Bob"""/);
  assert.match(csv.split("\n")[0], /^Number,Client/);
});

test("terms sentence includes the late-fee clause only when set", () => {
  assert.equal(termsSentence({ terms: "net30", due: "2026-11-05" }), "Payment is due within 30 days of the invoice date (by 2026-11-05).");
  assert.match(termsSentence({ terms: "net15" }, { flat: 25, monthlyPct: 1.5 }), /flat late fee of \$25\.00 plus 1\.5% per month/);
  assert.equal(termsSentence({ terms: "due_on_receipt" }), "Payment is due on receipt.");
});

test("validation lists what a payer's AP team would bounce", () => {
  assert.equal(validate({ number: "1", clientName: "A", issued: "2026-10-01", fromName: "Me", payInstructions: "Zelle", lines: [{ desc: "Work", qty: 1, rate: 10 }] }).length, 0);
  const bad = validate({ lines: [] });
  assert.ok(bad.length >= 5);
  assert.ok(validate({ number: "1", clientName: "A", issued: "2026-10-05", due: "2026-10-01", fromName: "x", payInstructions: "y", lines: [{ desc: "d", qty: 1, rate: 1 }] }).some((m) => /before the issue/.test(m)));
});
