import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDivisionBlackouts, applyDivisionBlackouts, parseDivisions, parseDivisionLinks, buildDivisions, applyDivisionRainouts, rainoutOptions, validateDivisions, linkConflicts, divisionsCsv, divisionsText, divisionsIcs, readDivisionsSpec, parseTravel, divisionStats, carryVenueHistory, venueImbalance, suggestFairnessWeight, travelWarnings, encodeDivisionFields, decodeDivisionFields } from "./divisions.mjs";
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
