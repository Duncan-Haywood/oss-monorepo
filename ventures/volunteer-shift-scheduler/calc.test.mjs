import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate, dayIso, dayOfWeek, dayLabel, parseTime, parseSlots, parseShifts, parseVolunteers, readSpec, canDo, clash,
  buildRoster, validateRoster, rosterCsv, volunteerCsv, rosterIcs, reminderFor, remindersText, rosterText,
  encodeShare, decodeShare, sampleFields,
} from "./calc.mjs";

const fields = (volunteers, shifts, extra = {}) => ({ org: "", slots: "AM=9am-12pm, PM=1pm-4pm", defaultMax: "", volunteers, shifts, ...extra });
const build = (f, opts) => {
  const { spec, errors } = readSpec(f);
  assert.deepEqual(errors, []);
  return buildRoster(spec, opts);
};

// Small seeded generator so the random checks below are reproducible.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function randomFields(seed) {
  const rnd = lcg(seed);
  const nv = 4 + Math.floor(rnd() * 14);
  const days = ["Sat", "Sun", "Mon", "Wed"];
  const slots = ["AM", "PM"];
  const roles = ["Greeter", "Packer", "Driver", "Setup"];
  const vols = [];
  for (let i = 0; i < nv; i++) {
    const av = [];
    for (const d of days) for (const sl of slots) if (rnd() < 0.45) av.push(`${d} ${sl}`);
    const no = roles.filter(() => rnd() < 0.15);
    vols.push(`Vol${i}: ${av.join(", ") || "any"}; max ${1 + Math.floor(rnd() * 4)}${no.length ? `; not: ${no.join(", ")}` : ""}`);
  }
  const shifts = [];
  for (const date of ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14", "2026-10-17"]) {
    for (const sl of slots) for (const role of roles) if (rnd() < 0.4) shifts.push(`${date}, ${sl}, ${role}, ${1 + Math.floor(rnd() * 3)}`);
  }
  return fields(vols.join("\n"), shifts.join("\n") || "2026-10-10, AM, Greeter, 1");
}

test("dates, weekdays and times parse in several spellings", () => {
  assert.equal(dayIso(parseDate("10/10/2026")), "2026-10-10");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("soon"), null);
  assert.equal(dayOfWeek(parseDate("2026-10-10")), 6);
  assert.equal(dayLabel(parseDate("2026-10-10")), "Sat 10 Oct");
  assert.equal(parseTime("9am"), 540);
  assert.equal(parseTime("1:30 PM"), 810);
  assert.equal(parseTime("noon"), 720);
  assert.equal(parseTime("18:00"), 1080);
  assert.equal(parseTime("13pm"), null);
  assert.equal(parseTime("25:00"), null);
});

test("slots parse with times, reject bad ones", () => {
  const { slots, errors } = parseSlots("AM=9am-12pm, Setup, PM=1pm to 4pm");
  assert.deepEqual(errors, []);
  assert.deepEqual(slots.am, { name: "AM", start: 540, end: 720 });
  assert.deepEqual(slots.setup, { name: "Setup", start: null, end: null });
  assert.equal(slots.pm.end, 960);
  assert.equal(parseSlots("Bad Name=9am-10am").errors.length, 1);
  assert.equal(parseSlots("AM=12pm-9am").errors.length, 1);
});

test("shift lines: optional role and headcount, weekly repeats, sorted by date and time", () => {
  const { slots } = parseSlots("AM=9am-12pm, PM=1pm-4pm");
  const { shifts, errors } = parseShifts("2026-10-17, PM, Driver\nSaturdays 2026-10-10 to 2026-10-24, AM, Greeter, 2\n2026-10-10, PM, 3\n# comment", slots);
  assert.deepEqual(errors, []);
  assert.equal(shifts.length, 5);
  assert.deepEqual(shifts.map((s) => s.date), [...shifts.map((s) => s.date)].sort());
  const first = shifts[0];
  assert.equal(first.role, "Greeter");
  assert.equal(first.need, 2);
  assert.equal(first.start, 540);
  const pm = shifts.find((s) => s.role === "Volunteer");
  assert.equal(pm.need, 3);
  assert.equal(shifts.find((s) => s.role === "Driver").need, 1);
  assert.deepEqual(shifts.map((s) => s.id), [0, 1, 2, 3, 4]);
});

