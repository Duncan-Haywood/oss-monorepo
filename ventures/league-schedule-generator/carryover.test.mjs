import test from "node:test";
import assert from "node:assert/strict";
import { carryOverFromOpponents, carryOver, lowCarryOverRounds, lowCarryOverDouble, circleOpp, assignVenues, venueCost } from "./carryover.mjs";
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
    assert.ok(html.includes(`<td>${fmt(r.whole)}</td><td>${r.wholeBreaks}</td>`), `whole ${r.teams}`);
    assert.ok(r.whole < r.balanced && r.whole < Math.min(...rows.filter((x) => x.teams === r.teams).map((x) => x.plannedCoe)));
  }
  assert.ok(html.includes(`scores ${fmt(r20.whole)} with ${r20.wholeBreaks} breaks`));
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /how-to-balance-carry-over-in-a-round-robin\.html/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\/how-to-balance-carry-over-in-a-round-robin\.html"/);
});

function checkDouble(rounds, n) {
  const N = n % 2 ? n + 1 : n, R = N - 1;
  assert.equal(rounds.length, 2 * R);
  for (const half of [rounds.slice(0, R), rounds.slice(R)]) checkRoundRobin(half, n);
  const ground = new Map();
  for (const r of rounds) for (const [h, a] of r.matches) {
    const k = `${h}>${a}`;
    assert.ok(!ground.has(k), `${k} at the same ground twice`);
    ground.set(k, 1);
  }
  assert.equal(ground.size, n * (n - 1), "each pair once at each ground");
  const last = Array(n).fill(-1);
  for (const r of rounds) {
    const now = Array(n).fill(-1);
    for (const [h, a] of r.matches) { now[h] = a; now[a] = h; }
    for (let t = 0; t < n; t++) assert.ok(now[t] < 0 || now[t] !== last[t], "same opponent in consecutive games");
    for (let t = 0; t < n; t++) if (now[t] >= 0) last[t] = now[t];
  }
  assert.deepEqual(rounds.map((r) => r.leg), [...Array(R).fill(0), ...Array(R).fill(1)]);
}

test("double round robin searched as a whole: valid, phased, never worse than mirroring, seeded", () => {
  for (const n of [4, 5, 6, 7, 9, 12]) {
    const d = lowCarryOverDouble(n, { seed: 3 });
    checkDouble(d.rounds, n);
    const c = carryOver({ teams: teams(n), rounds: d.rounds });
    assert.equal(c.value, d.coe);
    assert.ok(d.coe <= d.mirroredCoe, `${n}: ${d.coe} vs mirrored ${d.mirroredCoe}`);
    assert.ok(d.coe >= d.lowerBound);
    assert.equal(d.backToBack, 0);
    const home = Array(n).fill(0);
    for (const r of d.rounds) for (const [h] of r.matches) home[h]++;
    assert.ok(home.every((h) => h === n - 1), "home and away equal");
  }
  assert.deepEqual(lowCarryOverDouble(10, { seed: 5 }).rounds, lowCarryOverDouble(10, { seed: 5 }).rounds);
});

test("whole-season search beats mirroring the searched half by a margin at 18 teams", () => {
  const d = lowCarryOverDouble(18, { seed: 1, breakWeight: 10 });
  checkDouble(d.rounds, 18);
  const half = lowCarryOverRounds(18, { seed: 1, breakWeight: 10 }).rounds;
  const mirrored = [...half, ...half.map((r) => ({ ...r, matches: r.matches.map(([h, a]) => [a, h]) }))];
  const m = carryOver({ teams: teams(18), rounds: mirrored }).value;
  assert.ok(d.coe < 0.85 * m, `${d.coe} vs ${m}`);
});

test("buildSchedule double with carryOver uses the whole-season search", () => {
  const f = { teams: teams(10).join("\n"), start: "2026-01-05", weekdays: ["Mon"], double: true, carryOver: true };
  const s = buildSchedule(readSpec(f).spec);
  assert.deepEqual(validateSchedule(s).errors, []);
  const d = lowCarryOverDouble(10, { seed: 1, breakWeight: 10 });
  assert.equal(s.stats.carryOver.value, d.coe);
  assert.ok(s.stats.carryOver.value <= d.mirroredCoe);
});
