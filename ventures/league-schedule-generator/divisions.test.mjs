import { dayLabel } from "./calc.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDivisionBlackouts, applyDivisionBlackouts, parseDivisions, parseDivisionLinks, buildDivisions, applyDivisionRainouts, rainoutOptions, validateDivisions, linkConflicts, divisionsCsv, divisionsText, divisionsIcs, readDivisionsSpec, parseTravel, divisionStats, carryVenueHistory, venueImbalance, suggestFairnessWeight, travelWarnings, estimateDriveMinutes, encodeDivisionFields, decodeDivisionFields, divisionsStandings, divisionsTieBreakNotes, divisionsPlayoffs, divisionsStandingsText, divisionsStandingsCsv, divisionsWeeklyUpdate, divisionsOverdue, divisionsRace, divisionsRemaining, restGaps, divisionsChangeNotices, divisionsBookings, divisionsFacilityCost, divisionsDeadline, applyDivisionWithdrawals, blackoutsFromCsv, csvRows, availabilitySheetCsv, divisionsSeasonGridCsv } from "./divisions.mjs";
import { parseDate, dayIso } from "./calc.mjs";

const example = JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8"));
const build = (extra = {}) => {
  const { spec, errors } = readDivisionsSpec(example);
  assert.deepEqual(errors, []);
  return buildDivisions({ ...spec, ...extra });
};

test("parseDivisions reads names, teams and (double), and rejects repeats and short divisions", () => {
  const r = parseDivisions("A: x, y, z (double)\nB: p, q\nA: m, n\nC: solo\nD: u, U");
  assert.deepEqual(r.divisions.map((d) => [d.name, d.teams.length, d.double]), [["A", 3, true], ["B", 2, false]]);
  assert.equal(r.errors.length, 3);
});

test("parseDivisionLinks resolves Division/Team and names the ones it cannot", () => {
  const { divisions } = parseDivisions("A: x, y\nB: x, y");
  const r = parseDivisionLinks("A/x, B/x\nA/nobody, B/y", divisions);
  assert.deepEqual(r.groups, [[{ d: 0, t: 0 }, { d: 1, t: 0 }]]);
  assert.equal(r.errors.length, 2);
});

test("the example league validates: every pair meets, no court twice, closures and skips respected", () => {
  const s = build();
  const v = validateDivisions(s);
  assert.deepEqual(v.errors, []);
  assert.equal(s.stats.matches, 15 + 28 + 30);
  const days = s.nights.map((n) => dayIso(n.day));
  assert.ok(!days.includes("2026-11-26"), "skip date used");
  const dec3 = s.nights.find((n) => dayIso(n.day) === "2026-12-03");
  if (dec3) assert.ok(dec3.matches.every((m) => m.court !== "Gym A"));
});

test("no night holds more matches than open court slots, and divisions finish close together", () => {
  const s = build();
  for (const n of s.nights) assert.ok(n.matches.length <= 8);
  const ends = s.divisions.map((d) => d.rounds[d.rounds.length - 1].day);
  assert.ok(Math.max(...ends) - Math.min(...ends) <= 21);
});

test("linked teams are never at the same time when the slots allow it", () => {
  const s = build();
  assert.deepEqual(s.conflicts, []);
  assert.deepEqual(linkConflicts(s), []);
});

test("the optimiser beats the naive baseline on venue changes and linked clashes (measured on 8 seeds)", () => {
  let naiveTrips = 0, optTrips = 0, naiveClash = 0, optClash = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const a = build({ seed, optimize: false }).stats;
    const b = build({ seed }).stats;
    naiveTrips += a.trips; optTrips += b.trips; naiveClash += a.clashes; optClash += b.clashes;
  }
  assert.ok(optClash <= naiveClash);
  assert.ok(optTrips < naiveTrips, `trips ${optTrips} vs naive ${naiveTrips}`);
});

test("an unavoidable clash is listed, not hidden: one time slot and two linked teams in one round", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a1, a2\nB: b1, b2", courts: "C1, C2", times: "18:00", start: "2026-10-06", weekdays: "Tue", links: "A/a1, B/b1" });
  const s = buildDivisions(spec);
  assert.equal(validateDivisions(s).ok, true);
  assert.equal(s.nights.length, 1);
  assert.equal(s.conflicts.length, 1);
  assert.match(s.conflicts[0], /A\/a1 and B\/b1/);
});

test("a round bigger than the court slots is refused with the numbers", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: 1, 2, 3, 4, 5, 6", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue" });
  assert.throws(() => buildDivisions(spec), /3 matches needs 3 court slots/);
});

test("the validator catches a double-booked court and a missing meeting", () => {
  const s = build();
  const bad = structuredClone(s);
  bad.nights[0].matches[1].court = bad.nights[0].matches[0].court;
  bad.nights[0].matches[1].time = bad.nights[0].matches[0].time;
  assert.ok(validateDivisions(bad).errors.some((e) => /booked twice/.test(e)));
  const bad2 = structuredClone(s);
  bad2.divisions[0].rounds.pop();
  assert.ok(validateDivisions(bad2).errors.some((e) => /meet/.test(e)));
});

test("same seed, same schedule; CSV and text carry every match", () => {
  const a = build(), b = build();
  assert.equal(divisionsCsv(a), divisionsCsv(b));
  assert.equal(divisionsCsv(a).trim().split("\n").length, 1 + a.stats.matches);
  assert.match(divisionsText(a), /73 matches over/);
});

test("a double round robin hosts each pair once each way", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a, b, c, d (double)", courts: "C1, C2", times: "", start: "2026-10-06", weekdays: "Tue" });
  const s = buildDivisions(spec);
  assert.deepEqual(validateDivisions(s).errors, []);
  assert.equal(s.stats.matches, 12);
  assert.equal(dayIso(parseDate("2026-10-06")), "2026-10-06");
});

test("parseTravel reads minutes in either direction and names venues it does not know", () => {
  const r = parseTravel("Park - School: 25\nschool to Mall: 10\nPark - Park: 5\nPark - Mall: 0\nPark - Mall: 55 min", ["Park", "School", "Mall"]);
  assert.deepEqual(r.travel, { "Park|School": 25, "Mall|Park": 55 });
  assert.equal(r.errors.length, 3);
});

test("with a travel table the optimiser cuts minutes on the road, not just venue changes (measured on 8 seeds)", () => {
  const travelText = "Park - School: 10\nPark - Lake: 60\nSchool - Lake: 55";
  const f = { ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School, Gym B @ Lake", courtClosures: "", travel: travelText };
  const { spec, errors } = readDivisionsSpec(f);
  assert.deepEqual(errors, []);
  let flat = 0, aware = 0, naive = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const withTable = buildDivisions({ ...spec, seed });
    assert.deepEqual(validateDivisions(withTable).errors, []);
    aware += withTable.stats.travelMinutes;
    // the same league scheduled as if every change cost the same, then priced with the table
    const blind = buildDivisions({ ...spec, travel: {}, seed });
    flat += divisionStats({ ...blind, config: { ...blind.config, travel: spec.travel } }).travelMinutes;
    const base = buildDivisions({ ...spec, optimize: false, seed });
    naive += base.stats.travelMinutes;
  }
  assert.ok(aware < flat, `travel-aware ${aware} min vs flat ${flat} min`);
  assert.ok(aware < naive, `travel-aware ${aware} min vs naive ${naive} min`);
  console.log(`travel minutes over 8 seeds: naive ${naive}, flat-cost optimiser ${flat}, travel-aware ${aware}`);
});

test("no travel table leaves the schedule and stats exactly as before", () => {
  const s = build();
  assert.equal(s.stats.travelMinutes, undefined);
  assert.ok(!divisionsText(s).includes("min of travel"));
});

test("five venues on a line: the travel table cuts road minutes by more than half (measured on 8 seeds)", () => {
  const base = { divisions: "A: a1, a2, a3, a4, a5, a6\nB: b1, b2, b3, b4, b5, b6", courts: "C1 @ V1, C2 @ V2, C3 @ V3, C4 @ V4, C5 @ V5", times: "18:00", start: "2026-10-06", weekdays: "Tue, Thu" };
  const travel = "V1 - V2: 5\nV2 - V3: 5\nV3 - V4: 5\nV4 - V5: 5\nV1 - V3: 40\nV1 - V4: 60\nV1 - V5: 80\nV2 - V4: 40\nV2 - V5: 60\nV3 - V5: 40";
  let flat = 0, aware = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { spec, errors } = readDivisionsSpec({ ...base, travel, seed });
    assert.deepEqual(errors, []);
    const blind = buildDivisions({ ...spec, travel: {} }); // every change costs the same, then priced with the table
    flat += divisionStats({ ...blind, config: { ...blind.config, travel: spec.travel } }).travelMinutes;
    aware += buildDivisions(spec).stats.travelMinutes;
  }
  assert.ok(aware < flat * 0.6, `travel-aware ${aware} min vs flat ${flat} min`); // measured 1280 vs 3200
});

test("a rainout in one division moves only its matches, to a night both teams are free, and the result still validates", () => {
  const s = build();
  const night = s.nights[1];
  const target = night.matches[0];
  const before = JSON.stringify(s.nights.filter((n) => n !== night).map((n) => n.matches.filter((m) => m.division !== target.division || n.day < night.day)));
  const r = applyDivisionRainouts(s, `${dayIso(night.day)} ${target.division}/${target.homeName}`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.moves.length, 1);
  assert.ok(r.moves[0].to > night.day);
  assert.deepEqual(validateDivisions(r.schedule).errors, []);
  assert.equal(r.schedule.stats.matches, s.stats.matches);
  assert.equal(JSON.stringify(s.nights.filter((n) => n !== night).map((n) => n.matches.filter((m) => m.division !== target.division || n.day < night.day))), before);
  assert.deepEqual(r.schedule.conflicts, []);
});

