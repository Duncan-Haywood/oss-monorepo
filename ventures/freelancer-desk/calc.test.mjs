import { test } from "node:test";
import assert from "node:assert/strict";
import { readStore, invoiceTotals, invoiceStatus, receivables, incomeFor, pipeline, estimateValue, timeSummary, deductible, expenseSummary, nextTaxDue, setAside, buildDesk, makeBackup, checkBackup, deskToCsv, BACKUP_KIND } from "./calc.mjs";
import { sampleBoxes } from "./sample.mjs";

const inv = (o) => ({ number: "INV-1", clientName: "A", issued: "2026-03-01", due: "2026-03-31", sent: true, lines: [{ qty: "10", rate: "100", taxable: true }], paid: "", ...o });

test("invoice totals: discount before tax, shipping added, paid subtracted", () => {
  const t = invoiceTotals(inv({ discountType: "percent", discountValue: "10", taxRate: "10", shipping: "5", paid: "100" }));
  assert.equal(t.revenue, 90000);
  assert.equal(t.total, 90000 + 9000 + 500);
  assert.equal(t.balance, 99500 - 10000);
});

test("invoice status: paid, overdue, partial, draft, void", () => {
  const today = "2026-04-10";
  assert.equal(invoiceStatus(inv({ paid: "1000" }), today), "paid");
  assert.equal(invoiceStatus(inv(), today), "overdue");
  assert.equal(invoiceStatus(inv({ paid: "5", due: "2026-05-01" }), today), "partial");
  assert.equal(invoiceStatus(inv({ sent: false }), today), "draft");
  assert.equal(invoiceStatus(inv({ void: true }), today), "void");
});

test("receivables age from the due date and list the biggest overdue first", () => {
  const r = receivables([inv({ number: "A", lines: [{ qty: "1", rate: "100" }], due: "2026-03-31" }), inv({ number: "B", lines: [{ qty: "1", rate: "900" }], due: "2026-02-01" }), inv({ number: "C", due: "2026-06-01" }), inv({ number: "D", sent: false })], "2026-04-10");
  assert.equal(r.outstanding, 10000 + 90000 + 100000);
  assert.equal(r.overdue, 100000);
  assert.deepEqual(r.chase.map((c) => c.number), ["B", "A"]);
  assert.equal(r.buckets.d1_30, 10000);
  assert.equal(r.buckets.d61_90, 90000);
  assert.equal(r.buckets.current, 100000);
  assert.equal(r.drafts, 1);
});

test("income excludes sales tax and counts only the paid share", () => {
  const i = inv({ taxRate: "10", paid: "550" }); // total 1100, paid half
  const r = incomeFor([i, inv({ issued: "2025-12-30", paid: "1000" }), inv({ void: true, paid: "1000" })], 2026);
  assert.equal(r.cents, 50000);
  assert.equal(r.invoicedCents, 100000);
  assert.equal(r.count, 1);
});

test("pipeline: open value, follow-ups, win rate over decided estimates only", () => {
  const e = (o) => ({ number: "E", clientName: "C", issued: "2026-04-01", sentOn: "2026-04-01", validUntil: "2026-05-30", sent: true, options: [{ lines: [{ qty: "1", rate: "1000" }] }, { lines: [{ qty: "1", rate: "2000" }] }], ...o });
  const p = pipeline([e({}), e({ outcome: "accepted", acceptedOption: 1 }), e({ outcome: "declined" }), e({ sent: false }), e({ validUntil: "2026-04-05" })], "2026-04-10");
  assert.equal(p.open, 1);
  assert.equal(p.openValue, 100000);
  assert.equal(p.winRate, 1 / 3);
  assert.equal(p.followUp.length, 1);
  assert.equal(estimateValue(e({ outcome: "accepted", acceptedOption: 1 })), 200000);
});

test("time: unbilled value rounds up per entry; billed and non-billable are skipped; client from project", () => {
  const now = Date.UTC(2026, 3, 10);
  const box = { projects: [{ name: "P", client: "Acme", rate: "100" }], settings: { rounding: "15", defaultRate: "50" }, entries: [
    { start: now - 1e6, manualSec: 3600 + 60, project: "P" },          // 1h01 -> 1h15 at $100
    { start: now - 1e6, manualSec: 3600, project: "P", billed: true },
    { start: now - 1e6, manualSec: 3600, billable: false },
    { start: now - 1e6, manualSec: 1800, client: "Zed" },              // default $50
  ] };
  const t = timeSummary(box, now, 2026);
  assert.equal(t.byClient.Acme.unbilled, 12500);
  assert.equal(t.byClient.Zed.unbilled, 2500);
  assert.equal(t.unbilled, 15000);
  assert.equal(t.unbilledHours, 1.75);
});

test("a running timer is counted and flagged", () => {
  const now = Date.UTC(2026, 3, 10, 12);
  const t = timeSummary({ entries: [{ start: now - 3600e3, end: null, client: "A", rate: "60" }], settings: {}, projects: [] }, now, 2026);
  assert.equal(t.runningCount, 1);
  assert.equal(t.unbilled, 6000);
});

test("expenses: meals half, personal zero, business-use percent, receipts flagged", () => {
  assert.equal(deductible({ cents: 10000, category: "meals" }), 5000);
  assert.equal(deductible({ cents: 10000, category: "personal" }), 0);
  assert.equal(deductible({ cents: 10000, category: "office", bizPct: 30 }), 3000);
  const s = expenseSummary([{ date: "2026-02-01", cents: 8000, category: "office" }, { date: "2026-02-01", cents: 8000, category: "office", receipt: true }, { date: "2025-02-01", cents: 9000, category: "office" }], 2026);
  assert.equal(s.deductible, 16000);
  assert.equal(s.missingReceipts, 1);
});

