import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlySales, headcount, cutShifts, demandShifts, backtestSales } from "./demand.mjs";
import { parseShifts } from "./calc.mjs";

// Invented hand-built sales; the real bakery export is in eval/bakery-backtest.mjs (not committed).
const CSV = "Date Time,Net Sales\n2026-11-02 09:00,100\n2026-11-02 10:00,250\n2026-11-02 11:00,100\n2026-11-09 09:00,300\n2026-11-09 10:00,250\n2026-11-09 11:00,100\n";

test("averages each weekday-hour over the days seen", () => {
  const s = hourlySales(CSV);
  assert.equal(s.rows, 6);
  assert.equal(s.observed[0], 2);
  assert.deepEqual([s.avg[0][9], s.avg[0][10], s.avg[0][11], s.avg[0][12]], [200, 250, 100, 0]);
  assert.equal(s.observed[1], 0);
});
test("heads = ceil(avg / splh), at least the minimum, only in trading hours", () => {
  const s = hourlySales(CSV);
  const p = headcount(s.avg, s.observed, { splh: 100, minStaff: 1 });
  assert.deepEqual(p[0].slice(8, 13), [0, 2, 3, 1, 0]);
  assert.equal(p[1].every((x) => x === 0), true);
  const q = headcount(s.avg, s.observed, { splh: 100, minStaff: 2, open: 8, close: 13 });
  assert.deepEqual(q[0].slice(7, 14), [0, 2, 2, 3, 2, 2, 0]);
  assert.throws(() => headcount(s.avg, s.observed, { splh: 0 }), /positive/);
});
test("cutShifts covers every hour's need, within the length limits except stretched ones", () => {
  for (const prof of [[0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]) {
    const p = [...prof, ...new Array(24 - prof.length).fill(0)];
    const sh = cutShifts(p, 3, 6);
    for (let h = 0; h < 24; h++) assert.ok(sh.filter(([a, b]) => a <= h && h < b).length >= p[h], `hour ${h}`);
    for (const [a, b] of sh) assert.ok(b - a >= 3 && b - a <= 6 && a >= 0 && b <= 24, `${a}-${b}`);
  }
  assert.deepEqual(cutShifts(new Array(24).fill(1), 4, 8), [[0, 8], [8, 16], [16, 24]]);
});
test("a short peak is stretched to the shortest shift and counted as extra", () => {
  const p = new Array(24).fill(0); p[12] = 1;
  assert.deepEqual(cutShifts(p, 4, 8), [[12, 16]]);
  p[23] = 1; // stretches backwards at the end of the day
  assert.deepEqual(cutShifts(p.map((v, h) => (h === 12 ? 0 : v)), 4, 8), [[20, 24]]);
});
test("shift lines round-trip through parseShifts and group days with the same shape", () => {
  const two = CSV + "2026-11-03 09:00,100\n2026-11-03 10:00,250\n2026-11-03 11:00,100\n2026-11-10 09:00,300\n2026-11-10 10:00,250\n2026-11-10 11:00,100\n";
  const r = demandShifts(two, { splh: 100, minShift: 3, maxShift: 8 });
  // The 1-hour top layer (10:00) is stretched into open hours (9:00-12:00), not past the 12:00 close (was 10:00-13:00
  // before 2026-11-11, an hour after the last sale).
  assert.equal(r.shiftsText, "Mon/Tue, 9:00, 12:00, 3");
  const p = parseShifts(r.shiftsText);
  assert.deepEqual(p.errors, []);
  assert.equal(p.slots.length, r.days.reduce((a, d) => a + d.shifts.length, 0));
  assert.equal(r.needed, 2 * (2 + 3 + 1));
  assert.equal(r.extra, r.scheduled - r.needed);
});
test("bad rows are skipped with a reason; missing columns are reported", () => {
  const r = hourlySales("Date Time,Sales\nsoon,10\n2026-11-02 09:00,abc\n2026-11-02 09:00,-5\n2026-11-02 09:00,40");
  assert.equal(r.rows, 1);
  assert.equal(r.skipped.length, 2); // the refund is counted in a note, not listed (2026-11-11)
  assert.ok(r.notes.some((n) => /1 row with negative sales \(refunds or voids, 5 in all\)/.test(n)), JSON.stringify(r.notes));
  assert.match(hourlySales("Date,Qty\n2026-11-02 09:00,1").notes[0], /No sales column/);
  assert.match(hourlySales("Foo,Sales\nx,1").notes[0], /No date-time/);
});
test("weekday-name rows and US 12-hour stamps", () => {
  const r = hourlySales("Day,Hour,Sales\nMon,9am,120\nMon,2pm,300\nSat,10,80".replace("Day,Hour", "Day,Time"));
  assert.equal(r.avg[0][9], 120); assert.equal(r.avg[0][14], 300); assert.equal(r.avg[5][10], 80);
  const u = hourlySales("Timestamp,Amount\n11/02/2026 2:00 PM,50\n11/02/2026 12:30 AM,5");
  assert.equal(u.avg[0][14], 50); assert.equal(u.avg[0][0], 5);
});
test("CLI: --from-sales writes shift lines the scheduler reads, summary on stderr", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(tmpdir() + "/dem-");
  writeFileSync(dir + "/s.csv", CSV);
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const r = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "100", "--min-shift", "3"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.deepEqual(parseShifts(r.stdout).errors, []);
  assert.match(r.stderr, /person-hours needed/);
  const bad = spawnSync("node", [cli, "--from-sales", dir + "/s.csv"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--splh/);
});

// Hand-built: two Mondays, the second a holiday with 4x the sales.
const TWO = "Date Time,Net Sales\n2026-11-02 10:00,100\n2026-11-09 10:00,100\n2026-11-16 10:00,400\n";
test("skipDates leaves a day out of the average", () => {
  const s = hourlySales(TWO, { skipDates: ["2026-11-16"] });
  assert.equal(s.observed[0], 2);
  assert.equal(s.avg[0][10], 100);
  assert.equal(s.rows, 2);
  assert.match(s.notes.join(" "), /1 day left out/);
  assert.equal(hourlySales(TWO, { skipDates: ["2026-11-9"] }).rows, 2); // unpadded form matches too
  assert.equal(hourlySales(TWO).avg[0][10], 200);
});
test("halfLife weights recent weeks more", () => {
  const plain = hourlySales(TWO).avg[0][10];
  const w = hourlySales(TWO, { halfLife: 1 }).avg[0][10]; // weights 0.25, 0.5, 1 -> (25+50+400)/1.75
  assert.ok(Math.abs(w - 475 / 1.75) < 1e-9);
  assert.ok(w > plain);
  assert.ok(Math.abs(hourlySales(TWO, { halfLife: 1e9 }).avg[0][10] - plain) < 1e-3);
  assert.throws(() => hourlySales(TWO, { halfLife: 0 }), /half-life/);
});
test("demandShifts passes skipDates through", () => {
  const a = demandShifts(TWO, { splh: 100 }), b = demandShifts(TWO, { splh: 100, skipDates: ["2026-11-16"] });
  assert.ok(a.needed > b.needed);
});
test("an ISO date with a 12-hour clock reads PM and midnight correctly", () => {
  const hours = (s) => { const r = hourlySales("time,sales\n" + s + "\n"); return r.avg[3].map((v, h) => (v ? h : -1)).filter((h) => h >= 0); };
  assert.deepEqual(hours("2026-03-05 2:00 PM,100"), [14]);
  assert.deepEqual(hours("2026-03-05 12:00 AM,100"), [0]);
  assert.deepEqual(hours("2026-03-05 12:30 pm,100"), [12]);
  assert.deepEqual(hours("2026-03-05 11 PM,100"), [23]);
  assert.deepEqual(hours("2026-03-05T14:00:00.000,100"), [14]);
  assert.equal(hourlySales("time,sales\n2026-03-05 13:00 PM,100\n").rows, 0);
});

test("sales cells: accounting negatives, decimal commas and thousands commas", async () => {
  const { readAmount } = await import("./demand.mjs");
  assert.equal(readAmount("(12.50)"), -12.5);
  assert.equal(readAmount("-$3"), -3);
  assert.equal(readAmount("1.234,50"), 1234.5);
  assert.equal(readAmount("12,5"), 12.5);
  assert.equal(readAmount("1,234"), 1234);
  assert.equal(readAmount("$1,234.50"), 1234.5);
  assert.equal(readAmount("€ 99"), 99);
  assert.ok(Number.isNaN(readAmount("n/a")));
  assert.ok(Number.isNaN(readAmount("")));
});

test("month-name stamps and hour intervals are read", () => {
  const a = hourlySales('Time,Net Sales\n"Mar 5, 2026 2 PM",100\n5 March 2026 14:00,50\n"March 6th, 2026 12:00 AM",9\n');
  assert.equal(a.rows, 3, JSON.stringify(a.skipped));
  assert.equal(a.avg[3][14], 150); // Thursday 5 Mar 2026: two rows in one hour add up
  assert.equal(a.avg[4][0], 9);
  const b = hourlySales("Hour,Sales,Day\n14:00-15:00,100,Mon\n2 PM - 3 PM,100,Tue\n9,5,Wed\n");
  assert.equal(b.rows, 3, JSON.stringify(b.skipped));
  assert.equal(b.avg[0][14], 100);
  assert.equal(b.avg[1][14], 100);
});

test("a European export with decimal commas is not silently mis-scaled", () => {
  const r = hourlySales("Time;Net Sales\n05.03.2026 14:00;1.234,50\n");
  assert.equal(r.avg[3][14], 1234.5);
});

test("a separate Date column and Time column are joined into one stamp", () => {
  const r = hourlySales("Date,Time,Net Sales\n2026-03-05,2:00 PM,120\n2026-03-05,15:00,80\n2026-03-12,14:30,60\n");
  assert.equal(r.rows, 3, JSON.stringify(r.skipped));
  assert.equal(r.avg[3][14], 90); // two Thursdays: (120 + 60) / 2
  assert.equal(r.avg[3][15], 40);
  const m = hourlySales("Date;Hour;Sales\n05.03.2026;14;10\n");
  assert.equal(m.avg[3][14], 10);
  const bad = hourlySales("Date,Time,Net Sales\n2026-03-05,late,1\n");
  assert.equal(bad.rows, 0);
  assert.match(bad.skipped[0], /2026-03-05 late/);
});

test("a year-first date with slashes or dots is read like the ISO form", () => {
  const r = hourlySales("Date,Net Sales\n2026/03/05 14:00,10\n2026.03.12 2:00 PM,20\n");
  assert.equal(r.rows, 2, JSON.stringify(r.skipped));
  assert.equal(r.avg[3][14], 15); // two Thursdays
});

test("noon, midnight and a weekday name leading the hour in one cell are read", () => {
  const r = hourlySales("Day,Hour,Sales\nMonday,12 noon,50\nMon,midnight,5\nTue,noon,7\n");
  assert.equal(r.rows, 3, JSON.stringify(r.skipped));
  assert.equal(r.avg[0][12], 50);
  assert.equal(r.avg[0][0], 5);
  const one = hourlySales("Time,Sales\nThursday 2 PM,40\nFri 14:00-15:00,8\n");
  assert.equal(one.rows, 2, JSON.stringify(one.skipped));
  assert.equal(one.avg[3][14], 40);
  assert.equal(one.avg[4][14], 8);
});

test("an Excel sep= first line and a bracketed currency unit in the header are read past", () => {
  const a = hourlySales("sep=,\nDate,Net Sales\n2026-03-05 14:00,100\n");
  assert.equal(a.rows, 1);
  assert.equal(a.avg[3][14], 100);
  const b = hourlySales("Date,Net Sales (USD)\n2026-03-05 14:00,100\n");
  assert.equal(b.rows, 1);
  const c = hourlySales("Date,Sales [GBP]\n2026-03-05 14:00,100\n");
  assert.equal(c.rows, 1);
});

test("sales read with a currency code and Excel serial date-times", async () => {
  const { readAmount, hourlySales } = await import("./demand.mjs");
  assert.equal(readAmount("USD 40.00"), 40);
  assert.equal(readAmount("40.00 EUR"), 40);
  assert.equal(readAmount("(CAD 5.00)"), -5);
  const r = hourlySales("Date,Net Sales\n46328.5833,100\n46329.375,40");
  assert.equal(r.rows, 2);
  assert.equal(r.avg[0][14], 100); // Monday 2 Nov 2026, 14:00 (the fraction .5833 is 13:59:57, rounded to the minute)
  assert.equal(r.avg[1][9], 40);
});

test("a time zone suffix is not read as AM/PM, and weekday-led and dd-Mon-yyyy stamps read", () => {
  const at = (stamp) => {
    const r = hourlySales(`Date,Net Sales\n"${stamp}",100`);
    return r.rows ? r.avg.flatMap((d, i) => d.map((v, h) => (v ? [i, h] : null))).filter(Boolean)[0] : null;
  };
  // PST/PDT start with "P" and AEST with "A": before, 02:00 PST was read as 2 PM.
  assert.deepEqual(at("2026-03-05 02:00 PST"), [3, 2]);
  assert.deepEqual(at("2026-03-05 02:00 PDT"), [3, 2]);
  assert.deepEqual(at("3/5/2026 02:00 AEST"), [3, 2]);
  assert.deepEqual(at("Mar 5, 2026 2:00 PST"), [3, 2]);
  // a real PM marker still counts
  assert.deepEqual(at("2026-03-05 2:00 PM PST"), [3, 14]);
  assert.deepEqual(at("2026-03-05 2PM"), [3, 14]);
  // weekday name ahead of a full date, and dd-Mon-yyyy
  assert.deepEqual(at("Thu, 05 Mar 2026 14:00:00"), [3, 14]);
  assert.deepEqual(at("Thursday, March 5, 2026 2 PM"), [3, 14]);
  assert.deepEqual(at("Thu Mar 5 2026 2:00 PM"), [3, 14]);
  assert.deepEqual(at("05-Mar-2026 14:00"), [3, 14]);
  // the existing weekday + hour cell still reads
  assert.deepEqual(at("Thursday 2 PM"), [3, 14]);
});

test("Toast-, Clover- and Square-style header names are read (net price, order total, order date, transaction time)", async () => {
  const { hourlySales } = await import("./demand.mjs");
  for (const csv of [
    "Opened,Net Price\n3/5/2026 2:03 PM,12.50\n3/5/2026 3:03 PM,9",
    "Order Date,Order Total\n05-Mar-2026 02:03 PM,12\n05-Mar-2026 03:03 PM,9",
    "Transaction Time,Transaction Amount\n2026-03-05 14:03:22,12\n2026-03-05 15:03:22,9",
  ]) {
    const r = hourlySales(csv);
    assert.equal(r.rows, 2, csv);
    assert.ok(r.avg[3][14] > 0 && r.avg[3][15] > 0, csv);
  }
});

test("compact stamps 20260305 1400 and 20260305T140000Z read as Thursday 14:00", () => {
  for (const t of ["20260305 1400", "20260305T1400", "20260305T140000Z"]) {
    const r = hourlySales(`Time,Sales\n${t},50\n`);
    assert.equal(r.rows, 1, t);
    assert.ok(r.avg[3][14] === 50, t);
  }
});

test("one day-first date settles the order for the whole file; with none, month first and a note", () => {
  const dm = hourlySales("Time,Sales\n05/03/2026 14:00,10\n25/03/2026 14:00,20\n");
  assert.ok(dm.avg[3][14] > 0, "5 March 2026 is a Thursday");
  assert.ok(dm.notes.some((n) => /day first/.test(n)));
  const md = hourlySales("Time,Sales\n03/25/2026 14:00,10\n05/03/2026 14:00,20\n");
  assert.ok(md.avg[6][14] > 0, "May 3 2026 is a Sunday");
  const amb = hourlySales("Time,Sales\n05/03/2026 14:00,10\n");
  assert.ok(amb.avg[6][14] > 0);
  assert.ok(amb.notes.some((n) => /could be 5 March or May 3/.test(n)));
});

// ---- Found on a real bakery POS export (2026-11-11, eval/bakery-backtest.mjs) ----
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
// n weeks of a shop open Wed-Sun 11:00-15:00, `amt(week, hour)` per hour, from Monday 2026-01-05.
function weeksCsv(n, amt, extra = []) {
  const rows = ["datetime,total"];
  for (let w = 0; w < n; w++) for (let d = 2; d < 7; d++) for (let h = 11; h < 15; h++) {
    rows.push(`${ymd(Date.UTC(2026, 0, 5) + (w * 7 + d) * 86400000)} ${h}:10,${amt(w, h)}`);
  }
  return rows.concat(extra).join("\n");
}

test("rows of empty cells are ignored with one note, not reported row by row", () => {
  const r = hourlySales("datetime,total,place\n2026-01-07 11:00,100,\n,,\n,,\n");
  assert.equal(r.rows, 1);
  assert.equal(r.skipped.length, 0);
  assert.ok(r.notes.some((n) => /2 empty rows ignored/.test(n)));
});

test("a weekday that traded on 1 of 8 dates is treated as closed; --keep-rare keeps it", () => {
  const csv = weeksCsv(8, () => 100, ["2026-01-06 11:30,500"]); // one Tuesday
  const r = hourlySales(csv);
  assert.equal(r.observed[1], 0);
  assert.ok(r.notes.some((n) => /Tuesdays: sales on 1 of 8/.test(n)));
  assert.equal(hourlySales(csv, { keepRare: true }).observed[1], 1);
  const d = demandShifts(csv, { splh: 100 });
  assert.ok(!/Tue/.test(d.shiftsText));
});

test("an edge hour seen on 1 of 20+ days does not stretch the trading day", () => {
  const csv = weeksCsv(21, () => 100, ["2026-01-11 23:05,50"]); // one late Sunday order
  const d = demandShifts(csv, { splh: 100, minShift: 4 });
  assert.ok(!/0:00/.test(d.shiftsText), d.shiftsText);
  assert.ok(d.notes.some((n) => /Sun 23:00 \(1 of 21 days\)/.test(n)));
  assert.match(demandShifts(csv, { splh: 100, keepRare: true }).shiftsText, /Sun, \d+:00, 0:00/);
});

test("backtest: a steady shop has no short or over hours under any method", () => {
  const b = backtestSales(weeksCsv(10, () => 150), { splh: 100 });
  assert.equal(b.weeks, 6);
  for (const m of b.methods) { assert.equal(m.short, 0, m.id); assert.equal(m.over, 0, m.id); assert.equal(m.scheduled, 5 * 4 * 2); }
  assert.equal(b.clear, false);
});

test("backtest: on a growing shop recent weeks win and the plain average runs short", () => {
  const b = backtestSales(weeksCsv(16, (w) => 100 + 25 * w), { splh: 100 });
  const by = Object.fromEntries(b.methods.map((m) => [m.id, m]));
  assert.ok(by.all.short > by.hl2.short, "the plain average lags the growth");
  assert.ok(by.last1.miss <= by.all.miss);
  assert.notEqual(b.best, "all");
  assert.equal(b.clear, true);
});

test("backtest needs dated rows and enough weeks", () => {
  assert.equal(backtestSales("Day,Hour,Sales\nMon,9,100", { splh: 50 }).weeks, 0);
  assert.match(backtestSales(weeksCsv(3, () => 100), { splh: 50 }).notes.at(-1), /more than 4 full weeks/);
  assert.throws(() => backtestSales("x", { splh: 0 }), /positive/);
});

test("CLI: --backtest prints the method table and a verdict", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(tmpdir() + "/bt-");
  writeFileSync(dir + "/s.csv", weeksCsv(16, (w) => 100 + 25 * w));
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const r = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "100", "--backtest", "--warmup", "3"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Tested on 13 full weeks/);
  assert.match(r.stdout, /--half-life 4/);
  assert.match(r.stdout, /Best on your file:/);
  writeFileSync(dir + "/t.csv", weeksCsv(2, () => 100));
  assert.equal(spawnSync("node", [cli, "--from-sales", dir + "/t.csv", "--splh", "100", "--backtest"], { encoding: "utf8" }).status, 1);
  assert.equal(spawnSync("node", [cli, "--from-sales", dir + "/t.csv", "--splh", "100", "--warmup", "0"], { encoding: "utf8" }).status, 2);
});

