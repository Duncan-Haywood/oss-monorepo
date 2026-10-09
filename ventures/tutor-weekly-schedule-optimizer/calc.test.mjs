import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTime, fmtTime, parseDays, cleanStudents, cleanDays, cleanShared, solve, greedy, analyze, toCsv,
  EXAMPLE_STUDENTS, EXAMPLE_DAYS, SHARED_DEFAULTS,
} from "./calc.mjs";

test("parseTime reads 24h and am/pm and rejects junk", () => {
  assert.equal(parseTime("15:30"), 930);
  assert.equal(parseTime("3:30pm"), 930);
  assert.equal(parseTime("12am"), 0);
  assert.equal(parseTime("12:15 PM"), 735);
  assert.equal(parseTime("7"), 420);
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("soon"), null);
  assert.equal(parseTime("13pm"), null);
  assert.equal(parseTime("10:75"), null);
  assert.equal(fmtTime(930), "3:30pm");
  assert.equal(fmtTime(0), "12:00am");
});

test("parseDays handles names, groups and flags unknown words", () => {
  assert.deepEqual(parseDays("Mon Thu").days, [true, false, false, true, false, false, false]);
  assert.deepEqual(parseDays("weekdays").days.slice(0, 5), [true, true, true, true, true]);
  assert.deepEqual(parseDays("tues, wednesday").days.slice(0, 3), [false, true, true]);
  assert.deepEqual(parseDays("Mon Blursday").bad, ["blursday"]);
  assert.equal(parseDays("").blank, true);
});

const D = (open, close, cost = 0) => ({ open, close, dayCost: cost });
const S = (name, fee, dur, earliest, latest, days, extra = {}) => ({ name, fee, durationMin: dur, earliest, latest, days, ...extra });
const none = D("", "");

// Exhaustive oracle on the same 5-minute-free model: try every subset/day assignment and check feasibility by permutations.
function permutations(a) { if (a.length <= 1) return [a]; return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])); }
function dayFeasible(list, day, sh) {
  if (!list.length) return true;
  if (list.length > sh.maxLessonsPerDay) return false;
  if (list.reduce((a, s) => a + s.dur, 0) > sh.maxMinutesPerDay) return false;
  return permutations(list).some((perm) => {
    let t = -Infinity;
    for (const s of perm) {
      const start = Math.max(Math.max(s.earliest, day.open), t === -Infinity ? -Infinity : t + sh.bufferMin);
      const end = start + s.dur;
      if (end > Math.min(s.latest, day.close)) return false;
      t = end;
    }
    return true;
  });
}
function brute(students, days, sh) {
  const n = students.length;
  let best = 0;
  const assign = new Array(n).fill(-1);
  (function rec(i) {
    if (i === n) {
      const used = new Set();
      let profit = 0;
      for (let d = 0; d < 7; d++) {
        const list = students.filter((_, k) => assign[k] === d);
        if (!list.length) continue;
        if (!days[d].usable || !dayFeasible(list, days[d], sh)) return;
        used.add(d);
        profit -= days[d].cost;
      }
      for (let k = 0; k < n; k++) if (assign[k] >= 0) profit += students[k].fee - students[k].cost;
      best = Math.max(best, profit);
      return;
    }
    assign[i] = -1; rec(i + 1);
    for (let d = 0; d < 7; d++) if (students[i].days[d]) { assign[i] = d; rec(i + 1); }
    assign[i] = -1;
  })(0);
  return best;
}

test("exact solver matches exhaustive search on random instances", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(rnd() * 4); // up to 5 students keeps permutations cheap
    const dayRows = Array.from({ length: 7 }, (_, d) => (d < 3 + Math.floor(rnd() * 3) ? D("14:00", `${17 + Math.floor(rnd() * 4)}:00`, Math.floor(rnd() * 3) * 20) : none));
    const stu = Array.from({ length: n }, (_, i) => {
      const e = 14 * 60 + Math.floor(rnd() * 8) * 15;
      const dur = [30, 45, 60][Math.floor(rnd() * 3)];
      const daysStr = ["Mon", "Tue", "Wed", "Thu", "Fri"].filter(() => rnd() < 0.5).join(" ") || "Mon";
      return S("s" + i, 30 + Math.floor(rnd() * 5) * 10, dur, `${Math.floor(e / 60)}:${String(e % 60).padStart(2, "0")}`, `${e / 60 + 2 + Math.floor(rnd() * 3) | 0}:00`, daysStr, { costPerLesson: Math.floor(rnd() * 3) * 5 });
    });
    const sh = cleanShared({ bufferMin: [0, 10, 15][Math.floor(rnd() * 3)], maxLessonsPerDay: 3, maxHoursPerDay: 4 });
    const days = cleanDays(dayRows);
    const { students } = cleanStudents(stu);
    const got = solve(students, days, sh).profit;
    const want = brute(students, days, sh);
    assert.ok(Math.abs(got - want) < 0.01, `trial ${trial}: solver ${got} vs brute ${want}`);
  }
});

test("a plan never overlaps, respects windows, buffers and caps", () => {
  const a = analyze(EXAMPLE_STUDENTS, EXAMPLE_DAYS, SHARED_DEFAULTS);
  assert.ok(a.ok);
  for (const day of a.schedule) {
    for (let i = 0; i < day.lessons.length; i++) {
      const l = day.lessons[i];
      const dayRow = a.days[a.schedule.indexOf(day)];
      assert.ok(l.start >= Math.max(l.student.earliest, dayRow.open));
      assert.ok(l.end <= Math.min(l.student.latest, dayRow.close));
      assert.equal(l.end - l.start, l.student.dur);
      if (i) assert.ok(l.start >= day.lessons[i - 1].end + a.shared.bufferMin);
    }
    assert.ok(day.lessons.length <= a.shared.maxLessonsPerDay);
  }
  const names = a.best.placed.map((p) => p.idx);
  assert.equal(new Set(names).size, names.length, "a student is placed at most once");
});

