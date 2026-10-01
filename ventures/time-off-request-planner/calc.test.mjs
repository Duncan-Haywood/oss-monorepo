import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, fmtDate, weekday, parseWorkdays, parsePeople, parseRequests, parseMinimums, parseBlackouts,
  solve, decisionsCsv, calendarCsv, samplePeople, sampleRequests, sampleMinimums,
} from "./calc.mjs";

const setup = (people, reqs, mins, opts = {}) => {
  const p = parsePeople(people), q = parseRequests(reqs), m = parseMinimums(mins);
  assert.deepEqual([...p.errors, ...q.errors, ...m.errors], []);
  return solve(p.people, q.requests, { minimums: m.mins, ...opts });
};

test("dates round-trip, reject impossible days, and know the weekday", () => {
  assert.equal(fmtDate(parseDate("2026-07-06")), "2026-07-06");
  assert.equal(parseDate("7/6/2026"), parseDate("2026-07-06"));
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("nope"), null);
  assert.equal(weekday(parseDate("2026-07-06")), 0); // a Monday
  assert.equal(weekday(parseDate("1970-01-01")), 3); // a Thursday
  assert.equal(weekday(parseDate("2026-07-12")), 6);
});

test("workday specs parse ranges, lists and reject nonsense", () => {
  assert.deepEqual(parseWorkdays(""), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseWorkdays("Tue-Sat"), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseWorkdays("Mon/Wed/Fri"), [0, 2, 4]);
  assert.deepEqual(parseWorkdays("daily"), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(parseWorkdays("Funday"), null);
});

test("parsers report the line and what is wrong", () => {
  assert.match(parsePeople("Ana").errors[0], /line 1/);
  assert.match(parsePeople("Ana, Cook\nAna, Cook").errors[0], /listed twice/);
  assert.match(parseRequests("Ana, 2026-07-10, 2026-07-01").errors[0], /before the first/);
  assert.match(parseRequests("Ana, 2026-07-01, 2026-07-02, 9").errors[0], /priority/);
  assert.match(parseRequests("Ana, July 1, July 2").errors[0], /dates must look like/);
  assert.match(parseMinimums("cook, two").errors[0], /whole number/);
  assert.match(parseBlackouts("soon").errors[0], /Blackout/);
  assert.equal(parseRequests("name,start,end\nAna, 2026-07-01, 2026-07-02").requests.length, 1);
});

test("a role at its minimum cannot lose anyone, and the reason names the blockers", () => {
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-06, 2026-07-08\nBen, 2026-07-07, 2026-07-09", "Cook, 1");
  assert.equal(r.counts.approved, 1);
  const denied = r.decisions.find((d) => d.decision === "denied");
  assert.match(denied.reason, /1 of 2 Cook already off/);
  assert.match(denied.reason, /Ana|Ben/);
});

test("a minimum equal to the headcount means nobody in the role can be off", () => {
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-06, 2026-07-06", "Cook, 2");
  assert.equal(r.counts.approved, 0);
  assert.match(r.decisions[0].reason, /no Cook able to be off/);
  const over = setup("Ana, Cook", "Ana, 2026-07-06, 2026-07-06", "Cook, 3");
  assert.ok(over.warnings.some((w) => /need 3 cook/.test(w)));
});

test("weekends nobody works never consume cover, and an all-weekend request is free", () => {
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-04, 2026-07-05\nBen, 2026-07-06, 2026-07-06", "Cook, 1");
  assert.equal(r.counts.approved, 2);
  assert.match(r.decisions[0].reason, /never reduces cover/);
  const seven = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-04, 2026-07-05\nBen, 2026-07-04, 2026-07-05", "Cook, 1", { workdays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(seven.counts.approved, 1);
});

test("blackout dates deny a request outright", () => {
  const b = parseBlackouts("2026-07-08 to 2026-07-09");
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-06, 2026-07-08", "", { blackouts: b.ranges });
  assert.equal(r.counts.denied, 1);
  assert.match(r.decisions[0].reason, /2026-07-08 is a blackout/);
});

test("the daily cap on people off applies across roles", () => {
  const r = setup("Ana, A\nBen, B\nCy, C", "Ana, 2026-07-06, 2026-07-06\nBen, 2026-07-06, 2026-07-06\nCy, 2026-07-06, 2026-07-06", "", { maxOffPerDay: 2 });
  assert.equal(r.counts.approved, 2);
  assert.match(r.denied[0].reason, /your limit per day/);
});

test("unknown names are denied with a reason, and overlapping requests by one person warn", () => {
  const r = setup("Ana, Cook", "Zed, 2026-07-06, 2026-07-06\nAna, 2026-07-06, 2026-07-08\nAna, 2026-07-08, 2026-07-09", "");
  assert.match(r.decisions[0].reason, /not in the people list/);
  assert.ok(r.warnings.some((w) => /overlapping/.test(w)));
  assert.equal(r.approved.filter((d) => d.name === "Ana").length, 1);
});

test("a denied request gets the nearest window that works, or none", () => {
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-06, 2026-07-10\nBen, 2026-07-06, 2026-07-10", "Cook, 1");
  const d = r.denied[0];
  assert.ok(d.alt);
  // the suggestion really fits: it does not touch the approved week
  assert.ok(d.alt.start > parseDate("2026-07-10") || d.alt.end < parseDate("2026-07-06"));
  assert.equal(d.alt.end - d.alt.start, 4);
});

test("priority beats list order, and the plan never scores below first-come-first-served", () => {
  const r = setup("Ana, Cook\nBen, Cook", "Ana, 2026-07-06, 2026-07-08, 1\nBen, 2026-07-07, 2026-07-09, 5", "Cook, 1");
  assert.equal(r.approved[0].name, "Ben");
  assert.ok(r.plan.score >= r.fcfs.score);
  const sample = setup(samplePeople(), sampleRequests(), sampleMinimums());
  assert.ok(sample.plan.score > sample.fcfs.score);
});

test("days mode prefers the long trip over two short ones, requests mode the opposite", () => {
  const ppl = "Ana, Cook\nBen, Cook\nCy, Cook";
  const reqs = "Ana, 2026-07-06, 2026-07-17\nBen, 2026-07-06, 2026-07-08\nCy, 2026-07-13, 2026-07-15";
  const byDays = setup(ppl, reqs, "Cook, 2", { mode: "days" });
  const byReq = setup(ppl, reqs, "Cook, 2", { mode: "requests" });
  assert.deepEqual(byDays.approved.map((d) => d.name), ["Ana"]);
  assert.deepEqual(byReq.approved.map((d) => d.name).sort(), ["Ben", "Cy"]);
});

// Independent oracle: try every subset and check every rule day by day.
function brute(people, requests, mins, maxOff, mode) {
  const wd = [0, 1, 2, 3, 4];
  const roleOf = (n) => people.find((p) => p.name === n).role.toLowerCase();
  const counts = {};
  for (const p of people) counts[p.role.toLowerCase()] = (counts[p.role.toLowerCase()] || 0) + 1;
  let best = -1;
  for (let mask = 0; mask < 1 << requests.length; mask++) {
    const chosen = requests.filter((_, i) => mask & (1 << i));
    const offByDay = new Map();
    let ok = true, score = 0;
    for (const r of chosen) {
      const days = [];
      for (let d = r.start; d <= r.end; d++) if (wd.includes(weekday(d))) days.push(d);
      for (const d of days) {
        const k = d + "|" + r.name;
        if (offByDay.has(k)) ok = false;
        offByDay.set(k, roleOf(r.name));
      }
      score += (mode === "days" ? days.length : 1) * r.priority;
    }
    if (!ok) continue;
    const byDay = new Map();
    for (const [k, role] of offByDay) {
      const d = k.split("|")[0];
      if (!byDay.has(d)) byDay.set(d, {});
      byDay.get(d)[role] = (byDay.get(d)[role] || 0) + 1;
    }
    for (const roles of byDay.values()) {
      let tot = 0;
      for (const [role, n] of Object.entries(roles)) {
        tot += n;
        if (counts[role] - n < (mins[role] ?? 0)) ok = false;
      }
      if (tot > maxOff) ok = false;
    }
    if (ok && score > best) best = score;
  }
  return best;
}

test("the search matches an exhaustive subset search on random small problems", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const base = parseDate("2026-07-06");
  for (let trial = 0; trial < 60; trial++) {
    const people = [];
    for (let i = 0; i < 6; i++) people.push({ name: "P" + i, role: ["Cook", "Cashier"][i % 2 === 0 ? 0 : 1] });
    const requests = [];
    const n = 4 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const start = base + Math.floor(rnd() * 12), end = start + Math.floor(rnd() * 5);
      requests.push({ name: "P" + Math.floor(rnd() * 6), start, end, priority: 1 + Math.floor(rnd() * 5), line: i + 1 });
    }
    const mins = { cook: 1 + Math.floor(rnd() * 2), cashier: 1 };
    const maxOff = rnd() < 0.5 ? 2 : Infinity;
    const mode = rnd() < 0.5 ? "days" : "requests";
    const r = solve(people, requests, { minimums: mins, maxOffPerDay: maxOff, mode });
    assert.equal(r.exact, true);
    const free = r.decisions.filter((d) => d.kind === "free");
    const planScore = r.plan.score + free.reduce((s, d) => s + (mode === "days" ? 0 : d.priority), 0);
    const oracle = brute(people, requests, mins, maxOff, mode);
    assert.equal(planScore, oracle, `trial ${trial}`);
    // and the approved set really satisfies the rules day by day
    const off = new Map();
    for (const d of r.approved) for (const day of d.days) {
      const key = day + "|" + d.role;
      off.set(key, (off.get(key) || 0) + 1);
    }
    for (const [key, v] of off) {
      const role = key.split("|")[1];
      assert.ok(people.filter((p) => p.role.toLowerCase() === role).length - v >= (mins[role] ?? 0), key);
    }
  }
});