test("a whole-division and a whole-night rainout move every match, and a named make-up date is honoured or refused with the reason", () => {
  const s = build();
  const day = dayIso(s.nights[0].day);
  const whole = applyDivisionRainouts(s, day);
  assert.deepEqual(whole.errors, []);
  assert.equal(whole.moves.length, s.nights[0].matches.length);
  assert.deepEqual(validateDivisions(whole.schedule).errors, []);
  const name = s.nights[0].matches[0].division;
  const div = applyDivisionRainouts(s, `${day} ${name}`);
  assert.ok(div.moves.length > 0 && div.moves.every((m) => m.division === name));
  assert.deepEqual(validateDivisions(div.schedule).errors, []);
  const dated = applyDivisionRainouts(s, `${day} ${name} -> 2026-12-31`);
  assert.deepEqual(dated.errors, []);
  assert.ok(dated.moves.every((m) => dayIso(m.to) === "2026-12-31"));
  assert.deepEqual(validateDivisions(dated.schedule).errors, []);
  const early = applyDivisionRainouts(s, `${day} ${name} -> ${day}`);
  assert.equal(early.moves.length, 0);
  assert.match(early.errors[0], /is not after/);
  assert.equal(early.schedule.stats.matches, s.stats.matches);
});

test("bad rainout lines are named and change nothing", () => {
  const s = build();
  const r = applyDivisionRainouts(s, "tomorrow\n2026-10-07 U10\n2026-10-06 Nope\n2026-10-06 U10/Zebras");
  assert.equal(r.errors.length, 4);
  assert.equal(r.moves.length, 0);
  assert.equal(divisionsCsv(r.schedule), divisionsCsv(s));
});

test("a rainout moved match avoids a linked team's time slot where another slot is open", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a1, a2, a3, a4\nB: b1, b2", courts: "C1, C2", times: "18:00, 19:30", start: "2026-10-06", weekdays: "Tue", links: "A/a1, B/b1" });
  const s = buildDivisions(spec);
  assert.deepEqual(s.conflicts, []);
  const r = applyDivisionRainouts(s, `${dayIso(s.nights[0].day)} A/a1`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateDivisions(r.schedule).errors, []);
  assert.deepEqual(r.schedule.conflicts, []);
});

test("division share link round-trips the whole form and rejects junk", async () => {
  const { encodeDivisionFields, decodeDivisionFields } = await import("./divisions.mjs");
  const f = { ...example, divisions: "U10: Hawks, Owls — café\nAdult: Rams, Kings (double)", seed: 3 };
  const frag = encodeDivisionFields(f);
  assert.match(frag, /^[A-Za-z0-9_-]+$/);
  const back = decodeDivisionFields("#d=" + frag);
  for (const k of ["divisions", "courts", "times", "start", "weekdays", "skip", "courtClosures", "travel", "links", "rainouts"]) assert.equal(back[k], example[k] === undefined || k === "divisions" ? (k === "divisions" ? f.divisions : "") : String(example[k]), k);
  assert.equal(back.seed, "3");
  const a = buildDivisions(readDivisionsSpec(back).spec);
  const b = buildDivisions(readDivisionsSpec({ ...f, seed: 3 }).spec);
  assert.deepEqual(a.stats, b.stats);
  for (const bad of ["", "#", "#s=" + frag, "#d=", "#d=!!!", "#d=" + "A".repeat(20001), "#d=" + btoa("[1]")]) assert.equal(decodeDivisionFields(bad), null, bad);
});

test("splitRounds fills partial nights: fewer nights, still valid, each team once a night, parts in order", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  const whole = buildDivisions(spec);
  const split = buildDivisions({ ...spec, splitRounds: true });
  assert.deepEqual(validateDivisions(split).errors, []);
  assert.ok(split.stats.nights < whole.stats.nights, `${split.stats.nights} nights against ${whole.stats.nights}`);
  assert.equal(split.stats.matches, whole.stats.matches);
  assert.ok(split.divisions.some((d) => d.rounds.some((r) => /part 2/.test(r.label))));
  assert.ok(split.stats.utilisation > whole.stats.utilisation);
});

test("without splitRounds a round bigger than the slots is refused; with it the round spreads over nights", () => {
  const spec = { divisions: [{ name: "A", teams: ["a", "b", "c", "d", "e", "f", "g", "h"], double: false }], courts: ["C1", "C2"], times: [""], start: parseDate("2026-10-06"), weekdays: [2], seed: 1 };
  assert.throws(() => buildDivisions(spec), /needs 4 court slots/);
  const s = buildDivisions({ ...spec, splitRounds: true });
  assert.deepEqual(validateDivisions(s).errors, []);
  assert.equal(s.stats.matches, 28);
  assert.equal(s.stats.nights, 14);
});

test("the split form field is read and shared", async () => {
  const { encodeDivisionFields, decodeDivisionFields } = await import("./divisions.mjs");
  assert.equal(readDivisionsSpec({ ...example, split: "1" }).spec.splitRounds, true);
  assert.equal(readDivisionsSpec(example).spec.splitRounds, false);
  assert.equal(decodeDivisionFields("#d=" + encodeDivisionFields({ ...example, split: "1" })).split, "1");
});

test("stats count home/away breaks, and rainouts with balance:true add fewer of them than the earliest-night default", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  let plain = 0, balanced = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const s = buildDivisions({ ...spec, seed });
    assert.equal(typeof s.stats.homeAwayBreaks, "number");
    const text = s.nights.filter((_, i) => i % 4 === 1).map((n) => dayIso(n.day)).join("\n");
    const a = applyDivisionRainouts(s, text);
    const b = applyDivisionRainouts(s, text, { balance: true });
    assert.deepEqual(b.errors, []);
    assert.deepEqual(validateDivisions(b.schedule).errors, []);
    assert.equal(b.schedule.stats.matches, s.stats.matches);
    plain += a.schedule.stats.homeAwayBreaks; balanced += b.schedule.stats.homeAwayBreaks;
  }
  assert.ok(balanced < plain, `balanced ${balanced} against ${plain}`); // measured 8 seeds: 395 -> 347 (README), 4 seeds here
});

test("rainouts with flip:true swap home and away of moved matches: fewer breaks, same nights, still valid", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  let plain = 0, flipped = 0, swaps = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 8]) {
    const s = buildDivisions({ ...spec, seed });
    const text = s.nights.filter((_, i) => i % 4 === 1).map((n) => dayIso(n.day)).join("\n");
    const a = applyDivisionRainouts(s, text);
    const f = applyDivisionRainouts(s, text, { flip: true });
    assert.deepEqual(f.errors, []);
    assert.deepEqual(validateDivisions(f.schedule).errors, []);
    assert.deepEqual(f.moves.map((m) => m.to), a.moves.map((m) => m.to)); // no match changes night
    assert.equal(f.schedule.stats.lastDay, a.schedule.stats.lastDay);
    assert.ok(f.schedule.stats.homeAwayBreaks <= a.schedule.stats.homeAwayBreaks);
    plain += a.schedule.stats.homeAwayBreaks; flipped += f.schedule.stats.homeAwayBreaks;
    swaps += f.moves.filter((m) => m.flipped).length;
  }
  assert.ok(swaps > 0 && flipped < plain, `${swaps} swaps, ${flipped} against ${plain}`); // measured 7 seeds: 345 -> 333 (README)
});

test("rainouts with relocate:true move make-ups to earlier nights already on the calendar: fewer breaks, no later, still valid", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  let plain = 0, moved = 0, relocated = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 8]) {
    const s = buildDivisions({ ...spec, seed });
    const text = s.nights.filter((_, i) => i % 4 === 1).map((n) => dayIso(n.day)).join("\n");
    const a = applyDivisionRainouts(s, text, { balance: true });
    const r = applyDivisionRainouts(s, text, { balance: true, relocate: true });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(validateDivisions(r.schedule).errors, []);
    assert.equal(r.schedule.stats.matches, s.stats.matches);
    assert.ok(r.schedule.stats.lastDay <= a.schedule.stats.lastDay);
    r.moves.forEach((m, i) => assert.ok(m.to <= a.moves[i].to && m.to > m.from));
    assert.ok(r.schedule.stats.homeAwayBreaks <= a.schedule.stats.homeAwayBreaks);
    plain += a.schedule.stats.homeAwayBreaks; moved += r.schedule.stats.homeAwayBreaks;
    relocated += r.moves.filter((m) => m.relocated).length;
  }
  assert.ok(relocated > 0 && moved < plain, `${relocated} moved, ${moved} against ${plain}`); // measured 7 seeds with balance: 300 -> 296 (README)
});

test("rainouts with swapNights:true trade two make-ups' nights: fewer breaks, same season end, still valid", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  let plain = 0, swapped = 0, traded = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 8]) {
    const s = buildDivisions({ ...spec, seed });
    const text = s.nights.filter((_, i) => i % 4 === 1).map((n) => dayIso(n.day)).join("\n");
    const a = applyDivisionRainouts(s, text, { balance: true });
    const r = applyDivisionRainouts(s, text, { balance: true, swapNights: true });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(validateDivisions(r.schedule).errors, []);
    assert.equal(r.schedule.stats.matches, s.stats.matches);
    assert.equal(r.schedule.stats.lastDay, a.schedule.stats.lastDay);
    r.moves.forEach((m) => assert.ok(m.to > m.from));
    assert.ok(r.schedule.stats.homeAwayBreaks <= a.schedule.stats.homeAwayBreaks);
    plain += a.schedule.stats.homeAwayBreaks; swapped += r.schedule.stats.homeAwayBreaks;
    traded += r.moves.filter((m) => m.relocated).length;
  }
  assert.ok(traded > 0 && swapped < plain, `${traded} traded, ${swapped} against ${plain}`); // measured 7 seeds with balance: 300 -> 280 (README)
});

test("linked teams in back-to-back slots are not sent to different venues when another slot is free (30 seeds)", () => {
  const slots = ["18:00", "19:00", "20:00"];
  for (const links of ["A/a1, B/b1", "A/a1, B/b1\nA/a2, B/b2"]) for (let seed = 1; seed <= 30; seed++) {
    const { spec, errors } = readDivisionsSpec({ divisions: "A: a1, a2\nB: b1, b2", courts: "P1 @ Park, P2 @ Park, S1 @ School, S2 @ School", times: slots.join(", "), start: "2026-10-06", weekdays: "Tue", links, seed });
    assert.deepEqual(errors, []);
    const [x, y] = buildDivisions(spec).nights[0].matches;
    const gap = Math.abs(slots.indexOf(x.time) - slots.indexOf(y.time));
    assert.ok(!(gap === 1 && x.venue !== y.venue), `seed ${seed}: ${x.time} ${x.venue} then ${y.time} ${y.venue}`);
  }
});