test("shift line errors are specific", () => {
  const e = (t) => parseShifts(t, {}).errors.join(" ");
  assert.match(e("2026-10-10"), /date and a slot/);
  assert.match(e("tomorrow, AM"), /not a date/);
  assert.match(e("2026-10-10, AM, Greeter, many"), /not a whole number/);
  assert.match(e("2026-10-10, AM, Greeter, 0"), /headcount must be/);
  assert.match(e("2026-10-10, Sat morning"), /one word/);
  assert.match(e("Funday 2026-10-10 to 2026-10-31, AM"), /could not read/);
  assert.match(e("Wednesdays 2026-10-10 to 2026-10-12, AM"), /no Wednesdays/);
});

test("volunteer lines: availability, max, excluded roles, and plain names", () => {
  const { volunteers, errors } = parseVolunteers("Ana: Sat AM, Sun; max 3; not: Driver, Nursery\nBen\nCy: weekends; max 2 shifts\nDee: 2026-10-10 to 2026-10-12", { slotKeys: ["am", "pm"], defaultMax: 5 });
  assert.deepEqual(errors, []);
  assert.equal(volunteers.length, 4);
  assert.equal(volunteers[0].max, 3);
  assert.deepEqual(volunteers[0].noRoles, ["driver", "nursery"]);
  assert.equal(volunteers[1].avail.any, true);
  assert.equal(volunteers[1].max, 5);
  assert.equal(volunteers[2].max, 2);
  assert.deepEqual(volunteers[2].avail.tokens[0].wd, [0, 6]);
  assert.equal(volunteers[3].avail.tokens[0].ranges[0].length, 2);
});

test("volunteer line errors: unknown words, duplicates, max of zero", () => {
  const { volunteers, errors } = parseVolunteers("Ana: Saturnday\nBen: Sat\nben: Sun\nCy: Sat; max 0", { slotKeys: ["am"] });
  assert.equal(volunteers.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /"saturnday" is not a weekday/);
  assert.match(errors[1], /listed twice/);
  assert.match(errors[2], /max must be at least 1/);
});

test("availability matches weekday, slot, date and combinations", () => {
  const { spec } = readSpec(fields("A: Sat AM\nB: Sun\nC: AM\nD: 2026-10-10\nE: Sat Sun PM\nF: any; not: Greeter", "2026-10-10, AM, Greeter\n2026-10-10, PM, Packer\n2026-10-11, AM, Packer"));
  const [satAmG, satPmP, sunAmP] = spec.shifts;
  const can = (name, s) => canDo(spec.volunteers.find((v) => v.name === name), s);
  assert.equal(can("A", satAmG), true);
  assert.equal(can("A", satPmP), false);
  assert.equal(can("B", sunAmP), true);
  assert.equal(can("B", satAmG), false);
  assert.equal(can("C", satAmG), true);
  assert.equal(can("C", satPmP), false);
  assert.equal(can("D", sunAmP), false);
  assert.equal(can("D", satPmP), true);
  assert.equal(can("E", satPmP), true);
  assert.equal(can("E", sunAmP), false);
  assert.equal(can("F", satAmG), false);
  assert.equal(can("F", satPmP), true);
});

test("clash: same slot on the same day, or overlapping times", () => {
  const { spec } = readSpec(fields("A", "2026-10-10, AM, X\n2026-10-10, AM, Y\n2026-10-10, PM, Z\n2026-10-11, AM, W", { slots: "AM=9am-12pm, PM=1pm-4pm, Mid=11am-2pm" }));
  const by = (r) => spec.shifts.find((s) => s.role === r);
  assert.equal(clash(by("X"), by("Y")), true);
  assert.equal(clash(by("X"), by("Z")), false);
  assert.equal(clash(by("X"), by("W")), false);
  const r2 = readSpec(fields("A", "2026-10-10, AM, X\n2026-10-10, Mid, M\n2026-10-10, PM, Z", { slots: "AM=9am-12pm, PM=1pm-4pm, Mid=11am-2pm" })).spec;
  const g = (r) => r2.shifts.find((s) => s.role === r);
  assert.equal(clash(g("X"), g("M")), true);
  assert.equal(clash(g("M"), g("Z")), true);
  assert.equal(clash(g("X"), g("Z")), false);
});

test("the sample fills every place, validates, and is the example the guide uses", () => {
  const roster = build(sampleFields());
  assert.equal(validateRoster(roster).ok, true);
  assert.equal(roster.stats.needed, 19);
  assert.equal(roster.stats.filled, 19);
  assert.equal(roster.unfilled.length, 0);
  assert.equal(roster.stats.spread, 1);
});