// Made-up rows in the shape of the second real POS export (a French bakery's item lines, eval/french-bakery.mjs).
test("line-item exports: sales are quantity x unit price, decimal-comma euros; refund lines are one note", () => {
  const csv = ',date,time,ticket_number,article,Quantity,unit_price\n0,2026-11-02,08:38,150040.0,BAGUETTE,1.0,"0,90 €"\n1,2026-11-02,08:39,150041.0,PAIN AU CHOCOLAT,3.0,"1,20 €"\n2,2026-11-02,09:14,150042.0,BAGUETTE,-1.0,"0,90 €"\n3,2026-11-02,09:20,150043.0,TRADITIONAL BAGUETTE,2.0,"1,20 €"\n';
  const r = hourlySales(csv);
  assert.equal(r.rows, 3);
  assert.equal(r.skipped.length, 0);
  assert.ok(Math.abs(r.avg[0][8] - 4.5) < 1e-9, String(r.avg[0][8])); // 0.90 + 3 x 1.20
  assert.ok(Math.abs(r.avg[0][9] - 2.4) < 1e-9);
  assert.match(r.notes.join(" "), /quantity times its unit price/);
  assert.match(r.notes.join(" "), /1 row with negative sales \(refunds or voids, 0\.9 in all\)/);
  assert.deepEqual(hourlySales("Date,Time,Qty,Price\n2026-11-02,09:00,,2\n").skipped, ['row 2: could not read the sales " x 2"']);
});

