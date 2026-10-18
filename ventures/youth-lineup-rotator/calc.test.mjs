import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS, EXAMPLE, parseSlots, parsePlayers, buildContext, buildLineup, lineupCost, validateLineup,
  lineupText, lineupCsv, carryOverText, playerMessages, encodeSetup, decodeSetup, periodTable,
} from "./calc.mjs";

const make = (slotsText, playersText, periods, extra = {}) => {
  const { slots } = parseSlots(slotsText);
  const { players, errors } = parsePlayers(playersText, slots, periods);
  assert.deepEqual(errors, []);
  return { players, slotNames: slots, periods, ...extra };
};
const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`).join("\n");

test("parseSlots expands counts in both spellings and rejects nonsense", () => {
  assert.deepEqual(parseSlots("GK, DEF x2, 2 MID").slots, ["GK", "DEF", "DEF", "MID", "MID"]);
  // A position that merely ends in "x" is a name, not a count.
  assert.deepEqual(parseSlots("Flex2, Flex x2, Mix 2, DEF×2").slots, ["Flex2", "Flex", "Flex", "Mix 2", "DEF", "DEF"]);
  assert.ok(parseSlots("").errors.length);
  assert.ok(parseSlots("DEF x0").errors.length);
  for (const p of Object.values(PRESETS)) assert.ok(parseSlots(p.slots).slots.length >= 5, p.label);
});

test("parsePlayers reads settings and reports bad ones by name", () => {
  const { slots } = parseSlots("GK, DEF x2");
  const r = parsePlayers("Ana | skill: 9 | can: gk, def | late: 1 | sat: 2\nBen | not: FWD | speed: 3\nAna", slots, 4);
  assert.equal(r.players[0].skill, 5);
  assert.deepEqual([...r.players[0].can], ["GK", "DEF"]);
  assert.equal(r.players[0].late, 1);
  assert.equal(r.players[0].sat, 2);
  assert.ok(r.errors.some((e) => /FWD.*not a position/.test(e)));
  assert.ok(r.errors.some((e) => /unknown setting "speed"/.test(e)));
  assert.ok(r.errors.some((e) => /Ana is listed twice/.test(e)));
  assert.equal(parsePlayers("Ann, Ben, Cy", slots, 4).players.length, 3);
});

test("with no restrictions everyone plays within one period of everyone else", () => {
  for (const [n, slots, periods] of [[10, "GK, DEF x2, MID x2, FWD x2", 4], [12, "GK, DEF x2, MID x2, FWD x2", 4], [9, "Guard x2, Wing x2, Post", 4], [13, "G, D x3, M x3, A x3", 4], [8, "GK, DEF x2, FWD x2", 3]]) {
    const spec = make(slots, names(n), periods, { seed: 5 });
    const r = buildLineup(spec);
    assert.deepEqual(validateLineup(buildContext(spec.players, spec.slotNames, periods), r.grid), []);
    assert.ok(r.spread <= 1, `${n} players ${slots}: spread ${r.spread}`);
    assert.equal(r.unfilled.length, 0);
  }
});

test("nobody sits twice in a row when it can be avoided", () => {
  for (const n of [9, 10, 11, 12]) {
    const r = buildLineup(make("GK, DEF x2, MID x2, FWD x2", names(n), 4, { seed: 2 }));
    assert.ok(r.stats.every((s) => s.maxBenchRun <= 1), `${n} players: ${r.stats.map((s) => s.slots.join("/")).join(" | ")}`);
  }
});

test("hard rules hold: availability, allowed positions, no double booking", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", [
    "A | can: GK", "B | not: GK", "C | late: 2", "D | leaves: 2", "E | can: DEF, MID", "F", "G", "H | not: FWD", "I", "J | skill: 5", "K | skill: 1",
  ].join("\n"), 4, { seed: 9 });
  const r = buildLineup(spec);
  const ctx = buildContext(spec.players, spec.slotNames, 4);
  assert.deepEqual(validateLineup(ctx, r.grid), []);
  assert.equal(r.stats[2].slots[0], null);
  assert.equal(r.stats[3].slots[3], null);
  assert.ok(r.stats[0].slots.every((x) => x === null || x === "bench" || x === "GK"));
});

test("the keeper job is shared when enough players are allowed to take it", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", names(10), 4, { seed: 4 });
  const r = buildLineup(spec);
  const keepers = r.stats.map((s) => s.positions.GK || 0);
  assert.ok(keepers.every((c) => c <= 1), keepers.join());
  assert.equal(keepers.reduce((a, b) => a + b, 0), 4);
  // Only two allowed in goal for four periods: the cap must give way, with a warning.
  const tight = make("GK, DEF x2, MID x2, FWD x2", ["A | can: GK", "B | can: GK", ...names(8).split("\n").map((n) => `${n} | not: GK`)].join("\n"), 4, { seed: 4 });
  const r2 = buildLineup(tight);
  assert.equal(r2.unfilled.length, 0);
  assert.ok(r2.warnings.some((w) => /must play GK more than 1/.test(w)));
});

test("a kid who sat last game gets priority to play this game", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", Array.from({ length: 10 }, (_, i) => `P${i + 1}${i === 0 ? " | sat: 3" : ""}`).join("\n"), 4, { seed: 6 });
  const r = buildLineup(spec);
  assert.equal(r.stats[0].played, 4, "P1 sat three last game so plays every period");
});

test("a short roster reports unfilled positions instead of faking a lineup", () => {
  const r = buildLineup(make("GK, DEF x2, MID x2, FWD x2", names(5), 2, { seed: 1 }));
  assert.equal(r.unfilled.length, 4);
  assert.match(r.warnings[0], /could not be filled/);
});

test("strength balance evens out the periods when skills differ", () => {
  const rows = ["S1 | skill: 5", "S2 | skill: 5", "S3 | skill: 5", "S4 | skill: 5", "W1 | skill: 1", "W2 | skill: 1", "W3 | skill: 1", "W4 | skill: 1"];
  const slots = "A x2, B x2";
  const on = buildLineup(make(slots, rows.join("\n"), 4, { seed: 3, balance: 1 }));
  const off = buildLineup(make(slots, rows.join("\n"), 4, { seed: 3, balance: 0 }));
  const range = (a) => Math.max(...a) - Math.min(...a);
  assert.ok(range(on.strength) <= range(off.strength));
  assert.equal(range(on.strength), 0);
});

test("the search finds the best lineup that exhaustive search finds on tiny problems", () => {
  const cases = [
    make("A, B", ["p | can: A", "q", "r", "s | not: A"].join("\n"), 3, { seed: 1 }),
    make("A, B", ["p", "q | late: 1", "r | sat: 1", "s | skill: 5"].join("\n"), 3, { seed: 2 }),
  ];
  for (const spec of cases) {
    const ctx = buildContext(spec.players, spec.slotNames, spec.periods);
    const N = spec.players.length;
    const S = spec.slotNames.length;
    const rows = [];
    const rec = (row) => {
      if (row.length === S) { rows.push(row.slice()); return; }
      for (let p = -1; p < N; p++) { if (p >= 0 && row.includes(p)) continue; row.push(p); rec(row); row.pop(); }
    };
    rec([]);
    let best = Infinity;
    const walk = (grid) => {
      if (grid.length === spec.periods) { if (!validateLineup(ctx, grid).length) best = Math.min(best, lineupCost(ctx, grid)); return; }
      for (const row of rows) walk([...grid, row]);
    };
    walk([]);
    const r = buildLineup(spec);
    assert.equal(r.cost, best);
  }
});

test("same seed, same lineup; different seeds are still valid", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", EXAMPLE.players, 4);
  const a = buildLineup({ ...spec, seed: 7 });
  const b = buildLineup({ ...spec, seed: 7 });
  assert.deepEqual(a.grid, b.grid);
  const ctx = buildContext(spec.players, spec.slotNames, 4);
  assert.deepEqual(validateLineup(ctx, buildLineup({ ...spec, seed: 8 }).grid), []);
});

test("exports agree with the lineup", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", EXAMPLE.players, 4, { seed: 3 });
  const r = buildLineup(spec);
  const text = lineupText(r, { minutes: 12, title: "Sat game" });
  assert.match(text, /^Sat game\nPeriod 1: GK /);
  for (const s of r.stats) assert.ok(text.includes(`${s.name}: ${s.played} of ${s.avail} periods, ${s.played * 12} min`), s.name);
  const csv = lineupCsv(r).split("\n");
  assert.equal(csv.length, spec.players.length + 1);
  assert.equal(csv[0], "Player,Period 1,Period 2,Period 3,Period 4,Played,Available");
  assert.equal(playerMessages(r, { minutes: 12 }).length, spec.players.length);
  assert.equal(periodTable(r).length, 4);
  for (let t = 1; t < 4; t++) {
    const sub = r.subs[t - 1];
    assert.equal(sub.on.length, sub.off.length, `period ${t + 1}: as many come on as go off`);
  }
});

test("carry-over lines feed straight back in and raise next game's priority", () => {
  const spec = make("GK, DEF x2, MID x2, FWD x2", names(10), 4, { seed: 3 });
  const r = buildLineup(spec);
  const next = carryOverText(spec.players, r);
  const again = parsePlayers(next, spec.slotNames, 4);
  assert.deepEqual(again.errors, []);
  r.stats.forEach((s, i) => assert.equal(again.players[i].sat, s.bench));
  const r2 = buildLineup({ ...spec, players: again.players, seed: 3 });
  const satMost = Math.max(...r.stats.map((s) => s.bench));
  r.stats.forEach((s, i) => { if (s.bench === satMost) assert.ok(r2.stats[i].played >= r.stats[i].played, s.name); });
});

test("setup links round-trip, including non-ASCII names, and reject junk", () => {
  const setup = { preset: "soccer7", players: "Zoë | skill: 4\nJosé", periods: 4 };
  assert.deepEqual(decodeSetup(encodeSetup(setup)).setup, setup);
  assert.ok(decodeSetup("%%%").error);
  assert.ok(decodeSetup(encodeSetup({ nope: 1 })).error);
});