test("no double-booking, availability, max and role exclusions hold on 300 random rosters", () => {
  let withGaps = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { spec, errors } = readSpec(randomFields(seed));
    assert.deepEqual(errors, [], `seed ${seed}`);
    const roster = buildRoster(spec);
    const check = validateRoster(roster);
    assert.deepEqual(check.errors, [], `seed ${seed}`);
    // Re-check the three headline rules by hand, without the validator.
    roster.volunteers.forEach((v) => {
      const vol = spec.volunteers[v.index];
      if (vol.max != null) assert.ok(v.load <= vol.max, `seed ${seed}: ${v.name} over max`);
      for (let i = 0; i < v.shifts.length; i++) {
        const a = spec.shifts[v.shifts[i]];
        assert.ok(canDo(vol, a), `seed ${seed}: ${v.name} not available`);
        for (let j = i + 1; j < v.shifts.length; j++) {
          const b = spec.shifts[v.shifts[j]];
          assert.ok(!(a.day === b.day && a.slotKey === b.slotKey), `seed ${seed}: ${v.name} double-booked`);
        }
      }
    });
    roster.seats.forEach((list, s) => assert.ok(list.length <= spec.shifts[s].need && new Set(list).size === list.length));
    assert.equal(roster.stats.filled + roster.stats.unfilledSeats, roster.stats.needed);
    if (roster.stats.unfilledSeats) withGaps++;
  }
  assert.ok(withGaps > 10, "the random set should include rosters that cannot be filled");
});

test("overlapping slots are never given to one person", () => {
  const f = fields("Solo: any; max 5", "2026-10-10, AM, Greeter\n2026-10-10, Mid, Packer\n2026-10-10, PM, Driver", { slots: "AM=9am-12pm, Mid=11am-2pm, PM=1pm-4pm" });
  const roster = build(f);
  assert.equal(roster.stats.filled, 2);
  assert.equal(roster.unfilled.length, 1);
  assert.equal(validateRoster(roster).ok, true);
});

test("deterministic: the same input gives the identical roster, in any run", () => {
  for (const seed of [3, 17, 99]) {
    const a = JSON.stringify(build(randomFields(seed)));
    const b = JSON.stringify(build(randomFields(seed)));
    assert.equal(a, b);
  }
  const csvA = rosterCsv(build(sampleFields()));
  const csvB = rosterCsv(build(sampleFields()));
  assert.equal(csvA, csvB);
});

test("the repair pass fills a seat the greedy pass leaves empty", () => {
  const f = fields("V0: Sat AM, Sat; max 2\nV1: Sat AM, Sun; max 1\nV2: Sat PM, Sun AM; max 1", "2026-10-10, AM, A\n2026-10-10, PM, B\n2026-10-11, AM, C\n2026-10-10, AM, D");
  const greedy = build(f, { repair: false, balance: false });
  const repaired = build(f, { balance: false });
  assert.equal(greedy.stats.filled, 3);
  assert.equal(repaired.stats.filled, 4);
  assert.ok(repaired.stats.repaired >= 1);
  assert.equal(validateRoster(repaired).ok, true);
});

test("repair never loses places: it fills at least as many as greedy alone, on 300 random rosters", () => {
  let better = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { spec } = readSpec(randomFields(seed));
    const greedy = buildRoster(spec, { repair: false, balance: false });
    const full = buildRoster(spec);
    assert.ok(full.stats.filled >= greedy.stats.filled, `seed ${seed}`);
    if (full.stats.filled > greedy.stats.filled) better++;
  }
  assert.ok(better >= 1);
});

test("fairness: spread is at most one when everyone is free for everything", () => {
  const vols = Array.from({ length: 7 }, (_, i) => `V${i}: any`).join("\n");
  const shifts = ["2026-10-10, AM, A, 2", "2026-10-10, PM, B, 3", "2026-10-17, AM, A, 2", "2026-10-17, PM, B, 3", "2026-10-24, AM, A, 2"].join("\n");
  const roster = build(fields(vols, shifts));
  assert.equal(roster.stats.filled, 12);
  assert.ok(roster.stats.spread <= 1, `spread ${roster.stats.spread}`);
  assert.equal(roster.stats.min, 1);
  assert.equal(roster.stats.max, 2);
});

