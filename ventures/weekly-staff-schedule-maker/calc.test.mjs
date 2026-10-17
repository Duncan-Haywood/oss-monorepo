import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, readSpec, expandSlots, buildSchedule, validateSchedule, scheduleCsv, gridCsv, scheduleText, sampleFields, rng, DAYS } from "./calc.mjs";

const mk = (over = {}) => readSpec({ ...sampleFields(), ...over });

test("parseStaff reads roles, limits, rates and days off", () => {
  const { staff, errors } = parseStaff("Ana: Server, host; max 32; min 10; rate 17.5; off Mon Tue\nBen: cook");
  assert.deepEqual(errors, []);
  assert.deepEqual(staff[0].roles, ["server", "host"]);
  assert.equal(staff[0].max, 32);
  assert.equal(staff[0].min, 10);
  assert.equal(staff[0].rate, 17.5);
  assert.deepEqual([...staff[0].off], [0, 1]);
  assert.equal(staff[1].max, 40);
});

test("parseStaff reports bad lines instead of guessing", () => {
  assert.ok(parseStaff("Ana").errors[0].includes("role"));
  assert.ok(parseStaff("Ana: cook; max lots").errors.length);
  assert.ok(parseStaff("Ana: cook; off Funday").errors.length);
  assert.ok(parseStaff("Ana: cook; min 30; max 20").errors.length);
  assert.ok(parseStaff("Ana: cook\nana: cook").errors.some((e) => e.includes("twice")));
  assert.ok(parseStaff("").errors.length);
});

test("parseShifts handles ranges, wrap-around ranges, keywords and overnight", () => {
  const { shifts, errors } = parseShifts("Fri-Mon 22:00-02:00 bartender x2\nweekends 09:00-17:00 host\nClose | daily 16:00-23:30 server");
  assert.deepEqual(errors, []);
  assert.deepEqual(shifts[0].days, [0, 4, 5, 6]);
  assert.equal(shifts[0].end, 26 * 60);
  assert.equal(shifts[0].count, 2);
  assert.deepEqual(shifts[1].days, [5, 6]);
  assert.equal(shifts[2].label, "Close");
  assert.equal(shifts[2].days.length, 7);
});

test("parseShifts rejects nonsense", () => {
  assert.ok(parseShifts("Mon 25:00-26:00 cook").errors.length);
  assert.ok(parseShifts("Moon 09:00-10:00 cook").errors.length);
  assert.ok(parseShifts("Mon 09:00-09:00 cook").errors.length);
  assert.ok(parseShifts("Mon 09:00-10:00 cook x0").errors.length);
  assert.ok(parseShifts("just words").errors.length);
});

test("readSpec flags a role nobody has and a non-Monday week start", () => {
  const a = mk({ shifts: "Mon 09:00-17:00 pilot" });
  assert.ok(a.errors.some((e) => e.includes("pilot")));
  assert.ok(mk({ weekStart: "2026-10-13" }).errors.some((e) => e.includes("Monday")));
  assert.deepEqual(mk({ weekStart: "2026-10-12" }).errors, []);
  assert.ok(mk({ minRest: "99" }).errors.length);
  assert.ok(mk({ maxRun: "0" }).errors.length);
});

test("the sample week fills every slot and passes the independent validator", () => {
  const { spec, errors } = mk();
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 0);
  assert.equal(s.stats.filled, s.stats.slots);
  const v = validateSchedule(s);
  assert.deepEqual(v.errors, []);
});

test("same seed, same schedule; different seed may differ but stays valid", () => {
  const { spec } = mk();
  const a = buildSchedule(spec);
  const b = buildSchedule(spec);
  assert.deepEqual(a.assign, b.assign);
  const c = buildSchedule({ ...spec, seed: 7 });
  assert.deepEqual(validateSchedule(c).errors, []);
});