// 24 Mondays: busy 8-13 and 16-18, 14:00 and 15:00 trade on 2 of 24 dates (a lunch closure), 18:00 every week.
const lunch = () => {
  let csv = "Date Time,Sales\n";
  for (let w = 0; w < 24; w++) {
    const day = new Date(Date.UTC(2026, 0, 5 + 7 * w)).toISOString().slice(0, 10);
    for (const h of [8, 9, 10, 11, 12, 13, 16, 17, 18]) csv += `${day} ${h}:00,${h === 12 ? 250 : 90}\n`;
    if (w < 2) csv += `${day} 14:00,5\n${day} 15:00,5\n`;
  }
  return csv;
};
test("a lunch closure inside the day is not staffed, and no shift is stretched across it", () => {
  const r = demandShifts(lunch(), { splh: 100, minShift: 4 });
  const mon = r.days[0];
  for (const [a, b] of mon.shifts) assert.ok(b <= 14 || a >= 16, `${a}-${b} crosses the closure`);
  assert.match(r.notes.join(" "), /breaks .*Mon 14:00 \(2 of 24 days\), Mon 15:00 \(2 of 24 days\)/);
  const k = demandShifts(lunch(), { splh: 100, minShift: 4, keepRare: true });
  assert.ok(k.days[0].shifts.some(([a, b]) => a < 16 && b > 14), "--keep-rare staffs the closure as before");
  const set = demandShifts(lunch(), { splh: 100, minShift: 4, open: 8, close: 19 });
  assert.ok(set.days[0].shifts.some(([a, b]) => a < 16 && b > 14), "--open/--close are taken as given");
});
test("a quiet hour in a shop that is quiet all day stays staffed (no busy neighbours)", () => {
  // Sales in most hours on only some dates: 11:00 trades on 3 of 24, its neighbours on 10 of 24 (under half).
  let csv = "Date Time,Sales\n";
  for (let w = 0; w < 24; w++) {
    const day = new Date(Date.UTC(2026, 0, 5 + 7 * w)).toISOString().slice(0, 10);
    for (const h of [9, 10, 12, 13]) if (w % 12 < 5 || h === 9 || h === 13) csv += `${day} ${h}:00,40\n`;
    if (w < 3) csv += `${day} 11:00,40\n`;
  }
  const p = headcount(...(() => { const s = hourlySales(csv); return [s.avg, s.observed, { splh: 100, seen: s.seen }]; })());
  assert.equal(p[0][11], 1);
});
test("a file too large to spread into Math.max still reads (the French bakery has 234,005 lines)", () => {
  const rows = ["Date Time,Sales"];
  for (let i = 0; i < 200000; i++) rows.push(`2026-0${1 + (i % 9)}-1${i % 10} ${8 + (i % 10)}:00,1`);
  const r = hourlySales(rows.join("\n"));
  assert.equal(r.rows, 200000);
  assert.ok(backtestSales(rows.join("\n"), { splh: 50 }).weeks > 0);
});