test("venue fairness carries across seasons: three seasons end more even than within-season fairness or none (8 seeds)", () => {
  const sums = { off: 0, season: 0, carry: 0 };
  for (let seed = 1; seed <= 8; seed++) {
    for (const mode of Object.keys(sums)) {
      let hist = {};
      const all = {};
      for (let y = 0; y < 3; y++) {
        const s = build({ seed: seed * 10 + y, venueFairness: mode !== "off", venueHistory: mode === "carry" ? hist : undefined });
        assert.ok(validateDivisions(s).ok);
        const one = carryVenueHistory({ ...s, config: { ...s.config, venueHistory: {} } });
        for (const k of Object.keys(one)) { all[k] ||= {}; for (const v of Object.keys(one[k])) all[k][v] = (all[k][v] || 0) + one[k][v]; }
        hist = carryVenueHistory(s);
      }
      sums[mode] += venueImbalance(all) / 8;
    }
  }
  assert.ok(sums.season < sums.off, `season ${sums.season} vs off ${sums.off}`);
  assert.ok(sums.carry < sums.season, `carry ${sums.carry} vs season ${sums.season}`);
});

test("fairness off leaves the schedule untouched; history counts add up and a bad history is named", () => {
  const a = build({ seed: 3 }), b = build({ seed: 3, venueFairness: false });
  assert.deepEqual(a.nights, b.nights);
  assert.equal(a.stats.venueImbalance, undefined);
  const h = carryVenueHistory(build({ seed: 3, venueFairness: true }));
  const played = Object.values(h).reduce((n, o) => n + Object.values(o).reduce((x, y) => x + y, 0), 0);
  assert.equal(played, 2 * build({ seed: 3 }).stats.matches);
  assert.ok(readDivisionsSpec({ ...example, venueHistory: "{nope" }).errors.some((e) => /Venue history/.test(e)));
  assert.deepEqual(readDivisionsSpec({ ...example, venueHistory: JSON.stringify(h), venueFairness: "yes" }).errors, []);
});

test("a share link carries the venue-fairness switch and last season's history", () => {
  const h = JSON.stringify(carryVenueHistory(build({ seed: 3, venueFairness: true })));
  const back = decodeDivisionFields("#d=" + encodeDivisionFields({ ...example, venueFairness: "1", venueHistory: h }));
  assert.equal(back.venueFairness, "1");
  assert.equal(back.venueHistory, h);
  const { spec, errors } = readDivisionsSpec(back);
  assert.deepEqual(errors, []);
  assert.equal(spec.venueFairness, true);
  assert.ok(buildDivisions(spec).config.venueFairness);
});

test("fairnessWeight: 0 matches fairness off, a low weight evens venues for no extra travel, a bad value is named (8 seeds, 3 seasons)", () => {
  const run = (w) => {
    let imb = 0, trips = 0;
    for (let seed = 1; seed <= 8; seed++) {
      let hist = {};
      const all = {};
      for (let y = 0; y < 3; y++) {
        const s = build({ seed: seed * 10 + y, venueFairness: true, venueHistory: hist, fairnessWeight: w });
        trips += s.stats.trips;
        const one = carryVenueHistory({ ...s, config: { ...s.config, venueHistory: {} } });
        for (const k of Object.keys(one)) { all[k] ||= {}; for (const v of Object.keys(one[k])) all[k][v] = (all[k][v] || 0) + one[k][v]; }
        hist = carryVenueHistory(s);
      }
      imb += venueImbalance(all) / 8;
    }
    return { imb, trips };
  };
  const off = run(0), low = run(1.5), dflt = run(undefined);
  assert.ok(low.imb < off.imb / 2, `imbalance ${low.imb} vs ${off.imb}`); // measured 1.73 against 5.83 (README)
  assert.ok(low.trips <= off.trips * 1.05, `venue changes ${low.trips} vs ${off.trips}`); // measured 1020 against 1028
  assert.ok(dflt.trips > low.trips); // the default weight of 3 buys a little more evenness with more travel
  const bad = readDivisionsSpec({ ...example, fairnessWeight: "lots" });
  assert.ok(bad.errors.some((e) => /fairness weight/.test(e)));
  assert.equal(readDivisionsSpec({ ...example, fairnessWeight: "1.5" }).spec.fairnessWeight, 1.5);
});

test("the form's venueFairness switch reads true/yes/on/1 as on and false/no/off/empty as off", () => {
  for (const on of [true, "true", "TRUE", "yes", "on", "1"]) assert.equal(readDivisionsSpec({ ...example, venueFairness: on }).spec.venueFairness, true, String(on));
  for (const off of [false, "false", "no", "off", "0", "", undefined]) assert.equal(readDivisionsSpec({ ...example, venueFairness: off }).spec.venueFairness, false, String(off));
});

test("the command line prints next season's venue history as JSON with --history", () => {
  const dir = mkdtempSync(join(tmpdir(), "divisions-cli-"));
  const file = join(dir, "spec.json");
  writeFileSync(file, JSON.stringify({ ...example, venueFairness: "true" }));
  const run = spawnSync(process.execPath, [new URL("./divisions.mjs", import.meta.url).pathname, file, "--history"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.endsWith("}\n"));
  const { spec } = readDivisionsSpec({ ...example, venueFairness: "true" });
  assert.deepEqual(JSON.parse(run.stdout), carryVenueHistory(buildDivisions(spec)));
});

test("after rainouts the nights stay in date order, including the new nights make-ups open", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  for (const seed of [1, 2, 3]) {
    const s = buildDivisions({ ...spec, seed });
    const text = s.nights.filter((_, i) => i % 3 === 1).map((n) => dayIso(n.day)).join("\n");
    for (const opts of [{}, { relocate: true, balance: true }]) {
      const r = applyDivisionRainouts(s, text, opts);
      const days = r.schedule.nights.map((n) => n.day);
      assert.deepEqual(days, [...days].sort((a, b) => a - b));
      assert.ok(new Set(days).size === days.length);
    }
  }
});

test("relocated make-ups always land on a real time slot of the season", () => {
  const { spec } = readDivisionsSpec({ ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School" });
  for (const seed of [1, 2, 3, 4, 5, 6, 8]) {
    const s = buildDivisions({ ...spec, seed });
    const text = s.nights.filter((_, i) => i % 4 === 1).map((n) => dayIso(n.day)).join("\n");
    const r = applyDivisionRainouts(s, text, { balance: true, relocate: true });
    for (const n of r.schedule.nights) for (const m of n.matches) {
      assert.ok(r.schedule.config.times.includes(m.time), `${m.time} on ${dayIso(n.day)}`);
      assert.ok(r.schedule.config.courts.includes(m.court));
    }
    for (const m of r.moves) assert.ok(r.schedule.config.times.includes(m.time));
  }
});

test("make-ups on named dates past the season keep the nights in date order even when the later date is listed first", () => {
  const s = build();
  const [a, b] = [s.nights[0], s.nights[1]];
  const r = applyDivisionRainouts(s, `${dayIso(a.day)} ${a.matches[0].division}/${a.matches[0].homeName} -> 2027-03-09\n${dayIso(b.day)} ${b.matches[0].division}/${b.matches[0].homeName} -> 2027-03-02`);
  assert.deepEqual(r.errors, []);
  const days = r.schedule.nights.map((n) => n.day);
  assert.ok(days.includes(parseDate("2027-03-02")) && days.includes(parseDate("2027-03-09")));
  assert.deepEqual(days, [...days].sort((x, y) => x - y));
});

test("a make-up date whose every slot is taken is refused, not given a blank time", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a1, a2, a3", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue" });
  const s = buildDivisions(spec);
  const [first, second] = s.nights;
  const r = applyDivisionRainouts(s, `${dayIso(first.day)} A -> ${dayIso(second.day)}`);
  assert.equal(r.moves.length, 0);
  assert.ok(r.errors.length > 0 && r.errors.every((e) => /no open court slot|already plays/.test(e)));
  for (const n of r.schedule.nights) for (const m of n.matches) assert.ok(spec.times.includes(m.time), `blank time on ${dayIso(n.day)}`);
  assert.deepEqual(validateDivisions(r.schedule).errors, []);
});

test("after a rainout every night lists its matches by time, then by court", () => {
  const s = build();
  const r = applyDivisionRainouts(s, dayIso(s.nights[0].day));
  const { times, courts } = r.schedule.config;
  for (const n of r.schedule.nights) {
    const keys = n.matches.map((m) => times.indexOf(m.time) * 1000 + courts.indexOf(m.court));
    assert.deepEqual(keys, [...keys].sort((a, b) => a - b), `night ${dayIso(n.day)} out of order`);
  }
});

test("parseTravel keeps a hyphen inside a venue name", () => {
  const r = parseTravel("North-Park - School: 25\nSchool - North-Park: 30", ["North-Park", "School"]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.travel["North-Park|School"], 30);
});

test("fairness weight: 100 is accepted, 101 is named as out of range", () => {
  assert.ok(!readDivisionsSpec({ ...example, fairnessWeight: "100" }).errors.some((e) => /fairness weight/.test(e)));
  assert.ok(readDivisionsSpec({ ...example, fairnessWeight: "101" }).errors.some((e) => /fairness weight/.test(e)));
});

test("validateDivisions flags a double round robin where a pair hosts twice", () => {
  const s = JSON.parse(JSON.stringify(build({ divisions: [{ name: "D", teams: ["A", "B", "C"], double: true }], links: [] })));
  const ms = s.divisions[0].rounds.flatMap((r) => r.matches).concat(s.nights.flatMap((n) => n.matches));
  for (const m of ms) if (m.home > m.away) { [m.home, m.away] = [m.away, m.home]; }
  const v = validateDivisions(s);
  assert.ok(v.errors.some((e) => /do not each host once/.test(e)), v.errors.join("\n"));
});

