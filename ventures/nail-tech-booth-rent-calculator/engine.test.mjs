import test from "node:test";
import assert from "node:assert/strict";
import { compare, week, normalizeOptions, parseWeeks, history, summarizeCompare, summarizeHistory, money, pct, MODELS } from "./engine.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const byId = (c, id) => c.models.find((m) => m.id === id);

test("defaults by hand: booth week", () => {
  const w = week({}, "booth");
  // 24 clients x $60 = 1440 services, 18% tips = 259.20, retail 120 at 40% margin = 48.
  close(w.service, 1440);
  close(w.tips, 259.2);
  close(w.bookedHours, 30);
  close(w.idleHours, 6);
  close(w.hoursWorked, 40);
  close(w.income, 1440 + 259.2 + 48);
  // rent 275 + card 2.9% of (1440+259.2+120) + supplies 156 + (40+35)*12/52
  close(w.costs, 275 + 0.029 * 1819.2 + 156 + (75 * 12) / 52);
  close(w.seTax, w.net * 0.9235 * 0.153);
  close(w.incomeReserve, (w.net - w.seTax / 2) * 0.1);
  close(w.takeHome, w.net - w.seTax - w.incomeReserve);
  close(w.perWorkedHour, w.takeHome / 40);
  close(w.perBookedHour, w.takeHome / 30);
});

test("commission and employee weeks by hand", () => {
  const c = week({}, "commission");
  close(c.income, 1440 * 0.55 + 259.2 + 12);
  close(c.costs, 156 * 0.2 + (75 * 12) / 52);
  const e = week({}, "employee");
  close(e.hoursWorked, 36);
  close(e.income, 15 * 36 + 259.2 + 12);
  close(e.costs, 0);
  close(e.seTax, e.income * 0.0765);
  assert.equal(e.seLabel, "payroll tax (employee share)");
});

test("compare ranks on take-home per hour worked and finds crossovers and break-even", () => {
  const c = compare({});
  assert.equal(c.models.length, MODELS.length);
  assert.equal(c.best.id, "booth");
  assert.equal(money(byId(c, "booth").perWorkedHour), "$23.86");
  assert.equal(money(byId(c, "booth").perBookedHour), "$31.81");
  assert.equal(byId(c, "employee").breakEvenClients, null);
  for (const id of ["booth", "commission"]) {
    const m = byId(c, id);
    close(week(c.options, id, m.breakEvenClients).perWorkedHour, 25, 0.02);
  }
  const x = c.crossovers.boothVsCommission;
  close(week(c.options, "booth", x).perWorkedHour, week(c.options, "commission", x).perWorkedHour, 0.02);
  assert.equal(x.toFixed(1), "13.0");
  assert.equal(c.crossovers.boothVsEmployee.toFixed(1), "18.6");
});

test("idle chair time lowers per-hour-worked but not the weekly booth bill", () => {
  const busy = week({}, "booth", 30);
  const slow = week({}, "booth", 12);
  assert.ok(slow.idleHours > busy.idleHours);
  assert.ok(slow.perWorkedHour < busy.perWorkedHour);
  const c = compare({ clientsPerWeek: 12 });
  assert.equal(c.best.id, "employee");
  assert.ok(byId(c, "booth").perWorkedHour < byId(c, "employee").perWorkedHour);
});

test("booked beyond the hours at the salon extends hours worked, no idle time", () => {
  const w = week({ hoursAtSalon: 20, clientsPerWeek: 20, minutesPerClient: 90 }, "booth");
  close(w.bookedHours, 30);
  close(w.idleHours, 0);
  close(w.hoursWorked, 34);
  close(week({ hoursAtSalon: 20, clientsPerWeek: 20, minutesPerClient: 90 }, "employee").hoursWorked, 30);
});

test("losing weeks pay no tax set-aside", () => {
  const w = week({ clientsPerWeek: 0 }, "booth");
  assert.ok(w.net < 0);
  assert.equal(w.seTax, 0);
  assert.equal(w.incomeReserve, 0);
});