test("hand-checked: one cook, two shifts the same day cannot both be filled", () => {
  const { spec } = readSpec({ staff: "Cy: cook", shifts: "Mon 08:00-12:00 cook\nMon 13:00-17:00 cook", minRest: "0", maxRun: "6", seed: "1" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 1);
  assert.match(s.notices[0], /open/);
  assert.deepEqual(validateSchedule(s).errors, []);
});

test("rest rule: a close followed by an early open is not given to the same person", () => {
  const { spec } = readSpec({ staff: "Di: server\nEd: server", shifts: "Mon 16:00-23:00 server\nTue 07:00-12:00 server", minRest: "10", maxRun: "6", seed: "3" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 0);
  assert.notEqual(s.assign[0], s.assign[1]);
});

test("rest rule is shown as the cause when it blocks the only person", () => {
  const { spec } = readSpec({ staff: "Di: server", shifts: "Mon 16:00-23:00 server\nTue 07:00-12:00 server", minRest: "10", maxRun: "6", seed: "3" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 1);
  assert.match(s.notices[0], /1 eligible/);
});

test("rest wraps from Sunday night into the next Monday morning", () => {
  const { spec } = readSpec({ staff: "Di: server\nEd: server", shifts: "Sun 16:00-23:59 server\nMon 06:00-10:00 server", minRest: "10", maxRun: "7", seed: "1" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 0);
  assert.notEqual(s.assign[0], s.assign[1]);
});

test("weekly hour cap is never exceeded and surplus demand is reported open", () => {
  const { spec } = readSpec({ staff: "Fo: cook; max 10", shifts: "Mon-Fri 09:00-14:00 cook", minRest: "10", maxRun: "6", seed: "1" });
  const s = buildSchedule(spec);
  assert.equal(s.people[0].hours, 10);
  assert.equal(s.gaps.length, 3);
  assert.deepEqual(validateSchedule(s).errors, []);
});

test("days off are respected and said to be the reason when nobody is free", () => {
  const { spec } = readSpec({ staff: "Gi: cook; off Wed", shifts: "Wed 09:00-12:00 cook", minRest: "10", maxRun: "6", seed: "1" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 1);
  assert.match(s.notices[0], /nobody with that role is available/);
});

test("run limit: nobody works more than the longest run of days", () => {
  const { spec } = readSpec({ staff: "Hu: cook; max 80", shifts: "daily 09:00-12:00 cook", minRest: "10", maxRun: "3", seed: "1" });
  const s = buildSchedule(spec);
  assert.ok(s.people[0].shifts.length <= 6);
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.ok(s.gaps.length >= 1);
});

test("hours are spread by share of each person's limit, not dumped on one person", () => {
  const { spec } = readSpec({ staff: "A: cook; max 40\nB: cook; max 40\nC: cook; max 40", shifts: "Mon-Fri 09:00-17:00 cook x2", minRest: "10", maxRun: "6", seed: "5" });
  const s = buildSchedule(spec);
  assert.equal(s.gaps.length, 0);
  const hrs = s.people.map((p) => p.hours);
  assert.ok(Math.max(...hrs) - Math.min(...hrs) <= 8, hrs.join(","));
});

test("labor cost multiplies hours by rate, and is null if anyone lacks a rate", () => {
  const { spec } = readSpec({ staff: "A: cook; rate 20", shifts: "Mon 08:00-12:00 cook", minRest: "10", maxRun: "6", seed: "1" });
  assert.equal(buildSchedule(spec).stats.totalCost, 80);
  const { spec: spec2 } = readSpec({ staff: "A: cook; rate 20\nB: cook", shifts: "Mon 08:00-12:00 cook", minRest: "10", maxRun: "6", seed: "1" });
  assert.equal(buildSchedule(spec2).stats.totalCost, null);
});

test("minimum hours pull shifts toward the person who is short", () => {
  const { spec } = readSpec({ staff: "A: cook; max 40\nB: cook; max 40; min 12", shifts: "Mon-Wed 09:00-13:00 cook", minRest: "10", maxRun: "6", seed: "2" });
  const s = buildSchedule(spec);
  assert.ok(s.people[1].hours >= 12);
});

test("validator catches a hand-broken schedule", () => {
  const { spec } = mk();
  const s = buildSchedule(spec);
  const bad = { ...s, assign: s.assign.map((p, i) => (i === 0 ? spec.staff.findIndex((x) => !x.roles.includes(s.slots[0].role)) : p)) };
  assert.equal(validateSchedule(bad).ok, false);
  const dbl = { ...s, assign: s.slots.map(() => 0) };
  assert.ok(validateSchedule(dbl).errors.some((e) => /two shifts|over their|rest/.test(e)));
});

test("randomised: 40 seeded rosters always validate", () => {
  const r = rng(99);
  const roles = ["cook", "server", "host"];
  for (let t = 0; t < 40; t++) {
    const staff = Array.from({ length: 3 + Math.floor(r() * 6) }, (_, i) => `P${i}: ${roles.filter(() => r() < 0.6).concat(roles[i % 3]).filter((x, k, a) => a.indexOf(x) === k).join(", ")}; max ${10 + Math.floor(r() * 30)}${r() < 0.4 ? `; off ${DAYS[Math.floor(r() * 7)]}` : ""}`).join("\n");
    const shifts = roles.map((ro) => `Mon-Sun ${String(6 + Math.floor(r() * 10)).padStart(2, "0")}:00-${String(18 + Math.floor(r() * 6)).padStart(2, "0")}:30 ${ro} x${1 + Math.floor(r() * 2)}`).join("\n");
    const { spec, errors } = readSpec({ staff, shifts, minRest: "8", maxRun: "5", seed: String(t + 1) });
    if (errors.length) continue;
    const s = buildSchedule(spec, { restarts: 2, iters: 600 });
    assert.deepEqual(validateSchedule(s).errors, [], `${t}\n${staff}\n${shifts}`);
  }
});

test("CSV neutralises spreadsheet formulas in names and keeps every slot", () => {
  const { spec } = readSpec({ staff: "=HYPERLINK(\"x\"): cook", shifts: "Mon 08:00-12:00 cook", minRest: "10", maxRun: "6", seed: "1" });
  const s = buildSchedule(spec);
  const csv = scheduleCsv(s);
  assert.match(csv, /"'=HYPERLINK/);
  assert.equal(csv.trim().split("\r\n").length, 2);
  assert.match(gridCsv(s), /^Name,Mon,Tue/);
  assert.match(scheduleText(s), /WEEKLY SCHEDULE/);
});

test("week start labels each day with its date", () => {
  const { spec } = mk({ weekStart: "2026-10-12" });
  const s = buildSchedule(spec);
  assert.match(scheduleCsv(s), /Mon 10-12/);
  assert.match(scheduleCsv(s), /Sun 10-18/);
});

test("expandSlots multiplies headcount by days", () => {
  assert.equal(expandSlots(parseShifts("Mon-Fri 09:00-17:00 cook x3").shifts).length, 15);
});
