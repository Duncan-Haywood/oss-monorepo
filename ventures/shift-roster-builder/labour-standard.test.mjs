import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSales, hourlySales, demandShifts, backtestSales, parseStandard, describeStandard } from "./demand.mjs";

// Invented rows in the French bakery's item-line shape (ticket, quantity, unit price).
const ITEMS = [
  "date,time,ticket_number,article,Quantity,unit_price",
  "2026-11-02,08:05,1,BAGUETTE,1,\"0,90 €\"",
  "2026-11-02,08:05,1,CROISSANT,2,\"1,10 €\"",
  "2026-11-02,08:20,2,BAGUETTE,1,\"0,90 €\"",
  "2026-11-02,12:10,3,TARTE,1,\"25,00 €\"",
  "2026-11-02,12:15,4,BAGUETTE,-1,\"0,90 €\"",
].join("\n");

test("parseStandard reads minutes per ticket, sale and item in any order and spelling", () => {
  assert.deepEqual(parseStandard("1.5/ticket + 0.3/item"), { ticket: 1.5, sale: 0, item: 0.3 });
  assert.deepEqual(parseStandard("0.02 per euro, 2 min per order"), { ticket: 2, sale: 0.02, item: 0 });
  assert.deepEqual(parseStandard({ ticket: 1 }), { ticket: 1, sale: 0, item: 0 });
  assert.throws(() => parseStandard("fast"), /could not read/);
  assert.throws(() => parseStandard("0/ticket"), /above 0/);
  assert.equal(describeStandard({ ticket: 1.5, sale: 0, item: 0.3 }), "1.5 min a ticket + 0.3 min an item");
});

test("each row is its minutes of work: a ticket once at its first row, money and items per row, refunds left out", () => {
  const r = readSales(ITEMS, { standard: "2/ticket + 0.1/sale + 0.5/item" });
  assert.equal(r.count, "minutes");
  assert.equal(r.refunds.n, 1);
  const m = r.entries.map((e) => [e.hour, Math.round(e.amount * 1000) / 1000]);
  // row 1: 2 + 0.09 + 0.5; row 2 (same ticket): 0.22 + 1; row 3: 2 + 0.09 + 0.5; row 4: 2 + 2.5 + 0.5
  assert.deepEqual(m, [[8, 2.59], [8, 1.22], [8, 2.59], [12, 5]]);
  assert.ok(r.notes.some((n) => /Labour standard: 2 min a ticket \+ 0.1 min a unit of money taken \+ 0.5 min an item/.test(n)));
  assert.ok(r.notes.some((n) => /Share of the work: tickets \d+%, money \d+%, items \d+%/.test(n)));
});

test("ticket-only standard equals --count tickets scaled by the minutes", () => {
  const a = hourlySales(ITEMS, { standard: "3/ticket" }), b = hourlySales(ITEMS, { count: "tickets" });
  for (let h = 0; h < 24; h++) assert.equal(a.avg[0][h], b.avg[0][h] * 3);
});

test("a standard missing its column says which one", () => {
  const csv = "Date,Time,Total\n2026-11-02,09:00,5\n";
  const r = readSales(csv, { standard: "1/ticket" });
  assert.equal(r.rows, 0);
  assert.ok(r.notes.some((n) => /needs a ticket, order or receipt number column/.test(n)));
  assert.ok(readSales(csv, { standard: "0.2/sale" }).rows === 1);
  assert.ok(/needs a quantity column/.test(readSales(csv, { standard: "1/item" }).notes.join(" ")));
});

test("demandShifts and backtestSales run on minutes: heads are minutes over minutes per labor hour", () => {
  // Five weeks of Mondays: 30 tickets 9:00, 90 tickets 10:00. At 2 min a ticket and 60 min per labor hour: 1 then 3 heads.
  const rows = ["Date,Time,Receipt,Total"];
  for (let w = 0; w < 6; w++) {
    const d = new Date(Date.UTC(2026, 9, 5 + 7 * w)).toISOString().slice(0, 10);
    for (let i = 0; i < 30; i++) rows.push(`${d},09:${String(i).padStart(2, "0")},${w}-9-${i},4`);
    for (let i = 0; i < 90; i++) rows.push(`${d},10:${String(i % 60).padStart(2, "0")},${w}-10-${i},4`);
  }
  const csv = rows.join("\n");
  const s = hourlySales(csv, { standard: "2/ticket" });
  assert.equal(s.avg[0][9], 60); assert.equal(s.avg[0][10], 180);
  const d = demandShifts(csv, { standard: "2/ticket", splh: 60, minShift: 1, maxShift: 8, halfLife: "none" });
  assert.equal(d.count, "minutes");
  assert.equal(d.needed, 4);
  const b = backtestSales(csv, { standard: "2/ticket", splh: 60, minShift: 1, warmup: 1 });
  assert.ok(b.weeks > 0);
  assert.ok(b.notes.some((n) => /minutes of work per labor hour/.test(n)));
});

test("CLI --standard defaults --splh to 60 and rejects a standard it cannot read", () => {
  const dir = mkdtempSync(join(tmpdir(), "std-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, ITEMS);
  const out = execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "6/ticket", "--min-shift", "1"], { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Mon/);
  assert.throws(() => execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "lots"], { cwd: import.meta.dirname, stdio: "pipe" }));
});