test("tax rates are parameters", () => {
  const a = week({ seTaxPct: 0, incomeReservePct: 0 }, "booth");
  close(a.takeHome, a.net);
  const b = week({}, "booth");
  assert.ok(b.takeHome < a.takeHome);
});

test("validation names the field", () => {
  assert.throws(() => normalizeOptions({ avgTicket: "abc" }), /avgTicket must be a number/);
  assert.throws(() => normalizeOptions({ targetHourly: 0 }), /targetHourly must be between/);
  assert.throws(() => normalizeOptions({ splitPct: 120 }), /splitPct must be between/);
  assert.throws(() => normalizeOptions({ hoursAtSalon: 200 }), /hoursAtSalon must be between/);
  assert.equal(normalizeOptions({ avgTicket: "$1,200" }).avgTicket, 1200);
  assert.throws(() => week({}, "nope"), /unknown model/);
});

test("zero hours and zero clients never divide by zero", () => {
  const c = compare({ hoursAtSalon: 0, unpaidHours: 0, clientsPerWeek: 0 });
  for (const m of c.models) assert.equal(m.perWorkedHour, null);
  assert.doesNotThrow(() => summarizeCompare({ ...c, best: { ...c.models[0], perWorkedHour: 0, takeHome: 0, hoursWorked: 0 } }));
  assert.equal(week({ clientsPerWeek: 0 }, "booth").perBookedHour, null);
});

test("summary names the best arrangement and the crossover", () => {
  const s = summarizeCompare(compare({}));
  assert.equal(s.status, "below");
  assert.match(s.text, /Best is Booth \/ chair rent at \$23\.86/);
  assert.match(s.text, /overtakes the commission split at about 13\.0 clients/);
  assert.equal(summarizeCompare(compare({ targetHourly: 10 })).status, "ok");
});

test("parseWeeks reports line numbers and never throws", () => {
  const p = parseWeeks("week,model,pay,tips,expenses,hours,booked_hours\nw1,booth,1000,100,300,40,25\n# note\nw2,booth,x,1,1,1\nw3,salon,100,1,1,10\nw4,booth,100,1,1,0\nw5,booth,100,1,1,10,12\nshort,row\nw6,employee,500,50,0,30");
  assert.equal(p.weeks.length, 2);
  assert.equal(p.weeks[1].bookedHours, null);
  assert.equal(p.errors.length, 5);
  assert.match(p.errors[0], /^Line 4: pay/);
  assert.match(p.errors[1], /^Line 5: model must be/);
  assert.match(p.errors[2], /^Line 6: hours/);
  assert.match(p.errors[3], /^Line 7: booked_hours/);
  assert.match(p.errors[4], /^Line 8: expected/);
  assert.deepEqual(parseWeeks(null), { weeks: [], errors: [] });
});

test("history groups by arrangement, ranks worst first and sizes the shortfall", () => {
  const h = history(parseWeeks("A,booth,1000,100,300,40,20\nB,booth,600,50,300,40,20\nC,employee,700,100,0,36"), { targetHourly: 20 });
  assert.equal(h.weeks[0].name, "B");
  close(h.weeks[0].net, 350);
  close(h.weeks[0].idleShare, 0.5);
  assert.equal(h.weeks[2].idleShare, null);
  assert.equal(h.byModel.length, 2);
  assert.ok(h.below >= 1);
  close(h.shortfall, h.weeks.reduce((a, w) => a + w.shortfall, 0));
  close(h.blendedHourly, h.takeHome / 116);
  assert.equal(summarizeHistory(h).status, "below");
  assert.equal(summarizeHistory(history({ weeks: [] })).status, "empty");
});

test("money and pct format and tolerate non-numbers", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-3), "-$3.00");
  assert.equal(money(null), "n/a");
  assert.equal(money(Infinity), "n/a");
  assert.equal(pct(0.5, 0), "50%");
});
