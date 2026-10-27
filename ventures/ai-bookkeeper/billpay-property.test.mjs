// Property test for planBills: seeded random open bills and invoices against a random
// bank balance (made up, no outside data). Invariants: every bill due inside the window
// gets one row, no bill is paid before tomorrow or before its due date, delay and status
// agree with the dates, the shortfall is exactly the "cannot fit" bills, a bank balance
// that covers everything never defers a bill, and more starting cash never raises the shortfall.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks } from "./engine.mjs";
import { addDocuments } from "./accruals.mjs";
import { planBills } from "./billpay.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const ASOF = "2026-05-01", T0 = day(ASOF);

const make = (csv, bank) => {
  const b = addDocuments(newBooks(), "type,number,date,due,party,amount,account\n" + csv).books;
  const acct = b.accounts.find((a) => a.bank && a.type === "asset") ?? b.accounts.find((a) => a.type === "asset");
  acct.bank = true;
  b.transactions.push({ id: "t0", date: "2026-04-30", desc: "Opening", cents: bank, account: acct.code, balance: bank });
  return b;
};

test("planBills holds its invariants on 300 random cash positions", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 300; i++) {
    const nb = pick(1, 6), ni = pick(0, 3);
    let csv = "", total = 0;
    for (let k = 1; k <= nb; k++) {
      const date = T0 + pick(-60, 20), cents = pick(1, 900) * 100;
      total += cents;
      csv += `bill,${k},${iso(date)},${iso(date + pick(0, 40))},Supplier ${pick(1, 3)},${(cents / 100).toFixed(2)},6130\n`;
    }
    for (let k = 1; k <= ni; k++) {
      const date = T0 + pick(-30, 10);
      csv += `invoice,${k},${iso(date)},${iso(date + pick(0, 40))},Client ${k},${pick(1, 900)}.00,4000\n`;
    }
    const bank = pick(0, 1500) * 100, reserve = r() < 0.5 ? 0 : pick(0, 300) * 100;
    const days = pick(30, 120), tag = JSON.stringify({ csv, bank, reserve, days });
    const p = planBills(make(csv, bank), { asOf: ASOF, days, reserve });
    assert.ok(p.rows.length <= nb, "no more rows than bills " + tag);
    const ids = new Set();
    for (const row of p.rows) {
      assert.ok(!ids.has(row.id), "one row per bill " + tag); ids.add(row.id);
      const n = day(row.payOn), target = Math.max(day(row.due), T0 + 1);
      assert.ok(n >= T0 + 1, "not paid in the past " + tag);
      assert.ok(n >= target || row.status === "cannot fit", "not paid before it is due " + tag);
      assert.equal(row.delay, Math.max(0, n - target), "delay matches dates " + tag);
      assert.ok(["on time", "late now", "deferred", "cannot fit"].includes(row.status), tag);
      if (row.status === "cannot fit") assert.equal(n, target, "unfit bills stay on their target date " + tag);
      if (row.status === "deferred") assert.ok(row.delay > 0, tag);
      if (row.status === "on time") assert.equal(row.delay, 0, tag);
    }
    assert.equal(p.shortfall, p.rows.filter((x) => x.status === "cannot fit").reduce((s, x) => s + x.cents, 0), "shortfall " + tag);
    assert.deepEqual(p.rows.map((x) => x.payOn), p.rows.map((x) => x.payOn).sort(), "rows in date order " + tag);
    if (reserve === 0 && bank >= total) {
      assert.ok(p.rows.every((x) => x.status === "on time" || x.status === "late now"), "ample cash defers nothing " + tag);
    }
  }
});

test("more starting cash never leaves more bills unpaid", () => {
  const r = rng(77), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 150; i++) {
    let csv = "";
    for (let k = 1; k <= pick(1, 5); k++) {
      const date = T0 + pick(-20, 10);
      csv += `bill,${k},${iso(date)},${iso(date + pick(0, 30))},S${k},${pick(50, 800)}.00,6130\n`;
    }
    const lo = pick(0, 1000) * 100, hi = lo + pick(1, 800) * 100, tag = JSON.stringify({ csv, lo, hi });
    const a = planBills(make(csv, lo), { asOf: ASOF }), b = planBills(make(csv, hi), { asOf: ASOF });
    assert.ok(b.shortfall <= a.shortfall, "shortfall falls with cash " + tag);
  }
});