test("readDivisionsSpec reports missing courts and weekdays instead of leaving buildDivisions to throw", () => {
  const f = { divisions: "A: a, b, c", times: "18:00", start: "2026-10-06" };
  assert.ok(readDivisionsSpec({ ...f, weekdays: "Tue", courts: "" }).errors.includes("Name the shared courts."));
  assert.ok(readDivisionsSpec({ ...f, weekdays: "", courts: "C1" }).errors.includes("Pick at least one weekday to play on."));
  assert.deepEqual(readDivisionsSpec({ ...f, weekdays: "Tue", courts: "C1" }).errors, []);
});

test("a share fragment holding a JSON scalar or null is refused, not decoded into blank fields", () => {
  for (const json of ["5", '"x"', "true", "null"]) assert.equal(decodeDivisionFields("#d=" + btoa(json)), null, json);
});

test("a schedule built without skip days or links records them as empty lists, not undefined", () => {
  const { skipDays, links } = JSON.parse(JSON.stringify(build({ skipDays: undefined, links: undefined }))).config;
  assert.deepEqual(skipDays, []);
  assert.deepEqual(links, []);
});

test("rainoutOptions reads the page's make-up checkboxes and they ride in the share link", () => {
  assert.deepEqual(rainoutOptions({}), { balance: false, flip: false, relocate: false, swapNights: false });
  assert.deepEqual(rainoutOptions({ balance: "1", swapNights: "yes", relocate: true, flip: "0" }), { balance: true, flip: false, relocate: true, swapNights: true });
  const f = { divisions: "A: x, y", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue", relocate: "1", swapNights: "1", seed: "1" };
  const back = decodeDivisionFields("#d=" + encodeDivisionFields(f));
  assert.equal(back.relocate, "1");
  assert.equal(back.swapNights, "1");
  assert.equal(back.balance, "");
});

test("a blank seed means the default seed 1, so a share link (which reloads blank as 1) rebuilds the same schedule", () => {
  const base = { divisions: "A: a1, a2, a3, a4", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue" };
  assert.equal(readDivisionsSpec({ ...base, seed: "" }).spec.seed, 1);
  assert.equal(readDivisionsSpec({ ...base, seed: "  " }).spec.seed, 1);
  assert.equal(readDivisionsSpec({ ...base, seed: "0" }).spec.seed, 0);
  assert.equal(decodeDivisionFields("#d=" + encodeDivisionFields({ ...base, seed: "" })).seed, "1");
});

test("a venueHistory object survives a share link as JSON, not [object Object]", () => {
  const venueHistory = { "A/a1": { Park: 2 } };
  const back = decodeDivisionFields("#d=" + encodeDivisionFields({ divisions: "A: a1, a2", venueHistory }));
  assert.deepEqual(JSON.parse(back.venueHistory), venueHistory);
});

test("suggestFairnessWeight reads the league's own travel: free evenness on two venues, a priced fallback on three with distances", () => {
  const two = suggestFairnessWeight(build().config && readDivisionsSpec(example).spec);
  assert.equal(two.basis, "venue changes");
  assert.ok(two.weight >= 1 && two.weight <= 2 && !two.overSlack, JSON.stringify(two)); // measured 1.5 (README)
  const f = { ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School, Gym B @ Lake", courtClosures: "", travel: "Park - School: 10\nPark - Lake: 60\nSchool - Lake: 55" };
  const three = suggestFairnessWeight(readDivisionsSpec(f).spec, { seeds: 2 });
  assert.equal(three.basis, "minutes of travel");
  assert.ok(three.overSlack && three.weight > 0 && three.extraTravel > 0.05, JSON.stringify(three)); // 4 seeds: 0.5, +23%; 2 seeds in the test
  const zero = three.rows.find((r) => r.weight === 0), pick = three.rows.find((r) => r.weight === three.weight);
  assert.ok(pick.imbalance <= zero.imbalance / 2);
});

test("officials: every match gets a valid official across divisions", async () => {
  const { parseDivisionOfficials, assignDivisionOfficials, validateDivisionOfficials, divisionsCsv } = await import("./divisions.mjs");
  const { spec } = readDivisionsSpec(JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8")));
  const s = buildDivisions(spec);
  const text = "Ana (Hawks)\nBo (Rams): Tue\nCy\nDee\nEli\nFay\nGus";
  const po = parseDivisionOfficials(text, spec.divisions);
  assert.deepEqual(po.errors, []);
  const a = assignDivisionOfficials(s, po.officials);
  assert.deepEqual(validateDivisionOfficials(a.schedule, po.officials), []);
  assert.equal(a.total + a.unfilled.length, s.stats.matches);
  assert.equal(a.unfilled.length, 0);
  assert.ok(a.schedule.nights.every((n) => n.matches.every((m) => m.official)));
  assert.match(divisionsCsv(a.schedule).split("\n")[0], /,Official$/);
  assert.ok(!/Official/.test(divisionsCsv(s).split("\n")[0]));
});

test("officials: caps leave matches unfilled with a reason, and a bad team is an error", async () => {
  const { parseDivisionOfficials, assignDivisionOfficials, validateDivisionOfficials } = await import("./divisions.mjs");
  const { spec } = readDivisionsSpec(JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8")));
  const s = buildDivisions(spec);
  const po = parseDivisionOfficials("Ana max 2\nBo (Nobody)", spec.divisions);
  assert.equal(po.errors.length, 1);
  const a = assignDivisionOfficials(s, po.officials.slice(0, 1));
  assert.equal(a.total, 2);
  assert.equal(a.unfilled.length, s.stats.matches - 2);
  assert.ok(a.unfilled.every((u) => /at their match cap|already on another match/.test(u.reason)));
  assert.deepEqual(validateDivisionOfficials(a.schedule, po.officials.slice(0, 1)), []);
});

test("calendar export: every match once, per division and per team, lines folded", () => {
  const s = build();
  const stamp = "20261029T000000Z";
  const count = (t) => (t.match(/BEGIN:VEVENT/g) || []).length;
  const all = divisionsIcs(s, { stamp });
  assert.equal(count(all), s.stats.matches);
  assert.equal(all, divisionsIcs(s, { stamp }));
  assert.ok(all.startsWith("BEGIN:VCALENDAR\r\n") && all.endsWith("END:VCALENDAR\r\n"));
  assert.ok(all.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  const uids = all.match(/^UID:.*$/gm);
  assert.equal(new Set(uids).size, uids.length);
  assert.doesNotMatch(all, /VALARM/);
  const withAlarm = divisionsIcs(s, { stamp, alarmMinutes: 45 });
  assert.ok(/TRIGGER:-PT45M/.test(withAlarm) === /DTSTART:/.test(withAlarm));
  const d = s.divisions[0];
  const per = divisionsIcs(s, { division: d.name, stamp });
  assert.equal(count(per), d.rounds.reduce((n, r) => n + r.matches.length, 0));
  const t = d.teams[0];
  const mine = divisionsIcs(s, { team: t, stamp });
  const expect = s.nights.flatMap((n) => n.matches).filter((m) => m.homeName === t || m.awayName === t).length;
  assert.equal(count(mine), expect);
  assert.match(mine, new RegExp(`SUMMARY:${t} vs .* \\((home|away)\\)`));
  const first = s.nights[0].matches.find((m) => m.time);
  const [hh, mm] = first.time.split(":").map(Number);
  const end = hh * 60 + mm + 90;
  const one = divisionsIcs({ ...s, nights: [{ day: s.nights[0].day, matches: [first] }] }, { stamp, minutes: 90 });
  assert.match(one, new RegExp(`DTEND:\\d{8}T${String(Math.floor(end / 60) % 24).padStart(2, "0")}${String(end % 60).padStart(2, "0")}00`));
});

test("officials field: survives a share link and the page wires parse, assign and validate", async () => {
  const { encodeDivisionFields, decodeDivisionFields } = await import("./divisions.mjs");
  const { readFileSync } = await import("node:fs");
  const f = { divisions: "U10: A, B, C, D", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue", officials: "Ana (A): Tue max 6\nBo", seed: "1" };
  assert.equal(decodeDivisionFields("#d=" + encodeDivisionFields(f)).officials, f.officials);
  const html = readFileSync(new URL("./multi-division-league-schedule.html", import.meta.url), "utf8");
  assert.match(html, /id="officials"/);
  for (const fn of ["parseDivisionOfficials", "assignDivisionOfficials", "validateDivisionOfficials"]) assert.ok(html.includes(fn), fn);
});

test("team and official messages: every match appears once per side, byes add nothing, officials only their own", async () => {
  const { divisionsTeamMessages, divisionsOfficialMessages, parseDivisionOfficials, assignDivisionOfficials } = await import("./divisions.mjs");
  const { spec } = readDivisionsSpec(JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8")));
  const s = buildDivisions(spec);
  const msgs = divisionsTeamMessages(s);
  assert.equal(msgs.length, spec.divisions.reduce((n, d) => n + d.teams.length, 0));
  assert.equal(msgs.reduce((n, m) => n + m.matches, 0), 2 * s.stats.matches);
  for (const m of msgs) assert.equal(m.text.split("\n").length, m.matches + 2, `${m.division}/${m.team}`);
  const po = parseDivisionOfficials("Ana (Hawks)\nBo\nCy", spec.divisions);
  const a = assignDivisionOfficials(s, po.officials);
  const om = divisionsOfficialMessages(a.schedule);
  assert.equal(om.reduce((n, m) => n + m.matches, 0), a.total);
  assert.ok(om.every((m) => m.text.startsWith(`Hi ${m.official},`)));
  assert.deepEqual(divisionsOfficialMessages(s), []);
});

test("travelWarnings flags a missing pair and a direct time longer than going via a third venue", () => {
  const v = ["Park", "School", "Lake"];
  const full = parseTravel("Park - School: 10\nSchool - Lake: 20\nPark - Lake: 25", v).travel;
  assert.deepEqual(travelWarnings(full, v), []);
  const missing = parseTravel("Park - School: 10\nSchool - Lake: 20", v).travel;
  const w1 = travelWarnings(missing, v);
  assert.equal(w1.length, 1);
  assert.match(w1[0], /No travel time for Park - Lake.*20 min/);
  const typo = parseTravel("Park - School: 10\nSchool - Lake: 20\nPark - Lake: 250", v).travel;
  const w2 = travelWarnings(typo, v);
  assert.equal(w2.length, 1);
  assert.match(w2[0], /Park - Lake is 250 min but Park - School - Lake is 30/);
  assert.deepEqual(travelWarnings({}, v), []);
});

test("the multi-division page shows the travel-table warnings readDivisionsSpec returns", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./multi-division-league-schedule.html", import.meta.url), "utf8");
  assert.match(html, /readDivisionsSpec\(f\);/);
  assert.match(html, /const \{ spec, errors, warnings \} = readDivisionsSpec/);
  assert.match(html, /Travel table:/);
});

test("season grid: one row per team, one column per night, every match shows once per side", async () => {
  const { divisionsSeasonGrid, divisionsSeasonGridCsv } = await import("./divisions.mjs");
  const s = build();
  const { header, rows } = divisionsSeasonGrid(s);
  assert.equal(header.length, 2 + s.nights.length);
  assert.equal(rows.length, s.divisions.reduce((a, d) => a + d.teams.length, 0));
  const cells = rows.flatMap((r) => r.slice(2)).filter(Boolean).flatMap((c) => c.split(" / "));
  const matches = s.nights.reduce((a, n) => a + n.matches.length, 0);
  assert.equal(cells.length, matches * 2);
  assert.equal(cells.filter((c) => c.startsWith("v ")).length, matches);
  const csv = divisionsSeasonGridCsv(s);
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csv.trim().split("\r\n").length, rows.length + 1);
});

test("team unavailable dates: no match is left on a blackout night, moved matches avoid every blackout, and bad lines are named", () => {
  const s = build();
  const blackouts = {};
  const lines = [];
  // block the first three nights each team plays in the first two divisions' opening rounds
  for (const n of s.nights.slice(0, 3)) {
    const m = n.matches[0];
    const k = `${m.div}/${m.home}`;
    (blackouts[k] = blackouts[k] || []).push(n.day);
    lines.push(`${m.division}/${m.homeName}: ${dayIso(n.day)}`);
  }
  const pb = parseDivisionBlackouts(lines.join("\n"), s.divisions);
  assert.deepEqual(pb.errors, []);
  const r = applyDivisionBlackouts(s, pb.blackouts);
  assert.deepEqual(r.errors, []);
  assert.ok(r.moves.length >= 3);
  assert.deepEqual(validateDivisions(r.schedule).errors, []);
  assert.equal(r.schedule.stats.matches, s.stats.matches);
  for (const n of r.schedule.nights) for (const m of n.matches) for (const t of [m.home, m.away]) assert.ok(!(pb.blackouts[`${m.div}/${t}`] || []).includes(n.day));
  const bad = parseDivisionBlackouts("Nope/Team: 2026-10-06\nnonsense", s.divisions);
  assert.equal(bad.errors.length, 2);
});

test("team unavailable dates: a team blocked on every night is refused and reported, the match stays put", () => {
  const s = build();
  const first = s.nights[0].matches[0];
  const key = `${first.div}/${first.home}`;
  // the home team is unavailable on every night of the season
  const blackouts = { [key]: s.nights.map((n) => n.day) };
  // plus every night the mover would look at (120 play nights, under 800 days) so "later night" has nothing free either
  const last = s.nights[s.nights.length - 1].day;
  for (let d = last + 1; d <= last + 800; d++) blackouts[key].push(d);
  const r = applyDivisionBlackouts(s, blackouts);
  assert.ok(r.errors.length >= 1, "a refusal is reported");
  assert.equal(r.schedule.stats.matches, s.stats.matches, "no match is lost");
  assert.deepEqual(validateDivisions(r.schedule).errors, [], "the schedule still validates");
  const stays = r.schedule.nights[0].matches.some((m) => m.div === first.div && m.home === first.home && m.away === first.away);
  assert.ok(stays, "the refused match stays where it was");
});

test("division score sheets: a page per night, every match once, names escaped", async () => {
  const { divisionsScoreSheetsHtml } = await import("./divisions.mjs");
  const s = build();
  const first = s.nights[0].matches[0];
  const orig = first.homeName;
  first.homeName = "A<b>&Co";
  const html = divisionsScoreSheetsHtml(s, { title: "Spring <League>" });
  first.homeName = orig;
  assert.equal((html.match(/<section class="sheet">/g) || []).length, s.nights.length);
  const total = s.nights.reduce((a, n) => a + n.matches.length, 0);
  assert.equal((html.match(/<td class="f">/g) || []).length, total);
  assert.ok(html.includes("A&lt;b&gt;&amp;Co") && !html.includes("A<b>"));
  assert.ok(html.includes("Spring &lt;League&gt;") && !/<script/i.test(html));
});

test("divisionsStandings ranks each division and rejects results the schedule cannot have", () => {
  const { spec } = readDivisionsSpec(example);
  const sch = buildDivisions(spec);
  const [d0, d1] = sch.divisions;
  const [a, b, c] = d0.teams;
  const text = `${d0.name}: ${a} 3 - 0 ${b}\n${d0.name}: ${c} 1 - 1 ${a}\n${d0.name}: ${b} -2 pts\n${d1.name}: ${d1.teams[0]} w/o ${d1.teams[1]}`;
  const r = divisionsStandings(sch, text);
  assert.deepEqual(r.errors, []);
  const t0 = r.tables[0].rows;
  assert.equal(t0[0].name, a);
  assert.equal(t0[0].points, 4);
  assert.equal(t0.find((x) => x.name === b).points, -2);
  assert.equal(r.tables[1].rows[0].name, d1.teams[0]);
  // no prefix in a multi-division league, an unknown team, and a pair reported twice in a single round robin
  const bad = divisionsStandings(sch, `${a} 1 - 0 ${b}\n${d0.name}: ${a} 1 - 0 Nobody\n${d0.name}: ${a} 1 - 0 ${b}\n${d0.name}: ${b} 2 - 0 ${a}`);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[2], /more often than it is scheduled/);
});

test("standings text and CSV carry every division, and the CLI --results reads a file", () => {
  const { spec } = readDivisionsSpec(example);
  const sch = buildDivisions(spec);
  const [d0, d1] = sch.divisions;
  const text = `${d0.name}: ${d0.teams[0]} 3 - 0 ${d0.teams[1]}\n${d1.name}: ${d1.teams[0]} 2 - 2 ${d1.teams[1]}\n${d1.name}: ${d1.teams[0]} 1 - 0 Nobody`;
  const r = divisionsStandings(sch, text);
  const csv = divisionsStandingsCsv(r).trim().split(/\r\n/);
  assert.match(csv[0], /^Division,Rank,Team/);
  assert.equal(csv.length, 1 + r.tables.reduce((n, t) => n + t.rows.length, 0));
  assert.ok(csv[1].startsWith(`"${d0.name}",1,${d0.teams[0]},1,1,0,0,3,0,3,3`));
  const out = divisionsStandingsText(r);
  assert.ok(out.includes(d0.name) && out.includes(d1.name) && /Warning: .*Nobody/.test(out));
  const dir = mkdtempSync(join(tmpdir(), "lsg-"));
  writeFileSync(join(dir, "spec.json"), JSON.stringify(example));
  writeFileSync(join(dir, "res.txt"), text.split("\n").slice(0, 2).join("\n"));
  const run = spawnSync("node", [new URL("./divisions.mjs", import.meta.url).pathname, join(dir, "spec.json"), "--results", join(dir, "res.txt")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes(`${d0.teams[0]}`) && run.stdout.includes("Pts"));
});

test("divisionsPlayoffs seeds winners first, then runners-up, with wildcards last", () => {
  const { spec } = readDivisionsSpec(example);
  const sch = buildDivisions(spec);
  const lines = [];
  for (const d of sch.divisions) {
    lines.push(`${d.name}: ${d.teams[0]} 3 - 0 ${d.teams[1]}`, `${d.name}: ${d.teams[1]} 2 - 1 ${d.teams[2]}`);
  }
  const r = divisionsStandings(sch, lines.join("\n"));
  const n = sch.divisions.length;
  const po = divisionsPlayoffs(r, { perDivision: 2, wildcards: 1 });
  assert.equal(po.seeds.length, 2 * n + 1);
  assert.ok(po.seeds.slice(0, n).every((x) => x.rank === 1));
  assert.ok(po.seeds.slice(n, 2 * n).every((x) => x.rank === 2));
  assert.ok(po.seeds[2 * n].rank > 2);
  assert.deepEqual(po.seeds.map((x) => x.seed), po.seeds.map((_, i) => i + 1));
  assert.ok(po.bracket.games >= po.seeds.length - 1 && /Final/.test(po.text));
  assert.match(divisionsPlayoffs({ tables: [{ division: "A", rows: [{ name: "x", played: 0, points: 0, gd: 0, gf: 0 }] }] }, { perDivision: 1 }).errors.join(), /two teams/);
});

test("divisionsTieBreakNotes lists notes per division and skips divisions with none", () => {
  const { spec } = readDivisionsSpec(example);
  const sch = buildDivisions(spec);
  const [d0] = sch.divisions;
  const r = divisionsStandings(sch, `${d0.name}: ${d0.teams[0]} 3 - 0 ${d0.teams[1]}`);
  const n = divisionsTieBreakNotes(r);
  assert.ok(n.length >= 1 && n[0].division === d0.name);
  assert.ok(n[0].notes.every((x) => typeof x.text === "string"));
  assert.deepEqual(divisionsTieBreakNotes({ tables: [{ division: "X", rows: [] }] }), []);
});

test("divisionsWeeklyUpdate: one block per division with last scores, table and next round; bad results become warnings", () => {
  const s = build();
  const none = divisionsWeeklyUpdate(s, "");
  assert.match(none, /== U10 ==\nNext up: Round 1/);
  assert.match(none, /== Adult ==/);
  assert.ok(!none.includes("Table"));
  const r1 = s.divisions[0].rounds[0].matches;
  const text = r1.map((m, i) => `U10: ${m.homeName} ${i + 2} - ${i} ${m.awayName}`).join("\n") + "\nU10: Hawks 1 - 0 Hawks\nU12: Hawks 2 - 2 Rams";
  const out = divisionsWeeklyUpdate(s, text);
  const u10 = out.split("== ").find((b) => b.startsWith("U10"));
  assert.match(u10, /Round 1 results/);
  assert.match(u10, /Table\n  1\./);
  assert.match(u10, /Next up: Round 2/);
  assert.match(out, /== U12 ==\nNext up: Round 1/);
  assert.match(out, /Warning:/);
});

test("restGaps: counts back-to-back days and the longest idle stretch per team", () => {
  const mk = (day, h, a) => ({ day, matches: [{ division: "D", home: h, away: a, homeName: "T" + h, awayName: "T" + a }] });
  const sch = { nights: [mk(1, 0, 1), mk(2, 0, 2), mk(9, 1, 2)] };
  const r = restGaps(sch);
  assert.equal(r.backToBack, 1);
  assert.equal(r.minGap, 1);
  assert.equal(r.maxGap, 8);
  assert.deepEqual(r.longest.map((x) => x.team), ["D/T1"]);
  assert.equal(r.teams.find((t) => t.team === "D/T0").maxGap, 1);
  assert.equal(restGaps({ nights: [mk(1, 0, 1)] }).maxGap, null);
});

test("restGaps and divisionsText on the example league", () => {
  const s = build();
  const r = restGaps(s);
  assert.ok(r.teams.length >= 20 && r.minGap >= 1 && r.maxGap >= r.minGap);
  assert.match(divisionsText(s), /^Rest: \d+ back-to-back/m);
});

test("CLI --results --weekly prints the group-chat update", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "wk-"));
  const res = join(dir, "r.txt");
  writeFileSync(res, "U10: Hawks 2 - 1 Owls\n");
  const spec = join(import.meta.dirname, "example-divisions.json");
  const out = execFileSync("node", [join(import.meta.dirname, "divisions.mjs"), spec, "--results", res, "--weekly"], { encoding: "utf8" });
  assert.match(out, /== U10 ==/);
  assert.match(out, /== Adult ==\nNext up: Round 1/);
});

test("divisionsOverdue: lists past games with no typed result, per division, earliest meeting first", () => {
  const s = build();
  const r1 = s.divisions[0].rounds[0];
  const day1 = r1.day;
  const first = Math.min(...s.divisions.flatMap((d) => d.rounds.map((r) => r.day)));
  const none = divisionsOverdue(s, "", first);
  assert.deepEqual(none.overdue, []);
  assert.equal(none.text, "");
  const after = divisionsOverdue(s, "", day1 + 1);
  assert.equal(after.overdue.filter((o) => o.division === "U10" && o.day === day1).length, r1.matches.length);
  assert.match(after.text, /^Scores still missing \(\d+\):/);
  const typed = r1.matches.map((m) => `U10: ${m.homeName} 2 - 1 ${m.awayName}`).join("\n");
  const done = divisionsOverdue(s, typed, day1 + 1);
  assert.equal(done.overdue.filter((o) => o.division === "U10" && o.day === day1).length, 0);
  const junk = divisionsOverdue(s, typed + "\nU10: Hawks 1 - 0 Hawks\nNope: A 1 - 0 B", day1 + 1);
  assert.equal(junk.overdue.length, done.overdue.length);
  const far = divisionsOverdue(s, "", 1e9);
  const total = s.divisions.reduce((n, d) => n + d.rounds.reduce((m, r) => m + r.matches.length, 0), 0);
  assert.equal(far.overdue.length, total);
});

test("divisionsRace: clinched and eliminated teams per division from typed results", () => {
  const s = build();
  const div = s.divisions[0];
  const none = divisionsRace(s, "", { spots: 2 });
  assert.equal(none.errors.length, 0);
  assert.ok(none.rows.every((r) => r.status === "alive"));
  assert.match(none.text, new RegExp(`^${div.name} \\(top 2 qualify, \\d+ games? left\\)`));
  // The first-named team wins every scheduled game in its division: it must end up clinched once enough are in.
  const lines = [];
  for (const d of s.divisions) for (const r of d.rounds) for (const m of r.matches) lines.push(`${d.name}: ${m.homeName} ${m.home === 0 ? 3 : 0} - ${m.home === 0 ? 0 : (m.away === 0 ? 3 : 1)} ${m.awayName}`);
  const full = divisionsRace(s, lines.join("\n"), { spots: 2 });
  assert.equal(full.errors.length, 0);
  for (const d of s.divisions) {
    const rs = full.rows.filter((r) => r.division === d.name);
    assert.ok(rs.filter((r) => r.status === "clinched").length <= Math.min(2, d.teams.length));
    assert.equal(rs.find((r) => r.index === 0).status, "clinched");
  }
  const bad = divisionsRace(s, "Nope: A 1 - 0 B", { spots: 2 });
  assert.ok(bad.errors.length > 0);
});

test("divisionsRemaining: games left and opponents' points per game, hardest run-in first", () => {
  const s = build();
  const total = s.divisions.reduce((n, d) => n + d.rounds.reduce((m, r) => m + r.matches.length, 0), 0);
  const none = divisionsRemaining(s, "");
  assert.equal(none.rows.reduce((n, r) => n + r.left, 0), total * 2);
  assert.ok(none.rows.every((r) => r.left === 0 || r.oppPpg === 0));
  const m = s.divisions[0].rounds[0].matches[0];
  const typed = divisionsRemaining(s, `U10: ${m.homeName} 3 - 0 ${m.awayName}`);
  assert.equal(typed.rows.reduce((n, r) => n + r.left, 0), total * 2 - 2);
  const u10 = typed.rows.filter((r) => r.division === "U10");
  for (let i = 1; i < u10.length; i++) assert.ok((u10[i - 1].oppPpg ?? -1) >= (u10[i].oppPpg ?? -1));
  const hawk = u10.find((r) => r.team === m.homeName);
  assert.ok(hawk.oppPpg < 3);
  assert.match(typed.text, /hardest run-in first/);
});

test("rainout change notices: one group post, one per division, one note per affected team, and nothing for unmoved teams", () => {
  const s = build();
  const night = s.nights[1];
  const r = applyDivisionRainouts(s, `${dayIso(night.day)}`);
  assert.deepEqual(r.errors, []);
  assert.ok(r.moves.length > 1);
  const n = divisionsChangeNotices(r.moves);
  assert.equal(n.divisions.length, new Set(r.moves.map((m) => m.division)).size);
  const affected = new Set(r.moves.flatMap((m) => [m.division + "|" + m.home, m.division + "|" + m.away]));
  assert.equal(n.teams.length, affected.size);
  for (const t of n.teams) assert.ok(affected.has(t.division + "|" + t.team));
  for (const m of r.moves) assert.ok(n.group.includes(`${m.home} v ${m.away}: was ${dayLabel(m.from)}, now ${dayLabel(m.to)}`));
  assert.deepEqual(divisionsChangeNotices([]), { group: "", divisions: [], teams: [] });
});

test("change notices keep a team name used in two divisions apart", () => {
  const mv = (division, from, to) => ({ division, home: "Hawks", away: "Owls", from, to, court: "C1", time: "18:00" });
  const n = divisionsChangeNotices([mv("U10", 20000, 20007), mv("U12", 20001, 20008)]);
  assert.equal(n.teams.filter((t) => t.team === "Hawks").length, 2);
  assert.ok(n.teams.every((t) => t.text.includes(`(${t.division})`)));
});

test("divisionsBookings lists each venue's nights, courts and span, and counts every game once", () => {
  const s = build();
  const b = divisionsBookings(s);
  assert.equal(b.venues.reduce((n, v) => n + v.games, 0), s.nights.reduce((n, x) => n + x.matches.length, 0));
  for (const v of b.venues) for (const d of v.dates) {
    assert.match(d.from, /^\d\d:\d\d$/);
    assert.ok(d.from < d.to);
    assert.ok(d.courts.length >= 1 && d.games >= d.courts.length);
  }
  assert.deepEqual(b.venues.map((v) => v.venue), [...b.venues.map((v) => v.venue)].sort());
  assert.match(b.text, /^Park: \d+ nights?, \d+ games/m);
  // 18:00 and 19:30 slots at 60 minutes -> a night using both runs 18:00-20:30
  assert.ok(b.venues.some((v) => v.dates.some((d) => d.from === "18:00" && d.to === "20:30")));
  assert.equal(divisionsBookings(s, { minutes: 90 }).venues.flatMap((v) => v.dates).some((d) => d.to === "21:00"), true);
  assert.deepEqual(divisionsBookings({ nights: [] }), { venues: [], text: "" });
});

test("CLI --bookings prints the booking request", () => {
  const r = spawnSync("node", [new URL("./divisions.mjs", import.meta.url).pathname, new URL("./example-divisions.json", import.meta.url).pathname, "--bookings"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Park: \d+ nights?/);
  assert.match(r.stdout, /School: \d+ nights?/);
});

test("CLI --cost prices the season from a rates file, exit 2 when a venue has no rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "cost-"));
  const ex = new URL("./example-divisions.json", import.meta.url).pathname, cli = new URL("./divisions.mjs", import.meta.url).pathname;
  writeFileSync(join(dir, "none.txt"), "Nowhere: 10\n");
  const bad = spawnSync("node", [cli, ex, "--cost", join(dir, "none.txt")], { encoding: "utf8" });
  assert.equal(bad.status, 2, bad.stderr);
  assert.match(bad.stdout, /no rate given/);
  const venues = [...new Set(divisionsBookings(build()).venues.map((v) => v.venue))];
  writeFileSync(join(dir, "r.txt"), venues.map((v) => `${v}: 10`).join("\n"));
  const ok = spawnSync("node", [cli, ex, "--cost", join(dir, "r.txt"), "--extra", "100"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const want = divisionsFacilityCost(build(), venues.map((v) => `${v}: 10`).join("\n"), { extra: 100 });
  assert.match(ok.stdout, new RegExp(`Total: ${want.total.toFixed(2)}`));
  assert.match(ok.stdout, /Fee per team/);
  assert.equal(spawnSync("node", [cli, ex, "--cost"], { encoding: "utf8" }).status, 1);
});

test("applyDivisionWithdrawals removes a team's remaining matches, keeps the rest and names who is short", () => {
  const s = build();
  const total = s.stats.matches;
  const hawks = s.nights.flatMap((n) => n.matches).filter((m) => m.division === "U10" && (m.homeName === "Hawks" || m.awayName === "Hawks"));
  assert.ok(hawks.length > 2);
  const r = applyDivisionWithdrawals(s, "U10/hawks");
  assert.deepEqual(r.errors, []);
  assert.equal(r.withdrawals[0].removed, hawks.length);
  assert.equal(r.schedule.stats.matches, total - hawks.length);
  assert.equal(r.withdrawals[0].opponentsShort.reduce((a, o) => a + o.fixtures, 0), hawks.length);
  assert.ok(!r.schedule.nights.flatMap((n) => n.matches).some((m) => m.division === "U10" && (m.homeName === "Hawks" || m.awayName === "Hawks")));
  assert.ok(r.schedule.nights.flatMap((n) => n.matches).some((m) => m.division === "U12" && m.homeName === "Hawks"), "same name in another division stays");
  assert.ok(!r.schedule.divisions[0].rounds.flatMap((x) => x.matches).some((m) => m.homeName === "Hawks" || m.awayName === "Hawks"));
  assert.equal(validateDivisions(r.schedule).ok, true);
  assert.equal(s.stats.matches, total, "input not mutated");
  assert.match(r.notices[0], /U10\/Hawks withdrew: \d+ fixture/);
});

test("applyDivisionWithdrawals from a date keeps earlier matches; bad lines are named", () => {
  const s = build();
  const days = s.nights.map((n) => n.day);
  const cut = days[2];
  const r = applyDivisionWithdrawals(s, `${dayIso(cut)} U10/Hawks\nU10/Nobody\n2026-02-30 U10/Owls\nU10/Hawks`);
  assert.equal(r.errors.length, 3);
  const left = r.schedule.nights.filter((n) => n.day < cut).flatMap((n) => n.matches);
  const before = s.nights.filter((n) => n.day < cut).flatMap((n) => n.matches);
  assert.equal(left.length, before.length);
  assert.ok(!r.schedule.nights.filter((n) => n.day >= cut).flatMap((n) => n.matches).some((m) => m.division === "U10" && (m.homeName === "Hawks" || m.awayName === "Hawks")));
});

test("blackoutsFromCsv turns a coach form export into blackout lines, merges repeats and names what it cannot place", () => {
  const { divisions } = parseDivisions(example.divisions);
  const csv = '﻿Timestamp,Division,Team name,"Dates we cannot play"\r\n' +
    '11/1/2026,U10,Hawks,"2026-11-05; 2026-12-22 to 2026-12-30"\r\n' +
    '11/2/2026,U12,Hawks,none\r\n' +
    '11/2/2026,U10,Hawks,2026-11-12\r\n' +
    '11/3/2026,Adult,Rams,"2026-11-10,\n2026-11-17"\r\n' +
    '11/3/2026,U10,Nobody,2026-11-10\r\n' +
    '11/3/2026,,Owls,2026-11-10\r\n';
  const r = blackoutsFromCsv(csv, divisions);
  assert.equal(r.text, "U10/Hawks: 2026-11-05, 2026-12-22 to 2026-12-30, 2026-11-12\nAdult/Rams: 2026-11-10, 2026-11-17");
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Row 6.*U10\/Nobody/);
  assert.match(r.errors[1], /Row 7.*more than one division/);
  const pb = parseDivisionBlackouts(r.text, divisions);
  assert.deepEqual(pb.errors, []);
  assert.equal(Object.keys(pb.blackouts).length, 2);
});

test("blackoutsFromCsv accepts Division/Team cells and refuses a sheet without the columns it needs", () => {
  const { divisions } = parseDivisions(example.divisions);
  assert.equal(blackoutsFromCsv("Team,Blackout dates\nU12/Hawks,2026-11-05\n", divisions).text, "U12/Hawks: 2026-11-05");
  assert.match(blackoutsFromCsv("Name,Dates\nx,y\n", divisions).errors[0], /No team column/);
  assert.match(blackoutsFromCsv("Team,Colour\nHawks,red\n", divisions).errors[0], /No date column/);
  assert.match(blackoutsFromCsv("Team,Dates\n", divisions).errors[0], /header row/);
  assert.deepEqual(csvRows('a,"b ""q"", c"\n\n1,2'), [["a", 'b "q", c'], ["1", "2"]]);
});

test("--blackouts-csv on the CLI moves matches off the form's dates", () => {
  const dir = mkdtempSync(join(tmpdir(), "bcsv-"));
  const csv = join(dir, "f.csv");
  writeFileSync(csv, "Division,Team,Dates unavailable\nU10,Owls,2026-10-13\n");
  const spec = join(dir, "s.json");
  writeFileSync(spec, JSON.stringify(example));
  const run = (args) => spawnSync("node", [new URL("./divisions.mjs", import.meta.url).pathname, spec, ...args], { encoding: "utf8" });
  const base = run([]), withCsv = run(["--blackouts-csv", csv]);
  assert.equal(withCsv.status, 0, withCsv.stderr);
  assert.notEqual(base.stdout, withCsv.stdout);
});

test("divisionsDeadline reports spare days or late matches per division", () => {
  const s = build();
  const last = Math.max(...s.nights.map((n) => n.day));
  const ok = divisionsDeadline(s, last);
  assert.equal(ok.fits, true); assert.equal(ok.daysSpare, 0); assert.equal(ok.matchesAfter, 0);
  assert.ok(ok.divisions.length >= 3 && ok.divisions.some((d) => d.lastDay === last));
  const late = divisionsDeadline(s, last - 14);
  assert.equal(late.fits, false);
  assert.equal(late.daysSpare, -14);
  const total = s.nights.filter((n) => n.day > last - 14).reduce((a, n) => a + n.matches.length, 0);
  assert.equal(late.matchesAfter, total);
  assert.ok(late.matchesAfter > 0 && late.nightsAfter > 0);
  assert.match(late.text, /past \d{4}-\d\d-\d\d/);
  assert.equal(divisionsDeadline(s, null), null);
  assert.equal(divisionsDeadline({ nights: [] }, 20000), null);
});

test("CLI --deadline exits 0 when the season fits and 2 when it does not", () => {
  const run = (d) => spawnSync("node", [new URL("./divisions.mjs", import.meta.url).pathname, new URL("./example-divisions.json", import.meta.url).pathname, "--deadline", d], { encoding: "utf8" });
  const ok = run("2030-01-01"); assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /Every division finishes/);
  const late = run("2026-10-20"); assert.equal(late.status, 2); assert.match(late.stdout, /day\(s\) past 2026-10-20/);
  assert.equal(run("nope").status, 1);
});

test("availabilitySheetCsv lists every team and round-trips through blackoutsFromCsv", () => {
  const divs = [{ name: "U10", teams: ["Hawks", "Owls, The"] }, { name: "U12", teams: ["Hawks"] }];
  const csv = availabilitySheetCsv(divs);
  assert.equal(csvRows(csv).length, 4);
  assert.ok(csv.includes('"Owls, The"'));
  const filled = csv.replace('U12,Hawks,', 'U12,Hawks,"2026-11-05 to 2026-11-12"');
  const r = blackoutsFromCsv(filled, divs);
  assert.deepEqual(r.errors, []);
  assert.equal(r.text, "U12/Hawks: 2026-11-05 to 2026-11-12");
});

test("parseTravel estimates a pair from venue coordinates and lets a typed time win", () => {
  assert.equal(estimateDriveMinutes([40, -74], [40, -74]), 3); // same point: the floor
  // 0.1 degree of latitude = 11.12 km; x1.3 / 40 km/h = 21.7 min -> 22
  assert.equal(estimateDriveMinutes([40, -74], [40.1, -74]), 22);
  const r = parseTravel("Park @ 40.0, -74.0\nSchool @ 40.1 -74.0\nLake @ 40.0, -73.9\nPark - Lake: 50", ["Park", "School", "Lake"]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.travel["Park|School"], 22);
  assert.equal(r.travel["Lake|Park"], 50); // typed, not estimated
  assert.ok(r.travel["Lake|School"] > 22);
  assert.equal(r.estimated.length, 2);
  const bad = parseTravel("Nowhere @ 1, 2\nPark @ 95, 0", ["Park"]);
  assert.equal(bad.errors.length, 2);
});

test("divisionsFacilityCost: court-hours x rate by hand, unpriced venues left out, fee split by team or by games", () => {
  const mk = (day, matches) => ({ day, matches });
  const m = (division, court, time, venue) => ({ division, court, time, venue, homeName: "a", awayName: "b" });
  const s = {
    divisions: [{ name: "A", teams: ["1", "2", "3", "4"] }, { name: "B", teams: ["5", "6"] }],
    nights: [
      // Park: 2 courts, 18:00-19:00 and 19:00-20:00 slots at 60 min -> span 120 min x 2 courts = 4 court-hours
      mk(1, [m("A", "C1", "18:00", "Park"), m("A", "C2", "18:00", "Park"), m("A", "C1", "19:00", "Park")]),
      // Park: 1 court 18:00-19:00 = 1 court-hour; School untimed: 3 games on 1 court x 60 = 3 court-hours
      mk(8, [m("B", "C1", "18:00", "Park"), m("B", "G", null, "School"), m("B", "G", null, "School"), m("B", "G", null, "School")]),
    ],
  };
  const r = divisionsFacilityCost(s, "Park: $40/court-hour\nNowhere: 10", { extra: 60 });
  assert.equal(r.venues.find((v) => v.venue === "Park").courtHours, 5);
  assert.equal(r.venues.find((v) => v.venue === "Park").cost, 200);
  assert.equal(r.venues.find((v) => v.venue === "School").courtHours, 3);
  assert.deepEqual(r.unpriced, ["School"]);
  assert.equal(r.total, 260);
  assert.equal(r.teams, 6);
  assert.equal(r.perTeam, 43.33);
  assert.match(r.text, /without School: no rate/);
  // by games: A hosts 3 of 4 Park games... game counts are 4 for A, 4 for B -> split total evenly by games, then by teams
  const g = divisionsFacilityCost(s, "Park: 40", { split: "games" });
  assert.equal(g.total, 200);
  assert.equal(g.divisions.find((d) => d.division === "A").perTeam, Math.round(200 * (3 / 7) / 4 * 100) / 100);
  assert.equal(g.divisions.find((d) => d.division === "B").perTeam, Math.round(200 * (4 / 7) / 2 * 100) / 100);
  assert.throws(() => divisionsFacilityCost(s, "", { extra: -1 }), /Extra costs/);
  assert.equal(divisionsFacilityCost({ nights: [] }, "").total, 0);
});

test("divisionsFacilityCost: a decimal comma is not a thousand, a per-season or per-night quote is left unpriced", () => {
  const m = (court, time, venue) => ({ division: "A", court, time, venue, homeName: "a", awayName: "b" });
  const s = { divisions: [{ name: "A", teams: ["1", "2"] }], nights: [{ day: 1, matches: [m("C1", "18:00", "Park"), m("C1", "19:00", "Park")] }] };
  const cost = (rates) => divisionsFacilityCost(s, rates).venues[0];
  assert.equal(cost("Park: 45,50/court-hour").rate, 45.5);
  assert.equal(cost("Park: €45,5 per hour").rate, 45.5);
  assert.equal(cost("Park: $1,200").rate, 1200);
  assert.equal(cost("Park: $1,200.50/hr").rate, 1200.5);
  assert.equal(cost("Park: 45/court-hour").cost, 90);
  for (const q of ["Park: $900/season", "Park: 300 per night", "Park: 50 flat", "Park: 20/game"]) assert.equal(cost(q).rate, null, q);
});

test("divisionsWeeklyUpdate: warns when a team has two walkover losses", () => {
  const s = build();
  const [a, b, c] = s.divisions[0].teams;
  const out = divisionsWeeklyUpdate(s, `U10: ${b} w/o ${a}\nU10: ${c} w/o ${a}`);
  const none = divisionsWeeklyUpdate(s, `U10: ${b} w/o ${a}`);
  assert.match(out, new RegExp(`Warning: ${a} has two or more forfeits`));
  assert.ok(!/forfeits/.test(none));
});

test("division CSV exports defuse spreadsheet formulas in names", () => {
  const { spec } = readDivisionsSpec({ ...example, divisions: "=U10: =HYPERLINK(\"x\"), +Owls, @Lynx, Bears" });
  const r = buildDivisions(spec);
  for (const csv of [divisionsCsv(r), divisionsSeasonGridCsv(r)]) {
    for (const line of csv.split(/\r?\n/)) for (const cell of line.split(",")) assert.ok(!/^"?[=+@]/.test(cell), `cell runs as formula: ${cell}`);
  }
  assert.ok(divisionsCsv(r).includes("'=HYPERLINK"));
});

test("divisionsPlayoffs separate: keeps same-division teams apart in round one", () => {
  const row = (name, points) => ({ name, played: 3, points, gd: 0, gf: 0 });
  // Two divisions, top two each: plain seeding is A1, B1, B2, A2, so 1v4 and 2v3 are same-division games.
  const r = { tables: [{ division: "A", rows: [row("A1", 9), row("A2", 3)] }, { division: "B", rows: [row("B1", 8), row("B2", 4)] }] };
  const plain = divisionsPlayoffs(r, { perDivision: 2 });
  assert.equal(plain.moves.length, 0);
  const firstRound = (po) => po.bracket.rounds[0].matches.map((m) => [m.a.name, m.b.name]);
  const clashes = (po) => firstRound(po).filter(([a, b]) => a.match(/\((.*)\)/)[1] === b.match(/\((.*)\)/)[1]).length;
  assert.equal(clashes(plain), 2);
  const sep = divisionsPlayoffs(r, { perDivision: 2, separate: true });
  assert.equal(clashes(sep), 0);
  assert.equal(sep.moves.length, 1);
  assert.deepEqual(sep.seeds.map((x) => x.seed), [1, 2, 3, 4]);
  assert.deepEqual(sep.seeds.map((x) => x.name).sort(), ["A1", "A2", "B1", "B2"]);
  assert.match(sep.text, /swapped/);
  // One division only: nothing can be fixed, so nothing moves and nothing breaks.
  const one = divisionsPlayoffs({ tables: [{ division: "A", rows: [row("a", 9), row("b", 6), row("c", 3), row("d", 0)] }] }, { perDivision: 4, separate: true });
  assert.equal(one.moves.length, 0);
  assert.deepEqual(one.seeds.map((x) => x.name), ["a", "b", "c", "d"]);
});

test("divisionsPlayoffs separate: random fields never gain a clash and keep every team", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let n = 0; n < 300; n++) {
    const nd = 2 + Math.floor(rnd() * 5), per = 1 + Math.floor(rnd() * 3);
    const tables = [];
    for (let d = 0; d < nd; d++) tables.push({ division: "D" + d, rows: Array.from({ length: per + 1 }, (_, i) => ({ name: `D${d}T${i}`, played: 4, points: Math.floor(rnd() * 12), gd: 0, gf: 0 })).sort((a, b) => b.points - a.points) });
    const clashes = (po) => po.bracket.rounds[0].matches.filter((m) => m.a && m.b && m.a.name.split("T")[0] === m.b.name.split("T")[0]).length;
    const a = divisionsPlayoffs({ tables }, { perDivision: per, wildcards: Math.floor(rnd() * 3) });
    const b = divisionsPlayoffs({ tables }, { perDivision: per, wildcards: 0 + (a.seeds.length - nd * per), separate: true });
    assert.deepEqual(b.seeds.map((x) => x.name).sort(), a.seeds.map((x) => x.name).sort());
    assert.ok(clashes(b) <= clashes(a));
  }
});

test("duties: only playing teams, one duty a night, spread within one, CSV escapes", async () => {
  const { parseDivisionDuties, assignDivisionDuties, validateDivisionDuties, divisionsDutiesCsv, divisionsDutiesText } = await import("./divisions.mjs");
  const bad = parseDivisionDuties("Snack stand: 2\nSnack stand\n: 3\nGate: 11");
  assert.equal(bad.errors.length, 3);
  const pd = parseDivisionDuties("Snack stand: 2\nScoreboard\n=Setup: 1");
  assert.deepEqual(pd.errors, []);
  assert.deepEqual(pd.duties.map((d) => d.perNight), [2, 1, 1]);
  const s = build();
  const r = assignDivisionDuties(s, pd.duties);
  assert.deepEqual(validateDivisionDuties(s, pd.duties, r), []);
  assert.equal(r.rows.length + r.unfilled.length, s.nights.length * 4);
  const tot = r.loads.map((l) => l.total);
  assert.ok(Math.max(...tot) - Math.min(...tot) <= 2, JSON.stringify(tot));
  assert.deepEqual(r, assignDivisionDuties(s, pd.duties)); // deterministic
  assert.ok(divisionsDutiesCsv(r).includes("'=Setup"), "formula cell defused");
  assert.match(divisionsDutiesText(r), /Duties per team: \d+ to \d+/);
  // more slots than teams playing: listed, not invented
  const many = assignDivisionDuties(s, parseDivisionDuties("Gate: 10").duties);
  assert.ok(many.unfilled.length > 0 || many.rows.length === s.nights.length * 10);
  assert.deepEqual(validateDivisionDuties(s, [{ name: "Gate", perNight: 10 }], many), []);
});

test("team sheets: every fixture once per side, duties on the right night, rota page, escaping", async () => {
  const { parseDivisionDuties, assignDivisionDuties, divisionsTeamSheetsHtml } = await import("./divisions.mjs");
  const s = build();
  const pd = parseDivisionDuties("Snack stand: 2\nScoreboard: 1");
  const r = assignDivisionDuties(s, pd.duties);
  const html = divisionsTeamSheetsHtml(s, { title: "Spring <League>", contact: "a@b.c", duties: r });
  const sheets = html.split('<section class="sheet">').slice(1);
  const teamCount = s.divisions.reduce((n, d) => n + d.teams.length, 0);
  assert.equal(sheets.length, teamCount + 1, "one sheet per team plus the rota");
  const matches = s.nights.reduce((n, x) => n + x.matches.length, 0);
  const fixtureRows = sheets.slice(0, -1).reduce((n, sh) => n + (sh.match(/<td>(Home|Away)<\/td>/g) || []).length, 0);
  assert.equal(fixtureRows, 2 * matches, "each match appears on both teams' sheets");
  // duties on sheets equal the rota rows, and each sits on a night the team plays
  const dutyCells = sheets.slice(0, -1).flatMap((sh) => [...sh.matchAll(/<td class="d">([^<]*)<\/td>/g)].map((m) => m[1]).filter(Boolean).flatMap((c) => c.split(", ")));
  assert.equal(dutyCells.length, r.rows.length);
  const first = r.rows[0];
  const sheet = sheets.find((sh) => sh.startsWith(`<h2>${first.team} <span>${first.division}</span>`));
  assert.ok(sheet, "sheet for the first duty's team");
  assert.match(sheet, new RegExp(`<td>${dayLabel(first.day)}</td>[^\\n]*<td class="d">[^<]*${first.duty}`));
  assert.match(sheets.at(-1), /<h2>Duty rota<\/h2>/);
  assert.ok(html.includes("Spring &lt;League&gt;") && !html.includes("<League>"), "title escaped");
  assert.match(html, /Questions: a@b\.c/);
  assert.match(html, /No warranty/);
  // without duties: no duty column, no rota
  const plain = divisionsTeamSheetsHtml(s);
  assert.ok(!plain.includes("Your duty") && !plain.includes("Duty rota"));
  // unfilled slots are marked on the rota
  const many = assignDivisionDuties(s, parseDivisionDuties("Gate: 10").duties);
  if (many.unfilled.length) assert.match(divisionsTeamSheetsHtml(s, { duties: many }), /no team free/);
  // hostile team names are escaped
  const evil = build({ divisions: [{ name: "D<1>", teams: ["<img src=x onerror=alert(1)>", "B", "C", "D"] }] });
  const eh = divisionsTeamSheetsHtml(evil);
  assert.ok(!eh.includes("<img src=x"), "team name escaped");
});
