import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, carryOver, lowCarryOverRounds, circleOpp, assignVenues, venueCost } from "./carryover.mjs";
import { roundRobin, buildSchedule, validateSchedule, countBreaks, readSpec, encodeFields, decodeFields } from "./calc.mjs";

const teams = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

function checkRoundRobin(rounds, n) {
  const seen = new Map();
  for (const r of rounds) {
    const used = new Set();
    for (const [h, a] of r.matches) {
      assert.ok(h !== a && h < n && a < n && h >= 0 && a >= 0);
      assert.ok(!used.has(h) && !used.has(a), "a team plays twice in a round");
      used.add(h); used.add(a);
      const k = Math.min(h, a) * 100 + Math.max(h, a);
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  assert.equal(seen.size, (n * (n - 1)) / 2, "every pair meets");
  for (const c of seen.values()) assert.equal(c, 1, "no pair meets twice");
}

test("hand-worked carry-over: 4 teams, circle method", () => {
  // circle rounds for 4: (0-3, 1-2), (1-3, 2-0), (2-3, 0-1); opponents in order:
  // 0: 3,2,1  1: 2,3,0  2: 1,0,3  3: 0,1,2 -> pairs 3>2,2>1, 2>3,3>0, 1>0,0>3, 0>1,1>2
  const opp = [[3, 2, 1], [2, 3, 0], [1, 0, 3], [0, 1, 2]];
  const r = carryOverFromOpponents(opp);
  assert.equal(r.total, 8);
  assert.equal(r.value, 8); // eight different cells, each 1
  assert.equal(r.max, 1);
  const c = carryOverFromOpponents(opp, { cyclic: true });
  assert.equal(c.total, 12);
  assert.equal(c.value, 12); // Russell's bound n(n-1) is met for n = 4
});

test("carryOver of a built schedule matches the opponents form", () => {
  const s = buildSchedule(readSpec({ teams: teams(6).join("\n"), start: "2026-01-05", weekdays: ["Mon"] }).spec);
  const v = carryOver(s);
  assert.equal(v.value, s.stats.carryOver.value);
  assert.equal(v.total, 6 * 4); // each of 6 teams has 5 games, 4 steps
});

test("circle method values (cyclic) and the exhaustive K6 optimum", () => {
  const val = (n, cyclic) => carryOverFromOpponents(roundRobin(n).reduce((o, r) => { for (const [h, a] of r.matches) { o[h].push(a); o[a].push(h); } return o; }, Array.from({ length: n }, () => [])), { cyclic }).value;
  assert.equal(val(6, true), 60);
  assert.equal(val(8, true), 196);
  // every ordered 1-factorization of K6 (720 of them): the least cyclic value is 60, non-cyclic 42
  const N = 6, pms = [];
  (function rec(left, cur) { if (!left.length) { pms.push(cur.slice()); return; } for (let k = 1; k < left.length; k++) rec(left.filter((_, i) => i !== 0 && i !== k), [...cur, [left[0], left[k]]]); })([0, 1, 2, 3, 4, 5], []);
  let best = { true: Infinity, false: Infinity }, count = 0;
  const used = new Set();
  (function rec(seq) {
    if (seq.length === N - 1) {
      count++;
      const opp = Array.from({ length: N }, () => []);
      for (const m of seq) for (const [a, b] of m) { opp[a].push(b); opp[b].push(a); }
      for (const cyc of [true, false]) best[cyc] = Math.min(best[cyc], carryOverFromOpponents(opp, { cyclic: cyc }).value);
      return;
    }
    for (const m of pms) {
      if (m.some(([a, b]) => used.has(a * N + b))) continue;
      m.forEach(([a, b]) => used.add(a * N + b)); seq.push(m); rec(seq); seq.pop(); m.forEach(([a, b]) => used.delete(a * N + b));
    }
  })([]);
  assert.equal(count, 720);
  assert.equal(best.true, 60);
  assert.equal(best.false, 42);
  const r = lowCarryOverRounds(6, { cyclic: true });
  assert.equal(r.coe, 60, "the search reaches the K6 optimum");
});

test("search reaches Russell's bound for 8 teams and is a valid round robin", () => {
  const r = lowCarryOverRounds(8, { cyclic: true });
  assert.equal(r.coe, 56); // n(n-1): every carry-over cell 0 or 1
  assert.equal(r.lowerBound, 56);
  checkRoundRobin(r.rounds, 8);
});

test("search is valid, seeded and far below the circle method for 5 to 20 teams", () => {
  for (const n of [5, 7, 9, 10, 12, 15, 16, 20]) {
    const r = lowCarryOverRounds(n, { seed: 3, effort: 0.3 });
    checkRoundRobin(r.rounds, n);
    assert.ok(r.coe <= (n >= 7 ? r.circleCoe / 2 : r.circleCoe - 1), `${n}: ${r.coe} vs circle ${r.circleCoe}`);
    assert.ok(r.coe >= r.lowerBound);
    if (n % 2) for (let t = 0; t < n; t++) assert.equal(r.rounds.filter((x) => x.bye === t).length, 1, "one bye each");
    const again = lowCarryOverRounds(n, { seed: 3, effort: 0.3 });
    assert.deepEqual(again.rounds, r.rounds);
  }
});

test("venue search: zero breaks, balanced, on an odd circle timetable (the old single-flip search left 46 at 19 teams)", () => {
  for (const n of [5, 7, 9, 11, 15, 19, 21]) {
    const opp = circleOpp(n + 1);
    assert.equal(venueCost(assignVenues(opp, n, 1), opp, n), 0, `${n} teams`);
  }
  const opp = circleOpp(20);
  assert.ok(venueCost(assignVenues(opp, 19, 1, 8, { legacy: true }), opp, 19) > 0, "the legacy search does not find it");
});

test("venue search is never worse than the legacy single-flip search on the same seed", () => {
  for (const n of [7, 10, 11, 14, 15]) for (const seed of [1, 2]) {
    const lo = lowCarryOverRounds(n, { seed, effort: 0.2 });
    const N = n % 2 ? n + 1 : n;
    const opp = lo.rounds.map((r) => {
      const o = new Int16Array(N);
      for (const [a, b] of r.matches) { o[a] = b; o[b] = a; }
      if (r.bye != null) { o[r.bye] = n; o[n] = r.bye; }
      return o;
    });
    const now = venueCost(assignVenues(opp, n, seed), opp, n);
    const before = venueCost(assignVenues(opp, n, seed, 8, { legacy: true }), opp, n);
    assert.ok(now <= before, `${n} teams seed ${seed}: ${now} vs ${before}`);
  }
});

test("venue search finds the minimum n - 2 breaks on the circle timetable", () => {
  for (const n of [6, 8, 10, 12, 16, 20]) {
    const opp = circleOpp(n);
    const v = assignVenues(opp, n, 1);
    assert.equal(venueCost(v, opp, n), n - 2, `${n} teams`);
  }
});

test("buildSchedule with carryOver: validator passes, carry-over drops, share link keeps it", () => {
  for (const [n, double] of [[10, false], [9, false], [8, true], [14, false]]) {
    const f = { teams: teams(n).join("\n"), start: "2026-01-05", weekdays: ["Mon"], double };
    const plain = buildSchedule(readSpec(f).spec);
    const low = buildSchedule(readSpec({ ...f, carryOver: true }).spec);
    const v = validateSchedule(low);
    assert.deepEqual(v.errors, [], `${n} teams: ${v.errors.join(" ")}`);
    assert.ok(low.config.carryOver);
    assert.ok(low.stats.carryOver.value < plain.stats.carryOver.value / 2, `${n}: ${low.stats.carryOver.value} vs ${plain.stats.carryOver.value}`);
    assert.equal(low.stats.totalBreaks, countBreaks(low).reduce((a, b) => a + b, 0));
  }
  const back = decodeFields(encodeFields({ teams: "A\nB\nC\nD", carryOver: true }));
  assert.equal(back.carryOver, true);
  assert.equal(decodeFields(encodeFields({ teams: "A\nB" })).carryOver, false);
});

test("the carry-over guide's numbers come from the code and the real fixture data", async () => {
  const { readFileSync } = await import("node:fs");
  const name = "how-to-balance-carry-over-in-a-round-robin.html";
  const html = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
  assert.match(html, /No warranty/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  // worked example: circle method, 8 teams; Lions = team 5, Hawks = team 0
  const wrapped = { teams: teams(8), rounds: roundRobin(8) };
  const c = carryOver(wrapped);
  assert.equal(c.matrix[5][0], 5);
  assert.equal(c.max, 5);
  assert.equal(c.pairs, 7);
  assert.equal(c.value, 148);
  assert.ok(html.includes("<td>148</td>") && html.includes("5 of the Hawks' 7 opponents"));
  const low = lowCarryOverRounds(8);
  const lc = carryOver({ teams: teams(8), rounds: low.rounds });
  assert.equal(lc.value, 48);
  assert.equal(lc.max, 1);
  const home = Array(8).fill(0);
  for (const r of low.rounds) for (const [h] of r.matches) home[h]++;
  for (const h of home) assert.ok(h === 3 || h === 4);
  assert.ok(html.includes("a carry-over value of 48"));
  // the field construction paragraph: 16 teams, single and home-and-away, at the floor
  const f16 = lowCarryOverRounds(16, { effort: 0.2 });
  assert.equal(f16.coe, f16.lowerBound);
  assert.ok(html.includes(`a value of ${f16.coe}`));
  const c16 = lowCarryOverRounds(16, { field: false });
  assert.ok(html.includes(`stopped at ${c16.coe}`));
  // real fixture table
  const { run } = await import("./eval/carryover-real.mjs");
  const rows = run();
  const fmt = (v) => v.toLocaleString("en-US");
  const range = (rs, k) => [Math.min(...rs.map((r) => r[k])), Math.max(...rs.map((r) => r[k]))];
  const de = rows.filter((r) => r.key.startsWith("de."));
  const [deLo, deHi] = range(de, "plannedCoe");
  assert.ok(html.includes(`${fmt(deLo)} to ${fmt(deHi)}`));
  assert.ok(de.every((r) => r.plannedBreaks === 48));
  const twenty = rows.filter((r) => r.teams === 20);
  const [tLo, tHi] = range(twenty, "plannedCoe");
  const [bLo, bHi] = range(twenty, "plannedBreaks");
  assert.ok(html.includes(`${fmt(tLo)} to ${fmt(tHi)}`) && html.includes(`${bLo} to ${bHi}`));
  const r18 = rows.find((r) => r.teams === 18), r20 = twenty[0];
  for (const r of [r18, r20]) {
    assert.ok(html.includes(`<td>${fmt(r.circle)}</td><td>${r.circleBreaks}</td>`), `circle ${r.teams}`);
    assert.ok(html.includes(`<td>${fmt(r.balanced)}</td><td>${r.balancedBreaks}</td>`), `tool ${r.teams}`);
    assert.ok(html.includes(`<td>${fmt(r.whole)}</td><td>${r.wholeBreaks}</td>`), `whole season ${r.teams}`);
    assert.ok(r.whole <= r.balanced);
  }
  // 18 teams: searching the second half beats the mirror; 20 teams: the mirror is the floor
  assert.ok(r18.whole < r18.balanced);
  assert.ok(html.includes(`from ${fmt(r18.balanced)} to ${fmt(r18.whole)}`) && html.includes(`(${r18.wholeBreaks})`));
  assert.equal(r20.whole, r20.doubleLowerBound);
  assert.ok(html.includes(`scores ${fmt(r20.whole)} with ${r20.wholeBreaks} breaks`));
  // the starter paragraph: 20 teams at the floor, against the circle start
  const s20 = lowCarryOverRounds(20, { effort: 0.2 });
  assert.equal(s20.coe, s20.lowerBound);
  assert.ok(html.includes(`a value of ${s20.coe}, where the search from the circle method stopped at ${lowCarryOverRounds(20, { field: false }).coe}`));
  const s22 = lowCarryOverRounds(22, { effort: 0.2 });
  assert.equal(s22.coe, s22.lowerBound);
  assert.ok(html.includes(`at 22 teams a value of ${s22.coe}, where it stopped at ${lowCarryOverRounds(22, { field: false }).coe}`));
  // 20 teams, whole season: below every professional 20-team season, breaks inside their range
  assert.ok(r20.whole < tLo && r20.wholeBreaks >= bLo && r20.wholeBreaks <= bHi);
  assert.ok(html.includes(`${fmt(r20.whole)} with ${r20.wholeBreaks} breaks, below every one of the 14 professional 20-team seasons (inside their ${bLo} to ${bHi} breaks)`));
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /how-to-balance-carry-over-in-a-round-robin\.html/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\/how-to-balance-carry-over-in-a-round-robin\.html"/);
});

test("double round robin searched as a whole: valid legs, return games reversed, below mirrored", async () => {
  const { lowCarryOverDoubleRounds } = await import("./carryover.mjs");
  for (const [n, bw] of [[6, 0], [7, 10], [8, 0], [9, 10], [12, 10], [16, 10]]) {
    const r = lowCarryOverDoubleRounds(n, { seed: 2, effort: 0.3, breakWeight: bw });
    const R = n % 2 ? n : n - 1;
    assert.equal(r.rounds.length, 2 * R);
    const leg0 = r.rounds.slice(0, R), leg1 = r.rounds.slice(R);
    assert.ok(leg0.every((x) => x.leg === 0) && leg1.every((x) => x.leg === 1));
    checkRoundRobin(leg0, n);
    checkRoundRobin(leg1, n);
    // the return game is at the other ground, so every team has n - 1 home games
    const host = new Map();
    for (const x of leg0) for (const [h, a] of x.matches) host.set(`${h},${a}`, 1);
    for (const x of leg1) for (const [h, a] of x.matches) assert.ok(host.has(`${a},${h}`), `${n}: ${a}-${h} reversed`);
    const home = Array(n).fill(0);
    for (const x of r.rounds) for (const [h] of x.matches) home[h]++;
    assert.ok(home.every((h) => h === n - 1));
    // nobody meets the same side twice running, nobody sits out twice running
    assert.equal(r.repeats, 0);
    const c = carryOver({ teams: teams(n), rounds: r.rounds });
    assert.equal(c.value, r.coe);
    assert.equal(c.repeats, 0);
    assert.ok(r.coe >= r.lowerBound);
    // at a power of two (16) leg one is the field timetable, and its mirror is already at the floor
    // (the halfway step supplies each team's missing cyclic step), so it can only be matched
    const strict = n >= 12 && r.mirroredCoe > r.lowerBound;
    assert.ok(strict ? r.coe < r.mirroredCoe : r.coe <= r.mirroredCoe, `${n}: ${r.coe} vs mirrored ${r.mirroredCoe}`);
    assert.deepEqual(lowCarryOverDoubleRounds(n, { seed: 2, effort: 0.3, breakWeight: bw }).rounds, r.rounds, "seeded");
  }
  // 8 teams, carry-over only: reaches the floor for a double round robin with no repeats
  assert.equal(lowCarryOverDoubleRounds(8).coe, 200);
});

test("lower bound counts the diagonal only when a schedule meets a side twice running", () => {
  // 3 teams, team 0 plays 1, 1, 2: c[1][1] = 1
  const r = carryOverFromOpponents([[1, 1, 2], [0, 0, 2], [0, 1]]);
  assert.equal(r.repeats, 2);
  assert.equal(r.total, 5);
  assert.equal(r.lowerBound, 5); // 5 steps over 9 cells (the diagonal counts), all ones
  assert.equal(carryOverFromOpponents([[1, 2], [0, 2], [0, 1]]).repeats, 0);
});