test("fairness: the balance pass never hurts, and closes a gap the greedy pass leaves", () => {

  for (let seed = 1; seed <= 300; seed++) {
    const { spec } = readSpec(randomFields(seed));
    const raw = buildRoster(spec, { balance: false });
    const full = buildRoster(spec);
    assert.equal(full.stats.filled, raw.stats.filled, `seed ${seed}: balancing must not change how many places are filled`);
    assert.ok(full.stats.stdev <= raw.stats.stdev + 1e-9, `seed ${seed}`);
    assert.equal(validateRoster(full).ok, true);
  }
  // A pinned case where the greedy pass leaves a gap of two and one move closes it.
  const f = fields("V0: Sat PM, Sun AM; max 3\nV1: Sat AM, Sun AM; max 3\nV2: Sat PM, Sun AM, Sun; max 2\nV3: Sat AM, Sat PM, Sat; max 1\nV4: Sat; max 2",
    "2026-10-10, AM, A\n2026-10-10, PM, B\n2026-10-11, AM, C\n2026-10-17, AM, D\n2026-10-18, AM, F");
  const before = build(f, { balance: false });
  const after = build(f);
  assert.equal(before.stats.spread, 2);
  assert.equal(after.stats.spread, 0);
  assert.equal(after.stats.moved, 1);
  assert.equal(after.stats.filled, before.stats.filled);
  assert.equal(validateRoster(after).ok, true);
});

test("people with a max of one are not given two, and a bigger max does not starve others", () => {
  const roster = build(fields("A: any; max 1\nB: any; max 1\nC: any; max 4", "2026-10-10, AM, X, 1\n2026-10-17, AM, X, 1\n2026-10-24, AM, X, 1\n2026-10-31, AM, X, 1"));
  const by = Object.fromEntries(roster.volunteers.map((v) => [v.name, v.load]));
  assert.equal(by.A, 1);
  assert.equal(by.B, 1);
  assert.equal(by.C, 2);
  assert.equal(roster.stats.unfilledSeats, 0);
});

test("unfilled seats are reported with a reason, and nobody-available is named", () => {
  const roster = build(fields("A: Sat AM; max 1\nB: Sat AM; max 1", "2026-10-10, AM, Greeter, 3\n2026-10-10, PM, Driver\n2026-10-11, AM, Setup"));
  assert.equal(roster.stats.unfilledSeats, 3);
  const greet = roster.unfilled.find((u) => roster.spec.shifts[u.shift].role === "Greeter");
  assert.equal(greet.missing, 1);
  assert.match(greet.reason, /2 available/);
  const driver = roster.unfilled.find((u) => roster.spec.shifts[u.shift].role === "Driver");
  assert.match(driver.reason, /nobody listed is available/);
  assert.deepEqual(roster.stats.noOptions, []);
  assert.equal(roster.stats.fillPct, 40);
});

test("a volunteer who fits no shift is listed, and idle people are counted", () => {
  const roster = build(fields("A: Sat AM\nGhost: Wed PM\nC: Sat AM; not: Greeter", "2026-10-10, AM, Greeter\n2026-10-10, PM, Driver"));
  assert.deepEqual(roster.stats.noOptions.map((i) => roster.volunteers[i].name), ["Ghost", "C"]);
  assert.ok(roster.stats.idle.includes(1));
});

test("over- and under-loaded people are flagged against the mean", () => {
  // Pat is the only person available on Sat AM and takes all three; the others take one each.
  const roster = build(fields("Pat: Sat AM; max 5\nQ: Sun AM; max 5\nR: Sun AM; max 5", "2026-10-10, AM, A\n2026-10-17, AM, A\n2026-10-24, AM, A\n2026-10-11, AM, B\n2026-10-11, PM, B", { slots: "AM, PM" }));
  assert.equal(roster.volunteers[0].load, 3);
  assert.ok(roster.stats.over.includes(0));
  assert.ok(roster.stats.spread >= 1);
});

test("the validator catches a corrupted roster", () => {
  const roster = build(fields("A: Sat AM; max 1\nB: Sun AM", "2026-10-10, AM, X\n2026-10-10, AM, Y\n2026-10-11, AM, Z"));
  assert.equal(validateRoster(roster).ok, true);
  const bad = structuredClone(roster);
  bad.seats[0] = [0];
  bad.seats[1] = [0];
  const msgs = validateRoster(bad).errors.join(" ");
  assert.match(msgs, /double-booked/);
  assert.match(msgs, /max of 1/);
  const wrong = structuredClone(roster);
  wrong.seats[2] = [0];
  assert.match(validateRoster(wrong).errors.join(" "), /not available/);
});