// --short-cost (2026-11-11): the newsvendor fractile instead of the average.
import { shortCostShare, averageSales, demandShifts as dShifts, backtestSales as bSales } from "./demand.mjs";

const fourMondays = (amounts) => amounts.map((a, i) => `2026-10-${String(5 + 7 * i).padStart(2, "0")} 10:00,${a}`);

test("shortCostShare is r / (1 + r) and refuses non-positive weights", () => {
  assert.equal(shortCostShare(1), 0.5);
  assert.equal(shortCostShare(3), 0.75);
  assert.ok(Math.abs(shortCostShare(1 / 3) - 0.25) < 1e-12);
  for (const bad of [0, -1, "x", Infinity]) assert.throws(() => shortCostShare(bad), /short cost/);
});

test("short cost staffs each hour for the r/(1+r) share of its past dates, not the average", () => {
  // Need per Monday at 10:00 with splh 100: 0 (a Monday with sales only at 11), 0, 3, 5 heads. Average 2.
  const rows = ["datetime,sales", ...fourMondays([0, 0, 300, 500]), "2026-10-05 11:00,50", "2026-10-12 11:00,50"].filter((l) => !/,0$/.test(l));
  const text = rows.join("\n");
  const plain = dShifts(text, { splh: 100, minStaff: 0, minShift: 1 });
  assert.equal(plain.days[0].shifts.filter(([a]) => a === 10).length, 2); // ceil(800/4/100)
  const at = (r) => dShifts(text, { splh: 100, minStaff: 0, minShift: 1, shortCost: r }).days[0].shifts.filter(([a]) => a === 10).length;
  assert.equal(at(1), 0);   // median of 0,0,3,5: the 2nd value (cum share 0.5)
  assert.equal(at(1.01), 3);
  assert.equal(at(3), 3);   // 75%: 3rd value
  assert.equal(at(4), 5);   // 80%: 4th value
  assert.match(dShifts(text, { splh: 100, shortCost: 3 }).notes.join(" "), /75% of its past dates/);
  assert.throws(() => dShifts(text, { splh: 100, shortCost: 0 }), /short cost/);
});