test("next estimated-tax date rolls through the year", () => {
  assert.deepEqual(nextTaxDue("2026-01-02"), { date: "2026-01-15", label: "Q4 2025", days: 13 });
  assert.equal(nextTaxDue("2026-04-15").date, "2026-04-15");
  assert.equal(nextTaxDue("2026-04-16").date, "2026-06-15");
  assert.equal(nextTaxDue("2026-09-16").date, "2027-01-15");
  assert.equal(nextTaxDue("junk"), null);
});

test("set-aside is a share of positive profit only, capped at 70%", () => {
  assert.equal(setAside(100000, 25), 25000);
  assert.equal(setAside(-5, 25), 0);
  assert.equal(setAside(100000, 99), 70000);
  assert.equal(setAside(100000, "x"), 0);
});

test("desk joins the four tools and ranks actions by dollars", () => {
  const today = "2026-10-07", now = Date.UTC(2026, 9, 7, 12);
  const d = buildDesk(sampleBoxes(today, now), { today, now, ratePct: 25, taxPaid: 100000 });
  assert.equal(d.present.invoices && d.present.time && d.present.estimates && d.present.expenses, true);
  assert.ok(d.receivables.overdue > 0 && d.time.unbilled > 0 && d.pipeline.openValue > 0);
  assert.equal(d.atStake, d.receivables.outstanding + d.time.unbilled + d.pipeline.openValue);
  assert.equal(d.net, d.income.cents - d.expenses.deductible);
  assert.equal(d.setAsideGap, d.setAside - 100000);
  const vals = d.actions.map((a) => a.value);
  assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
  assert.ok(d.actions.some((a) => a.kind === "receipt"));
  assert.equal(d.nextTaxDue.date, "2027-01-15");
});

test("desk works with no data at all and with one tool only", () => {
  const empty = buildDesk({ estimates: null, time: null, invoices: null, expenses: null }, { today: "2026-10-07" });
  assert.equal(empty.atStake, 0);
  assert.deepEqual(empty.actions, []);
  assert.equal(Object.values(empty.present).some(Boolean), false);
  const one = buildDesk({ invoices: { invoices: [inv({})] } }, { today: "2026-10-07" });
  assert.equal(one.receivables.overdue, 100000);
  assert.equal(one.clients[0].client, "A");
});

test("per-client rows carry an effective hourly rate only when both sides exist", () => {
  const today = "2026-10-07", now = Date.UTC(2026, 9, 7);
  const d = buildDesk({ invoices: { invoices: [inv({ issued: "2026-05-01", due: "2026-06-01", paid: "1000", lines: [{ qty: "1", rate: "1000" }] }), inv({ clientName: "B", issued: "2026-05-01", paid: "1000" })] }, time: { entries: [{ start: Date.UTC(2026, 4, 1), manualSec: 10 * 3600, client: "A", billed: true }], settings: {}, projects: [] } }, { today, now });
  assert.equal(d.clients.find((c) => c.client === "A").effectiveRate, 10000);
  assert.equal(d.clients.find((c) => c.client === "B").effectiveRate, null);
});

test("damaged or foreign stores read as absent, never throw", () => {
  assert.equal(readStore("invoices", "{not json"), null);
  assert.equal(readStore("invoices", "[1,2]"), null);
  assert.equal(readStore("invoices", '{"invoices":"x"}'), null);
  assert.equal(readStore("nope", "{}"), null);
  assert.deepEqual(readStore("expenses", '{"entries":[]}'), { entries: [] });
  const d = buildDesk({ invoices: { invoices: [null, 5, "x", inv({})] }, estimates: { estimates: [null] }, time: { entries: [null] }, expenses: { entries: [null] } }, { today: "2026-10-07" });
  assert.equal(d.receivables.outstanding, 100000);
});

test("backup round-trips every present store and rejects other files", () => {
  const texts = { invoices: '{"invoices":[{"number":"INV-1"}]}', time: "garbage", expenses: '{"entries":[]}' };
  const b = makeBackup(texts, "2026-10-07");
  assert.equal(b.kind, BACKUP_KIND);
  assert.deepEqual(Object.keys(b.stores).sort(), ["expenses", "invoices"]);
  const ok = checkBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(ok.ok, true);
  assert.equal(checkBackup({ kind: "other", stores: {} }).ok, false);
  assert.equal(checkBackup(null).ok, false);
  assert.equal(checkBackup({ kind: BACKUP_KIND, stores: {} }).ok, false);
  assert.equal(checkBackup({ kind: BACKUP_KIND, stores: { invoices: { invoices: 3 } } }).ok, false);
  // unknown store names are ignored, not written
  const x = checkBackup({ kind: BACKUP_KIND, stores: { invoices: { invoices: [] }, evil: { a: 1 } } });
  assert.deepEqual(Object.keys(x.stores), ["invoices"]);
});

test("csv neutralises spreadsheet formulas in client names", () => {
  const d = buildDesk({ invoices: { invoices: [inv({ clientName: "=HYPERLINK(1)" })] } }, { today: "2026-10-07" });
  assert.match(deskToCsv(d), /'=HYPERLINK\(1\)/);
});