test("the calendar lists every day anyone is off with cover per role, and flags tight days", () => {
  const r = setup("Ana, Cook\nBen, Cook\nCy, Cook", "Ana, 2026-07-06, 2026-07-07", "Cook, 2");
  assert.equal(r.calendar.length, 2);
  assert.equal(r.calendar[0].perRole[0].onDuty, 2);
  assert.equal(r.calendar[0].perRole[0].tight, true);
});

test("exports are CSV with formula-looking cells defused", () => {
  const r = setup("=SUM(A1), Cook\nBen, Cook", "=SUM(A1), 2026-07-06, 2026-07-06\nBen, 2026-07-13, 2026-07-14", "Cook, 1");
  const csv = decisionsCsv(r);
  assert.match(csv.split("\n")[0], /^name,role,first_day/);
  assert.ok(csv.includes("'=SUM(A1)"));
  assert.equal(csv.split("\n").length, 4);
  assert.match(calendarCsv(r), /^date,people_off/);
});

test("input limits return an error instead of hanging", () => {
  assert.match(solve([], [{ name: "a", start: 0, end: 0, priority: 3 }]).error, /at least one person/);
  const far = solve([{ name: "A", role: "x" }], [{ name: "A", start: 20000, end: 20000, priority: 3, line: 1 }, { name: "A", start: 21000, end: 21000, priority: 3, line: 2 }]);
  assert.match(far.error, /keep them within/);
});

test("the sample runs and is deterministic", () => {
  const a = setup(samplePeople(), sampleRequests(), sampleMinimums());
  const b = setup(samplePeople(), sampleRequests(), sampleMinimums());
  assert.deepEqual(a.decisions.map((d) => d.decision), b.decisions.map((d) => d.decision));
  assert.ok(a.counts.approved > 0 && a.counts.denied > 0);
});
