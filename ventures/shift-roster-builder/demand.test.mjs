import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlySales, headcount, cutShifts, demandShifts } from "./demand.mjs";
import { parseShifts } from "./calc.mjs";

// Invented hand-built sales; no real POS export has been tested.
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
  assert.match(r.shiftsText, /^Mon\/Tue, 9:00, 12:00, 2\nMon\/Tue, 10:00, 13:00, 1/);
  const p = parseShifts(r.shiftsText);
  assert.deepEqual(p.errors, []);
  assert.equal(p.slots.length, r.days.reduce((a, d) => a + d.shifts.length, 0));
  assert.equal(r.needed, 2 * (2 + 3 + 1));
  assert.equal(r.extra, r.scheduled - r.needed);
});
test("bad rows are skipped with a reason; missing columns are reported", () => {
  const r = hourlySales("Date Time,Sales\nsoon,10\n2026-11-02 09:00,abc\n2026-11-02 09:00,-5\n2026-11-02 09:00,40");
  assert.equal(r.rows, 1);
  assert.equal(r.skipped.length, 3);
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