test("CSV has one row per place, marks UNFILLED, and defuses spreadsheet formulas", () => {
  const roster = build(fields("=cmd|calc: Sat AM; max 1\nBo: Sat AM", "2026-10-10, AM, Greeter, 3"));
  const csv = rosterCsv(roster);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "Date,Weekday,Slot,Start,End,Role,Volunteer,Status");
  assert.equal(lines.length, 4);
  assert.match(csv, /'=cmd\|calc,Assigned/);
  assert.match(csv, /,,UNFILLED/);
  assert.equal(lines.filter((l) => l.endsWith("UNFILLED")).length, 1);
  assert.match(lines[1], /^2026-10-10,Sat,AM,09:00,12:00,Greeter,/);
  const byVol = volunteerCsv(roster);
  assert.match(byVol, /^Volunteer,Shifts,Max,Date,Slot,Role/);
  assert.match(byVol, /Bo,1,,2026-10-10,AM,Greeter/);
});

test("per-volunteer calendar has only that person's shifts, with correct times", () => {
  const roster = build(sampleFields());
  const ana = roster.volunteers[0];
  const ics = rosterIcs(roster, 0, "20261001T000000Z");
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, ana.shifts.length);
  assert.match(ics, /DTSTART:20261010T090000/);
  assert.match(ics, /DTEND:20261010T120000/);
  assert.match(ics, /DTSTAMP:20261001T000000Z/);
  assert.match(ics, /X-WR-CALNAME:Riverside Food Pantry \(invented example\): Ana Ruiz/);
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75);
  const all = rosterIcs(roster, null, "20261001T000000Z");
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, roster.spec.shifts.length);
  const uids = [...all.matchAll(/UID:(.*)\r\n/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
});

test("a shift with no times becomes an all-day event", () => {
  const roster = build(fields("A", "2026-10-10, Setup, Tables", { slots: "" }));
  assert.match(rosterIcs(roster, 0, "20261001T000000Z"), /DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261011/);
});

test("reminders name each shift, the others on it, and an optional note", () => {
  const roster = build(sampleFields());
  const msg = reminderFor(roster, 0, "Please arrive 10 minutes early.");
  assert.match(msg, /^Hi Ana Ruiz, thank you for volunteering for Riverside Food Pantry/);
  assert.match(msg, /- Sat 10 Oct, AM 09:00-12:00: Greeter \(with Frank Lee\)/);
  assert.match(msg, /Please arrive 10 minutes early\.$/);
  const all = remindersText(roster);
  assert.equal(all.split("\n\n---\n\n").length, roster.volunteers.length);
  const none = build(fields("Zed: Wed PM\nA", "2026-10-10, AM, X"));
  assert.match(reminderFor(none, 0), /not put you on a shift/);
});

test("roster text lists every day and flags places still needed", () => {
  const roster = build(fields("A: Sat AM", "2026-10-10, AM, Greeter, 2\n2026-10-11, AM, Packer"));
  const t = rosterText(roster);
  assert.match(t, /Sat 10 Oct\n  AM 09:00-12:00 Greeter: A, \(NEEDED\)/);
  assert.match(t, /Sun 11 Oct/);
  assert.match(t, /Filled 1 of 3 places/);
});

test("share links round-trip, including accents, and bad input is refused", () => {
  const f = { ...sampleFields(), org: "Café Saint-Éloi ❤" };
  const code = encodeShare(f);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code), f);
  assert.deepEqual(decodeShare("#s=" + code), f);
  assert.equal(decodeShare("not base64 !!"), null);
  assert.equal(decodeShare(encodeShare([1, 2])), null);
  assert.equal(decodeShare(""), null);
});

test("readSpec reports errors, empty inputs, and misspelled excluded roles", () => {
  assert.ok(readSpec(fields("", "")).errors.length >= 2);
  assert.match(readSpec(fields("A", "2026-10-10, AM, X", { defaultMax: "zero" })).errors.join(" "), /Default max/);
  const w = readSpec(fields("A: Sat; not: Greter", "2026-10-10, AM, Greeter"));
  assert.match(w.warnings.join(" "), /no shift has that role/);
  const capped = build(fields("A\nB", "2026-10-10, AM, X\n2026-10-17, AM, X\n2026-10-24, AM, X\n2026-10-31, AM, X", { defaultMax: "1" }));
  assert.equal(capped.stats.filled, 2);
});
