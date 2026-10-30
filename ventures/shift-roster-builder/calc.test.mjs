import { test } from "node:test";
import assert from "node:assert/strict";
import { placeBreaks, placeRestBreaks, laborPercent, budgetCheck, dailyLabor, salesPerLaborHour, fairnessReport, hoursThresholds, tipPool, trimOptions, scheduleFlags, unsupervisedStretches, loneStretches, shortShifts,
  parseTime, parseDaySpec, parseAvailability, parseStaff, parseShifts, buildRoster, coverOptions, absencePlan, swapOptions, checkTrade, rosterCsv, hoursCsv, rosterIcs, rosterMessages, openShiftPost,
  sampleStaff, openFloorByPricing, branchedScoreBound, optimalityText, sampleShifts, fmtClock, money, money2, _internals,
} from "./calc.mjs";

const staffOf = (t) => { const r = parseStaff(t); assert.deepEqual(r.errors, []); return r.staff; };
const slotsOf = (t) => { const r = parseShifts(t); assert.deepEqual(r.errors, []); return r.slots; };

test("times parse in the formats people type", () => {
  assert.equal(parseTime("9"), 540);
  assert.equal(parseTime("9:30"), 570);
  assert.equal(parseTime("9am"), 540);
  assert.equal(parseTime("5 PM"), 1020);
  assert.equal(parseTime("12am"), 0);
  assert.equal(parseTime("12pm"), 720);
  assert.equal(parseTime("24"), 1440);
  assert.ok(Number.isNaN(parseTime("25")));
  assert.ok(Number.isNaN(parseTime("13pm")));
  assert.ok(Number.isNaN(parseTime("9:75")));
  assert.ok(Number.isNaN(parseTime("noon")));
  assert.equal(fmtClock(1020), "5pm");
  assert.equal(fmtClock(570), "9:30am");
  assert.equal(fmtClock(1500), "1am");
});

test("day specs: names, ranges, wraps, lists", () => {
  assert.deepEqual(parseDaySpec("Mon-Fri"), [0, 1, 2, 3, 4]);
  assert.deepEqual(parseDaySpec("Sat-Mon"), [5, 6, 0]);
  assert.deepEqual(parseDaySpec("Mon/Wed/Fri"), [0, 2, 4]);
  assert.deepEqual(parseDaySpec("friday"), [4]);
  assert.deepEqual(parseDaySpec("daily").length, 7);
  assert.deepEqual(parseDaySpec("Funday"), []);
});

test("availability: windows, off days, unlisted days are unavailable, empty means any", () => {
  const a = parseAvailability("Mon-Fri 9-17; Sat 10am-2pm; Sun off");
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.days[0], [[540, 1020]]);
  assert.deepEqual(a.days[5], [[600, 840]]);
  assert.deepEqual(a.days[6], []);
  assert.equal(parseAvailability("").any, true);
  assert.deepEqual(parseAvailability("").days[3], [[0, 1440]]);
  const split = parseAvailability("Mon 6-10; Mon 16-22");
  assert.equal(split.days[0].length, 2);
  assert.equal(parseAvailability("Mon 17-9").errors.length, 1);
  assert.equal(parseAvailability("Blursday 9-5").errors.length, 1);
});

test("staff parser: header skipped, defaults, errors name the line", () => {
  const r = parseStaff("name,wage,max,min,avail\nAna, $18, , , Mon-Fri 9-17\nBen,x\nAna,15\nCy,12,10,20,any");
  assert.equal(r.staff.length, 2);
  assert.equal(r.staff[0].maxHours, 40);
  assert.equal(r.staff[0].wage, 18);
  assert.equal(r.staff[1].minHours, 10, "min hours cannot exceed max hours");
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Staff line 3.*Ben/);
  assert.match(r.errors[1], /listed twice/);
});

test("shift parser: ranges expand, counts copy, overnight runs past midnight, errors named", () => {
  const r = parseShifts("day,start,end,n,label\nMon-Wed, 9, 17, 2, open\nFri, 22, 6\nTue, 9, 9\nBlah, 9, 10\nThu, 9, 10, 0");
  assert.equal(r.slots.length, 7);
  assert.equal(r.errors.length, 3);
  const night = r.slots.find((s) => s.day === 4);
  assert.equal(night.endMin, 6 * 60 + 1440);
  assert.equal((night.end - night.start) / 60, 8);
  assert.equal(r.slots.filter((s) => s.day === 0).length, 2);
  assert.ok(r.slots.every((s, i) => s.id === i));
});

test("a shift nobody can cover is reported with why, and does not block the rest", () => {
  const staff = staffOf("Ann,10,40,0,Mon 9-12");
  const slots = slotsOf("Mon,9,12,1\nTue,9,12,1");
  const r = buildRoster(staff, slots);
  assert.equal(r.unfilledSlots, 1);
  assert.equal(r.unfilled[0].slot.day, 1);
  assert.match(r.unfilled[0].text, /nobody listed is available/);
  assert.equal(r.assignments[0].person, "Ann");
});

test("availability must cover the whole shift", () => {
  const staff = staffOf("Ann,10,40,0,Mon 9-12");
  assert.equal(buildRoster(staff, slotsOf("Mon,9,13,1")).unfilledSlots, 1);
  assert.equal(buildRoster(staff, slotsOf("Mon,9,12,1")).unfilledSlots, 0);
  const night = staffOf("Nia,10,40,0,Fri 20-24; Sat 0-6");
  assert.equal(buildRoster(night, slotsOf("Fri,22,6,1")).unfilledSlots, 0, "overnight needs both days");
  const half = staffOf("Hal,10,40,0,Fri 20-24");
  assert.equal(buildRoster(half, slotsOf("Fri,22,6,1")).unfilledSlots, 1);
});

test("rest rule blocks a close followed by an open, and the reason says so", () => {
  const staff = staffOf("Ann,10,40,0,any");
  const slots = slotsOf("Mon,14,22,1\nTue,6,14,1");
  const r = buildRoster(staff, slots, { minRestHours: 10 });
  assert.equal(r.unfilledSlots, 1);
  assert.match(r.unfilled[0].text, /rest rule/);
  assert.equal(buildRoster(staff, slots, { minRestHours: 8 }).unfilledSlots, 0);
  assert.equal(buildRoster(staff, slots, { minRestHours: 0 }).unfilledSlots, 0);
});

test("weekly hour cap and double booking are hard rules", () => {
  const staff = staffOf("Ann,10,10,0,any");
  const r = buildRoster(staff, slotsOf("Mon,9,15,1\nTue,9,15,1"));
  assert.equal(r.unfilledSlots, 1);
  assert.match(r.unfilled[0].text, /weekly hour limit/);
  const two = buildRoster(staffOf("Ann,10,40,0,any"), slotsOf("Mon,9,15,2"), { minRestHours: 0 });
  assert.equal(two.unfilledSlots, 1, "one person cannot work two overlapping copies");
  assert.match(two.unfilled[0].text, /already on another shift/);
});

test("consecutive-day limit holds", () => {
  const staff = staffOf("Ann,10,60,0,any");
  const r = buildRoster(staff, slotsOf("Mon-Sun,9,13,1"), { maxConsecDays: 3 });
  assert.equal(r.unfilledSlots, 1, "three on, one off, three on is the most that fits");
  assert.match(r.unfilled[0].text, /consecutive/);
});

test("overtime is priced above the threshold and avoided when someone else can take it", () => {
  const only = buildRoster(staffOf("Ann,10,60,0,any"), slotsOf("Mon-Fri,8,18,1"), { otAfter: 40, otMult: 1.5, balance: 0 });
  assert.equal(only.unfilledSlots, 0);
  assert.equal(only.people[0].hours, 50);
  assert.equal(only.otHours, 10);
  assert.equal(Math.round(only.cost), Math.round(10 * 40 + 10 * 10 * 1.5));
  const two = buildRoster(staffOf("Ann,10,60,0,any\nBo,11,60,0,any"), slotsOf("Mon-Fri,8,18,1"), { otAfter: 40, otMult: 1.5, balance: 0 });
  assert.equal(two.otHours, 0, "the extra 10 hours go to Bo at 11/h instead of Ann at 15/h");
  assert.equal(Math.round(two.cost), 40 * 10 + 10 * 11);
});

test("payroll burden scales cost; balance slider spreads hours", () => {
  const staff = staffOf("Cheap,10,40,0,any\nDear,14,40,0,any");
  const slots = slotsOf("Mon-Fri,9,17,1");
  const noBal = buildRoster(staff, slots, { balance: 0, burdenPct: 10 });
  assert.equal(noBal.people[0].hours, 40);
  assert.equal(Math.round(noBal.cost), Math.round(40 * 10 * 1.1));
  const bal = buildRoster(staff, slots, { balance: 100 });
  assert.ok(Math.abs(bal.people[0].hours - bal.people[1].hours) < Math.abs(noBal.people[0].hours - noBal.people[1].hours));
});

test("minimum hours are honoured when there is room", () => {
  const staff = staffOf("A,10,40,0,any\nB,12,40,16,any");
  const r = buildRoster(staff, slotsOf("Mon-Fri,9,17,1"), { balance: 0, shortfallValue: 8 });
  assert.ok(r.people[1].hours >= 16, "B is guaranteed 16 hours even though A is cheaper");
});

test("every roster respects every hard rule (random problems)", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 12; trial++) {
    const nStaff = 3 + Math.floor(rnd() * 5);
    const staffLines = [];
    for (let i = 0; i < nStaff; i++) {
      const a = 6 + Math.floor(rnd() * 6), b = 16 + Math.floor(rnd() * 8);
      staffLines.push(`P${i},${10 + Math.floor(rnd() * 10)},${16 + Math.floor(rnd() * 25)},0,Mon-Sun ${a}-${b}`);
    }
    const shiftLines = [];
    for (let d = 0; d < 7; d++) {
      const a = 6 + Math.floor(rnd() * 6);
      shiftLines.push(`${d + 1 === 7 ? "Sun" : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]},${a},${a + 4 + Math.floor(rnd() * 5)},${1 + Math.floor(rnd() * 2)}`);
    }
    const staff = staffOf(staffLines.join("\n")), slots = slotsOf(shiftLines.join("\n"));
    const r = buildRoster(staff, slots, { restarts: 2, iterations: 3000 });
    const ctx = _internals.buildContext(staff, slots, {});
    assert.ok(_internals.ownerValid(ctx, r.owner), `trial ${trial} broke a hard rule`);
    assert.ok(Math.abs(_internals.scoreOwner(ctx, r.owner).total - r.score) < 1e-6);
  }
});

function bruteForceBest(staff, slots, opts) {
  const ctx = _internals.buildContext(staff, slots, opts);
  const P = staff.length, S = slots.length;
  let best = Infinity;
  const owner = new Array(S).fill(-1);
  (function rec(i) {
    if (i === S) { if (_internals.ownerValid(ctx, owner)) best = Math.min(best, _internals.scoreOwner(ctx, owner).total); return; }
    for (let p = -1; p < P; p++) { owner[i] = p; if (p < 0 || ctx.elig[p][i]) rec(i + 1); }
    owner[i] = -1;
  })(0);
  return best;
}

test("the search finds the true optimum on small problems (brute force)", () => {
  const cases = [
    ["A,12,16,0,Mon-Fri 8-18\nB,10,12,6,Mon-Wed 6-16\nC,15,40,0,any", "Mon,8,14,1\nMon,12,18,1\nTue,8,16,1\nWed,6,12,2\nThu,10,18,1\nFri,8,13,1"],
    ["A,9,10,0,any\nB,14,40,10,Mon-Sat 6-22\nC,11,20,0,Tue-Sun 10-24", "Mon,6,14,1\nTue,10,18,1\nTue,14,22,1\nWed,8,16,1\nSat,12,20,1\nSun,10,18,1"],
    ["A,10,8,0,any\nB,10,8,0,any\nC,20,40,0,any", "Mon,8,16,1\nMon,9,17,1\nTue,8,16,1\nTue,9,17,1\nWed,8,16,1"],
  ];
  for (const [st, sh] of cases) {
    const staff = staffOf(st), slots = slotsOf(sh);
    const opts = { balance: 30, otAfter: 12 };
    const exact = bruteForceBest(staff, slots, opts);
    const got = buildRoster(staff, slots, opts).score;
    assert.ok(Math.abs(got - exact) < 1e-6, `search ${got} vs optimum ${exact}`);
  }
});

test("exact mode proves the optimum against brute force, including the options that make the score non-monotone", () => {
  const cases = [
    ["A,12,16,0,Mon-Fri 8-18\nB,10,12,6,Mon-Wed 6-16\nC,15,40,0,any", "Mon,8,14,1\nMon,12,18,1\nTue,8,16,1\nWed,6,12,2\nThu,10,18,1\nFri,8,13,1", { balance: 30, otAfter: 12 }],
    ["A,9,10,10,any\nB,14,40,10,Mon-Sat 6-22\nC,11,20,0,Tue-Sun 10-24", "Mon,6,14,1\nTue,10,18,1\nTue,14,22,1\nWed,8,16,1\nSat,12,20,1\nSun,10,18,1", { balance: 60, toughBalance: 40 }],
    ["A,10,30,0,any,prefer: Mon\nB,10,30,0,any,avoid: Tue\nC,20,40,0,any", "Mon,8,16,1\nMon,9,17,1\nTue,8,16,1\nTue,9,17,1\nWed,8,16,1", { dailyOtAfter: 6, otAfter: 14, burdenPct: 10 }],
  ];
  for (const [st, sh, opts] of cases) {
    const staff = staffOf(st), slots = slotsOf(sh);
    const exactBrute = bruteForceBest(staff, slots, opts);
    const r = buildRoster(staff, slots, { ...opts, exact: true });
    assert.ok(r.optimality, "optimality reported");
    assert.notEqual(r.optimality.status, "bounded");
    assert.ok(Math.abs(r.score - exactBrute) < 1e-6, `exact ${r.score} vs brute ${exactBrute}`);
    assert.ok(r.optimality.gap >= 0 && r.optimality.annealScore >= r.optimality.bestScore - 1e-9);
  }
});

