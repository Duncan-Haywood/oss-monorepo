import { test } from "node:test";
import assert from "node:assert/strict";
import { laborPercent,
  parseTime, parseDaySpec, parseAvailability, parseStaff, parseShifts, buildRoster, coverOptions, rosterCsv, hoursCsv, rosterIcs, rosterMessages,
  sampleStaff, sampleShifts, fmtClock, money, money2, _internals,
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
