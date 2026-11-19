import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS, EXAMPLE, parseSlots, parsePlayers, buildContext, buildLineup, lineupCost, validateLineup,
  lineupText, lineupCsv, carryOverText, playerMessages, encodeSetup, decodeSetup, periodTable, minPlayCheck, minPlayWarning,
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
  // Every cell names a player, the first-listed one (index 0) included.
  for (const [t, row] of periodTable(r).entries()) row.forEach((c, s) => assert.equal(c.player, r.grid[t][s] >= 0 ? r.playerNames[r.grid[t][s]] : null));
  assert.ok(periodTable(r).flat().some((c) => c.player === r.playerNames[0]), "player 0 appears in the table");
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

test("minimum-play rule: even lineups pass, a squeezed child is named", () => {
  const even = buildLineup(make("GK, DEF x2, MID x2, FWD x2", names(10), 4));
  assert.deepEqual(minPlayCheck(even, 0.5), []);
  assert.deepEqual(minPlayCheck(even, 0), []);
  // A played 1 of 4 periods: short of half; C is only there for 1 period; D is absent.
  const tight = { periods: 4, stats: [
    { name: "A", played: 1, avail: 4 }, { name: "B", played: 4, avail: 4 }, { name: "C", played: 1, avail: 1 }, { name: "D", played: 0, avail: 0 },
  ] };
  const short = minPlayCheck(tight, 0.5);
  assert.deepEqual(short.map((x) => x.name), ["A"]);
  assert.equal(short[0].need, 2);
  assert.match(minPlayWarning(short, 0.5), /A \(1 of 2 periods\)/);
  assert.equal(minPlayWarning([], 0.5), null);
});

test("minimum-play never asks a late arrival for more than they can play", () => {
  const r = { periods: 4, stats: [{ name: "L", played: 1, avail: 1 }] };
  assert.deepEqual(minPlayCheck(r, 1), []);
});

// The plain, allocating cost function lineupCost replaced (2026-11-18). The
// scratch-array version must give the same number, bit for bit, on any grid,
// because the annealer's accept/reject decisions compare these totals.
function plainCost(ctx, grid) {
  const { players, periods, names } = ctx;
  const N = players.length;
  const S = ctx.slotNames.length;
  let cost = 0;
  const played = new Array(N).fill(0);
  const onField = Array.from({ length: periods }, () => new Array(N).fill(false));
  const count = Array.from({ length: N }, () => new Array(names.length).fill(0));
  const strength = new Array(periods).fill(0);
  const last = new Array(N).fill(-1);
  for (let t = 0; t < periods; t++) {
    for (let s = 0; s < S; s++) {
      const p = grid[t][s];
      if (p < 0) { cost += 1e6; continue; }
      played[p]++;
      onField[t][p] = true;
      count[p][ctx.nameOf[s]]++;
      strength[t] += players[p].skill;
      if (last[p] === ctx.nameOf[s] && onField[t - 1]?.[p]) cost += 15;
    }
    for (let p = 0; p < N; p++) last[p] = -1;
    for (let s = 0; s < S; s++) if (grid[t][s] >= 0) last[grid[t][s]] = ctx.nameOf[s];
  }
  for (let p = 0; p < N; p++) {
    let avail = 0;
    let run = 0;
    for (let t = 0; t < periods; t++) {
      if (!ctx.avail[p][t]) { run = 0; continue; }
      avail++;
      if (!onField[t][p]) { if (run > 0) cost += 400; run++; } else run = 0;
    }
    const eff = avail - played[p] + 0.5 * players[p].sat;
    cost += 100 * eff * eff;
    for (let n = 0; n < names.length; n++) {
      const c = count[p][n];
      cost += 10 * c * c;
      if (ctx.isKeeper[n] && c > ctx.keeperMax) cost += 3000 * (c - ctx.keeperMax);
    }
  }
  if (ctx.balance > 0) {
    const mean = strength.reduce((a, b) => a + b, 0) / periods;
    for (const v of strength) cost += 8 * ctx.balance * (v - mean) ** 2;
  }
  return cost;
}

