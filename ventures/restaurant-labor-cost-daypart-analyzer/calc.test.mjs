import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDateTime, parseClock, parseDayparts, normalizeSales, normalizeLabor, analyze, reportCsv, summaryText, sampleCsv, detectDelimiter, decodeBuffer } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);
const S = (text) => normalizeSales(parseCsv(text));
const L = (text) => normalizeLabor(parseCsv(text));

test("date-times: ISO, US with AM/PM, day-first when the first number exceeds 12, date only", () => {
  const a = parseDateTime("2026-09-01 14:30"), b = parseDateTime("9/1/2026 2:30 PM"), c = parseDateTime("2026-09-01T14:30:00");
  assert.deepEqual(a, b); assert.deepEqual(a, c);
  assert.equal(a.min, 14 * 60 + 30);
  assert.equal(parseDateTime("13/01/2026").day, parseDateTime("2026-01-13").day);
  assert.equal(parseDateTime("2026-09-01").min, null);
  assert.equal(parseDateTime("2026-02-30"), undefined);
  assert.equal(parseDateTime("hello"), undefined);
});

test("clock times: 24h, AM/PM, noon and midnight, ranges use the start", () => {
  assert.equal(parseClock("14"), 840);
  assert.equal(parseClock("2 PM"), 840);
  assert.equal(parseClock("12:00 AM"), 0);
  assert.equal(parseClock("12:30 PM"), 12 * 60 + 30);
  assert.equal(parseClock("14:00-15:00"), 840);
  assert.equal(parseClock("13 PM"), undefined);
  assert.equal(parseClock("noon"), undefined);
});

test("dayparts: wrap past midnight, must cover all 24 hours with no overlap", () => {
  const ok = parseDayparts("Day 6-22, Late 22-6");
  assert.equal(ok.owner[5], "Late"); assert.equal(ok.owner[6], "Day"); assert.equal(ok.owner[23], "Late");
  assert.match(parseDayparts("Day 6-22").error, /belongs to no daypart/);
  assert.match(parseDayparts("A 6-12, B 10-14, C 14-6").error, /both/);
  assert.match(parseDayparts("nonsense").error, /Could not read/);
  assert.match(parseDayparts("").error, /at least one/);
});

test("sales: hour column, combined date-time, refunds keep sign, totals and unreadable rows are skipped and counted", () => {
  const r = S("Date,Hour,Net Sales\n2026-09-01,9,100\n2026-09-01,10 AM,-20\nTotal,,80\n2026-09-01,,5\nbad,9,5\n2026-09-01,11,x");
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].sales, -20);
  assert.deepEqual(r.skipped.map((x) => x.reason), ["total row", "no hour of day", "date not readable", "sales not readable"]);
  const dt = S("Opened,Net\n9/1/2026 2:15 PM,\"1,000.50\"");
  near(dt.rows[0].sales, 1000.5);
  assert.match(S("Foo,Bar\n1,2").error, /No header row/);
  assert.match(S("").error, /empty/);
});

test("labor: in/out with rate, pay wins over rate, overnight shift rolls to next day, bad shifts are skipped with a reason", () => {
  const r = L("Employee,Job,In Date,Out Date,Hourly Rate,Total Pay\nA,Server,2026-09-01 09:00,2026-09-01 17:00,15,\nB,Cook,2026-09-01 09:00,2026-09-01 17:00,15,200\nC,Cook,2026-09-01 22:00,2026-09-01 02:00,10,\nD,Cook,2026-09-01 09:00,,10,\nE,Cook,2026-09-01 09:00,2026-09-03 12:00,10,");
  assert.equal(r.shifts.length, 3);
  assert.equal(r.shifts[0].cost, 120); assert.equal(r.shifts[0].costFrom, "rate");
  assert.equal(r.shifts[1].cost, 200); assert.equal(r.shifts[1].costFrom, "pay");
  assert.equal((r.shifts[2].t1 - r.shifts[2].t0) / 60, 4);
  assert.deepEqual(r.skipped.map((x) => x.reason), ["still clocked in (no clock-out)", "shift longer than 24 hours"]);
});

test("labor: date and hours without clock times are kept as day-only", () => {
  const r = L("Employee,Date,Hours,Hourly Rate\nA,2026-09-01,8,15");
  assert.equal(r.shifts.length, 0); assert.equal(r.dayOnly[0].cost, 120);
  assert.match(L("x,y\n1,2").error, /No header row/);
});