test("short cost: minimum staff, breaks and closed weekdays still apply; half-life weights the dates", () => {
  const a = averageSales([
    { key: "2026-10-05", day: 0, hour: 10, amount: 500 }, { key: "2026-10-12", day: 0, hour: 10, amount: 100 },
  ], { splh: 100, shortCost: 1, halfLife: 1 });
  // weights 0.5 (older) and 1: the newer date alone reaches half the weight, so the median is its 1 head
  assert.equal(a.heads[0][10], 1);
  const b = averageSales([
    { key: "2026-10-05", day: 0, hour: 10, amount: 500 }, { key: "2026-10-12", day: 0, hour: 10, amount: 100 },
  ], { splh: 100, shortCost: 1 });
  assert.equal(b.heads[0][10], 1); // equal weights: cum 0.5 at the smaller
  const p = headcount(a.avg, a.observed, { splh: 100, minStaff: 2, heads: a.heads });
  assert.equal(p[0][10], 2);
  assert.equal(p[1][10], 0);
});

test("backtest with short cost scores r x short + over and adds a fractile row per weighting", () => {
  const rows = ["datetime,sales"];
  // 10 weeks of Mondays alternating quiet (1 head) and busy (4 heads) at 10:00
  for (let w = 0; w < 10; w++) {
    const d = new Date(Date.UTC(2026, 0, 5 + 7 * w));
    for (let k = 0; k < 7; k++) {
      const day = new Date(d.getTime() + k * 86400000).toISOString().slice(0, 10);
      rows.push(`${day} 10:00,${k === 0 && w % 2 ? 400 : 100}`);
    }
  }
  const b = bSales(rows.join("\n"), { splh: 100, shortCost: 3 });
  assert.equal(b.shortCost, 3);
  assert.equal(b.methods[0].id, "all");
  assert.deepEqual(b.methods.slice(1).map((m) => m.id), ["q-all", "q-hl8", "q-hl4", "q-hl2", "q-last4", "q-last1"]);
  const base = b.methods[0], q = b.methods[1];
  assert.ok(Math.abs(base.miss - (3 * base.short + base.over)) < 1e-9);
  assert.ok(q.miss < base.miss, `fractile ${q.miss} should beat the average ${base.miss} at r 3`);
  assert.equal(bSales(rows.join("\n"), { splh: 100 }).methods.length, 6);
  // the page's "put N in the half-life box" hint reads these back
  assert.equal(b.methods.find((m) => m.id === "q-hl4").halfLife, 4);
  assert.equal(b.methods.find((m) => m.id === "q-hl4").shortCost, 3);
  assert.equal(b.methods[0].shortCost, undefined);
});

test("CLI: --short-cost reaches the plan and the backtest report", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const dir = mkdtempSync(tmpdir() + "/sc-");
  const rows = ["datetime,sales"];
  for (let i = 0; i < 70; i++) { const day = new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10); rows.push(`${day} 10:00,${i % 3 ? 100 : 350}`); }
  writeFileSync(dir + "/s.csv", rows.join("\n"));
  const p = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "100", "--short-cost", "3"], { encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stderr, /Short-vs-over weight 3/);
  const b = spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "100", "--short-cost", "3", "--backtest"], { encoding: "utf8" });
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /3xshort\+over/);
  assert.match(b.stdout, /every earlier week, short cost 3/);
  assert.equal(spawnSync("node", [cli, "--from-sales", dir + "/s.csv", "--splh", "100", "--short-cost", "0"], { encoding: "utf8" }).status, 2);
});
