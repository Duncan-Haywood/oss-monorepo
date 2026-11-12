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

// Fixed work (2026-11-12): minutes every trading hour, at opening and at closing.
test("parseStandard reads fixed minutes per hour, open and close; a variable-only standard is unchanged", () => {
  assert.deepEqual(parseStandard("1.5/ticket + 10/hour + 30/open + 45/close"), { ticket: 1.5, sale: 0, item: 0, hour: 10, open: 30, close: 45 });
  assert.deepEqual(parseStandard("12 min per open hour, 20/opening, 15/closing"), { ticket: 0, sale: 0, item: 0, hour: 12, open: 20, close: 15 });
  assert.deepEqual(parseStandard("5 per hour"), { ticket: 0, sale: 0, item: 0, hour: 5 });
  assert.deepEqual(parseStandard({ ticket: 1, close: 30 }), { ticket: 1, sale: 0, item: 0, close: 30 });
  assert.deepEqual(parseStandard("1/ticket + 0/hour"), { ticket: 1, sale: 0, item: 0 });
  assert.throws(() => parseStandard("0/hour"), /above 0/);
  assert.equal(describeStandard(parseStandard("2/ticket + 10/hour + 30/close")), "2 min a ticket + 10 min every trading hour + 30 min at closing");
});

test("fixed work lands on each trading hour, opening on the first and closing on the last of each date", () => {
  const r = readSales(ITEMS, { standard: "2/ticket + 10/hour + 30/open + 45/close" });
  // 2026-11-02 trades at 8:00 and 12:00 (the 12:15 refund is left out but 12:10 sold).
  const fixed = r.entries.filter((e) => e.fixed);
  assert.deepEqual(fixed.map((e) => [e.hour, e.amount]).sort((a, b) => a[0] - b[0]), [[8, 40], [12, 55]]);
  assert.equal(r.parts.fixed, 95);
  assert.ok(r.notes.some((n) => /Fixed work: 95 minutes over 2 trading hours on 1 days/.test(n)));
  assert.ok(r.notes.some((n) => /Share of the work: tickets 8%, fixed work 92%/.test(n)), r.notes.join(" | "));
  const s = hourlySales(ITEMS, { standard: "2/ticket + 10/hour + 30/open + 45/close" });
  assert.equal(s.avg[0][8], 2 * 2 + 40);
  assert.equal(s.avg[0][12], 2 * 2 + 55); // a ticket-only standard reads no money, so the -1 line counts as a ticket (as before)
});

test("a fixed-only standard staffs every trading hour alike and needs no sales column", () => {
  const csv = ["date,time,ticket", "2026-11-02,09:00,1", "2026-11-02,10:30,2", "2026-11-02,11:10,3", "2026-11-09,09:00,4", "2026-11-09,11:00,5"].join("\n");
  const s = hourlySales(csv, { standard: "30/hour" });
  // Monday 10:00 traded on one of the two Mondays, so it averages 15 minutes.
  assert.deepEqual([s.avg[0][9], s.avg[0][10], s.avg[0][11]], [30, 15, 30]);
  const d = demandShifts(csv, { standard: "60/hour", splh: 60, minShift: 1, maxShift: 8, halfLife: "none" });
  assert.match(d.shiftsText, /\d/);
});