// Five days, one sales row per hour 10-12 and one shift 10:00-12:00 at $10/h, no burden.
function fixture(extra = "") {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
  const sales = "Date,Hour,Net Sales\n" + days.map((d) => `${d},10,100\n${d},11,50`).join("\n");
  const labor = "Employee,Job,In Date,Out Date,Hourly Rate\n" + days.map((d) => `A,Server,${d} 10:00,${d} 12:00,10\nB,Server,${d} 10:00,${d} 12:00,10`).join("\n") + extra;
  return { s: S(sales).rows, l: L(labor) };
}

test("hand-checked totals: 5 days, $750 sales, 20 labor hours, $200 labor = 26.7%, $37.50 per labor hour", () => {
  const { s, l } = fixture();
  const a = analyze(s, l, { burdenPct: 0, minCrew: 0 });
  assert.equal(a.invalid, undefined);
  near(a.summary.sales, 750); near(a.summary.laborCost, 200); near(a.summary.laborHours, 20);
  near(a.summary.laborPct, 26.6667, 1e-3); near(a.summary.splh, 37.5);
  assert.equal(a.summary.days, 5);
});

test("burden is added to every wage: 12% on $200 is $224", () => {
  const { s, l } = fixture();
  near(analyze(s, l, { burdenPct: 12 }).summary.laborCost, 224);
});

test("trimmable is capped by the minimum crew: hour 10 has $100 sales and $40 labor at a 30% target", () => {
  const { s, l } = fixture();
  // Hour 10 per day: 2 staff, $20 wage... 2 h total labor across hours -> per hour: 2 staff x $10 = $20 on $100 (20%); hour 11: $20 on $50 (40%).
  const open = analyze(s, l, { burdenPct: 0, minCrew: 0, targetPct: 30 });
  // Hour 11: cost 100 over 5 days vs 30% x 250 = 75, so 25 excess; 2 avg staff, min crew 0 -> not capped.
  near(open.summary.trim, 25);
  const held = analyze(s, l, { burdenPct: 0, minCrew: 2, targetPct: 30 });
  assert.equal(held.summary.trim, 0); // already at the minimum crew of 2, nothing can go
  const one = analyze(s, l, { burdenPct: 0, minCrew: 1, targetPct: 30 });
  near(one.summary.trim, 25); // half the crew (50h*... ) is worth $50, the excess is $25 and is the smaller number
});

test("dayparts and weekdays reconcile to the total; day-only hours reach weekdays but not dayparts", () => {
  const { s, l } = fixture("\nC,Server,x,x,10");
  const a = analyze(s, l, { burdenPct: 0 });
  const dpCost = a.dayparts.reduce((t, d) => t + d.cost, 0), wdCost = a.weekdays.reduce((t, d) => t + d.cost, 0);
  near(dpCost, a.summary.laborCost); near(wdCost, a.summary.laborCost);
  const d = fixture();
  const withDayOnly = normalizeLabor(parseCsv("Employee,Date,Hours,Hourly Rate\nZ,2026-09-01,4,10"));
  const merged = { shifts: d.l.shifts, dayOnly: withDayOnly.dayOnly };
  const b = analyze(d.s, merged, { burdenPct: 0 });
  near(b.summary.laborCost, 240);
  near(b.weekdays.reduce((t, x) => t + x.cost, 0), 240);
  near(b.dayparts.reduce((t, x) => t + x.cost, 0), 200);
  assert.ok(b.findings.some((f) => /no clock times/.test(f.title)));
});

test("a shift is spread across the hours it covers by minutes: 09:30-11:00 puts 30 min in hour 9 and 60 in hour 10", () => {
  const sales = S("Date,Hour,Net Sales\n2026-09-01,9,50\n2026-09-02,9,50\n2026-09-03,9,50\n2026-09-01,10,50").rows;
  const labor = L("Employee,Job,In Date,Out Date,Hourly Rate\nA,Cook,2026-09-01 09:30,2026-09-01 11:00,12");
  const a = analyze(sales, labor, { burdenPct: 0 });
  const h9 = a.grid.find((g) => g.hour === 9 && g.dowName === "Tue"), h10 = a.grid.find((g) => g.hour === 10);
  near(h9.hours, 0.5); near(h9.cost, 6); near(h10.hours, 1); near(h10.cost, 12);
});

