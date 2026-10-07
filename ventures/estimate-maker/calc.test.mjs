import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, optionTotals, depositFor, validUntil, status, estimateValue, nextNumber, duplicateNumbers, pipeline, toInvoiceDraft, estimatesToCsv, acceptanceSentence, validate } from "./calc.mjs";

const est = (over = {}) => ({
  id: "e1", number: "EST-0001", clientName: "Acme", issued: "2026-10-01", validUntil: "2026-10-31", sent: true, sentOn: "2026-10-01",
  taxRate: 8, depositType: "percent", depositValue: 25, currency: "USD", scope: "Replace fence",
  options: [
    { name: "Basic", lines: [{ desc: "Labour", qty: 10, rate: "100", taxable: false }, { desc: "Posts", qty: 4, rate: "25", taxable: true }] },
    { name: "Premium", lines: [{ desc: "Labour", qty: 14, rate: "100", taxable: false }, { desc: "Cedar", qty: 1, rate: "900", taxable: true }, { desc: "Stain", qty: 1, rate: "150", taxable: true, optional: true }] },
  ],
  ...over,
});

test("option totals: tax only on taxable lines, add-ons reported separately", () => {
  const e = est();
  const basic = optionTotals(e, e.options[0]);
  assert.equal(basic.subtotal, 110000);
  assert.equal(basic.tax, 800); // 8% of the $100 of posts
  assert.equal(basic.total, 110800);
  const premium = optionTotals(e, e.options[1]);
  assert.equal(premium.total, 230000 + 7200);
  assert.equal(premium.addonTotal, 15000 + 1200);
  assert.equal(premium.addons.length, 1);
});

test("percent discount reduces the taxable base pro rata", () => {
  const e = est({ discountType: "percent", discountValue: 10 });
  const t = optionTotals(e, e.options[0]);
  assert.equal(t.discount, 11000);
  assert.equal(t.tax, 720);
});

test("deposit: percent, flat, capped at total, zero when off", () => {
  assert.equal(depositFor({ depositType: "percent", depositValue: 25 }, 110800), 27700);
  assert.equal(depositFor({ depositType: "amount", depositValue: "500" }, 110800), 50000);
  assert.equal(depositFor({ depositType: "amount", depositValue: "5000" }, 110800), 110800);
  assert.equal(depositFor({ depositType: "none" }, 110800), 0);
  assert.equal(depositFor({ depositType: "percent", depositValue: 25 }, 0), 0);
});

test("valid-until and status transitions", () => {
  assert.equal(validUntil("2026-10-01", 30), "2026-10-31");
  assert.equal(status(est({ sent: false }), "2026-10-05"), "draft");
  assert.equal(status(est(), "2026-10-05"), "sent");
  assert.equal(status(est(), "2026-10-31"), "sent");
  assert.equal(status(est(), "2026-11-01"), "expired");
  assert.equal(status(est({ outcome: "accepted" }), "2027-01-01"), "accepted");
  assert.equal(status(est({ outcome: "declined" }), "2026-10-05"), "declined");
});

test("estimate value is the lowest option until one is accepted", () => {
  assert.equal(estimateValue(est()), 110800);
  assert.equal(estimateValue(est({ outcome: "accepted", acceptedOption: 1 })), 237200);
  assert.equal(estimateValue({ options: [] }), 0);
});

test("numbering and duplicates", () => {
  assert.equal(nextNumber([]), "EST-0001");
  assert.equal(nextNumber([{ number: "EST-0009" }, { number: "EST-0010" }]), "EST-0011");
  assert.equal(nextNumber([{ number: "OTHER-7" }]), "EST-0001");
  assert.deepEqual(duplicateNumbers([{ number: "A" }, { number: "A" }, { number: "B" }]), ["A"]);
});

test("pipeline: win rate counts decided estimates only; follow-ups by age and value", () => {
  const list = [
    est({ id: "1", number: "EST-0001", outcome: "accepted", acceptedOption: 0 }),
    est({ id: "2", number: "EST-0002", outcome: "declined" }),
    est({ id: "3", number: "EST-0003", validUntil: "2026-10-05" }), // expired by 2026-10-10
    est({ id: "4", number: "EST-0004", sentOn: "2026-10-02" }), // open, 8 days quiet
    est({ id: "5", number: "EST-0005", sentOn: "2026-10-09" }), // open, 1 day
    est({ id: "6", number: "EST-0006", sent: false }), // draft ignored
  ];
  const p = pipeline(list, "2026-10-10");
  assert.equal(p.sent, 5);
  assert.equal(p.accepted, 1);
  assert.equal(p.declined, 1);
  assert.equal(p.expired, 1);
  assert.equal(p.open, 2);
  assert.equal(p.winRate, 1 / 3);
  assert.equal(p.wonValue, 110800);
  assert.equal(p.openValue, 2 * 110800);
  assert.deepEqual(p.followUp.map((f) => f.number), ["EST-0004"]);
});

test("pipeline with nothing decided has no win rate rather than zero", () => {
  assert.equal(pipeline([est()], "2026-10-05").winRate, null);
  assert.equal(pipeline([], "2026-10-05").winRate, null);
});

test("accepted estimate converts to an Invoice Maker draft", () => {
  const e = est({ outcome: "accepted", acceptedOption: 1, acceptedAddons: ["Stain"] });
  const inv = toInvoiceDraft(e, { depositPaid: true, issued: "2026-11-01" });
  assert.equal(inv.number, "INV-0001");
  assert.equal(inv.due, "2026-12-01");
  assert.equal(inv.lines.length, 3);
  assert.equal(inv.lines[2].desc, "Stain");
  assert.equal(inv.paid, "368.00".replace("368.00", (optionTotals(e, e.options[1]).deposit / 100).toFixed(2)));
  const without = toInvoiceDraft(est({ outcome: "accepted", acceptedOption: 0 }), {});
  assert.equal(without.paid, "");
  assert.equal(without.lines.length, 2);
});

test("csv is formula-safe and lists the accepted option", () => {
  const csv = estimatesToCsv([est({ clientName: "=HYPERLINK(\"x\")", outcome: "accepted", acceptedOption: 1 })], "2026-10-05");
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /accepted,2,1108\.00,2372\.00,Premium,2372\.00/);
});

test("acceptance sentence names expiry, deposit and that it is not a fixed contract", () => {
  const s = acceptanceSentence(est(), 27700);
  assert.match(s, /valid until 2026-10-31/);
  assert.match(s, /\$277\.00/);
  assert.match(s, /not a fixed-price contract/);
});

test("validation lists what is missing", () => {
  assert.deepEqual(validate(est({ fromName: "Me" })), []);
  const v = validate({ options: [{ name: "", lines: [] }, { name: "B", lines: [] }] });
  assert.ok(v.length >= 6);
  assert.ok(v.some((m) => /expiry/.test(m)));
  assert.ok(v.some((m) => /scope/i.test(m)));
  assert.ok(validate(est({ fromName: "Me", validUntil: "2026-09-01" })).some((m) => /before the issue date/.test(m)));
  assert.ok(validate(est({ fromName: "Me", options: [{ name: "", lines: est().options[0].lines }, { name: "X", lines: [] }] })).some((m) => /Name each option/.test(m)));
});

test("toCents stays exact", () => assert.equal(toCents("1.005"), 101));