test("one trading hour gets both the opening and the closing minutes; undated rows group by weekday", () => {
  const one = readSales(["date,time,ticket", "2026-11-03,14:00,1"].join("\n"), { standard: "1/ticket + 20/open + 25/close" });
  assert.deepEqual(one.entries.filter((e) => e.fixed).map((e) => e.amount), [45]);
  const undated = readSales(["day,hour,ticket", "Mon,9,1", "Mon,15,2", "Tue,10,3"].join("\n"), { standard: "1/ticket + 20/open + 25/close" });
  const f = undated.entries.filter((e) => e.fixed).map((e) => [e.day, e.hour, e.amount]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(f, [[0, 9, 20], [0, 15, 25], [1, 10, 45]]);
});

test("CLI --standard accepts fixed work", () => {
  const dir = mkdtempSync(join(tmpdir(), "srb-fixed-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, ["date,time,ticket", "2026-11-02,09:00,1", "2026-11-02,10:00,2", "2026-11-09,09:00,3", "2026-11-09,10:00,4"].join("\n"));
  const out = execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "1/ticket + 30/hour + 60/close", "--min-shift", "1"], { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  // Monday 10:00 needs 1 + 30 + 60 = 91 minutes, so a second person comes in for the closing hour.
  assert.match(out, /Mon, 9:00, 11:00, 1/); assert.match(out, /Mon, 10:00, 11:00, 1/);
});

// Before opening and after closing (2026-11-12 later): the hour outside the trading day, doors shut.
test("parseStandard reads before-open and after-close minutes in several spellings", () => {
  assert.deepEqual(parseStandard("1/ticket + 20/before-open + 45/after-close"), { ticket: 1, sale: 0, item: 0, beforeOpen: 20, afterClose: 45 });
  assert.deepEqual(parseStandard("10 min pre open, 30 after closing, 5/post-close, 4/before opening"), { ticket: 0, sale: 0, item: 0, beforeOpen: 14, afterClose: 35 });
  assert.deepEqual(parseStandard("30/close + 15/after close"), { ticket: 0, sale: 0, item: 0, close: 30, afterClose: 15 });
  assert.equal(describeStandard(parseStandard("1/ticket + 20/before open + 45/after close")), "1 min a ticket + 20 min in the hour before opening + 45 min in the hour after closing");
});

test("after-close work lands in the hour after the last trading hour; a day ending at 23:00 keeps it in its last hour", () => {
  const r = readSales(ITEMS, { standard: "2/ticket + 20/before-open + 45/after-close" });
  const fixed = r.entries.filter((e) => e.fixed).map((e) => [e.hour, e.amount, e.outside]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(fixed, [[7, 20, true], [13, 45, true]]);
  assert.ok(r.notes.some((n) => /65 of them in the hour before opening or after closing/.test(n)), r.notes.join(" | "));
  const late = readSales(["date,time,ticket", "2026-11-03,00:30,1", "2026-11-03,23:10,2"].join("\n"), { standard: "1/ticket + 20/before-open + 45/after-close" });
  assert.deepEqual(late.entries.filter((e) => e.fixed).map((e) => [e.hour, e.amount, e.outside]).sort((a, b) => a[0] - b[0]), [[0, 20, false], [23, 45, false]]);
  assert.ok(late.notes.some((n) => /on 2 day-ends the day reached 0:00 or midnight/.test(n)));
});

// Six Mondays trading 9:00-12:59, one ticket an hour.
const MONDAYS = (() => {
  const rows = ["date,time,ticket"];
  for (let w = 0; w < 6; w++) {
    const d = new Date(Date.UTC(2026, 9, 5 + 7 * w)).toISOString().slice(0, 10);
    for (const h of [9, 10, 11, 12]) rows.push(`${d},${h}:10,${w}-${h}`);
  }
  return rows.join("\n");
})();

test("the closer stays on and the opener comes in early; /close keeps the same day", () => {
  const plan = (std, minStaff = 1) => demandShifts(MONDAYS, { standard: std, splh: 60, minStaff, minShift: 1, maxShift: 8, halfLife: "none" }).shiftsText;
  assert.equal(plan("1/ticket + 45/close"), "Mon, 9:00, 13:00, 1");
  assert.equal(plan("1/ticket + 45/after-close"), "Mon, 9:00, 14:00, 1");
  assert.equal(plan("1/ticket + 30/before-open + 45/after-close"), "Mon, 8:00, 14:00, 1");
  // Minimum staff 2 is for the open shop: the shut hours get the heads their minutes need (1), not 2.
  assert.equal(plan("1/ticket + 45/close", 2), "Mon, 9:00, 13:00, 2");
  assert.equal(plan("1/ticket + 30/before-open + 45/after-close", 2), "Mon, 8:00, 14:00, 1\nMon, 9:00, 13:00, 1");
  // 90 minutes after close is one person staying two hours (13:00 and 14:00), not two people for one (spread, later).
  assert.equal(plan("1/ticket + 30/before-open + 90/after-close", 2), "Mon, 8:00, 15:00, 1\nMon, 9:00, 13:00, 1");
});

// Spread over hours, and the shut-hour minimum (2026-11-12, last): 90 minutes after close used to be 2 heads for the hour.
test("shut-door work spills into the next hour at 60 minutes a person; before-open spills earlier", () => {
  const r = readSales(MONDAYS, { standard: "1/ticket + 75/before-open + 90/after-close" });
  const fixed = r.entries.filter((e) => e.fixed && e.key === "2026-10-5").map((e) => [e.hour, e.amount, e.outside]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(fixed, [[7, 15, true], [8, 60, true], [13, 60, true], [14, 30, true]]);
  // A crew of two (the shut-hour minimum) clears 120 minutes an hour: the 90 stays in one hour.
  const two = readSales(MONDAYS, { standard: "1/ticket + 90/after-close", shutMin: 2 });
  assert.deepEqual(two.entries.filter((e) => e.fixed && e.key === "2026-10-5").map((e) => [e.hour, e.amount]), [[13, 90]]);
  // Exact: the minutes added are the minutes asked for, however they spread.
  const sum = (x) => x.entries.reduce((a, e) => a + e.amount, 0);
  assert.equal(sum(r) - sum(readSales(MONDAYS, { standard: "1/ticket" })), 6 * 165);
});

test("a day ending at 22:00 spills after-close work into 23:00 and keeps the rest there", () => {
  const r = readSales(["date,time,ticket", "2026-11-03,22:10,1"].join("\n"), { standard: "1/ticket + 150/after-close" });
  assert.deepEqual(r.entries.filter((e) => e.fixed).map((e) => [e.hour, e.amount, e.outside]), [[23, 150, true]]);
  assert.ok(r.notes.some((n) => /on 1 day-end the day reached 0:00 or midnight/.test(n)), r.notes.join(" | "));
});

test("shut hours are planned at 60 minutes a person whatever the rate, and --shut-min 2 puts two on to lock up", () => {
  const plan = (o) => demandShifts(MONDAYS, { standard: "1/ticket + 45/after-close", splh: 30, minShift: 1, maxShift: 8, halfLife: "none", ...o }).shiftsText;
  // At 30 minutes a labor hour the open hours need 1 (1 ticket-minute); 45 shut-door minutes stay one person, not two.
  assert.equal(plan({}), "Mon, 9:00, 14:00, 1");
  assert.equal(plan({ shutMin: 2 }), "Mon, 9:00, 14:00, 1\nMon, 13:00, 14:00, 1");
  assert.equal(plan({ minStaff: 2 }), "Mon, 9:00, 13:00, 1\nMon, 9:00, 14:00, 1");
  assert.equal(plan({ minStaff: 2, shutMin: 2 }), "Mon, 9:00, 14:00, 2");
  assert.equal(plan({ minStaff: 0 }), "Mon, 9:00, 14:00, 1"); // the work still needs someone
  assert.throws(() => plan({ shutMin: 1.5 }), /doors shut must be a whole number/);
});

test("the backtest scores shut hours at 60 minutes a person and the shut-hour minimum: a steady shop is never short", () => {
  for (const [std, shutMin] of [["1/ticket + 90/after-close", undefined], ["1/ticket + 90/after-close", 2], ["1/ticket + 75/before-open + 45/after-close", 2]]) {
    const b = backtestSales(MONDAYS, { standard: std, splh: 30, minStaff: 1, shutMin, minShift: 1, warmup: 1, shifts: true });
    assert.ok(b.weeks > 0);
    assert.equal(b.methods[0].short, 0, `${std} ${shutMin}`); assert.equal(b.methods[0].over, 0, `${std} ${shutMin}`);
  }
});

test("CLI --shut-min puts two on after close", () => {
  const dir = mkdtempSync(join(tmpdir(), "srb-shut-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, MONDAYS);
  const run = (...a) => execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "1/ticket + 45/after-close", "--min-shift", "1", "--half-life", "none", ...a], { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(run("--shut-min", "2"), /Mon, 13:00, 14:00, 1/);
  assert.doesNotMatch(run(), /Mon, 13:00, 14:00/);
});

test("the backtest scores the shut hours the same way: no short or spare hour on a steady shop at minimum staff 2", () => {
  for (const std of ["1/ticket + 45/after-close", "1/ticket + 30/before-open + 45/after-close"]) {
    const b = backtestSales(MONDAYS, { standard: std, splh: 60, minStaff: 2, minShift: 1, warmup: 1, shifts: true });
    assert.ok(b.weeks > 0);
    assert.equal(b.methods[0].short, 0, std); assert.equal(b.methods[0].over, 0, std);
  }
});

test("CLI --standard accepts after-close work", () => {
  const dir = mkdtempSync(join(tmpdir(), "srb-after-"));
  const f = join(dir, "s.csv");
  writeFileSync(f, MONDAYS);
  const out = execFileSync(process.execPath, ["cli.mjs", "--from-sales", f, "--standard", "1/ticket + 45/after-close", "--min-shift", "1", "--half-life", "none"], { cwd: import.meta.dirname, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(out, /Mon, 9:00, 14:00, 1/);
});