test("lineupCost matches the plain cost function exactly on random grids", () => {
  let a = 12345;
  const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
  const cases = [
    ["GK, DEF x2, MID x2, FWD x2", EXAMPLE.players, 4, {}],
    ["G, D x2, C, W x2", "A | skill: 2.5 | sat: 1.5\nB | sat: 3\nC | late: 1\nD | leaves: 2\nE\nF | skill: 5\nG | not: G\nH", 3, { balance: 2, keeperMax: 2 }],
    ["Setter, Outside x2, Middle x2, Opposite", names(7), 3, { balance: 0 }],
    ["GK, DEF x2, FWD x2", names(12), 6, {}],
  ];
  // One context per case and repeated calls on it, so the reused scratch
  // arrays are exercised, including after a different-sized context ran.
  for (let round = 0; round < 2; round++) for (const [slotsText, roster, periods, extra] of cases) {
    const spec = make(slotsText, roster, periods, extra);
    const ctx = buildContext(spec.players, spec.slotNames, periods, extra);
    for (let k = 0; k < 300; k++) {
      const grid = Array.from({ length: periods }, () => spec.slotNames.map(() => (rnd() < 0.1 ? -1 : Math.floor(rnd() * spec.players.length))));
      assert.equal(lineupCost(ctx, grid), plainCost(ctx, grid));
    }
    const r = buildLineup({ ...spec, seed: 4, iterations: 2000, restarts: 2 });
    assert.equal(lineupCost(ctx, r.grid), plainCost(ctx, r.grid));
  }
});

test("a child whose leaves: is not after late: is reported, not silently benched all game", () => {
  const { slots } = parseSlots("GK, DEF x2");
  const r = parsePlayers("Ana | late: 3 | leaves: 1\nBen\nCy\nDee", slots, 4);
  assert.ok(r.errors.some((e) => e.startsWith("Ana:") && /no period/.test(e)), r.errors.join("; "));
  assert.ok(parsePlayers("Ana | late: 4\nBen\nCy", slots, 4).errors.some((e) => e.startsWith("Ana:")));
  assert.deepEqual(parsePlayers("Ana | late: 1 | leaves: 2\nBen\nCy", slots, 4).errors, []);
});

test("CSV cells a spreadsheet would run as a formula are neutralised", () => {
  const spec = make("GK, DEF", "=HYPERLINK(\"http://x\")\n+1+cmd\n@SUM(A1)\n-2+3\nBea", 2);
  const csv = lineupCsv(buildLineup(spec)).split("\n").slice(1);
  for (const line of csv) assert.doesNotMatch(line, /^"?[=+\-@]/, line);
  assert.ok(csv.some((l) => l.startsWith("\"'=HYPERLINK")), csv.join("\n"));
});

test("late floors to whole periods and late: 0 means there from the start (redteam 2026-11-19)", () => {
  const { slots } = parseSlots("A, B");
  const r = parsePlayers("p | late: 0\nq | late: 0.9\nr | late: 1.9\ns | late: -2", slots, 3);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.players.map((p) => p.late), [0, 0, 1, 0]);
});

test("unfilled positions name the 1-based period they are in (redteam 2026-11-19)", () => {
  const r = buildLineup(make("GK, DEF", "A | not: DEF\nB | not: DEF", 2, { seed: 1 }));
  assert.deepEqual(r.unfilled.map((u) => [u.period, u.position]), [[1, "DEF"], [2, "DEF"]]);
  assert.match(r.warnings[0], /DEF in period 1, DEF in period 2/);
});

test("minPlayWarning shows the rule as a percentage (redteam 2026-11-19)", () => {
  const short = [{ name: "A", played: 1, need: 2, avail: 4 }];
  assert.match(minPlayWarning(short, 0.5), /^Minimum play of 50% /);
  assert.match(minPlayWarning(short, "0.75"), /^Minimum play of 75% /);
});

test("a child allowed in no position is an error, not a silent full game on the bench (redteam 2026-11-19)", () => {
  const { slots } = parseSlots("GK, DEF x2");
  // An empty "can:" used to read as "can play nothing": Ann sat all game with only a sits-twice warning.
  const empty = parsePlayers("Ann | can:\nBob\nCy", slots, 4);
  assert.equal(empty.errors.length, 1);
  assert.match(empty.errors[0], /^Ann: no position/);
  const all = parsePlayers("Ann | not: GK, DEF\nBob\nCy", slots, 4);
  assert.match(all.errors[0], /^Ann: no position/);
  const clash = parsePlayers("Ann | can: GK | not: GK\nBob\nCy", slots, 4);
  assert.match(clash.errors[0], /^Ann: no position/);
  assert.deepEqual(parsePlayers("Ann | can: GK | not: DEF\nBob", slots, 4).errors, []);
});