test("the business day starts at the day-start hour: a 01:00 sale belongs to the previous day's weekday", () => {
  const sales = S("Date,Hour,Net Sales\n2026-09-02,01:00,40\n2026-09-02,12,10\n2026-09-03,12,10\n2026-09-04,12,10").rows;
  const a = analyze(sales, { shifts: [], dayOnly: [] }, { dayStartHour: 4 });
  const late = a.grid.find((g) => g.hour === 1);
  assert.equal(late.dowName, "Tue"); // 2026-09-01 is a Tuesday; 01:00 on the 2nd is still Tuesday's night
  const strict = analyze(sales, { shifts: [], dayOnly: [] }, { dayStartHour: 0 });
  assert.equal(strict.grid.find((g) => g.hour === 1).dowName, "Wed");
});

test("excluded roles are left out of the percentages and reported", () => {
  const { s, l } = fixture("\nM,General Manager,2026-09-01 10:00,2026-09-01 12:00,50");
  const a = analyze(s, l, { burdenPct: 0, excludeRoles: ["manager"] });
  near(a.summary.laborCost, 200);
  assert.equal(a.flags.excludedShifts, 1);
  assert.ok(a.findings.some((f) => /excluded by role/.test(f.title)));
});

test("a shift with no pay uses the typed default wage and is flagged; with none typed it is flagged high", () => {
  const { s } = fixture();
  const l = L("Employee,Job,In Date,Out Date\nA,Server,2026-09-01 10:00,2026-09-01 12:00");
  const withDefault = analyze(s, l, { burdenPct: 0, defaultWage: 15 });
  near(withDefault.summary.laborCost, 30);
  assert.ok(withDefault.findings.some((f) => /used the default wage/.test(f.title)));
  const none = analyze(s, l, { burdenPct: 0 });
  assert.equal(none.summary.laborCost, 0);
  assert.equal(none.findings.find((f) => /no pay and no default wage/.test(f.title)).severity, "high");
});

test("files covering different days are flagged", () => {
  const { s, l } = fixture("\nA,Server,2026-09-10 10:00,2026-09-10 12:00,10");
  const a = analyze(s, l, { burdenPct: 0 });
  assert.ok(a.findings.some((f) => /do not cover the same days/.test(f.title)));
});

test("labor in an hour with no sales is counted separately", () => {
  const { s, l } = fixture("\nA,Cook,2026-09-01 06:00,2026-09-01 07:00,10");
  const a = analyze(s, l, { burdenPct: 0 });
  near(a.summary.noSalesHours, 1); near(a.summary.noSalesCost, 10);
});

test("invalid inputs are refused with a reason", () => {
  const { s, l } = fixture();
  assert.match(analyze(s, l, { targetPct: 0 }).invalid, /Target/);
  assert.match(analyze(s, l, { burdenPct: 120 }).invalid, /burden/);
  assert.match(analyze(s, l, { dayparts: "Day 6-22" }).invalid, /no daypart/);
  assert.match(analyze(s.slice(0, 2), { shifts: [], dayOnly: [] }).invalid, /business day/);
  assert.match(analyze([], { shifts: [], dayOnly: [] }).invalid, /Nothing to analyze/);
});

test("sample data reads clean, reconciles, and shows an over-target afternoon", () => {
  const smp = sampleCsv();
  const sr = S(smp.sales), lr = L(smp.labor);
  assert.equal(sr.skipped.length, 0); assert.equal(lr.skipped.length, 0);
  const a = analyze(sr.rows, lr);
  assert.equal(a.invalid, undefined);
  near(a.dayparts.reduce((t, d) => t + d.cost, 0), a.summary.laborCost, 1e-6);
  near(a.dayparts.reduce((t, d) => t + d.sales, 0), a.summary.sales, 1e-6);
  near(a.weekdays.reduce((t, d) => t + d.cost, 0), a.summary.laborCost, 1e-6);
  const worst = [...a.dayparts].sort((x, y) => y.pct - x.pct)[0];
  assert.equal(worst.name, "Afternoon");
  assert.ok(a.summary.trim > 0);
});

test("csv report and summary text carry the figures", () => {
  const smp = sampleCsv();
  const a = analyze(S(smp.sales).rows, L(smp.labor));
  const csv = reportCsv(a).trim().split("\n");
  assert.equal(csv.length, a.grid.length + 1);
  assert.match(csv[0], /^weekday,hour,/);
  const txt = summaryText(a);
  assert.match(txt, /of sales \(target 30%\)/);
  assert.match(txt, /not advice/);
});

test("delimiters and UTF-16 are handled", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a\tb\n1\t2"), "\t");
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Date,Hour"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Date,Hour");
});
