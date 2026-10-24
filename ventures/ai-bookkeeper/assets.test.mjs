import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, reports, closeChecks, lockPeriod } from "./engine.mjs";
import { addAsset, disposeAsset, register, schedule, addAssetsCsv, yearDepreciation } from "./assets.mjs";
import { scheduleC } from "./taxforms.mjs";
import { trialBalance } from "./ledger.mjs";

// A laptop bought 2026-01-15 for 1,800.00 (filed to 1500), plus later months of rent.
const CSV = `Date,Description,Amount
2026-01-15,APPLE STORE LAPTOP,-1800.00
2026-06-30,LANDLORD RENT,-500.00
`;
function base() {
  let b = newBooks();
  b = importStatement(b, CSV, "1000").books;
  const ids = b.transactions.map((t) => t.id);
  return confirm(b, { [ids[0]]: "1500", [ids[1]]: "6080" });
}

test("straight-line cents add up exactly, month by month", () => {
  const { asset } = addAsset(newBooks(), { name: "Odd", date: "2026-01-10", cost: "1000.01", lifeMonths: 7 });
  const s = schedule(asset, "2026-12-31");
  assert.equal(s.length, 7);
  assert.equal(s.reduce((a, r) => a + r.cents, 0), 100001);
  assert.equal(s.at(-1).accumulated, 100001);
  assert.equal(s[0].date, "2026-01-31");
  assert.equal(s[6].date, "2026-07-31");
});

test("depreciation books through the latest month in the books and balances", () => {
  let b = base();
  b = addAsset(b, { name: "Laptop", date: "2026-01-15", cost: "1800.00", lifeMonths: 36 }).books;
  const dep = journal(b).filter((e) => e.source === "depreciation");
  assert.equal(dep.length, 6); // Jan..Jun
  assert.ok(dep.every((e) => e.lines[0].debit === 5000 && e.lines[1].credit === 5000));
  const tb = trialBalance(journal(b), b.accounts);
  assert.equal(tb.debits ?? tb.totalDebit ?? undefined, tb.credits ?? tb.totalCredit ?? undefined);
  const r = register(b);
  assert.deepEqual([r.cost, r.accumulated, r.netBookValue], [180000, 30000, 150000]);
  assert.equal(closeChecks(b).filter((c) => c.check === "assets").length, 0);
  assert.equal(closeChecks(b).filter((c) => c.check === "unbalanced").length, 0);
});

test("a purchase in the asset account with no register row is flagged", () => {
  let b = base();
  b = addAsset(b, { name: "Chair", date: "2026-02-01", cost: "100.00", lifeMonths: 12 }).books;
  const f = closeChecks(b).find((c) => c.check === "assets");
  assert.ok(f && /no register row/.test(f.message));
});

test("expense method writes the whole cost off in the first month", () => {
  let b = base();
  b = addAsset(b, { name: "Laptop", date: "2026-01-15", cost: "1800.00", method: "expense" }).books;
  const dep = journal(b).filter((e) => e.source === "depreciation");
  assert.equal(dep.length, 1);
  assert.equal(dep[0].lines[0].debit, 180000);
});

test("disposal removes the asset and books the gain or loss", () => {
  let b = base();
  b = addAsset(b, { name: "Laptop", date: "2026-01-15", cost: "1800.00", lifeMonths: 36 }).books;
  b = disposeAsset(b, "FA-1", { date: "2026-04-10", proceeds: 1500 }).books;
  const es = journal(b);
  assert.equal(es.filter((e) => e.source === "depreciation").length, 4); // Jan..Apr
  const d = es.find((e) => e.source === "disposal");
  // accumulated 4 x 50.00 = 200.00; NBV 1,600.00; proceeds 1,500.00 -> loss of 100.00
  const loss = d.lines.find((l) => l.account === "4150");
  assert.deepEqual([loss.debit, loss.credit], [10000, 0]);
  assert.equal(d.lines.reduce((s, l) => s + l.debit - l.credit, 0), 0);
  assert.equal(register(b).cost, 0);
  assert.equal(closeChecks(b).filter((c) => c.check === "assets" || c.check === "unbalanced").length, 0);
});

test("schedule C takes depreciation to line 13, and the year view agrees", () => {
  let b = base();
  b = addAsset(b, { name: "Laptop", date: "2026-01-15", cost: "1800.00", lifeMonths: 36 }).books;
  const sc = scheduleC(b, {});
  const l13 = sc.lines.find((l) => l.line === "13");
  assert.equal(l13.cents, 30000);
  assert.equal(yearDepreciation(b, 2026)[0].cents, 30000);
  assert.equal(sc.unmapped.length, 0);
});

test("bad input is refused and locked periods stay locked", () => {
  const b0 = base();
  assert.throws(() => addAsset(b0, { name: "", date: "2026-01-15", cost: "10" }), /name/);
  assert.throws(() => addAsset(b0, { name: "x", date: "2026-01-15", cost: "-10" }), /Cost/);
  assert.throws(() => addAsset(b0, { name: "x", date: "2026-01-15", cost: "10", salvage: "10" }), /Salvage/);
  assert.throws(() => addAsset(b0, { name: "x", date: "2026-01-15", cost: "10", lifeMonths: 1 }), /Life/);
  const locked = lockPeriod(b0, "2026-06-30");
  assert.throws(() => addAsset(locked, { name: "x", date: "2026-03-01", cost: "10" }), /locked/);
});

test("CSV load adds rows, skips repeats and reports bad rows", () => {
  const csv = "name,date,cost,life_months,salvage\nDrill,2026-02-03,300.00,24,30.00\nBad,nope,10,12,0\n";
  let r = addAssetsCsv(newBooks(), csv);
  assert.equal(r.added, 1);
  assert.equal(r.problems.length, 1);
  const again = addAssetsCsv(r.books, csv);
  assert.equal(again.added, 0);
  assert.equal(schedule(r.books.assets[0], "2028-01-31").at(-1).accumulated, 27000);
});
