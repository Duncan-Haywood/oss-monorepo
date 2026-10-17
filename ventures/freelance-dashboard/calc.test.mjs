import { test } from "node:test";
import assert from "node:assert/strict";
import { STORES, readStores, receivables, incomeSummary, invoiceStatus, pipeline, estimateValue, timeSummary, expenseSummary, netProfit, setAside, nextEstimatedTaxDate, overview, actions, buildBackup, parseBackup, exampleStores, formatMoney } from "./calc.mjs";

const TODAY = "2026-10-07";
const NOW = Date.parse("2026-10-07T12:00:00Z");
const ctx = { today: TODAY, now: NOW, ratePct: 30 };
const store = (map) => (k) => (k in map ? map[k] : null);
const line = (rate, qty = 1) => ({ desc: "x", qty, rate: String(rate), taxable: false });

test("readStores degrades per tool and survives junk", () => {
  const s = readStores(store({ [STORES.invoices]: "{not json", [STORES.estimates]: JSON.stringify({ estimates: [{}, null, 3] }) }));
  assert.deepEqual(s.found, { invoices: false, estimates: true, time: false, expenses: false });
  assert.equal(s.invoices.length, 0);
  assert.equal(s.estimates.length, 1);
  const thrower = readStores(() => { throw new Error("blocked"); });
  assert.equal(thrower.found.invoices, false);
});

test("invoice status and receivables age from the due date", () => {
  const invs = [
    { number: "A", clientName: "X", issued: "2026-08-01", due: "2026-08-31", sent: true, paid: "", lines: [line(1000)] },
    { number: "B", clientName: "Y", issued: "2026-10-01", due: "2026-10-31", sent: true, paid: "100", lines: [line(500)] },
    { number: "C", clientName: "Z", issued: "2026-10-01", due: "2026-10-01", sent: false, lines: [line(900)] },
    { number: "D", clientName: "Z", issued: "2026-10-01", due: "2026-10-01", sent: true, void: true, lines: [line(900)] },
    { number: "E", clientName: "Z", issued: "2026-09-01", due: "2026-09-30", sent: true, paid: "300", lines: [line(300)] },
  ];
  assert.equal(invoiceStatus(invs[0], TODAY), "overdue");
  assert.equal(invoiceStatus(invs[1], TODAY), "partial");
  assert.equal(invoiceStatus(invs[2], TODAY), "draft");
  assert.equal(invoiceStatus(invs[4], TODAY), "paid");
  const r = receivables(invs, TODAY);
  assert.equal(r.outstanding, 100000 + 40000);
  assert.equal(r.overdue, 100000);
  assert.equal(r.open[0].number, "A");
  assert.equal(r.open[0].daysLate, 37);
});

test("income: paid share excludes sales tax and drafts and voids are left out", () => {
  const invs = [
    { clientName: "X", issued: "2026-03-10", sent: true, paid: "110", taxRate: "10", lines: [line(100)] },
    { clientName: "Y", issued: "2026-03-10", sent: true, paid: "", lines: [line(300)] },
    { clientName: "Z", issued: "2026-03-10", sent: false, lines: [line(900)] },
    { clientName: "W", issued: "2025-03-10", sent: true, paid: "50", lines: [line(50)] },
  ];
  const s = incomeSummary(invs, 2026);
  assert.equal(s.paid, 10000);
  assert.equal(s.invoiced, 40000);
  assert.equal(s.byMonth[2], 10000);
  assert.equal(s.topClient, "Y");
  assert.equal(s.topShare, 0.75);
});

test("estimate value uses the cheapest option until one is accepted; pipeline win rate counts decided only", () => {
  const e = { options: [{ lines: [line(1000)] }, { lines: [line(2000)] }] };
  assert.equal(estimateValue(e), 100000);
  assert.equal(estimateValue({ ...e, outcome: "accepted", acceptedOption: 1 }), 200000);
  const p = pipeline([
    { ...e, sent: true, sentOn: "2026-09-30", number: "E1", clientName: "A", validUntil: "2026-11-01" },
    { ...e, sent: true, outcome: "accepted", acceptedOption: 0 },
    { ...e, sent: true, outcome: "declined" },
    { ...e, sent: false },
    { ...e, sent: true, validUntil: "2026-09-01" },
  ], TODAY);
  assert.equal(p.open, 1);
  assert.equal(p.openValue, 100000);
  assert.equal(p.decided, 3);
  assert.ok(Math.abs(p.winRate - 1 / 3) < 1e-9);
  assert.equal(p.followUp[0].days, 7);
});

test("time: unbilled by client with rounding, billed and non-billable excluded, runaway timer found", () => {
  const H = 3600e3;
  const t = { settings: { rounding: "15", defaultRate: "100" }, projects: [{ id: "p1", name: "Site", client: "Acme", rate: "120" }], entries: [
    { start: NOW - 5 * H, end: NOW - 5 * H + 1.1 * H, projectId: "p1", project: "Site" },
    { start: NOW - 4 * H, end: NOW - 3 * H, client: "Beta", billed: true },
    { start: NOW - 3 * H, end: NOW - 2 * H, client: "Beta", billable: false },
    { start: NOW - 14 * H, project: "Left on" },
  ] };
  const s = timeSummary(t, NOW);
  // 1.1h rounds up to 1.25h at 120/h
  assert.equal(s.clients[0].client, "Acme");
  assert.equal(s.clients[0].cents, 15000);
  assert.equal(s.clients.length, 1); // the running timer, the billed and the non-billable entries are not unbilled work
  assert.ok(s.running && s.running.hours >= 14 - 1e-9);
  assert.ok(s.utilisation > 0 && s.utilisation < 1);
});