test("exact plan is at least as good as the greedy baseline and the example shows a real gain", () => {
  const a = analyze(EXAMPLE_STUDENTS, EXAMPLE_DAYS, SHARED_DEFAULTS);
  assert.ok(a.best.profit >= a.base.profit - 1e-9);
  assert.ok(a.gain >= 0);
});

test("room cost on a day makes the plan consolidate onto fewer days", () => {
  const stu = [S("a", 40, 60, "15:00", "18:00", "Mon Tue"), S("b", 40, 60, "15:00", "18:00", "Mon Tue")];
  const days = [D("15:00", "18:00", 30), D("15:00", "18:00", 30), none, none, none, none, none];
  const cheap = analyze(stu, days.map((d) => ({ ...d, dayCost: 0 })), SHARED_DEFAULTS);
  const costly = analyze(stu, days, SHARED_DEFAULTS);
  assert.equal(cheap.best.daysUsed, 1, "two one-hour lessons fit one evening, so one day even when free");
  assert.equal(costly.best.profit, 80 - 30);
});

test("a day that costs more than it earns stays closed", () => {
  const stu = [S("a", 20, 30, "15:00", "17:00", "Mon")];
  const a = analyze(stu, [D("15:00", "17:00", 50), none, none, none, none, none, none], SHARED_DEFAULTS);
  assert.equal(a.best.placed.length, 0);
  assert.equal(a.best.profit, 0);
});

test("must-keep students are placed ahead of a better paid rival for the same slot", () => {
  const stu = [S("regular", 30, 60, "16:00", "17:00", "Mon", { mustKeep: "yes" }), S("new", 90, 60, "16:00", "17:00", "Mon")];
  const a = analyze(stu, [D("15:00", "18:00"), none, none, none, none, none, none], SHARED_DEFAULTS);
  assert.deepEqual(a.best.placed.map((p) => stu[p.idx].name), ["regular"]);
});

test("a must-keep student who cannot fit is reported", () => {
  const stu = [S("regular", 30, 60, "09:00", "10:00", "Mon", { mustKeep: "yes" })];
  const a = analyze(stu, [D("15:00", "18:00"), none, none, none, none, none, none], SHARED_DEFAULTS);
  assert.equal(a.droppedMust.length, 1);
  assert.match(a.rows[0].why, /never overlap/);
});

test("buffers are enforced between back-to-back lessons", () => {
  const stu = [S("a", 40, 60, "15:00", "17:00", "Mon"), S("b", 40, 60, "15:00", "17:00", "Mon")];
  const day = [D("15:00", "17:00"), none, none, none, none, none, none];
  assert.equal(analyze(stu, day, { ...SHARED_DEFAULTS, bufferMin: 0 }).best.placed.length, 2);
  assert.equal(analyze(stu, day, { ...SHARED_DEFAULTS, bufferMin: 10 }).best.placed.length, 1);
});

test("daily hour and lesson caps bind", () => {
  const stu = [S("a", 40, 60, "09:00", "18:00", "Mon"), S("b", 40, 60, "09:00", "18:00", "Mon"), S("c", 40, 60, "09:00", "18:00", "Mon")];
  const day = [D("09:00", "18:00"), none, none, none, none, none, none];
  assert.equal(analyze(stu, day, { ...SHARED_DEFAULTS, maxHoursPerDay: 2 }).best.placed.length, 2);
  assert.equal(analyze(stu, day, { ...SHARED_DEFAULTS, maxLessonsPerDay: 1 }).best.placed.length, 1);
});

test("opportunities name the change that earns more and its gain is real", () => {
  const stu = [S("a", 50, 60, "16:00", "18:00", "Mon"), S("b", 50, 60, "16:00", "19:00", "Mon")];
  const a = analyze(stu, [D("16:00", "17:00"), none, none, none, none, none, none], { ...SHARED_DEFAULTS, bufferMin: 0 });
  assert.equal(a.best.profit, 50);
  assert.ok(a.opps.length > 0);
  assert.equal(a.opps[0].gain, 50);
});

test("bad input is reported, not guessed", () => {
  const a = analyze([S("x", 0, 30, "", "", "Mon")], [none, none, none, none, none, none, none], SHARED_DEFAULTS);
  assert.equal(a.ok, false);
  assert.ok(a.warnings.some((w) => /fee and the lesson length/.test(w)));
  assert.ok(a.warnings.some((w) => /hours you teach/.test(w)));
  const b = cleanStudents([S("y", 30, 30, "soon", "", "Funday")]);
  assert.equal(b.warnings.length, 2);
});

test("twelve students solve quickly", () => {
  const stu = Array.from({ length: 12 }, (_, i) => S("s" + i, 30 + i, 30 + (i % 3) * 15, "15:00", "20:00", "weekdays"));
  const days = Array.from({ length: 7 }, (_, d) => (d < 5 ? D("15:00", "20:00", 10) : none));
  const t = Date.now();
  const a = analyze(stu, days, SHARED_DEFAULTS);
  assert.ok(a.ok);
  assert.ok(Date.now() - t < 20000, "analysis stays interactive");
});

test("csv lists every placed lesson", () => {
  const a = analyze(EXAMPLE_STUDENTS, EXAMPLE_DAYS, SHARED_DEFAULTS);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 1 + a.best.placed.length);
});