test("the coverage floor never lets a pay bound overstate: a good starting roster still reaches the exact optimum", () => {
  // Found 2026-10-22: once the heuristic covered everything coverable, the exact search was seeded with 11 open hours, the coverage pass
  // proved that floor, and the cost bound still charged the pay of the most hours the flow could cover, which are more than 11 open
  // hours leave. The search cut the optimum (1100260.75) and called 1100267.75 optimal.
  const staff = staffOf("P0,14,12,0,Mon-Wed 6-20\nP1,14,12,0,Mon-Wed 6-21"), slots = slotsOf("Mon,6,13,1\nMon,6,9,1\nMon,6,11,1\nMon,6,11,1\nWed,6,11,1\nMon,6,9,1");
  const r = buildRoster(staff, slots, { exact: true });
  assert.equal(r.score, bruteForceBest(staff, slots, {}));
});

test("exact mode on a deliberately weak anneal finds the improvement and reports the gap", () => {
  const staff = staffOf("A,10,40,0,any\nB,11,40,0,any\nC,12,40,0,any\nD,13,40,0,any"), slots = slotsOf("Mon,8,16,2\nTue,8,16,2\nWed,8,16,2\nThu,8,16,1\nFri,8,16,1");
  const weak = buildRoster(staff, slots, { restarts: 1, iterations: 1 });
  const r = buildRoster(staff, slots, { restarts: 1, iterations: 1, exact: true });
  assert.ok(r.score <= weak.score + 1e-9);
  assert.ok(["optimal", "improved"].includes(r.optimality.status));
  assert.equal(Math.round(r.optimality.gap * 100) / 100, Math.round((weak.score - r.score) * 100) / 100);
});

test("exact mode gives up honestly: a tiny node limit reports a bound, not a proof", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const r = buildRoster(staff, slots, { exact: true, exactNodes: 50, coverRepair: false });
  assert.equal(r.optimality.status, "bounded");
  assert.ok(r.optimality.lowerBound <= r.score + 1e-6);
  assert.ok(r.optimality.gap >= 0);
});