test("expenses: meals at half, personal at zero, business-use percent, receipts flagged from $75", () => {
  const es = expenseSummary([
    { date: "2026-02-01", cents: 10000, category: "meals" },
    { date: "2026-02-02", cents: 10000, category: "personal" },
    { date: "2026-02-03", cents: 10000, category: "other", bizPct: 50, receipt: true },
    { date: "2026-02-04", cents: 7499, category: "other" },
    { date: "2025-02-04", cents: 99999, category: "other" },
  ], 2026);
  assert.equal(es.spent, 37499);
  assert.equal(es.deductible, 5000 + 0 + 5000 + 7499);
  assert.equal(es.missing, 1);
});

test("net profit, set-aside and the next estimated-tax date", () => {
  assert.equal(netProfit(100000, 30000), 70000);
  assert.equal(setAside(70000, 30), 21000);
  assert.equal(setAside(-5, 30), 0);
  assert.equal(setAside(70000, 500), 49000);
  assert.deepEqual(nextEstimatedTaxDate("2026-04-15"), { date: "2026-04-15", days: 0, label: "Q1" });
  assert.equal(nextEstimatedTaxDate("2026-04-16").date, "2026-06-15");
  assert.equal(nextEstimatedTaxDate("2026-10-07").date, "2027-01-15");
  assert.equal(nextEstimatedTaxDate("2026-10-07").label, "Q4");
  assert.equal(nextEstimatedTaxDate("2026-01-05").label, "Q4 of last year");
  assert.equal(nextEstimatedTaxDate("nonsense"), null);
});

test("the example data produces actions in cost-of-ignoring order", () => {
  const ex = exampleStores(TODAY);
  const s = readStores(store(ex));
  assert.equal(Object.values(s.found).every(Boolean), true);
  const a = actions(s, ctx);
  assert.equal(a[0].kind, "chase");
  const kinds = new Set(a.map((x) => x.kind));
  for (const k of ["chase", "follow", "bill", "receipts", "concentration"]) assert.ok(kinds.has(k), k);
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].weight >= a[i].weight);
  const o = overview(s, ctx);
  assert.equal(o.toolsFound, 4);
  assert.equal(o.net, o.income.paid - o.expenses.deductible);
});

test("a tax action appears only when a payment is within 30 days and there is profit", () => {
  const ex = exampleStores("2026-12-20");
  const s = readStores(store(ex));
  const a = actions(s, { today: "2026-12-20", now: Date.parse("2026-12-20T12:00:00Z"), ratePct: 30 });
  assert.ok(a.some((x) => x.kind === "tax" && /2027-01-15/.test(x.text)));
  assert.ok(!actions(readStores(store({})), ctx).some((x) => x.kind === "tax"));
});

test("an empty browser gives an empty, non-crashing overview", () => {
  const o = overview(readStores(store({})), ctx);
  assert.equal(o.toolsFound, 0);
  assert.equal(o.actions.length, 0);
  assert.equal(o.net, 0);
  assert.equal(o.pipeline.winRate, null);
});

test("backup round-trips and rejects foreign or malformed files", () => {
  const ex = exampleStores(TODAY);
  const b = buildBackup(store(ex), "2026-10-07T00:00:00Z");
  const back = parseBackup(JSON.stringify(b));
  assert.equal(back.ok, true);
  assert.equal(back.writes.length, 4);
  assert.equal(parseBackup("nope").ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: "other" })).ok, false);
  const evil = parseBackup(JSON.stringify({ app: "freelance-dashboard-backup", stores: { "some-other-key": "x", [STORES.invoices]: "{\"invoices\":[]}" } }));
  assert.deepEqual(evil.writes.map((w) => w[0]), [STORES.invoices]);
  assert.equal(parseBackup(JSON.stringify({ app: "freelance-dashboard-backup", stores: { [STORES.invoices]: "{\"wrong\":1}" } })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: "freelance-dashboard-backup", stores: { x: "y" } })).ok, false);
});

test("formatMoney handles zero and undefined", () => {
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(undefined), "$0.00");
});

test("an entry with no project is not attached to a project that has no id", async () => {
  const { timeSummary } = await import("./calc.mjs");
  const now = Date.UTC(2026, 9, 7);
  const t = { projects: [{ name: "P", client: "Acme", rate: "100" }], settings: { rounding: "none", defaultRate: "50" }, entries: [{ start: now - 1e6, manualSec: 3600, client: "Zed" }] };
  const r = timeSummary(t, now);
  assert.equal(r.unbilled, 5000);
  assert.equal(r.clients[0].client, "Zed");
});

test("client rows: effective rate only where revenue and hours both exist", async () => {
  const { clientRows } = await import("./calc.mjs");
  const rows = clientRows(
    { clients: [{ client: "A", cents: 100000 }, { client: "B", cents: 50000 }] },
    { open: [{ client: "B", balance: 20000 }, { client: "C", balance: 5000 }] },
    { hoursByClient: { A: 10, C: 3 } },
  );
  const by = Object.fromEntries(rows.map((r) => [r.client, r]));
  assert.equal(by.A.rate, 10000);
  assert.equal(by.B.rate, null);
  assert.equal(by.C.rate, null);
  assert.equal(by.B.owed, 20000);
  assert.deepEqual(rows.map((r) => r.client), ["A", "B", "C"]);
});