test("the exact bound sees that hours, overlaps and rest force shifts open, and never overstates", () => {
  // Sample week: the coverage flow proves 15 hours must stay open, so the root bound sits within a fraction of a percent of the best roster
  // (before the flow it was 79% below it).
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const r = buildRoster(staff, slots, { exact: true, exactNodes: 20000 });
  assert.ok(r.optimality.lowerBound >= 15 * 100000, `bound ${r.optimality.lowerBound}`);
  assert.ok(r.optimality.lowerBound <= r.score + 1e-6);
  assert.ok((r.score - r.optimality.lowerBound) / r.score < 0.01, `bound ${r.optimality.lowerBound} vs ${r.score}`);
  // The balance terms are coupled through the fixed covered hours (Lagrangian bound): the gap was $68.95 with each person alone.
  assert.ok(r.score - r.optimality.lowerBound < 60, `gap ${r.score - r.optimality.lowerBound}`);
  // Hours terms inside the coverage flow (tangent lines under each person's convex hours curve): who can work when is priced with the
  // balance targets, and the gap falls to cents. The same flow without them (flowBalance: false) leaves the older Lagrangian gap.
  assert.ok(r.score - r.optimality.lowerBound < 1, `flow gap ${r.score - r.optimality.lowerBound}`);
  const old = buildRoster(staff, slots, { exact: true, exactNodes: 20, flowBalance: false });
  assert.ok(old.score - old.optimality.lowerBound > 50);
  // Random tight weeks (caps, overlaps, rest rules all biting): the exact answer still equals brute force.
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const days = ["Mon", "Tue", "Wed"];
  for (let c = 0; c < 25; c++) {
    const st = Array.from({ length: 2 + rnd(2) }, (_, p) => `P${p},${10 + rnd(10)},${8 + rnd(3) * 4},0,${days[rnd(3)]}-Wed ${6 + rnd(3)}-${18 + rnd(5)}`).join("\n");
    const sh = Array.from({ length: 5 + rnd(3) }, () => { const a = 6 + rnd(8); return `${days[rnd(3)]},${a},${a + 3 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const stf = staffOf(st), sl = slotsOf(sh);
    if (sl.length > 9) continue;
    const brute = bruteForceBest(stf, sl, {});
    const got = buildRoster(stf, sl, { exact: true });
    assert.notEqual(got.optimality.status, "bounded", `case ${c}`);
    assert.ok(Math.abs(got.score - brute) < 1e-6, `case ${c}: exact ${got.score} vs brute ${brute}\n${st}\n${sh}`);
  }
});

test("same input gives the same roster", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const a = buildRoster(staff, slots, {}), b = buildRoster(staff, slots, {});
  assert.deepEqual(a.owner, b.owner);
  assert.equal(a.cost, b.cost);
});

test("the example fills most shifts, beats filling in listed order, and names who is critical", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const r = buildRoster(staff, slots, {});
  assert.ok(r.unfilledSlots <= r.listed.unfilledSlots);
  assert.ok(r.unfilledSlots < slots.length / 4);
  assert.ok(r.critical.length > 0);
  assert.ok(r.people.every((p) => p.hours <= p.maxHours + 1e-9));
  assert.ok(r.unfilled.every((u) => u.text.length > 10));
  assert.equal(r.grid.length, staff.length);
  assert.ok(r.warnings.length >= 0);
});

test("a person nobody can use is flagged; total capacity shortfall is flagged", () => {
  const r = buildRoster(staffOf("Ann,10,5,0,any\nZed,10,0,0,Sun 1-2"), slotsOf("Mon,9,17,1"));
  assert.ok(r.warnings.some((w) => /Zed is not available/.test(w)));
  assert.ok(r.warnings.some((w) => /weekly limits together/.test(w)));
});

test("single point of failure is found", () => {
  const r = buildRoster(staffOf("Ann,10,40,0,any\nBo,10,40,0,Mon 9-10"), slotsOf("Mon,9,17,1\nTue,9,17,1"));
  assert.equal(r.critical[0].name, "Ann");
  assert.ok(r.critical[0].extraUnfilledHours >= 8);
  // Losing Ann leaves most shifts empty, so the paid cost falls: extraCost is the without-her cost minus the with-her cost.
  assert.ok(r.critical[0].extraCost < 0);
  assert.ok(r.onlyOne.length >= 1);
});

test("CSV exports quote and mark unfilled shifts", () => {
  const r = buildRoster(staffOf('"Q, R",10,40,0,Mon 9-12'.replace('"Q, R"', "QR")), slotsOf("Mon,9,12,1,front desk\nTue,9,12,1"));
  const csv = rosterCsv(r);
  assert.match(csv, /^day,start,end,hours,label,assigned_to/);
  assert.match(csv, /Mon,9am,12pm,3\.00,front desk,QR/);
  assert.match(csv, /UNFILLED/);
  assert.match(hoursCsv(r), /^person,shifts,hours/);
});

test("limits are enforced with a message, not a hang", () => {
  const many = Array.from({ length: 61 }, (_, i) => `P${i},10`).join("\n");
  assert.match(parseStaff(many).errors.join(" "), /up to 60/);
  assert.match(parseShifts("Mon-Sun,9,17,50\nMon-Sun,9,17,50").errors.join(" "), /up to 400/);
  assert.ok(buildRoster([], []).error);
});

test("roles: only qualified people fill a role shift, and the reason says so", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, roles: cook|server\nBen, 12, 40, 0, any, roles: server\nCy, 10, 40, 0, any");
  assert.deepEqual(staff.map((s) => s.roles), [["cook", "server"], ["server"], []]);
  const slots = slotsOf("Mon, 8, 12, 2, line, role: cook\nMon, 13, 17, 1, floor, server");
  assert.equal(slots[0].role, "cook");
  assert.equal(slots[0].label, "line");
  const r = buildRoster(staff, slots);
  const cooks = r.assignments.filter((a) => a.slot.role === "cook");
  assert.ok(cooks.every((a) => a.person === "Ana" || a.person === null));
  assert.equal(r.unfilledSlots, 1); // two cooks needed, only Ana is one
  assert.match(r.unfilled[0].text, /cook/);
  assert.match(rosterCsv(r), /,role\n/);
});

test("roles: a role nobody has is named, and shifts without roles ignore roles", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, roles: cook");
  const r = buildRoster(staff, slotsOf("Tue, 8, 12, 1, bar, role: bartender\nTue, 13, 17, 1, any job"));
  assert.match(r.unfilled[0].text, /nobody listed has the role "bartender"/);
  assert.equal(r.assignments.find((a) => !a.slot.role).person, "Ana");
});

test("ics export: one event per assigned shift, overnight ends next day, per-person filter, Monday check", () => {
  const staff = staffOf("Ana, 15, 40, 0, any\nBen, 12, 40, 0, any");
  const r = buildRoster(staff, slotsOf("Fri, 22, 6, 1, night\nMon, 9, 17, 1, day"));
  const all = rosterIcs(r, "2026-10-12");
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(all, /DTSTART:20261016T220000\r\nDTEND:20261017T060000/);
  const who = r.assignments.find((a) => a.slot.label === "night").person;
  const one = rosterIcs(r, "2026-10-12", who);
  assert.ok((one.match(/BEGIN:VEVENT/g) || []).length >= 1);
  assert.ok(!one.includes(` - ${who}`));
  assert.throws(() => rosterIcs(r, "2026-10-13"), /Monday/);
  assert.throws(() => rosterIcs(r, "nope"), /YYYY/);
});

test("messages: one pasteable text per person, sorted by day, dated when a Monday is given, empty weeks said plainly", () => {
  const staff = staffOf("Ana, 15, 40, 0, any\nBen, 12, 40, 0, Mon 9-17");
  const r = buildRoster(staff, slotsOf("Wed, 9, 17, 1, open\nMon, 9, 13, 1, early, role: any"));
  const m = rosterMessages(r, "2026-10-12");
  assert.deepEqual(m.map((x) => x.person), ["Ana", "Ben"]);
  const ana = m.find((x) => x.person === "Ana");
  assert.match(ana.text, /^Hi Ana, your shifts this week:/);
  assert.match(ana.text, /Wed 14 Oct: 9am-5pm open/);
  const undated = rosterMessages(r);
  assert.match(undated.find((x) => x.person === "Ana").text, /Wed: /);
  const none = rosterMessages(buildRoster(staffOf("Zed, 10, 40, 0, any\nAnn, 11, 40, 0, Mon 9-17"), slotsOf("Mon, 9, 13, 1, early")));
  assert.ok(none.some((x) => /no shifts this week/.test(x.text)));
  assert.throws(() => rosterMessages(r, "nope"), /YYYY/);
});

test("hire what-if: an unfillable shift reports what one more person would cover", () => {
  const staff = staffOf("Ann, 15, 40, 0, Mon-Fri 9-17");
  const slots = slotsOf("Sat, 9, 13, 1, Open");
  const r = buildRoster(staff, slots);
  assert.equal(r.unfilledSlots, 1);
  assert.ok(r.hireTest);
  assert.equal(r.hireTest.coveredHours, 4);
  assert.equal(r.hireTest.stillUnfilledHours, 0);
  assert.ok(Math.abs(r.hireTest.extraCost - 60) < 1e-6);
  assert.equal(r.hireTest.windows.length, 1);
  assert.match(r.hireTest.windows[0], /^Sat /);
});

test("hire what-if: absent when everything is covered", () => {
  const r = buildRoster(staffOf("Ann, 15, 40, 0, any"), slotsOf("Mon, 9, 13, 1, Open"));
  assert.equal(r.hireTest, null);
});

test("coverOptions: lists who can take a shift, cheapest first, with the rule that blocks the rest", () => {
  const staff = staffOf("Ana, 10, 40, 0, Mon 8-16\nBen, 20, 40, 0, Mon 8-16\nCy, 15, 4, 0, Mon 8-16\nDee, 12, 40, 0, Tue 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open");
  const r = buildRoster(staff, slots);
  assert.equal(r.assignments[0].person, "Ana");
  const c = coverOptions(staff, slots, r, 0);
  assert.equal(c.current, "Ana");
  assert.deepEqual(c.fits.map((f) => f.name), ["Ben"]);
  assert.ok(Math.abs(c.fits[0].extraCost - 80) < 1e-6); // Ben 8h at $20 minus Ana's 8h at $10
  assert.deepEqual(c.blocked, [{ name: "Cy", reason: "would go over their weekly hour limit" }]);
});

test("coverOptions: an open shift has no current owner and reports an unreadable roster", () => {
  const staff = staffOf("Ana, 10, 40, 0, Mon 8-16");
  const slots = slotsOf("Mon, 8, 16, 2, open");
  const r = buildRoster(staff, slots);
  const open = r.assignments.findIndex((a) => a.person === null);
  const c = coverOptions(staff, slots, r, open);
  assert.equal(c.current, null);
  assert.equal(c.fits.length, 0);
  assert.deepEqual(c.blocked, [{ name: "Ana", reason: "already on a shift at that time" }]);
  assert.ok(coverOptions(staff, slots, null, 0).error);
});

test("prev: carries the rest rule across the week boundary", () => {
  const staff = staffOf("Ana, 20, 40, 0, , prev: Sun 11pm\nBo, 20, 40, 0, ");
  assert.equal(staff[0].prevEnd, -1440 + 23 * 60);
  assert.equal(staff[1].prevEnd, null);
  const slots = slotsOf("Mon, 6am, 10am, 1, Open");
  const r = buildRoster(staff, slots);
  const csv = rosterCsv(r);
  assert.ok(csv.includes("Bo"), "Bo takes the open: Ana ended 11pm Sunday, only 7h of rest");
  assert.ok(!csv.includes("Ana"));
  const only = buildRoster(staffOf("Ana, 20, 40, 0, , prev: Sun 11pm"), slots);
  assert.ok(/rest/i.test(JSON.stringify(only)), "the unfilled reason names the rest rule");
});

test("prev: errors on unreadable text", () => {
  const r = parseStaff("Ana, 20, 40, 0, , prev: lately");
  assert.ok(r.errors.some((e) => e.includes("prev")));
});

test("money formats whole dollars and cents, with a minus sign for negatives", () => {
  assert.equal(money(1234.5), "$1,235");
  assert.equal(money(0), "$0");
  assert.equal(money(-42), "\u2212$42");
  assert.equal(money2(1234.5), "$1,234.50");
  assert.equal(money2(-0.5), "\u2212$0.50");
  assert.equal(money2(0), "$0.00");
  assert.equal(money2(0.5), "$0.50");
});

test("ics export: the per-person file holds only that person's shifts and unfilled shifts are left out", () => {
  const staff = staffOf("Ana, 15, 40, 0, Mon 9-17\nBen, 12, 40, 0, Tue 9-17");
  const r = buildRoster(staff, slotsOf("Mon, 9, 17, 1, am shift\nTue, 9, 17, 1, tue shift\nWed, 9, 17, 1, nobody shift"));
  assert.equal(r.unfilledSlots, 1);
  const all = rosterIcs(r, "2026-10-12");
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(!all.includes("nobody shift"));
  const ana = rosterIcs(r, "2026-10-12", "Ana");
  assert.equal((ana.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ana, /SUMMARY:am shift/);
  assert.ok(!ana.includes("tue shift"));
});

test("hour targets split the week's hours in proportion to each person's cap", () => {
  const ctx = _internals.buildContext(staffOf("Ana, 10, 30, 0, any\nBen, 10, 10, 0, any"), slotsOf("Mon, 9, 17, 1\nTue, 9, 17, 1"));
  assert.ok(Math.abs(ctx.target[0] - 12) < 1e-9);
  assert.ok(Math.abs(ctx.target[1] - 4) < 1e-9);
});

test("off: removes whole days and clock ranges without rewriting availability", () => {
  const r = parseStaff("Ana, 20, 40, 0, any, off: Wed; Fri 5pm-close");
  assert.deepEqual(r.errors, []);
  const d = r.staff[0].days;
  assert.deepEqual(d[2], []);
  assert.deepEqual(d[4], [[0, 1020]]);
  assert.deepEqual(d[0], [[0, 1440]]);
});

test("off: keeps a person off a shift the solver would otherwise give them", () => {
  const staff = parseStaff("Ana, 10, 40, 0, any, off: Wed\nBo, 30, 40, 0, any").staff;
  const slots = parseShifts("Wed, 9, 17, 1").slots;
  const r = buildRoster(staff, slots);
  assert.equal(staff[0].name, "Ana");
  assert.equal(r.owner[0], 1);
});

test("off: reports unreadable text", () => {
  assert.equal(parseStaff("Ana, 20, 40, 0, any, off: Blursday").errors.length, 1);
  assert.equal(parseStaff("Ana, 20, 40, 0, any, off: Wed 9-").errors.length, 1);
});

test("daily overtime: California 8/12 pays 1.5x over 8 and 2x over 12, and weekly overtime skips hours already premium", () => {
  const staff = staffOf("Ana, 20, 60, 0, any");
  const one = (days, a, b) => slotsOf(`${days}, ${a}, ${b}, 1, x`);
  const opts = { dailyOtAfter: 8, dailyDtAfter: 12, minRestHours: 0 };
  // one 14 hour day: 8 straight + 4 at 1.5x + 2 at 2x
  const r = buildRoster(staff, one("Mon", 6, 20), opts);
  assert.equal(r.cost, 20 * (8 + 4 * 1.5 + 2 * 2));
  assert.equal(r.otHours, 6);
  // weekly rule only: the same 14 hours cost straight time
  assert.equal(buildRoster(staff, one("Mon", 6, 20)).cost, 20 * 14);
  // five 9-hour days = 45 h: daily OT 5 h; straight 40 h, so no extra weekly OT on top
  const w = buildRoster(staff, one("Mon-Fri", 8, 17), { dailyOtAfter: 8, minRestHours: 0 });
  assert.equal(w.cost, 20 * (40 + 5 * 1.5));
  assert.equal(w.otHours, 5);
});

test("daily overtime steers the search to split a long day across two people", () => {
  const staff = staffOf("Ana, 20, 40, 0, any\nBen, 20, 40, 0, any");
  const slots = slotsOf("Mon, 6, 14, 1, a\nMon, 14, 22, 1, b");
  const r = buildRoster(staff, slots, { dailyOtAfter: 8, balance: 0 });
  assert.equal(r.cost, 20 * 16);
  assert.equal(r.otHours, 0);
});

test("carry over: last week's CSV sets prev: so the rest rule holds across the boundary", async () => {
  const { carryOverStaff, lastShiftEnds, parseStaff, buildRoster, parseShifts, rosterCsv } = await import("./calc.mjs");
  const csv = [
    "day,start,end,hours,label,assigned_to,role",
    "Fri,5pm,11pm,6.00,,Sam,",
    "Sun (overnight),6pm,1am,7.00,close,Sam,",
    "Sat,9am,5pm,8.00,,Alex,",
    "Sat,9am,5pm,8.00,,UNFILLED,",
  ].join("\n");
  const e = lastShiftEnds(csv);
  assert.equal(e.get("sam").abs, 6 * 1440 + 1500);
  assert.equal(e.get("alex").abs, 5 * 1440 + 1020);
  assert.equal(e.has("unfilled"), false);
  const r = carryOverStaff("name,wage,max,min,avail\nSam, 15, 30, 0, any, prev: Mon 8am\nAlex, 14\nPat, 13", csv);
  assert.equal(r.changed, 2);
  const st = parseStaff(r.text);
  assert.deepEqual(st.errors, []);
  assert.equal(st.staff[0].prevEnd, (6 - 7) * 1440 + 1500); // Mon 1:00am this week
  assert.equal(st.staff[1].prevEnd, (5 - 7) * 1440 + 1020);
  assert.equal(st.staff[2].prevEnd, null);
  // Sam's overnight Sunday close ended 1am Monday: a 6am Monday shift (5h rest) must not go to Sam.
  const sh = parseShifts("Mon, 6am, 10am, 1");
  const roster = buildRoster(st.staff.slice(0, 1), sh.slots);
  assert.equal(roster.assignments[0].person, null);
});

test("laborPercent: share of sales, target headroom, bad input", () => {
  const a = laborPercent(2800, 10000, 30);
  assert.ok(Math.abs(a.pct - 28) < 1e-9);
  assert.equal(a.maxPayroll, 3000);
  assert.equal(a.headroom, 200);
  assert.equal(a.over, false);
  assert.equal(laborPercent(3500, 10000, 30).over, true);
  assert.equal(laborPercent(2800, 10000).target, null);
  assert.equal(laborPercent(2800, 0), null);
  assert.equal(laborPercent(2800, "abc"), null);
});

test("daily hour limit: per-person cell and roster-wide setting are hard rules and explain themselves", () => {
  const slots = slotsOf("Mon,8,14,1\nMon,14,20,1");
  const free = staffOf("Ann,10,40,0,any");
  assert.equal(buildRoster(free, slots, { minRestHours: 0 }).unfilledSlots, 0);
  const capped = staffOf("Ann,10,40,0,any,daily: 8");
  assert.equal(capped[0].maxDaily, 8);
  const r = buildRoster(capped, slots, { minRestHours: 0 });
  assert.equal(r.unfilledSlots, 1);
  assert.match(r.unfilled[0].text, /daily hour limit/);
  assert.equal(buildRoster(free, slots, { minRestHours: 0, maxDailyHours: 8 }).unfilledSlots, 1);
  assert.equal(buildRoster(free, slots, { minRestHours: 0, maxDailyHours: 12 }).unfilledSlots, 0);
  const two = staffOf("Ann,10,40,0,any,daily: 8\nBo,12,40,0,any");
  const r2 = buildRoster(two, slots, { minRestHours: 0 });
  assert.equal(r2.unfilledSlots, 0);
  assert.notEqual(r2.owner[0], r2.owner[1]);
  assert.ok(parseStaff("Ann,10,40,0,any,daily: lots").errors.length === 1);
});

test("scheduleFlags: daily hours, split shifts, notice", () => {
  const r = { assignments: [
    { slot: { day: 0, startMin: 480, endMin: 720 }, person: "Sam" },
    { slot: { day: 0, startMin: 900, endMin: 1200 }, person: "Sam" },
    { slot: { day: 1, startMin: 480, endMin: 960 }, person: "Ana" },
    { slot: { day: 1, startMin: 960, endMin: 1020 }, person: "Ana" },
    { slot: { day: 2, startMin: 480, endMin: 960 }, person: null },
  ] };
  const f = scheduleFlags(r, { weekStart: "2026-11-02", today: "2026-10-26" });
  assert.deepEqual(f.overDaily.map((x) => [x.person, x.day, x.hours]), [["Ana", "Tue", 9], ["Sam", "Mon", 9]]);
  assert.deepEqual(f.splits.map((x) => [x.person, x.day, x.gapHours]), [["Sam", "Mon", 3]]);
  assert.deepEqual(f.longStretches.map((x) => [x.person, x.day, x.hours]), [["Ana", "Tue", 9]]);
  assert.equal(scheduleFlags(r, { mealAfter: 10 }).longStretches.length, 0);
  assert.deepEqual(f.notice, { days: 7, required: 14, short: true });
  assert.equal(scheduleFlags(r, { dailyLimit: 10 }).overDaily.length, 0);
  assert.equal(scheduleFlags(r).notice, null);
  assert.equal(scheduleFlags({}).overDaily.length, 0);
  assert.deepEqual(f.shortDays, []);
  assert.deepEqual(scheduleFlags(r, { minDay: 9.5 }).shortDays.map((x) => [x.person, x.day]), [["Ana", "Tue"], ["Sam", "Mon"]]);
});

test("scheduleFlags: shortDays flags days under the minimum, adjacent shifts count together", () => {
  const r = { assignments: [
    { slot: { day: 0, startMin: 600, endMin: 780 }, person: "Sam" },
    { slot: { day: 1, startMin: 600, endMin: 720 }, person: "Sam" },
    { slot: { day: 1, startMin: 720, endMin: 900 }, person: "Sam" },
    { slot: { day: 2, startMin: 600, endMin: 720 }, person: null },
  ] };
  assert.deepEqual(scheduleFlags(r, { minDay: 4 }).shortDays.map((x) => [x.person, x.day, x.hours]), [["Sam", "Mon", 3]]);
  assert.equal(scheduleFlags(r).shortDays.length, 0);
});

test("scheduleFlags: flags a person scheduled on all seven days", () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ slot: { day, startMin: 540, endMin: 780 }, person: "Sam" }));
  const other = [0, 1, 2, 3, 4, 5].map((day) => ({ slot: { day, startMin: 840, endMin: 1020 }, person: "Ana" }));
  assert.deepEqual(scheduleFlags({ assignments: week.concat(other) }).sevenDays, [{ person: "Sam" }]);
  assert.equal(scheduleFlags({ assignments: other }).sevenDays.length, 0);
  assert.equal(scheduleFlags({}).sevenDays.length, 0);
});

test("seventhDayPay: extra over straight time on the seventh day, only for people on all seven days", async () => {
  const { seventhDayPay } = await import("./calc.mjs");
  const week = [0, 1, 2, 3, 4, 5].map((day) => ({ slot: { day, startMin: 540, endMin: 780 }, person: "Sam" }));
  const sun = { slot: { day: 6, startMin: 540, endMin: 1140 }, person: "Sam" }; // 10 hours
  const r = { people: [{ name: "Sam", wage: 20 }, { name: "Ana", wage: 30 }], assignments: week.concat(sun, [{ slot: { day: 6, startMin: 0, endMin: 120 }, person: "Ana" }]) };
  const p = seventhDayPay(r);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].person, "Sam");
  assert.equal(p.rows[0].hours, 10);
  // 8h x 0.5 x $20 + 2h x 1.0 x $20 = $120
  assert.equal(p.total, 120);
  assert.equal(seventhDayPay(r, { burdenPct: 10 }).total, 132);
  assert.equal(seventhDayPay({}).total, 0);
});

test("fixed: pins a shift to one person and the rest is planned around it", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Ana, 10, 40, 0, any\nBen, 30, 40, 0, any").staff;
  // Ben is far dearer, so only the pin puts him on Monday's shift.
  const free = buildRoster(staff, parseShifts("Mon, 9, 17, 1").slots);
  assert.equal(free.assignments[0].person, "Ana");
  const pinned = parseShifts("Mon, 9, 17, 1, fixed: ben\nTue, 9, 17, 1");
  assert.deepEqual(pinned.errors, []);
  assert.equal(pinned.slots[0].fixed, "ben");
  assert.equal(pinned.slots[0].label, "");
  assert.equal(pinned.slots[0].role, "");
  const r = buildRoster(staff, pinned.slots);
  assert.equal(r.assignments[0].person, "Ben");
  assert.equal(r.assignments[1].person, "Ana");
});

test("fixed: copies, unavailable person, unknown name", async () => {
  const { parseStaff, parseShifts, buildRoster } = await import("./calc.mjs");
  const staff = parseStaff("Ana, 10, 40, 0, Mon 9-12\nBen, 30, 40, 0, any").staff;
  const two = parseShifts("Wed, 9, 17, 2, fixed: Ben");
  assert.deepEqual(two.slots.map((s) => s.fixed), ["Ben", ""]);
  const un = buildRoster(staff, parseShifts("Mon, 9, 17, 1, fixed: Ana").slots);
  assert.equal(un.unfilledSlots, 1);
  assert.match(un.unfilled[0].reason || JSON.stringify(un.unfilled[0]), /pinned/);
  const ghost = buildRoster(staff, parseShifts("Mon, 9, 17, 1, fixed: Zed").slots);
  assert.ok(ghost.warnings.some((w) => /Zed/.test(w)));
  assert.ok(parseShifts("Mon, 9, 17, 1, fixed:").errors.length);
});

test("avoid: is a soft preference, honoured when someone else can cover", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, avoid: Sat\nBen, 15, 40, 0, any");
  const slots = slotsOf("Sat, 9, 17, 1");
  const r = buildRoster(staff, slots, { balance: 0 });
  assert.equal(r.assignments[0].person, "Ben");
  assert.equal(r.people.find((p) => p.name === "Ana").avoidHours, 0);
});

test("avoid: is still worked when nobody else is available, and says so", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, avoid: Sat 8am-12pm\nBen, 15, 40, 0, Mon-Fri 9-17");
  const slots = slotsOf("Sat, 9, 13, 1");
  const r = buildRoster(staff, slots);
  assert.equal(r.assignments[0].person, "Ana");
  assert.equal(r.people[0].avoidHours, 3);
  assert.ok(r.warnings.some((w) => /Ana works 3 hours inside/.test(w)));
});

test("avoid: a Monday window counts against a Sunday shift that runs past midnight", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, avoid: Mon 12am-3am");
  const slots = slotsOf("Sun, 22, 2, 1");
  const r = buildRoster(staff, slots);
  assert.equal(r.people[0].avoidHours, 2);
});

test("avoid: bad days are reported", () => {
  const r = parseStaff("Ana, 15, 40, 0, any, avoid: Funday");
  assert.ok(r.errors.some((e) => /avoid/.test(e)));
});

test("swapOptions: offers one-for-one trades that keep both weeks valid, even when nobody can simply take the shift", () => {
  const staff = staffOf("Ana, 10, 8, 0, Mon 8-16; Tue 8-16\nBen, 12, 8, 0, Mon 8-16; Tue 8-16\nCy, 11, 8, 0, Wed 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open\nTue, 8, 16, 1, close");
  const r = buildRoster(staff, slots);
  const [first, second] = r.assignments.map((a) => a.person);
  assert.deepEqual([first, second].sort(), ["Ana", "Ben"]); // one 8-hour shift each, both at their weekly limit
  assert.deepEqual(coverOptions(staff, slots, r, 0).fits, []);
  const s = swapOptions(staff, slots, r, 0);
  assert.equal(s.from, first);
  assert.equal(s.trades.length, 1);
  assert.equal(s.trades[0].with, second);
  assert.equal(s.trades[0].direct, false);
  assert.equal(s.trades[0].gives.day, 1);
  assert.ok(Math.abs(s.trades[0].extraCost) < 1e-6); // each still works 8 hours at their own wage
});

test("swapOptions: open shifts and a missing roster are reported, not guessed", () => {
  const staff = staffOf("Ana, 10, 40, 0, Mon 8-16");
  const slots = slotsOf("Mon, 8, 16, 2, open");
  const r = buildRoster(staff, slots);
  const open = r.assignments.findIndex((a) => a.person === null);
  assert.ok(swapOptions(staff, slots, r, open).error);
  assert.ok(swapOptions(staff, slots, null, 0).error);
});

test("checkTrade: an allowed trade carries its payroll change, a blocked one names who it breaks and why", () => {
  const staff = staffOf("Ana, 10, 16, 0, Mon 8-16; Tue 8-16\nBen, 20, 16, 0, Mon 8-16; Tue 8-16\nCy, 11, 8, 0, Wed 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open\nTue, 8, 16, 1, close\nWed, 8, 16, 1, mid");
  const r = { owner: [0, 1, 2], options: {} };
  const ok = checkTrade(staff, slots, r, 0, 1);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.a.name, "Ana");
  assert.equal(ok.b.name, "Ben");
  assert.ok(Math.abs(ok.extraCost) < 1e-6); // both still work 8 hours at their own wage
  const bad = checkTrade(staff, slots, r, 0, 2); // Ana cannot work Wednesday, Cy cannot work Monday
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.problems.map((x) => x.name).sort(), ["Ana", "Cy"]);
  assert.equal(bad.extraCost, null);
});

test("checkTrade: names the hard rule that stops a trade, and rejects same shift, open shifts and same person", () => {
  const staff = staffOf("Ana, 10, 8, 0, any\nBen, 12, 24, 0, any");
  const slots = slotsOf("Mon, 8, 16, 1, a\nTue, 8, 20, 1, b\nWed, 8, 12, 1, c");
  const r = { owner: [0, 1, 1], options: {} };
  const cap = checkTrade(staff, slots, r, 0, 1); // Ana (8 h cap) would take a 12 h shift
  assert.equal(cap.ok, false);
  assert.deepEqual(cap.problems, [{ name: "Ana", reason: "would go over their weekly hour limit" }]);
  assert.equal(cap.extraCost, null);
  assert.equal(checkTrade(staff, slots, r, 0, 2).ok, true); // Ana 4 h, Ben 8 + 12 = 20 h
  assert.ok(checkTrade(staff, slots, r, 1, 2).error); // Ben holds both
  assert.ok(checkTrade(staff, slots, r, 1, 1).error);
  assert.ok(checkTrade(staff, slots, { owner: [0, -1, 1], options: {} }, 0, 1).error); // open shift
  assert.ok(checkTrade(staff, slots, null, 0, 1).error);
});

test("dailyLabor: hours and base-wage cost per day, labor share where sales are given", () => {
  const staff = staffOf("Ann,10,40,0,any");
  const slots = slotsOf("Mon,8,12,1\nMon,13,17,1\nWed,9,13,1");
  const r = buildRoster(staff, slots, { minRestHours: 0 });
  const d = dailyLabor(r, staff, "$400, 0, 100");
  assert.equal(d.days.length, 7);
  assert.equal(d.days[0].hours, 8);
  assert.equal(d.days[0].cost, 80);
  assert.ok(Math.abs(d.days[0].pct - 20) < 1e-9);
  assert.equal(d.days[1].pct, null);
  assert.ok(Math.abs(d.days[2].pct - 40) < 1e-9);
  assert.equal(d.worst.day, "Wed");
  assert.equal(dailyLabor(r, staff, "").hasSales, false);
  const b = buildRoster(staff, slots, { minRestHours: 0, burdenPct: 10 });
  assert.ok(Math.abs(dailyLabor(b, staff, "").days[0].cost - 88) < 1e-9);
});

test("an unpaid meal break lowers pay on long shifts only, never the hours a person is scheduled", () => {
  const staff = staffOf("Ana, $20, 40");
  const slots = slotsOf("Mon, 9am, 5pm, 1, Open\nTue, 9am, 1pm, 1, Short");
  const plain = buildRoster(staff, slots, {});
  const meal = buildRoster(staff, slots, { mealAfter: 6, mealMin: 30 });
  assert.equal(meal.unfilledSlots, 0);
  assert.equal(meal.hours, plain.hours);
  // 8h shift loses 30 min of pay, the 4h shift does not: 20 * (12 - 0.5)
  assert.ok(Math.abs(plain.cost - 240) < 1e-6);
  assert.ok(Math.abs(meal.cost - 230) < 1e-6);
});

test("prefer: gives the hours to the person who asked, but never leaves a shift open", () => {
  const staff = staffOf("Ana, 15, 40, 0, any\nBen, 15, 40, 0, any, prefer: Sat");
  const r = buildRoster(staff, slotsOf("Sat, 9, 17, 1"), { balance: 0 });
  assert.equal(r.assignments[0].person, "Ben");
  const only = buildRoster(staffOf("Ana, 15, 40, 0, any\nBen, 15, 40, 0, Mon-Fri 9-17, prefer: Sat"), slotsOf("Sat, 9, 17, 1"));
  assert.equal(only.assignments[0].person, "Ana");
});

test("prefer: bad days are reported", () => {
  assert.ok(parseStaff("Ana, 15, 40, 0, any, prefer: Funday").errors.some((e) => /prefer/.test(e)));
});

test("hoursThresholds lists people at or just under a weekly-hours line", () => {
  const r = { people: [{ name: "A", hours: 32 }, { name: "B", hours: 30 }, { name: "C", hours: 28.5 }, { name: "D", hours: 20 }, { name: "E", hours: 0 }] };
  const t = hoursThresholds(r);
  assert.deepEqual(t.over.map((x) => x.name), ["A", "B"]);
  assert.equal(t.over[0].by, 2);
  assert.deepEqual(t.near.map((x) => x.name), ["C"]);
  assert.equal(t.near[0].short, 1.5);
  assert.equal(hoursThresholds(r, { threshold: 40 }).near.length, 0);
  assert.equal(hoursThresholds(r, { threshold: 0 }).over.length, 0);
  assert.equal(hoursThresholds({}).over.length, 0);
});

test("fairnessReport counts weekend, closing and opening shifts per person and flags a lopsided week", () => {
  const staff = staffOf("Ann,10,60,0,any\nBo,10,60,0,Mon-Fri 9am-5pm");
  const slots = slotsOf("Mon,9am,5pm,1\nTue,9am,5pm,1\nSat,10am,6pm,1\nFri,4pm,11pm,1\nSun,5am,1pm,1");
  const r = buildRoster(staff, slots, { minRestHours: 0 });
  const f = fairnessReport(r);
  const ann = f.rows.find((x) => x.name === "Ann");
  assert.equal(ann.weekend, 2);
  assert.equal(ann.closing, 1);
  assert.equal(ann.opening, 1);
  assert.equal(ann.tough, 3);
  assert.equal(f.most.name, "Ann");
  assert.ok(f.spread >= 3 && f.flag);
  assert.equal(fairnessReport({ people: [], assignments: [] }).flag, false);
});

import { parseRosterCsv, scheduleChanges } from "./calc.mjs";

const POSTED = [
  "day,start,end,hours,label,assigned_to,role",
  "Mon,9:00 AM,5:00 PM,8.00,open,Ana,",
  "Tue,9:00 AM,5:00 PM,8.00,open,Ana,",
  "Wed,5:00 PM,11:00 PM,6.00,close,Ben,",
  "Thu,9:00 AM,1:00 PM,4.00,open,UNFILLED,",
].join("\n") + "\n";

test("parseRosterCsv reads minutes from Monday and skips unfilled rows", () => {
  const rows = parseRosterCsv(POSTED);
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].person, rows[0].start, rows[0].end], ["Ana", 540, 1020]);
  assert.equal(rows[2].start, 2 * 1440 + 17 * 60);
});

test("scheduleChanges finds moved, cancelled and added shifts and prices short notice", () => {
  const revised = [
    "day,start,end,hours,label,assigned_to,role",
    "Mon,9:00 AM,5:00 PM,8.00,open,Ana,",
    "Tue,11:00 AM,5:00 PM,6.00,open,Ana,",
    "Thu,9:00 AM,1:00 PM,4.00,open,Cleo,",
  ].join("\n") + "\n";
  // Changed Monday 8:00 AM: Tuesday's move is 25 h out, Wednesday's cancel is 57 h out, Thursday's add is 73 h out.
  const r = scheduleChanges(POSTED, revised, { changedAt: 8 * 60, noticeHours: 48, premiumHours: 1, wages: { Ana: 20, Ben: 15, Cleo: 12 } });
  assert.deepEqual(r.changes.map((c) => c.kind + ":" + c.person), ["moved:Ana", "cancelled:Ben", "added:Cleo"]);
  assert.equal(r.changes[0].hoursDelta, -2);
  assert.equal(Math.round(r.changes[0].noticeHours), 25);
  assert.equal(r.changes[0].shortNotice, true);
  assert.equal(r.changes[1].shortNotice, false);
  assert.equal(r.owed, 20);
  assert.equal(r.shortNotice, 1);
});

test("scheduleChanges leaves out exempt people and says when notice is unknown", () => {
  const revised = POSTED.replace("Ana,\nWed", "Ana,\nWed").replace("Ben", "Cleo");
  const a = scheduleChanges(POSTED, revised, { changedAt: 17 * 60 + 2 * 1440 - 60, noticeHours: 48, wages: { Ben: 15, Cleo: 12 }, exempt: ["ben"] });
  assert.equal(a.changes.find((c) => c.person === "Ben").exempt, true);
  assert.equal(a.owed, 12);
  const b = scheduleChanges(POSTED, revised, {});
  assert.equal(b.noticeKnown, false);
  assert.equal(b.owed, 0);
  assert.equal(b.changes[0].noticeHours, null);
});

test("scheduleChanges reports nothing for identical rosters", () => {
  assert.equal(scheduleChanges(POSTED, POSTED, { changedAt: 0 }).changes.length, 0);
});

test("trimOptions: ranks drops by payroll saved, safe ones first, and prices overtime from the whole week", () => {
  const staff = staffOf("Ana, 10, 40, 0\nBen, 20, 40, 0");
  const slots = slotsOf("Mon, 8, 16, 2, open\nTue, 8, 16, 1, close");
  const r = buildRoster(staff, slots);
  assert.ok(r.filledAll);
  const t = trimOptions(staff, slots, r);
  assert.equal(t.rows.length, 3);
  assert.equal(t.safe, 2); // the two Monday copies; Tuesday has one person
  assert.equal(t.rows[2].leavesEmpty, true);
  assert.equal(t.rows[2].slot.day, 1);
  const saves = t.rows.map((x) => x.saves);
  assert.ok(Math.abs(saves[0] - 20 * 8) < 1e-6 || Math.abs(saves[0] - 10 * 8) < 1e-6);
  assert.ok(saves[0] >= saves[1]);
  assert.ok(t.rows.every((x) => x.saves > 0));
});

test("trimOptions: flags a cut that drops someone under their minimum hours; no roster is an error", () => {
  const staff = staffOf("Ana, 10, 40, 8");
  const slots = slotsOf("Mon, 8, 16, 1");
  const r = buildRoster(staff, slots);
  assert.equal(trimOptions(staff, slots, r).rows[0].breaksMinimum, true);
  assert.ok(trimOptions(staff, slots, null).error);
});

test("scheduleChanges: a blank or negative wage is unpriced, never $0 or a negative premium", () => {
  const head = "Day,Start,End,Hours,Label,Person\n";
  const a = head + "Mon,9am,5pm,8,x,Ana\n", b = head + "Mon,10am,6pm,8,x,Ana\n";
  for (const w of ["", -5, "abc"]) {
    const r = scheduleChanges(a, b, { changedAt: 0, wages: { Ana: w } });
    assert.equal(r.owed, 0);
    assert.equal(r.changes[0].premiumUnpriced, true);
  }
});

test("split-shift premium: priced per split day, off by default, and the search avoids it when another person can cover", () => {
  const ana = staffOf("Ana, 20, 60, 0, any");
  const split = slotsOf("Mon, 8, 11, 1, am\nMon, 15, 18, 1, pm");
  const off = buildRoster(ana, split, { minRestHours: 0 });
  assert.equal(off.cost, 20 * 6);
  const on = buildRoster(ana, split, { minRestHours: 0, splitPremium: 15 });
  assert.equal(on.cost, 20 * 6 + 15);
  assert.equal(on.people[0].splitDays, 1);
  // a gap of exactly the limit is not a split; burden applies to the premium too
  const tight = buildRoster(ana, slotsOf("Mon, 8, 11, 1, am\nMon, 12, 15, 1, pm"), { minRestHours: 0, splitPremium: 15 });
  assert.equal(tight.cost, 20 * 6);
  assert.equal(buildRoster(ana, split, { minRestHours: 0, splitPremium: 10, burdenPct: 10 }).cost, (20 * 6 + 10) * 1.1);
  // with a second person free, the search splits the day across people to skip the premium
  const two = staffOf("Ana, 20, 60, 0, any\nBen, 20, 60, 0, any");
  const r = buildRoster(two, split, { minRestHours: 0, splitPremium: 15 });
  assert.equal(r.cost, 20 * 6);
  assert.ok(r.people.every((p) => p.splitDays === 0));
});

test("off: dated entries apply only to the week they fall in", () => {
  const cell = "Ana, 20, 40, 0, any, off: 2026-11-04..2026-11-05; 2026-11-06 5pm-close";
  const wk = parseStaff(cell, { weekStart: "2026-11-02" });
  assert.deepEqual(wk.errors, []);
  const d = wk.staff[0].days;
  assert.deepEqual(d[2], []);
  assert.deepEqual(d[3], []);
  assert.deepEqual(d[4], [[0, 1020]]);
  assert.deepEqual(d[0], [[0, 1440]]);
  const next = parseStaff(cell, { weekStart: "2026-11-09" });
  assert.deepEqual(next.staff[0].days[2], [[0, 1440]]);
  assert.deepEqual(next.notes, []);
});

test("off: a dated entry without a week start is reported, not silently dropped", () => {
  const r = parseStaff("Ana, 20, 40, 0, any, off: 2026-11-04");
  assert.deepEqual(r.errors, []);
  assert.equal(r.notes.length, 1);
  assert.deepEqual(r.staff[0].days[2], [[0, 1440]]);
  assert.equal(parseStaff("Ana, 20, 40, 0, any, off: 2026-13-99x", { weekStart: "2026-11-02" }).errors.length, 1);
});

test("tipPool splits by hours in whole cents and always adds back to the pot", () => {
  const r = { people: [{ name: "A", hours: 30 }, { name: "B", hours: 20 }, { name: "C", hours: 10 }, { name: "D", hours: 0 }] };
  const t = tipPool(r, 600);
  assert.deepEqual(t.rows.map((x) => [x.name, x.share]), [["A", 300], ["B", 200], ["C", 100]]);
  const odd = tipPool({ people: [{ name: "A", hours: 1 }, { name: "B", hours: 1 }, { name: "C", hours: 1 }] }, 100);
  assert.equal(Math.round(odd.rows.reduce((a, x) => a + x.share, 0) * 100), 10000);
  assert.deepEqual(odd.rows.map((x) => x.share), [33.34, 33.33, 33.33]);
  assert.equal(tipPool(r, 0).rows.length, 0);
  assert.equal(tipPool({}, 50).rows.length, 0);
});

test("messages: dates roll over month ends using the real year (leap Feb 29)", () => {
  const r = buildRoster(staffOf("Ana, 15, 40, 0, any"), slotsOf("Thu, 9, 17, 1, open"));
  const ana = rosterMessages(r, "2024-02-26").find((x) => x.person === "Ana");
  assert.match(ana.text, /Thu 29 Feb: /);
});

test("carry over: a row with an unreadable start or end time is skipped, not read as NaN", async () => {
  const { lastShiftEnds } = await import("./calc.mjs");
  const e = lastShiftEnds([
    "day,start,end,hours,label,assigned_to,role",
    "Fri,5pm,??,6.00,,Sam,",
    "Sat,??,5pm,8.00,,Alex,",
    "Sat,9am,5pm,8.00,,Pat,",
  ].join("\n"));
  assert.deepEqual([...e.keys()], ["pat"]);
});

test("toughBalance spreads weekend, closing and opening shifts without leaving shifts open", () => {
  const staff = staffOf("Ann,10,40,0,any\nBo,10,40,0,any\nCy,10,40,0,any");
  const slots = slotsOf("Sat,9,17,1\nSun,9,17,1\nMon,9,17,1\nTue,9,17,1\nWed,9,17,1\nThu,9,17,1");
  const spread = (r) => fairnessReport(r).spread;
  const off = buildRoster(staff, slots, { balance: 0, toughBalance: 0 });
  const on = buildRoster(staff, slots, { balance: 0, toughBalance: 100 });
  assert.equal(on.unfilled.length, 0);
  assert.ok(spread(on) <= spread(off));
  assert.ok(spread(on) <= 1);
});

test("coverageGrid counts people per clock hour and skips unfilled slots", async () => {
  const { coverageGrid } = await import("./calc.mjs");
  const slot = (day, s, e) => ({ day, startMin: s * 60, endMin: e * 60 });
  const r = { assignments: [
    { person: "Ana", slot: slot(0, 9, 13) }, { person: "Ben", slot: slot(0, 11, 15) }, { person: null, slot: slot(1, 6, 7) },
  ] };
  const g = coverageGrid(r);
  assert.equal(g.from, 9); assert.equal(g.to, 15); assert.equal(g.peak, 2);
  assert.deepEqual(g.rows[0].counts, [1, 1, 2, 2, 1, 1]);
  assert.equal(g.rows[0].thin, 4);
  assert.equal(g.rows[1].empty, 0);
  assert.deepEqual(coverageGrid({ assignments: [] }).rows, []);
});

test("coverageGrid on a built sample roster never exceeds the staff and totals the scheduled hours", async () => {
  const { coverageGrid, parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } = await import("./calc.mjs");
  const st = parseStaff(sampleStaff()), sh = parseShifts(sampleShifts());
  const r = buildRoster(st.staff, sh.slots);
  const g = coverageGrid(r);
  const total = g.rows.reduce((t, row) => t + row.counts.reduce((a, b) => a + b, 0), 0);
  const hours = r.assignments.filter((a) => a.person).reduce((t, a) => t + Math.ceil(a.slot.endMin / 60) - Math.floor(a.slot.startMin / 60), 0);
  assert.equal(total, hours);
  assert.ok(g.peak <= st.staff.length);
});

test("placeBreaks: staggers meal breaks so someone stays on the floor", () => {
  const A = (person, startMin, endMin) => ({ slot: { day: 0, startMin, endMin }, person });
  const r = { assignments: [A("Ana", 480, 1020), A("Ben", 480, 1020), A("Cy", 480, 600), A("Short", 600, 780)] };
  const b = placeBreaks(r);
  assert.deepEqual(b.map((x) => x.person), ["Ana", "Ben"]);
  for (const x of b) {
    assert.equal(x.endMin - x.startMin, 30);
    assert.ok(x.startMin >= 480 + 120 && x.startMin <= 480 + 300, "begins before the 5th hour is over");
    assert.ok(x.startMin % 15 === 0);
    assert.ok(x.others >= 1 && !x.alone);
  }
  assert.ok(b[0].endMin <= b[1].startMin || b[1].endMin <= b[0].startMin);
  assert.equal(b[0].dayName, "Mon");
});

test("placeBreaks: joins back-to-back shifts, skips short days, flags a lone worker", () => {
  const r = { assignments: [
    { slot: { day: 1, startMin: 480, endMin: 660 }, person: "Sam" },
    { slot: { day: 1, startMin: 660, endMin: 960 }, person: "Sam" },
    { slot: { day: 2, startMin: 480, endMin: 720 }, person: "Sam" },
    { slot: { day: 3, startMin: 480, endMin: 960 }, person: null },
  ] };
  const b = placeBreaks(r);
  assert.equal(b.length, 1);
  assert.equal(b[0].dayName, "Tue");
  assert.ok(b[0].alone && b[0].others === 0);
  assert.equal(placeBreaks(r, { mealAfter: 10 }).length, 0);
  assert.deepEqual(placeBreaks({ assignments: [] }), []);
});

test("absencePlan: hands a week of shifts to others cheapest first, stays valid, and leaves unfillable shifts open", () => {
  const staff = staffOf("Ana, 10, 40, 0, Mon-Wed 8-16\nBen, 20, 40, 0, Mon-Wed 8-16\nCy, 15, 8, 0, Mon-Wed 8-16\nDee, 12, 40, 0, Tue 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open\nTue, 8, 16, 1, open\nWed, 8, 16, 1, open");
  const r = buildRoster(staff, slots);
  const anas = r.assignments.filter((a) => a.person === "Ana").length;
  assert.ok(anas >= 2);
  const plan = absencePlan(staff, slots, r, "ana");
  assert.equal(plan.moves.length + plan.open.length, anas);
  assert.ok(plan.moves.every((m) => m.to !== "Ana"));
  assert.ok(plan.owner.every((k) => k !== 0));
  // Nobody is over their weekly limit, or double-booked on a day, afterwards.
  for (let k = 0; k < staff.length; k++) {
    const mine = plan.owner.map((o, i) => (o === k ? i : -1)).filter((i) => i >= 0);
    assert.ok(mine.reduce((t, i) => t + (slots[i].end - slots[i].start) / 60, 0) <= staff[k].maxHours + 1e-9);
    assert.equal(new Set(mine.map((i) => slots[i].day)).size, mine.length);
  }
  // Only Tuesday: at most that one shift moves, to someone free on Tuesday.
  const tue = absencePlan(staff, slots, r, "Ana", [1]);
  assert.ok(tue.moves.length + tue.open.length <= 1);
  assert.ok(absencePlan(staff, slots, r, "Zed").error);
  assert.ok(absencePlan(staff, slots, null, "Ana").error);
});

test("absencePlan: a shift nobody can take stays open with the reasons", () => {
  const staff = staffOf("Ana, 10, 40, 0, Mon 8-16\nBen, 20, 4, 0, Mon 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open");
  const r = buildRoster(staff, slots);
  const plan = absencePlan(staff, slots, r, "Ana");
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.open.length, 1);
  assert.equal(plan.open[0].blocked[0].name, "Ben");
  assert.equal(plan.owner[0], -1);
});

test("absencePlan: equally hard shifts are handed over in calendar order, so the cheaper cover takes the earlier one", () => {
  // Ben (cheapest) can only take one 8-hour shift; Cy takes the other. Mon and Tue each have two possible covers.
  const staff = staffOf("Ana, 10, 40, 0, Mon-Tue 8-16\nBen, 12, 8, 0, Mon-Tue 8-16\nCy, 20, 40, 0, Mon-Tue 8-16");
  const slots = slotsOf("Mon, 8, 16, 1, open\nTue, 8, 16, 1, open");
  const r = { owner: [0, 0] };
  const plan = absencePlan(staff, slots, r, "Ana");
  assert.deepEqual(plan.moves.map((m) => [m.slot.day, m.to]), [[0, "Ben"], [1, "Cy"]]);
});

test("pay differential adds a premium for hours inside its windows, per hour and as a percent of wage", () => {
  const ana = staffOf("Ana, 20, 40");
  const shifts = slotsOf("Fri,22,6,1,close\nMon,9,17,1,day");
  const base = buildRoster(ana, shifts, { minRestHours: 0 });
  // Fri 22:00-24:00 is 2 h and the Saturday tail 0-6 is 6 h inside "Fri 22-24; Sat 0-6"; Monday is outside.
  const per = buildRoster(ana, shifts, { minRestHours: 0, diffWhen: "Fri 22-24; Sat 0-6", diffPerHour: 3 });
  assert.equal(per.unfilledSlots, 0);
  assert.equal(per.cost - base.cost, 8 * 3);
  const pct = buildRoster(ana, shifts, { minRestHours: 0, diffWhen: "Fri 22-24; Sat 0-6", diffPct: 10 });
  assert.equal(pct.cost - base.cost, 8 * 20 * 0.1);
  const burdened = buildRoster(ana, shifts, { minRestHours: 0, burdenPct: 10, diffWhen: "Fri 22-24; Sat 0-6", diffPerHour: 3 });
  assert.ok(Math.abs(burdened.cost - (base.cost + 24) * 1.1) < 1e-9);
  assert.equal(buildRoster(ana, shifts, { minRestHours: 0, diffWhen: "Fri 22-24", diffPerHour: 0 }).cost, base.cost, "no premium set: unchanged");
});

test("a percent differential steers a night shift to the lower-paid person", () => {
  const two = staffOf("Hi, 30, 40\nLo, 15, 40");
  const r = buildRoster(two, slotsOf("Sat,9,17,1,sat"), { diffWhen: "Sat-Sun", diffPct: 50 });
  assert.equal(r.owner[0], 1);
  assert.equal(r.cost, 15 * 8 * 1.5);
});

import { availabilityFromGrid, parseAvailabilityReply, mergeAvailabilityReplies } from "./calc.mjs";

test("availability grid becomes the text the staff list reads, ranges collapsed", () => {
  const w = { mode: "range", from: 540, to: 1020 };
  const grid = [w, w, w, w, w, { mode: "range", from: 600, to: 840 }, { mode: "off" }];
  const text = availabilityFromGrid(grid);
  assert.equal(text, "Mon-Fri 9-17; Sat 10-14; Sun off");
  const a = parseAvailability(text);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.days[0], [[540, 1020]]);
  assert.deepEqual(a.days[5], [[600, 840]]);
  assert.deepEqual(a.days[6], []);
  assert.equal(availabilityFromGrid(Array(7).fill({ mode: "any" })), "Mon-Sun 0-24");
  const allOff = availabilityFromGrid(Array(7).fill({ mode: "off" }));
  assert.equal(allOff, "Mon-Sun off");
  assert.equal(parseAvailability(allOff).any, false);
  assert.deepEqual(parseAvailability(allOff).days.flat(), []);
  assert.equal(availabilityFromGrid([{ mode: "range", from: 570, to: 1050 }, ...Array(6).fill({ mode: "off" })]), "Mon 9:30-17:30; Tue-Sun off");
});

test("reply lines: valid, bad availability, bad extras", () => {
  const ok = parseAvailabilityReply("Ana | Mon-Fri 9-17; Sat off | max: 30 | off: Wed");
  assert.equal(ok.name, "Ana");
  assert.equal(ok.max, 30);
  assert.deepEqual(ok.extras, ["off: Wed"]);
  assert.match(parseAvailabilityReply("Ana").error, /not a reply line/);
  assert.match(parseAvailabilityReply("Ana | Funday 9-5").error, /^Ana:/);
  assert.match(parseAvailabilityReply("Ana | Mon 9-17 | wage: 99").error, /could not read/);
});

test("merging replies replaces availability, keeps wage and roles, never raises max hours", () => {
  const staff = "name, wage, max, min, availability\nAna, 18, 40, 30, Mon-Sat 6-22, roles: cook, prev: Sun 10pm\nBen, 16, 32, 20, any, off: Fri";
  const m = mergeAvailabilityReplies(staff, "Ana | Mon-Fri 9-17; Sat off | max: 25 | off: Wed\nBen | Mon-Sun 0-24 | max: 50\nZed | Sat 8-16");
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.updated, ["Ana", "Ben"]);
  assert.deepEqual(m.added, ["Zed"]);
  const lines = m.text.split("\n");
  assert.equal(lines[0], "name, wage, max, min, availability");
  assert.equal(lines[1], "Ana, 18, 25, 25, Mon-Fri 9-17; Sat off, off: Wed, roles: cook, prev: Sun 10pm");
  assert.equal(lines[2], "Ben, 16, 32, 20, Mon-Sun 0-24, off: Fri");
  const p = parseStaff(lines.slice(0, 3).join("\n"));
  assert.deepEqual(p.errors, []);
  assert.equal(p.staff[0].maxHours, 25);
  assert.deepEqual(p.staff[0].roles, ["cook"]);
  assert.ok(p.staff[0].prevEnd !== null);
  assert.ok(m.text.includes("Zed, , 40, 0, Sat 8-16"));
  assert.ok(parseStaff(m.text).errors.some((e) => /Zed/.test(e) && /wage/.test(e)));
});

test("merging reports bad lines without touching the rest", () => {
  const staff = "Ana, 18, 40, 0, any";
  const m = mergeAvailabilityReplies(staff, "# comment\nAna | Moonday 9-5\n\nnonsense");
  assert.equal(m.text, staff);
  assert.equal(m.errors.length, 2);
  assert.deepEqual(m.updated, []);
});

test("parseRosterCsv: later days and overnight shifts keep absolute minutes from Monday", () => {
  const csv = ["day,start,end,hours,label,assigned_to,role", "Tue,9:00 AM,5:00 PM,8.00,open,Ana,", "Fri (overnight),10:00 PM,2:00 AM,4.00,close,Ben,"].join("\n");
  const rows = parseRosterCsv(csv);
  assert.deepEqual([rows[0].start, rows[0].end], [1440 + 540, 1440 + 1020]);
  assert.deepEqual([rows[1].start, rows[1].end], [4 * 1440 + 22 * 60, 5 * 1440 + 120]);
});

test("placeBreaks: only people on the floor at that time on that day count as cover", () => {
  const r = { assignments: [
    { slot: { day: 0, startMin: 480, endMin: 960 }, person: "Sam" },
    { slot: { day: 1, startMin: 480, endMin: 960 }, person: "Zed" },
  ] };
  const b = placeBreaks(r);
  const sam = b.find((x) => x.person === "Sam");
  assert.ok(sam.alone && sam.others === 0, "Zed works Tuesday, so he is no cover for Monday");
});

test("placeBreaks: a break taken on one day does not take that person off the floor on another", () => {
  const A = (person, day) => ({ slot: { day, startMin: 480, endMin: 960 }, person });
  const b = placeBreaks({ assignments: [A("Ana", 0), A("Ben", 0), A("Ana", 1), A("Ben", 1)] });
  assert.equal(b.length, 4);
  assert.ok(b.every((x) => !x.alone && x.others === 1));
});

test("roles: 'role: keyholder x1' needs one keyholder among several people, the rest take anyone", () => {
  const staff = staffOf("Ana, 15, 40, 0, any, roles: keyholder\nBen, 12, 40, 0, any\nCy, 10, 40, 0, any");
  const slots = slotsOf("Mon, 8, 16, 3, open, role: keyholder x1");
  assert.deepEqual(slots.map((s) => s.role), ["keyholder", "", ""]);
  const r = buildRoster(staff, slots);
  assert.equal(r.unfilled.length, 0);
  assert.equal(r.assignments.filter((a) => a.slot.role === "keyholder")[0].person, "Ana");
  // Without Ana nobody can hold the keyholder copy, so exactly that one stays open.
  const noKey = buildRoster(staffOf("Ben, 12, 40, 0, any\nCy, 10, 40, 0, any\nDi, 9, 40, 0, any"), slots);
  assert.equal(noKey.unfilled.length, 1);
  assert.match(noKey.unfilled[0].text, /nobody listed has the role "keyholder"/);
  assert.match(parseShifts("Mon, 8, 16, 2, open, role: keyholder x3").errors[0], /asks for 3/);
});

test("a high balance setting never costs coverage on the sample week", () => {
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const base = buildRoster(staff, slots, { balance: 0 }).unfilledHours;
  for (const balance of [25, 50, 75, 100]) assert.equal(buildRoster(staff, slots, { balance }).unfilledHours, base, `balance ${balance}`);
});

test("tough: history makes the search hand this week's closes to the person who has had fewest lately", async () => {
  const { parseStaff, parseShifts, buildRoster, carryOverStaff, toughCounts } = await import("./calc.mjs");
  const st = parseStaff("name,wage,max,min,avail\nAna, 15, 40, 0, any, tough: 4\nBen, 15, 40, 0, any, tough: 0");
  assert.deepEqual(st.errors, []);
  assert.equal(st.staff[0].toughBefore, 4);
  assert.equal(st.staff[1].toughBefore, 0);
  assert.equal(st.staff[0].days.length > 0, true);
  const sh = parseShifts("Mon-Thu, 5pm, 11pm, 1, close");
  const r = buildRoster(st.staff, sh.slots, { toughBalance: 100, balance: 0 });
  const by = (n) => r.assignments.filter((a) => a.person === n).length;
  assert.equal(by("Ana") + by("Ben"), 4);
  assert.ok(by("Ben") > by("Ana"), `Ben ${by("Ben")} vs Ana ${by("Ana")}`);
  // Without history the same week splits evenly.
  const even = parseStaff("name,wage,max,min,avail\nAna, 15, 40, 0, any\nBen, 15, 40, 0, any");
  const r2 = buildRoster(even.staff, sh.slots, { toughBalance: 100, balance: 0 });
  assert.equal(r2.assignments.filter((a) => a.person === "Ana").length, 2);
  // A bad cell is reported.
  assert.match(parseStaff("name,wage,max,min,avail\nAna, 15, 40, 0, any, tough: lots").errors[0], /tough: 3/);
  // Carry over: counts last week's tough shifts and halves the old tally.
  const csv = ["day,start,end,hours,label,assigned_to,role", "Sat,9am,5pm,8.00,,Ana,", "Mon,5pm,11pm,6.00,,Ana,", "Tue,9am,5pm,8.00,,Ana,", "Tue,9am,5pm,8.00,,Ben,"].join("\n");
  assert.equal(toughCounts(csv).get("ana"), 2);
  assert.equal(toughCounts(csv).get("ben"), 0);
  const c = carryOverStaff("name,wage,max,min,avail\nAna, 15, 40, 0, any, tough: 4\nBen, 15, 40, 0, any, tough: 2", csv);
  const next = parseStaff(c.text);
  assert.deepEqual(next.errors, []);
  assert.equal(next.staff[0].toughBefore, 4); // 4 * 0.5 + 2
  assert.equal(next.staff[1].toughBefore, 1); // 2 * 0.5 + 0
});

test("salesPerLaborHour: hours each day's sales call for against hours scheduled", () => {
  const staff = staffOf("Ann,10,40,0,any");
  const slots = slotsOf("Mon,8,12,1\nMon,13,17,1\nWed,9,13,1");
  const r = buildRoster(staff, slots, { minRestHours: 0 });
  const g = salesPerLaborHour(r, staff, "$400, 0, 100", 50);
  assert.equal(g.days[0].splh, 50);
  assert.equal(g.days[0].needHours, 8);
  assert.equal(g.days[0].gap, 0);
  assert.equal(g.days[1].gap, null);
  assert.equal(g.days[2].needHours, 2);
  assert.equal(g.days[2].gap, 2);
  assert.deepEqual(g.over.map((d) => d.day), ["Wed"]);
  assert.deepEqual(g.under, []);
  assert.equal(salesPerLaborHour(r, staff, "", 50), null);
  assert.equal(salesPerLaborHour(r, staff, "400", 0), null);
  assert.deepEqual(salesPerLaborHour(r, staff, "800", 50).under.map((d) => d.day), ["Mon"]);
});

test("openShiftPost: one group message naming each open shift and who could take it, no pay figures", () => {
  const staff = staffOf("Ana, 15, 40, 0, Mon 9-17\nBen, 12, 40, 0, Mon 9-17; Tue 9-17");
  const slots = slotsOf("Mon, 9, 13, 1, early\nTue, 9, 13, 1, tue\nSat, 9, 13, 1, sat");
  const r = buildRoster(staff, slots);
  const post = openShiftPost(staff, slots, r, "2026-10-12");
  assert.equal(post.count, 1);
  assert.match(post.text, /^Open shifts this week\. Reply to claim one:/);
  assert.match(post.text, /Sat 17 Oct: 9am-1pm sat - open to anyone free/);
  assert.doesNotMatch(post.text, /\$/);
  const full = buildRoster(staff, slotsOf("Mon, 9, 13, 1, early"));
  assert.deepEqual(openShiftPost(staff, slotsOf("Mon, 9, 13, 1, early"), full), { count: 0, text: "" });
  assert.ok(openShiftPost(staff, slots, null).error);
});

test("openShiftPost: names the people who could take an open shift", () => {
  const staff = staffOf("Ana, 15, 40, 0, Mon 9-17\nBen, 12, 40, 0, Mon 9-17");
  const slots = slotsOf("Mon, 9, 13, 1, crew");
  const r = buildRoster(staff, slots);
  const emptied = { ...r, owner: [-1] };
  const post = openShiftPost(staff, slots, emptied);
  assert.equal(post.count, 1);
  assert.match(post.text, /Mon: 9am-1pm crew - could take it: Ben, Ana/);
});

import { planWeeks, sampleStaff as _ss, sampleShifts as _sh, parseRosterCsv as _prc } from "./calc.mjs";

test("planWeeks builds consecutive weeks and carries the tough-shift tally forward", () => {
  const p = planWeeks(_ss(), _sh(), { weeks: 3, weekStart: "2026-11-02", toughBalance: 60, restarts: 1, iterations: 3000 });
  assert.ok(p.ok);
  assert.equal(p.weeks.length, 3);
  assert.deepEqual(p.weeks.map((w) => w.weekStart), ["2026-11-02", "2026-11-09", "2026-11-16"]);
  for (const w of p.weeks) assert.ok(_prc(w.csv).length > 0);
  assert.equal(p.totalCost, p.weeks.reduce((t, w) => t + w.roster.cost, 0));
});

test("planWeeks applies a dated off entry only in the week it falls in", () => {
  const staff = _ss().replace("Gus, 19, 40, 0, any", "Gus, 19, 40, 0, any, off: 2026-11-10");
  const p = planWeeks(staff, _sh(), { weeks: 2, weekStart: "2026-11-02", restarts: 1, iterations: 3000 });
  assert.ok(p.ok);
  const gusTue = (w) => _prc(w.csv).filter((s) => s.person === "Gus" && s.day === 1).length;
  assert.equal(gusTue(p.weeks[1]), 0);
});

test("planWeeks drops a stale prev: for people who did not work last week", () => {
  const staff = "name, wage, max hours, min hours, availability\nAna, 18, 40, 0, Mon-Sun 6-22, prev: Sun 10pm\nBen, 16, 40, 0, Mon-Sun 6-22";
  const shifts = "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day";
  const p = planWeeks(staff, shifts, { weeks: 2, weekStart: "2026-11-02", restarts: 1, iterations: 2000 });
  assert.ok(p.ok);
  assert.equal(p.weeks.length, 2);
  assert.equal(planWeeks(staff, shifts, { weeks: 99 }).weeks.length, 8);
});

test("budgetCheck: headroom, overage in hours at average cost, bad input", () => {
  const under = budgetCheck({ cost: 900, hours: 60 }, 1000);
  assert.equal(under.over, false);
  assert.equal(under.headroom, 100);
  assert.equal(under.cutHours, 0);
  const over = budgetCheck({ cost: 1200, hours: 80 }, 1000);
  assert.equal(over.over, true);
  assert.equal(over.perHour, 15);
  assert.ok(Math.abs(over.cutHours - 200 / 15) < 1e-9);
  assert.equal(budgetCheck({ cost: 900, hours: 60 }, 0), null);
  assert.equal(budgetCheck({ cost: 900, hours: 60 }, "x"), null);
});

test("unsupervisedStretches: a minor is never the only one in", () => {
  const st = staffOf("Name, Wage\nKit, 12, , , minor\nAna, 15\nSam, 15");
  assert.equal(st[0].supervised, true);
  assert.equal(st[1].supervised, false);
  const a = (person, day, startMin, endMin) => ({ slot: { day, startMin, endMin }, person });
  const r = { assignments: [a("Kit", 0, 540, 900), a("Ana", 0, 600, 840), a("Kit", 1, 600, 720), a("Kit", 2, 1260, 120)] };
  const got = unsupervisedStretches(r, st);
  assert.deepEqual(got.map((x) => [x.people.join(), x.day, x.startMin, x.endMin]), [["Kit", "Mon", 540, 600], ["Kit", "Mon", 840, 900], ["Kit", "Tue", 600, 720], ["Kit", "Wed", 1260, 120]]);
  assert.deepEqual(unsupervisedStretches({ assignments: [a("Kit", 0, 540, 600), a("Ana", 0, 540, 600)] }, st), []);
  assert.deepEqual(unsupervisedStretches(r, staffOf("Ana, 15")), []);
});

test("loneStretches: one person alone for longer than the limit", () => {
  const a = (person, day, startMin, endMin) => ({ slot: { day, startMin, endMin }, person });
  const r = { assignments: [a("Ana", 0, 540, 900), a("Ben", 0, 660, 780), a("Cy", 1, 600, 660), a("Ana", 2, 1260, 120)] };
  const got = loneStretches(r, 2);
  assert.deepEqual(got.map((x) => [x.person, x.day, x.startMin, x.endMin, x.hours]), [["Ana", "Wed", 1260, 120, 5]]);
  assert.deepEqual(loneStretches(r, 1).map((x) => x.day + x.person), ["MonAna", "MonAna", "WedAna"]);
  assert.deepEqual(loneStretches({ assignments: [a("Ana", 0, 540, 600), a("Ben", 0, 540, 600)] }, 0), []);
});

test("shortShifts: assigned shifts under the minimum, overnight aware", () => {
  const a = (person, day, startMin, endMin) => ({ slot: { day, startMin, endMin }, person });
  const r = { assignments: [a("Ana", 0, 540, 660), a("Ben", 1, 540, 840), a("Cy", 2, 1380, 60), { slot: { day: 3, startMin: 0, endMin: 60 }, person: null }] };
  assert.deepEqual(shortShifts(r, 4).map((x) => [x.person, x.day, x.hours]), [["Ana", "Mon", 2], ["Cy", "Wed", 2]]);
  assert.deepEqual(shortShifts(r, 2), []);
});

test("age: 15 applies the federal youth-hour limits as hard rules", () => {
  const { staff, errors, notes } = parseStaff("Name, Wage\nKit, 12, 40, , age: 15\nVic, 12, , , age: 15 summer\nAna, 15\nLou, 12, , , age: 17");
  assert.deepEqual(errors, []);
  const [kit, vic, ana, lou] = staff;
  assert.equal(kit.maxHours, 18);
  assert.equal(kit.maxDaily, 3);
  assert.deepEqual(kit.days[0], [[420, 1140]]);
  assert.equal(vic.maxHours, 40);
  assert.equal(vic.maxDaily, 8);
  assert.deepEqual(vic.days[2], [[420, 1260]]);
  assert.equal(kit.supervised, true);
  assert.equal(lou.supervised, true);
  assert.equal(lou.maxHours, 40);
  assert.equal(ana.age, null);
  assert.equal(notes.length, 2);
  // the solver cannot give a 15-year-old a closing shift or a 6-hour school-week day
  const sh = parseShifts("Mon, 5pm, 10pm, 1\nTue, 3pm, 9pm, 1");
  const r = buildRoster([kit], sh.slots);
  assert.equal(r.assignments.filter((a) => a.person === "Kit").length, 0);
  assert.equal(parseStaff("Name, Wage\nTy, 12, , , age: 12").errors.length, 1);
  assert.equal(parseStaff("Name, Wage\nTy, 12, , , age: old").errors.length, 1);
});

import { parseTimeOffRequest, addTimeOff } from "./calc.mjs";
test("parseTimeOffRequest allows 60 calendar days inclusive, as its message says, and no more", () => {
  assert.deepEqual(parseTimeOffRequest("2026-01-01", "2026-03-01"), { entry: "2026-01-01..2026-03-01" }); // 60 days
  assert.ok(parseTimeOffRequest("2026-01-01", "2026-03-02").error); // 61 days
});
test("parseTimeOffRequest and addTimeOff build an off: entry", () => {
  assert.deepEqual(parseTimeOffRequest("2026-11-04"), { entry: "2026-11-04" });
  assert.deepEqual(parseTimeOffRequest("2026-11-04", "2026-11-06"), { entry: "2026-11-04..2026-11-06" });
  for (const bad of [["2026-13-40"], ["2026-02-30"], ["tomorrow"], ["2026-11-06", "2026-11-04"], ["2026-01-01", "2026-06-01"]]) assert.ok(parseTimeOffRequest(...bad).error, bad.join());
  const staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, any\nBen, 20, 40, 0, any, off: Fri";
  assert.match(addTimeOff(staff, "ana", "2026-11-04").text, /Ana, 20, 40, 0, any, off: 2026-11-04$/m);
  const b = addTimeOff(staff, "Ben", "2026-11-04").text;
  assert.match(b, /Ben, 20, 40, 0, any, off: Fri; 2026-11-04$/m);
  assert.equal(addTimeOff(b, "Ben", "2026-11-04").text, b);
  assert.ok(addTimeOff(staff, "Zed", "2026-11-04").error);
});

import { TEMPLATES as _TPL, parseStaff as _ps2, parseShifts as _psh2, buildRoster as _br2 } from "./calc.mjs";
test("every starter template parses cleanly and builds a roster that covers its shifts", () => {
  assert.ok(Object.keys(_TPL).length >= 4);
  for (const [k, t] of Object.entries(_TPL)) {
    const st = _ps2(t.staff()), sh = _psh2(t.shifts());
    assert.equal(st.errors?.length || 0, 0, k + " staff errors");
    assert.equal(sh.errors?.length || 0, 0, k + " shift errors");
    assert.ok(st.staff.length >= 5 && sh.slots.length > 0, k);
    const r = _br2(st.staff, sh.slots, {});
    assert.ok(r.ok && r.totalHours > 0, k);
    if (k !== "cafe") assert.ok(r.unfilledHours <= 10, k + " leaves too much open: " + r.unfilledHours);
  }
});

import { planFairness } from "./calc.mjs";

test("planFairness adds each week's tough shifts per person and flags a lopsided month", () => {
  const p = planWeeks(_ss(), _sh(), { weeks: 3, weekStart: "2026-11-02", toughBalance: 60, restarts: 1, iterations: 3000 });
  const f = planFairness(p);
  assert.equal(f.weeks, 3);
  const total = f.rows.reduce((t, x) => t + x.tough, 0);
  const perWeek = p.weeks.reduce((t, w) => t + fairnessReport(w.roster).rows.reduce((u, x) => u + x.tough, 0), 0);
  assert.equal(total, perWeek);
  assert.equal(f.spread, f.most.tough - f.least.tough);
  const fake = (name, tough) => ({ roster: { people: [{ name }, { name: "Zed" }], assignments: Array.from({ length: tough }, () => ({ person: name, slot: { day: 5, startMin: 600, endMin: 900 } })).concat([{ person: "Zed", slot: { day: 1, startMin: 600, endMin: 900 } }]) } });
  const lop = planFairness({ weeks: [fake("Ann", 4), fake("Ann", 4)] });
  assert.equal(lop.most.name, "Ann");
  assert.equal(lop.most.tough, 8);
  assert.equal(lop.flag, true);
  assert.deepEqual(planFairness(null), { weeks: 0, rows: [], spread: 0, flag: false, most: null, least: null });
});

test("ownerValid judges a person's shifts in time order, whatever order the slot array is in", () => {
  const staff = staffOf("Ann,15,40,0,Mon-Sun 6-24");
  const base = slotsOf("Mon,9,17,1\nTue,9,17,1\nWed,9,17,1");
  // Slot indices run with the clock in one array and against it in the other.
  for (const slots of [base, [...base].reverse()]) {
    const ctx = _internals.buildContext(staff, slots, {});
    assert.ok(_internals.ownerValid(ctx, slots.map(() => 0)), "three days of shifts with a full night between them are valid");
  }
  const clash = slotsOf("Mon,6,12,1\nMon,10,16,1");
  for (const slots of [clash, [...clash].reverse()]) {
    const ctx = _internals.buildContext(staff, slots, {});
    assert.ok(!_internals.ownerValid(ctx, [0, 0]), "overlapping shifts are invalid");
  }
});

test("exact search runs by itself on small weeks and can be switched off", () => {
  const staff = staffOf("Ana,15,24,0,Mon-Fri 8-18\nBen,12,16,8,Mon-Wed 6-16\nCy,18,40,0,any");
  const small = slotsOf("Mon,8,14,1\nTue,8,16,1\nWed,6,12,2");
  assert.ok(buildRoster(staff, small).optimality, "a 4-shift week is checked without asking");
  assert.equal(buildRoster(staff, small, { exact: false }).optimality, null);
  const big = slotsOf("Mon,8,16,3\nTue,8,16,3\nWed,8,16,3\nThu,8,16,3\nFri,8,16,3");
  assert.equal(buildRoster(staff, big).optimality, null, "15 shifts is past the automatic limit");
});

test("exact search treats people who differ only by name as interchangeable: same optimum as brute force, and big twin crews are now proven", () => {
  const twins = (n) => ["name, wage, max hours, min hours, availability", ...Array.from({ length: n }, (_, i) => `Pat${i + 1}, 15, 12, 0, Mon-Sun 6-23`)].join("\n");
  const week = (m) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].flatMap((d) => [`${d},8,16,1`, `${d},12,20,1`]).slice(0, m).join("\n");
  // equal crews, brute force over every assignment
  const small = bruteForceBest(staffOf(twins(3)), slotsOf(week(6)), {});
  const r3 = buildRoster(staffOf(twins(3)), slotsOf(week(6)), { exact: true });
  assert.equal(r3.optimality.status === "optimal" || r3.optimality.status === "improved", true);
  assert.ok(Math.abs(r3.score - small) < 1e-6, `exact ${r3.score} vs brute ${small}`);
  // a mixed crew (two twins and one different) keeps the distinction
  const mixed = "name, wage, max hours, min hours, availability\nA, 15, 12, 0, any\nB, 15, 12, 0, any\nC, 22, 12, 0, any";
  const bm = bruteForceBest(staffOf(mixed), slotsOf(week(6)), { balance: 30 });
  assert.ok(Math.abs(buildRoster(staffOf(mixed), slotsOf(week(6)), { exact: true, balance: 30 }).score - bm) < 1e-6);
  // six interchangeable people, ten shifts: used to hit the 8 s limit, now finishes
  const big = buildRoster(staffOf(twins(6)), slotsOf(week(10)), { exact: true });
  assert.ok(["optimal", "improved"].includes(big.optimality.status), big.optimality.status);
});

test("the 7-person sample week is proven inside the default limits, to within the stated tolerance", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const r = buildRoster(staff, slots, { exact: true });
  assert.ok(["optimal", "improved"].includes(r.optimality.status), r.optimality.status);
  assert.equal(r.optimality.tolerance, 0.5);
  assert.equal(r.optimality.forcedOpenHours, 15);
  assert.match(optimalityText(r.optimality), /within \$0\.50|more than \$0\.50/);
  // with no tolerance the same week is still proven now that the coverage pass always runs (it stayed "bounded" before 2026-10-22)
  const strict = buildRoster(staff, slots, { exact: true, exactTolerance: 0, exactNodes: 20000 });
  assert.equal(strict.optimality.tolerance, 0);
  assert.ok(["optimal", "improved"].includes(strict.optimality.status), strict.optimality.status);
});

test("the coverage pass runs even when the flow bound says nothing must stay open, and its better roster is kept", () => {
  // seeded random week (eval/scale-bench.mjs, 8 people x 22 shifts, case 1): the annealer leaves 5 h open, the flow bound at the
  // root says 0, and the coverage pass finds a roster with 4 h open and proves 4 is the least. It used to be skipped here.
  const staff = staffOf("P0,15,12,0,Mon-Fri 6-20\nP1,14,36,0,Mon-Fri 6-20\nP2,18,18,0,Tue-Fri 6-20\nP3,10,24,0,Mon-Fri 9-17\nP4,10,24,0,Mon-Fri 6-23\nP5,17,24,0,Mon-Fri 8-22\nP6,11,30,0,Tue-Fri 7-20\nP7,18,18,0,Tue-Fri 6-20");
  const slots = slotsOf("Fri,8,15,2\nMon,14,19,1\nMon,8,13,1\nWed,11,17,1\nTue,9,14,2\nTue,14,19,2\nThu,7,15,1\nFri,6,14,2\nMon,9,17,1\nMon,7,11,1\nWed,9,13,1\nMon,10,16,1\nThu,14,18,1\nWed,7,15,1\nTue,9,18,1\nTue,11,15,1\nFri,7,16,2\nWed,13,17,1\nMon,9,17,1\nThu,7,11,1\nTue,9,15,2\nThu,7,14,2");
  const r = buildRoster(staff, slots, { exact: true, exactNodes: 30000, exactMs: 20000 });
  assert.equal(r.optimality.coverOpen, 4);
  assert.equal(r.optimality.forcedOpenHours, 4);
  assert.equal(r.optimality.coverageProven, true);
  assert.equal(r.unfilledHours, 4);
});

test("coverage-first pass proves how few hours must stay open, and the cost search is told", () => {
  // seeded random week (eval/bound-bench.mjs, case 10): 5 people, 14 shifts, 22 hours cannot all be covered
  const staff = staffOf("P0,20,30,0,Tue-Fri 8-22\nP1,16,18,0,Mon-Fri 7-21\nP2,11,18,0,Tue-Fri 6-20\nP3,18,30,0,Mon-Fri 6-20\nP4,10,18,0,Tue-Fri 9-18");
  const slots = slotsOf("Thu,7,13,1\nWed,14,18,2\nFri,8,17,1\nMon,14,23,2\nFri,9,14,1\nTue,11,18,2\nThu,12,20,1\nThu,13,19,1\nWed,6,15,2\nFri,11,17,1\nFri,11,16,2\nTue,11,17,1\nThu,11,17,1\nTue,12,18,1");
  const r = buildRoster(staff, slots, { exact: true, balance: 60, exactNodes: 100000, exactMs: 20000, restarts: 2, iterations: 2000 });
  assert.equal(r.optimality.coverOpen, 22);
  assert.notEqual(r.optimality.status, "bounded");
  assert.equal(r.unfilledHours, 22);
});

test("redteam: a meal break on an unwatched stretch sits nearest the middle, not at the latest start", () => {
  const r = { assignments: [{ slot: { day: 2, startMin: 480, endMin: 960 }, person: "Sam" }] };
  const b = placeBreaks(r);
  assert.equal(b.length, 1);
  assert.equal(b[0].startMin, 705);
});

test("redteam: the unpaid meal cut applies from just over mealAfter hours, not a few minutes later", () => {
  const staff = staffOf("Ana, $20, 40");
  const slots = slotsOf("Mon, 9:00am, 3:05pm, 1, Open");
  const plain = buildRoster(staff, slots, {});
  const meal = buildRoster(staff, slots, { mealAfter: 6, mealMin: 30 });
  assert.ok(Math.abs(plain.cost - meal.cost - 10) < 1e-6);
});

test("the shift-pricing floor never exceeds the fewest open hours brute force finds, and equals it somewhere", () => {
  let seed = 11;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const days = ["Mon", "Tue", "Wed"];
  let tight = 0;
  for (let c = 0; c < 40; c++) {
    const stf = staffOf(Array.from({ length: 2 + rnd(2) }, (_, p) => `P${p},${10 + rnd(10)},${8 + rnd(3) * 4},0,${days[rnd(3)]}-Wed ${6 + rnd(3)}-${18 + rnd(5)}`).join("\n"));
    const sl = slotsOf(Array.from({ length: 5 + rnd(3) }, () => { const a = 6 + rnd(8); return `${days[rnd(3)]},${a},${a + 3 + rnd(6)},${1 + rnd(2)}`; }).join("\n"));
    if (sl.length > 9) continue;
    const ctx = _internals.buildContext(stf, sl, {});
    let least = Infinity;
    const owner = new Array(sl.length).fill(-1);
    (function rec(i) {
      if (i === sl.length) { if (_internals.ownerValid(ctx, owner)) least = Math.min(least, sl.reduce((t, s, j) => t + (owner[j] < 0 ? (s.end - s.start) / 60 : 0), 0)); return; }
      for (let p = -1; p < stf.length; p++) { owner[i] = p; if (p < 0 || ctx.elig[p][i]) rec(i + 1); }
      owner[i] = -1;
    })(0);
    const f = openFloorByPricing(stf, sl);
    assert.ok(f.floor <= least + 1e-6, `case ${c}: floor ${f.floor} above true ${least}`);
    if (f.floor > least - 1e-6) tight++;
  }
  assert.ok(tight > 0);
});

test("the whole-score shift-pricing bound never exceeds the brute-force optimum, with balance and overtime terms on", () => {
  let seed = 23;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const days = ["Mon", "Tue", "Wed"];
  const opts = { balance: 60, burdenPct: 10 };
  let checked = 0, gapShare = 0;
  for (let c = 0; c < 40; c++) {
    const stf = staffOf(Array.from({ length: 2 + rnd(2) }, (_, p) => `P${p},${10 + rnd(10)},${8 + rnd(3) * 4},0,${days[rnd(3)]}-Wed ${6 + rnd(3)}-${18 + rnd(5)}`).join("\n"));
    const sl = slotsOf(Array.from({ length: 5 + rnd(3) }, () => { const a = 6 + rnd(8); return `${days[rnd(3)]},${a},${a + 3 + rnd(6)},${1 + rnd(2)}`; }).join("\n"));
    if (sl.length > 9) continue;
    const brute = bruteForceBest(stf, sl, opts);
    const f = openFloorByPricing(stf, sl, opts, { incumbentOpen: 0, incumbentScore: brute + 1 });
    assert.ok(f.scoreBound <= brute + 1e-6, `case ${c}: bound ${f.scoreBound} above true ${brute}`);
    checked++; gapShare += (brute - f.scoreBound) / Math.max(brute, 1);
  }
  assert.ok(checked > 10 && gapShare / checked < 0.5, `mean relative gap ${gapShare / checked}`);
});

test("branching on contested shifts raises the priced bound without ever passing the brute-force optimum", () => {
  let seed = 31;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const days = ["Mon", "Tue", "Wed"];
  const opts = { balance: 60, burdenPct: 10 };
  let checked = 0, raised = 0;
  for (let c = 0; c < 40; c++) {
    const stf = staffOf(Array.from({ length: 2 + rnd(2) }, (_, p) => `P${p},${10 + rnd(10)},${8 + rnd(3) * 4},0,${days[rnd(3)]}-Wed ${6 + rnd(3)}-${18 + rnd(5)}`).join("\n"));
    const sl = slotsOf(Array.from({ length: 5 + rnd(3) }, () => { const a = 6 + rnd(8); return `${days[rnd(3)]},${a},${a + 3 + rnd(6)},${1 + rnd(2)}`; }).join("\n"));
    if (sl.length > 9) continue;
    const brute = bruteForceBest(stf, sl, opts);
    const b = branchedScoreBound(stf, sl, opts, { incumbentScore: brute + 1, maxNodes: 30 });
    if (!b) continue;
    assert.ok(b.bound <= brute + 1e-6, `case ${c}: branched bound ${b.bound} above true ${brute}`);
    assert.ok(b.bound >= b.root - 1e-6, `case ${c}: branching lowered the bound`);
    checked++; if (b.bound > b.root + 1e-6) raised++;
  }
  assert.ok(checked > 10);
  assert.ok(raised > 0, "branching never helped on any tight week");
});

test("reduced-cost fixing keeps the proven optimum and never costs nodes", () => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  let seed = 4242;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  for (let c = 0; c < 6; c++) {
    const st = Array.from({ length: 5 }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: 10 }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const run = (fix) => buildRoster(parseStaff(st).staff, parseShifts(sh).slots, { exact: true, flowBalance: true, balance: 60, exactNodes: 100000, restarts: 2, iterations: 1000, reducedCostFixing: fix });
    const a = run(true), b = run(false);
    if (a.optimality.status !== "bounded" && b.optimality.status !== "bounded") assert.ok(Math.abs(a.score - b.score) < 1e-6, `case ${c}: ${a.score} vs ${b.score}`);
    else assert.ok(a.score <= b.score + 1e-6 || b.optimality.status === "bounded", `case ${c}`);
  }
});

test("coverRepair: exact repair of the open hours covers the sample week's 15-hour optimum that the walk leaves at 16", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const open = (r) => r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  const off = buildRoster(staff, slots, { minRestHours: 0 });
  const on = buildRoster(staff, slots, { minRestHours: 0, coverRepair: true });
  assert.equal(open(off), 16);
  assert.equal(open(on), 15);
  assert.equal(buildRoster(staff, slots, { minRestHours: 0, exact: true }).unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0), 15);
});

test("coverRepair: at equal open hours it keeps the fewest open shifts, and never more than the repair-off roster's hours", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const r = buildRoster(staff, slots, { coverRepair: true });
  const off = buildRoster(staff, slots, { coverRepair: false });
  const hrs = (x) => x.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  assert.ok(hrs(r) <= hrs(off));
  assert.equal(hrs(r), 15);
  assert.equal(r.unfilled.length, 5); // measured 2026-10-28: the tiebreak finds no 15 h roster with fewer than 5 open shifts here
});

test("coverRepair: a node budget ends the search, so the roster does not depend on the clock", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const open = (r) => r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  const a = buildRoster(staff, slots, { minRestHours: 0, coverRepair: true, coverRepairMs: 60000 });
  const b = buildRoster(staff, slots, { minRestHours: 0, coverRepair: true, coverRepairMs: 600000 });
  assert.equal(JSON.stringify(a.assignments ?? a.unfilled), JSON.stringify(b.assignments ?? b.unfilled));
  assert.equal(open(a), 15);
  assert.equal(open(buildRoster(staff, slots, { minRestHours: 0, coverRepair: true, coverRepairNodes: 0 })), 16);
});

test("coverRepair: openShiftWeight prices an open shift in hours, so the repair can trade hours for fewer open shifts", () => {
  const staff = staffOf(sampleStaff()), slots = slotsOf(sampleShifts());
  const hrs = (x) => x.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
  const def = buildRoster(staff, slots, { coverRepair: true });
  const heavy = buildRoster(staff, slots, { coverRepair: true, openShiftWeight: 100 });
  assert.equal([hrs(def), def.unfilled.length].join(), "15,5"); // measured 2026-10-28
  assert.equal([hrs(heavy), heavy.unfilled.length].join(), "19,3"); // 4 more open hours buy 2 fewer open shifts
  // the weighted objective (hours + weight x open shifts) is never worse than the default roster's under the same weight
  assert.ok(hrs(heavy) + 100 * heavy.unfilled.length <= hrs(def) + 100 * def.unfilled.length + 1e-9);
});

test("placeRestBreaks: one paid break per full 4 hours, spread out, clear of the meal break, staggered", () => {
  const A = (person, startMin, endMin) => ({ slot: { day: 0, startMin, endMin }, person });
  const r = { assignments: [A("Ana", 480, 1020), A("Ben", 480, 1020), A("Cy", 480, 720)] };
  const rest = placeRestBreaks(r);
  assert.deepEqual(rest.map((x) => x.person), ["Ana", "Ana", "Ben", "Ben", "Cy"]);
  const meals = placeBreaks(r);
  for (const x of rest) {
    assert.equal(x.endMin - x.startMin, 10);
    assert.ok(x.startMin % 5 === 0 && x.dayName === "Mon");
    for (const m of meals.filter((m) => m.person === x.person)) assert.ok(x.endMin <= m.startMin || m.endMin <= x.startMin, "clear of the meal break");
  }
  const ana = rest.filter((x) => x.person === "Ana");
  assert.ok(ana[0].startMin < 480 + 270 && ana[1].startMin > 480 + 270, "one in each half of the 9 hour stretch");
  const first = rest.filter((x) => x.person !== "Cy");
  assert.ok(first.every((x) => x.others >= 1), "somebody else is on the floor");
  assert.ok(ana[0].startMin !== rest.find((x) => x.person === "Ben").startMin, "Ana and Ben are not off together");
});

test("placeRestBreaks: short stretches get none, off at 0, joined shifts count once, a lone worker is flagged", () => {
  const A = (person, startMin, endMin) => ({ slot: { day: 1, startMin, endMin }, person });
  assert.deepEqual(placeRestBreaks({ assignments: [A("Ana", 480, 710)] }), []);
  assert.deepEqual(placeRestBreaks({ assignments: [A("Ana", 480, 960)] }, { restMin: 0 }), []);
  assert.deepEqual(placeRestBreaks({ assignments: [] }), []);
  const joined = placeRestBreaks({ assignments: [A("Ana", 480, 720), A("Ana", 720, 960)] }, { mealAfter: 0 });
  assert.equal(joined.length, 2);
  assert.ok(joined.every((x) => x.alone && x.startMin >= 510 && x.endMin <= 930));
  assert.equal(placeRestBreaks({ assignments: [A("Ana", 480, 960)] }, { restEvery: 2, mealAfter: 0 }).length, 4);
});

test("splitShiftPay: one premium hour per split or over-spread person-day, optional wage credit", async () => {
  const { splitShiftPay } = await import("./calc.mjs");
  const sh = (day, a, b, person) => ({ slot: { day, startMin: a * 60, endMin: b * 60 }, person });
  const r = {
    people: [{ name: "Sam", wage: 20 }, { name: "Ana", wage: 15 }],
    assignments: [sh(0, 9, 12, "Sam"), sh(0, 16, 20, "Sam"), // split, 4h gap
      sh(1, 8, 12, "Ana"), sh(1, 12, 19, "Ana"), // continuous 11h: spread only
      sh(2, 8, 12, "Ana"), sh(2, 16, 20, "Ana"), // split, 12h spread: one premium
      sh(3, 9, 17, "Sam")], // plain day
  };
  const p = splitShiftPay(r, { minWage: 15 });
  assert.deepEqual(p.rows.map((x) => [x.person, x.day, x.reason]), [["Ana", "Tue", "spread"], ["Ana", "Wed", "split and spread"], ["Sam", "Mon", "split and spread"]]);
  assert.equal(p.total, 45);
  assert.equal(splitShiftPay(r, { minWage: 15, burdenPct: 10 }).total, 49.5);
  // credit: Sam earns $5 over minimum for 7 hours = $35, more than the $15 premium, so nothing owed
  const c = splitShiftPay(r, { minWage: 15, credit: true });
  assert.equal(c.rows.find((x) => x.person === "Sam").extra, 0);
  assert.equal(c.total, 30);
  assert.equal(splitShiftPay({}).total, 0);
});

import { planStreaks } from "./calc.mjs";

test("planStreaks joins a Sunday shift to the next week's Monday and flags runs over six days", () => {
  const a = (person, day) => ({ person, slot: { day, startMin: 600, endMin: 900 } });
  // Ann: Thu..Sun of week 1 (4) + Mon..Wed of week 2 (3) = 7 in a row, though no single week has seven.
  const w1 = { roster: { assignments: [3, 4, 5, 6].map((d) => a("Ann", d)).concat([a("Bo", 0), a("Bo", 2)]) } };
  const w2 = { roster: { assignments: [0, 1, 2].map((d) => a("Ann", d)).concat([a("Bo", 0)]) } };
  const s = planStreaks({ weeks: [w1, w2] });
  assert.equal(s.rows[0].name, "Ann");
  assert.equal(s.rows[0].longest, 7);
  assert.equal(s.rows[0].from, 3);
  assert.equal(s.rows[0].to, 9);
  assert.deepEqual(s.flag.map((x) => x.name), ["Ann"]);
  assert.equal(s.rows.find((x) => x.name === "Bo").longest, 1);
  assert.equal(planStreaks({ weeks: [w1, w2] }, { maxDays: 7 }).flag.length, 0);
  assert.deepEqual(planStreaks(null).rows, []);
});

import { carryOverStaff as _cos, rosterCsv as _rcsv } from "./calc.mjs";

test("streak: carries the days-in-a-row limit across Monday, and carry-over writes and refreshes it", () => {
  const staff = (t) => { const r = parseStaff(t); assert.deepEqual(r.errors, []); return r.staff; };
  // Ann worked Thu to Sun (4 in a row); with a limit of 6 she may work Mon and Tue only.
  const withStreak = buildRoster(staff("Ann,10,60,0,any,streak: 4"), slotsOf("Mon-Sat,9,13,1"), { maxConsecDays: 6 });
  assert.equal(withStreak.unfilledSlots, 1, "one day off is enough: Mon-Tue (6 in a row), a gap, then Thu-Sat");
  assert.match(withStreak.unfilled[0].text, /consecutive|days-in-a-row/i);
  const without = buildRoster(staff("Ann,10,60,0,any"), slotsOf("Mon-Sat,9,13,1"), { maxConsecDays: 6 });
  assert.equal(without.unfilledSlots, 0);
  assert.equal(parseStaff("Ann,10,40,0,any,streak: x").errors.length, 1);
  // Carry-over: Ann works Thu-Sun, Bo works Sat only, Cy skipped Sunday.
  const csv = _rcsv(buildRoster(staff("Ann,10,60,0,any\nBo,10,60,0,any\nCy,10,60,0,any,streak: 3"), slotsOf("Thu-Sun,9,13,1"), { maxConsecDays: 7 }));
  const carried = _cos("Ann,10,60,0,any\nBo,10,60,0,any\nCy,10,60,0,any,streak: 3", csv).text;
  const lines = carried.split("\n");
  const has = (n) => lines.find((l) => l.startsWith(n));
  const sum = [...csv.matchAll(/^(\w+),/gm)].length;
  assert.ok(sum > 0);
  // Whoever worked Sunday gets streak: = their trailing run; whoever did not loses a stale one.
  const names = ["Ann", "Bo", "Cy"];
  for (const n of names) {
    const worksSunday = new RegExp(`^Sun.*,${n}\\b`, "m").test(csv);
    assert.equal(/streak:/.test(has(n)), worksSunday, n);
  }
  assert.ok(!/streak:/.test(has("Cy")) || /Sun.*,Cy/.test(csv));
  // A person on all seven days adds their old streak: 7 + 3 = 10.
  const full = _rcsv(buildRoster(staff("Dee,10,80,0,any,streak: 3"), slotsOf("Mon-Sun,9,13,1"), { maxConsecDays: 20 }));
  assert.match(_cos("Dee,10,80,0,any,streak: 3", full).text, /streak: 10/);
});
