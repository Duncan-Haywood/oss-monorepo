import { test } from "node:test";
import assert from "node:assert/strict";
import { bowlingSchedule, laneReport, validateBowling, hungarian, bowlingCsv, bowlingText, parseWeekList, pairLabels, teamLaneGrid, assignLanes, offBound, boundOutOfReach, VACANCY, laneTargets, parseLaneAvoid, matchShape, avoidShapeSlots, feasibleDealing, cutRepeats, laneLimits } from "./bowling.mjs";
import { LANE_SHAPES } from "./bowling-avoid-shapes.mjs";
import { LANE_TABLE } from "./bowling-lane-table.mjs";
import { LANE_NEAR } from "./bowling-lane-near.mjs";
import { OUT_OF_REACH } from "./bowling-proofs.mjs";
import { toDay, roundRobin } from "./calc.mjs";

const START = toDay(2026, 9, 1);
const names = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);

test("hungarian finds the minimum assignment (checked against every permutation)", () => {
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 40; trial++) {
    const n = 1 + (trial % 6);
    const c = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.floor(rnd() * 20)));
    const col = hungarian(c);
    assert.equal(new Set(col).size, n);
    const got = col.reduce((s, j, i) => s + c[i][j], 0);
    const best = Math.min(...perms([...Array(n).keys()]).map((p) => p.reduce((s, j, i) => s + c[i][j], 0)));
    assert.equal(got, best);
  }
});

test("every season validates: each team once a week, each lane pair once, pairs meet evenly", () => {
  for (const n of [2, 3, 4, 5, 8, 9, 12]) for (const weeks of [1, 7, 15, 30]) {
    const s = bowlingSchedule({ teams: names(n), weeks, start: START, positionWeeks: weeks >= 15 ? [15] : [] });
    assert.deepEqual(s.errors, []);
    assert.deepEqual(validateBowling(s), [], `${n} teams ${weeks} weeks`);
    assert.equal(s.weeks.length, weeks);
  }
});

test("an odd league bowls against a Vacancy on its own pair", () => {
  const s = bowlingSchedule({ teams: names(9), weeks: 18, start: START });
  assert.equal(s.teams.length, 10);
  assert.equal(s.teams[9], VACANCY);
  assert.equal(s.nPairs, 5);
  for (const wk of s.weeks) assert.equal(wk.matches.filter((m) => m.a === 9 || m.b === 9).length, 1);
});

test("the polished season is never less even than the greedy or hand-rotated ones, and reaches the bound on common sizes", () => {
  for (const [n, weeks] of [[8, 30], [10, 33], [12, 33], [14, 30], [16, 30]]) {
    const cyc = roundRobin(n);
    const rounds = Array.from({ length: weeks }, (_, k) => cyc[k % cyc.length].matches);
    const off = (plan) => {
      const c = Array.from({ length: n }, () => new Array(n / 2).fill(0));
      for (const wk of plan) for (const [a, b, p] of wk) { c[a][p]++; c[b][p]++; }
      return c.reduce((s, row) => s + Math.max(...row) - Math.min(...row) - (weeks % (n / 2) ? 1 : 0), 0);
    };
    const pol = off(assignLanes(rounds, n, n / 2));
    assert.ok(pol <= off(assignLanes(rounds, n, n / 2, { mode: "greedy" })));
    assert.ok(pol <= off(assignLanes(rounds, n, n / 2, { mode: "rotate" })));
    const s = bowlingSchedule({ teams: names(n), weeks, start: START });
    const r = laneReport(s);
    assert.equal(r.atBound, n, `${n} teams ${weeks} weeks`);
    assert.ok(r.worstSpread <= 1);
  }
});

test("every stored SAT assignment is a permutation each week and puts every team at the bound", () => {
  for (const [key, code] of Object.entries(LANE_TABLE)) {
    const [n, weeks] = key.split(",").map(Number);
    const P = n / 2;
    assert.equal(code.length, weeks * P, key);
    const cyc = roundRobin(n);
    const plan = Array.from({ length: weeks }, (_, w) => cyc[w % cyc.length].matches.map(([a, b], m) => [a, b, parseInt(code[w * P + m], 36)]));
    for (const wk of plan) assert.equal(new Set(wk.map((m) => m[2])).size, P, key);
    assert.equal(offBound(plan, n, P), 0, key);
    // and the page uses it: the season it builds is at the bound, on any lane deal
    const rounds = plan.map((wk) => wk.map(([a, b]) => [a, b]));
    for (const seed of [1, 2]) assert.equal(offBound(assignLanes(rounds, n, P, { seed }), n, P), 0, `${key} seed ${seed}`);
  }
});

test("every stored near-bound answer is a permutation each week, as close as recorded, and the page builds no worse", () => {
  for (const [key, { off, page, code }] of Object.entries(LANE_NEAR)) {
    const [n, weeks] = key.split(",").map(Number);
    const P = n / 2;
    assert.ok(!LANE_TABLE[key], `${key} is also at the bound in LANE_TABLE`);
    assert.equal(code.length, weeks * P, key);
    assert.ok(off > 0 && off < page, key);
    const cyc = roundRobin(n);
    const plan = Array.from({ length: weeks }, (_, w) => cyc[w % cyc.length].matches.map(([a, b], m) => [a, b, parseInt(code[w * P + m], 36)]));
    for (const wk of plan) assert.equal(new Set(wk.map((m) => m[2])).size, P, key);
    assert.equal(offBound(plan, n, P), off, key);
    const rounds = plan.map((wk) => wk.map(([a, b]) => [a, b]));
    for (const seed of [1, 2]) assert.ok(offBound(assignLanes(rounds, n, P, { seed }), n, P) <= off, `${key} seed ${seed}`);
  }
});

test("the six seasons the week re-solves missed are now at the bound (walk or stored assignment)", () => {
  for (const [n, weeks] of [[10, 30], [12, 30], [16, 32], [18, 26], [20, 30], [24, 34]]) {
    const cyc = roundRobin(n);
    const rounds = Array.from({ length: weeks }, (_, k) => cyc[k % cyc.length].matches);
    assert.equal(offBound(assignLanes(rounds, n, n / 2), n, n / 2), 0, `${n} teams ${weeks} weeks`);
  }
});

test("a stale or damaged stored entry is ignored, never trusted", () => {
  const cyc = roundRobin(12);
  const rounds = Array.from({ length: 30 }, (_, k) => cyc[k % cyc.length].matches.map(([a, b]) => [b, a]).reverse());
  // reversed match order: the stored digits no longer fit these rounds, so the search runs instead
  const plan = assignLanes(rounds, 12, 6);
  for (const wk of plan) assert.equal(new Set(wk.map((m) => m[2])).size, 6);
});

test("the same input gives the same season (no clock, no Math.random)", () => {
  const a = bowlingCsv(bowlingSchedule({ teams: names(10), weeks: 30, start: START }));
  const b = bowlingCsv(bowlingSchedule({ teams: names(10), weeks: 30, start: START }));
  assert.equal(a, b);
  const c = bowlingCsv(bowlingSchedule({ teams: names(10), weeks: 30, start: START, seed: 2 }));
  assert.equal(typeof c, "string");
});

test("position rounds take a week, list places on pairs, and do not advance the round robin", () => {
  const s = bowlingSchedule({ teams: names(6), weeks: 12, start: START, positionWeeks: [6, 12] });
  const pos = s.weeks.filter((w) => w.kind === "position");
  assert.deepEqual(pos.map((w) => w.week), [6, 12]);
  assert.equal(pos[0].matches[0].a, "1st place");
  assert.equal(pos[0].matches[2].b, "6th place");
  const rr = s.weeks.filter((w) => w.kind === "round");
  assert.deepEqual(rr.map((w) => w.round), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
  assert.deepEqual(validateBowling(s), []);
});

test("skip dates push the season back a week; lane labels start where the league's lanes start", () => {
  const skip = [START + 14];
  const s = bowlingSchedule({ teams: names(4), weeks: 4, start: START, skipDays: skip, firstLane: 13 });
  assert.deepEqual(s.weeks.map((w) => w.day - START), [0, 7, 21, 28]);
  assert.deepEqual(s.skipped, skip);
  assert.deepEqual(s.labels, ["Lanes 13-14", "Lanes 15-16"]);
  assert.deepEqual(pairLabels(3, 1), ["Lanes 1-2", "Lanes 3-4", "Lanes 5-6"]);
});

test("bad input is refused with a reason", () => {
  assert.ok(bowlingSchedule({ teams: ["Solo"], weeks: 10, start: START }).errors.length);
  assert.ok(bowlingSchedule({ teams: names(4), weeks: 0, start: START }).errors.length);
  assert.ok(bowlingSchedule({ teams: names(4), weeks: 10, start: null }).errors.length);
  assert.ok(bowlingSchedule({ teams: names(4), weeks: 10, start: START, firstLane: 0 }).errors.length);
  assert.ok(bowlingSchedule({ teams: "A\nA\nB", weeks: 4, start: START }).errors.length);
  const w = parseWeekList("8, 16 x 99", 32);
  assert.deepEqual(w.weeks, [8, 16]);
  assert.equal(w.errors.length, 2);
});

test("exports: CSV rows per match with formula-safe names, text per week, a team-by-week grid", () => {
  const s = bowlingSchedule({ teams: ["=Pins", "Splits", "Gutters", "Strikers"], weeks: 3, start: START, positionWeeks: [3] });
  const csv = bowlingCsv(s).trim().split("\n");
  assert.equal(csv[0], "Week,Date,Lanes,Team,Opponent,Note");
  assert.equal(csv.length, 1 + 3 * 2);
  assert.ok(csv.some((l) => l.includes("'=Pins")));
  assert.ok(csv.at(-1).includes("Position round"));
  const txt = bowlingText(s);
  assert.match(txt, /Week 1, Tue 1 Sep 2026/);
  assert.match(txt, /\(position round\)/);
  const g = teamLaneGrid(s);
  assert.equal(g.length, 4);
  assert.equal(g[0].weeks.length, 3);
  assert.equal(g[0].weeks[2], "Pos");
  assert.match(g[0].weeks[0], /^\d+-\d+$/);
});

import { readFileSync } from "node:fs";
import { dayLabel } from "./calc.mjs";
const page = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("the bowling page's worked example matches bowlingSchedule(), its FAQ matches its JSON-LD, and it is linked and in the sitemap", () => {
  const name = "bowling-league-schedule.html";
  const html = page(name);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const teams = ["Pin Pals", "Alley Cats", "Split Happens", "Gutter Gang", "Lucky Strikes", "Ten Pin Titans", "Spare Me", "Rolling Thunder"];
  // The page's own form defaults build the same season.
  for (const t of teams) assert.ok(html.includes(t));
  assert.match(html, /id="start" type="date" value="2026-09-08"/);
  assert.match(html, /id="weeks" type="number" min="1" max="60" value="16"/);
  const s = bowlingSchedule({ teams, weeks: 16, start: toDay(2026, 9, 8), positionWeeks: [16] });
  assert.deepEqual(validateBowling(s), []);
  for (const wk of s.weeks) {
    const cells = s.labels.map((_, p) => { const m = wk.matches.find((x) => x.pair === p); return wk.kind === "round" ? `${s.teams[m.a]} v ${s.teams[m.b]}` : `${m.a} v ${m.b}`; });
    const row = `<tr><td>${wk.week}</td><td>${dayLabel(wk.day)}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    assert.ok(html.includes(row), row);
  }
  const r = laneReport(s);
  assert.equal(r.atBound, 8);
  for (const row of r.rows) {
    assert.deepEqual([...row.counts].sort(), [3, 4, 4, 4]);
    assert.ok(html.includes(`<tr><td>${row.name}</td>${row.counts.map((v) => `<td>${v}</td>`).join("")}</tr>`), row.name);
  }
  // The measured claims on the page are the ones in eval/bowling-lanes.txt.
  const ev = page("eval/bowling-lanes.txt");
  assert.match(ev, /polished: every team at the bound in 36 of 36 seasons; worst spread 1/);
  assert.match(ev, /rotate: every team at the bound in 1 of 36 seasons; worst spread 13/);
  assert.match(html, /all 36/);
  // The repeat claim on the page is the one in eval/bowling-repeat-anneal.txt and eval/bowling-lanes.txt.
  assert.match(page("eval/bowling-repeat-anneal.txt"), /repeats 272 -> 148 over 36 seasons; 13 seasons with none; seasons less balanced with the anneal: 0/);
  assert.match(ev, /polished: every team at the bound in 36 of 36 seasons; worst spread 1; repeats 148 in total/);
  assert.match(html, /fell from 392 to 148, and 13 seasons have none/);
  assert.equal((page("eval/bowling-lane-sat.txt").match(/: SAT$/gm) || []).length, 6);
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});

test("26 teams over 12 weeks: every team on 12 different pairs (stored 2026-11-24 from the mirrored CP-SAT model; 13 weeks is proved out of reach)", () => {
  assert.ok(OUT_OF_REACH.includes("26,13"));
  assert.ok(LANE_TABLE["26,12"] && !LANE_NEAR["26,12"]);
  const s = bowlingSchedule({ teams: names(26), weeks: 12, start: START });
  assert.equal(laneReport(s).atBound, 26);
});

test("seasons a solver proved out of reach are flagged, and only those", () => {
  assert.ok(OUT_OF_REACH.length >= 20, `${OUT_OF_REACH.length} proofs`);
  // Every listed season really is off the bound in the page's own season: a proof can never sit
  // on a season the search put at the bound (that would make the proof file wrong).
  for (const key of OUT_OF_REACH.filter((k) => Number(k.split(",")[0]) <= 12)) {
    const [n, W] = key.split(",").map(Number);
    const s = bowlingSchedule({ teams: names(n), weeks: W, start: START });
    const r = laneReport(s);
    assert.equal(r.boundProvedOutOfReach, true, key);
    assert.ok(r.atBound < n, key);
  }
  // 4 teams, 2 weeks: in week 1 a v b share one pair and c v d the other, so in week 2 every team
  // must change pairs, but a now plays c (or d), who must move the opposite way. No deal works.
  assert.equal(boundOutOfReach(4, 2), true);
  assert.equal(laneReport(bowlingSchedule({ teams: names(4), weeks: 2, start: START })).boundProvedOutOfReach, true);
  // A position round does not count: 3 weeks with one position round is still 2 round-robin weeks.
  assert.equal(bowlingSchedule({ teams: names(4), weeks: 3, start: START, positionWeeks: [3] }).boundProvedOutOfReach, true);
  // An odd league's proof would cover the Vacancy's row, so it is never claimed.
  assert.equal(bowlingSchedule({ teams: names(3), weeks: 2, start: START }).boundProvedOutOfReach, false);
  // A season at the bound is never flagged.
  assert.equal(laneReport(bowlingSchedule({ teams: names(8), weeks: 30, start: START })).boundProvedOutOfReach, false);
});

// Red team 2026-11-17: three faults seeded into bowling.mjs got past the suite, and three real
// defects turned up reading it. Each test below fails on one of them.

test("an odd league's position round puts last place against the Vacancy, not a place that does not exist", () => {
  const s = bowlingSchedule({ teams: names(5), weeks: 3, start: START, positionWeeks: [3] });
  const pos = s.weeks.find((w) => w.kind === "position");
  assert.deepEqual(pos.matches.map((m) => [m.a, m.b]), [["1st place", "2nd place"], ["3rd place", "4th place"], ["5th place", VACANCY]]);
  assert.doesNotMatch(bowlingText(s), /6th place/);
  // An even league still lists every place.
  const e = bowlingSchedule({ teams: names(6), weeks: 1, start: START, positionWeeks: [1] });
  assert.equal(e.weeks[0].matches[2].b, "6th place");
});

test("a team called Vacancy is refused in an odd league (it would be two teams of one name), allowed in an even one", () => {
  const odd = bowlingSchedule({ teams: "Pins\nSplits\nvacancy", weeks: 4, start: START });
  assert.equal(odd.errors.length, 1);
  assert.match(odd.errors[0], /Vacancy/);
  assert.equal(bowlingSchedule({ teams: ["Pins", "Splits", " VACANCY "], weeks: 4, start: START }).errors.length, 1);
  assert.deepEqual(bowlingSchedule({ teams: "Pins\nSplits\nVacancy\nStrikes", weeks: 4, start: START }).errors, []);
});

test("each input problem is reported once", () => {
  for (const teams of ["Solo", Array.from({ length: 70 }, (_, i) => `T${i}`).join("\n")]) {
    const errs = bowlingSchedule({ teams, weeks: 4, start: START }).errors;
    assert.equal(errs.length, 1, errs.join(" | "));
  }
  assert.equal(bowlingSchedule({ teams: ["Solo"], weeks: 4, start: START }).errors.length, 1);
});

test("weeks: 60 is the longest season accepted, 61 is refused", () => {
  assert.deepEqual(bowlingSchedule({ teams: names(4), weeks: 60, start: START, mode: "greedy" }).errors, []);
  assert.equal(bowlingSchedule({ teams: names(4), weeks: 61, start: START }).errors.length, 1);
  assert.equal(bowlingSchedule({ teams: names(4), weeks: 2.5, start: START }).errors.length, 1);
});

test("validateBowling checks the first team's meetings too", () => {
  const s = bowlingSchedule({ teams: names(4), weeks: 3, start: START });
  assert.deepEqual(validateBowling(s), []);
  // Swap opponents in week 2 so team 0 meets team 1 twice and team 2 never; other pairs too.
  const wk = s.weeks[1];
  const t = structuredClone(s);
  t.weeks[1].matches = wk.matches.map((m) => (m.a === 0 || m.b === 0 ? { ...m, a: 0, b: 1 } : { ...m, a: 2, b: 3 }));
  assert.ok(validateBowling(t).some((p) => p.startsWith("Team 1 and")), validateBowling(t).join(" | "));
});

test("the season polish keeps back-to-back repeats low (12 teams, 30 weeks: 17 repeats)", () => {
  // The sweep accepts a re-solve only when the season's price falls; flipping the sign of the
  // squared-count term in that price left the spread intact but raised repeats from 17 to 25.
  const s = bowlingSchedule({ teams: names(12), weeks: 30, start: START });
  const r = laneReport(s);
  assert.ok(r.worstSpread <= 2, `spread ${r.worstSpread}`);
  assert.ok(r.repeats <= 17, `repeats ${r.repeats}`);
});

const repeatsOf = (plan, n) => {
  const last = new Array(n).fill(-1); let r = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { if (last[t] === p) r++; last[t] = p; }
  return r;
};
const plainRounds = (n, W) => { const cyc = roundRobin(n); return Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches); };

test("the repeat anneal never unbalances a season or adds a repeat, keeps lane limits, and cuts repeats (6 teams, 26 weeks)", () => {
  for (const [n, W] of [[6, 26], [8, 34], [10, 26]]) {
    const P = n / 2;
    const before = assignLanes(plainRounds(n, W), n, P, { anneal: false });
    const lim = laneLimits(before, n, P, null);
    const after = cutRepeats(before, n, P, 1, 200000, lim);
    assert.equal(offBound(after, n, P), 0, `${n}x${W} balance`);
    assert.ok(repeatsOf(after, n) <= repeatsOf(before, n), `${n}x${W} repeats`);
    after.forEach((wk, w) => { assert.equal(new Set(wk.map((m) => m[2])).size, P); assert.deepEqual(wk.map(([a, b]) => [a, b]), before[w].map(([a, b]) => [a, b])); });
  }
  const P = 3, before = assignLanes(plainRounds(6, 26), 6, P, { anneal: false });
  assert.ok(repeatsOf(cutRepeats(before, 6, P, 1, 200000, laneLimits(before, 6, P, null)), 6) < repeatsOf(before, 6));
  // With lane limits the anneal still never puts a team on a pair it avoids.
  const s = bowlingSchedule({ teams: names(8), weeks: 30, start: START, laneAvoid: "Team 1: last\nTeam 2: 1-2" });
  assert.deepEqual(validateBowling(s), []);
  for (const wk of s.weeks) for (const m of wk.matches) {
    if (m.a === 0 || m.b === 0) assert.notEqual(m.pair, 3);
    if (m.a === 1 || m.b === 1) assert.notEqual(m.pair, 0);
  }
  // An unbalanced season is returned as it is.
  const off = [[[0, 1, 0], [2, 3, 1]], [[0, 2, 0], [1, 3, 1]], [[0, 3, 0], [1, 2, 1]]];
  const lim = laneLimits(off, 4, 2, null);
  assert.ok(offBound(off, 4, 2) > 0);
  assert.deepEqual(cutRepeats(off, 4, 2, 1, 1000, lim), off);
});

test("12 teams over 30 weeks: every pair exactly five times and never the same pair two weeks running (stored answer re-solved for repeats)", () => {
  for (const seed of [1, 2]) {
    const r = laneReport(bowlingSchedule({ teams: names(12), weeks: 30, start: START, seed }));
    assert.equal(r.atBound, 12);
    assert.equal(r.repeats, 0, `seed ${seed}`);
  }
});

test("lane limits: a team never bowls on a pair it avoids, and every team lands in its fair share", () => {
  const s = bowlingSchedule({ teams: names(8), weeks: 30, start: START, laneAvoid: "Team 1: last\nteam 2: 1-2, 3" });
  assert.deepEqual(s.errors, []);
  assert.deepEqual(validateBowling(s), []);
  assert.deepEqual(s.avoid[0], [3]);
  assert.deepEqual(s.avoid[1], [0, 1]);
  for (const wk of s.weeks) for (const m of wk.matches) {
    for (const t of [m.a, m.b]) assert.ok(!(s.avoid[t] ?? []).includes(m.pair), `week ${wk.week}: ${s.teams[t]} on pair ${m.pair}`);
  }
  const r = laneReport(s);
  assert.equal(r.atBound, 8);
  assert.equal(r.rows[0].counts[3], 0);
  assert.deepEqual(r.rows[0].avoided, [3]);
  for (const row of r.rows) assert.ok(row.spread <= row.bound, row.name);
  assert.equal(s.boundProvedOutOfReach, false);
});

test("laneTargets is the old floor..ceil bound with no limits, and keeps row and pair totals with some", () => {
  const plain = laneTargets([30, 30, 30, 30], 2);
  assert.deepEqual(plain.lo, [[15, 15], [15, 15], [15, 15], [15, 15]]);
  const g = new Array(10).fill(30);
  const t = laneTargets(g, 5, [[4], [], [], [], [], [], [], [], [], []]);
  assert.deepEqual(t.hi[0], [8, 8, 8, 8, 0]);
  for (let p = 0; p < 5; p++) {
    const share = t.share.reduce((s, row) => s + row[p], 0);
    assert.ok(Math.abs(share - 60) < 1e-6);
    assert.ok(t.lo.reduce((s, row) => s + row[p], 0) <= 60 && t.hi.reduce((s, row) => s + row[p], 0) >= 60);
  }
  for (let i = 1; i < 10; i++) assert.ok(t.hi[i][4] > t.hi[i][0] || t.lo[i][4] > t.lo[i][0]); // the shunned pair is shared out
});

test("lane limits that leave a week with no deal are refused with the week named, and bad input is reported", () => {
  const s = bowlingSchedule({ teams: names(4), weeks: 6, start: START, laneAvoid: "Team 1: 1\nTeam 2: 1\nTeam 3: 1" });
  assert.equal(s.weeks, undefined);
  assert.match(s.errors[0], /^Week \d+: the lane limits leave no way/);
  const p = parseLaneAvoid("Nobody: 1\nTeam 1 7-8\nTeam 2: 2-3\nTeam 3: 1-2, 3-4", names(4), 2, 1);
  assert.equal(p.errors.length, 4);
  assert.match(p.errors[0], /"Nobody" is not one of the teams/);
  assert.match(p.errors[1], /colon/);
  assert.match(p.errors[2], /not a lane pair/);
  assert.match(p.errors[3], /cannot avoid every lane pair/);
  const q = parseLaneAvoid("Team 1: ends\nTeam 2: lanes 15-16\nTeam 3: first", names(6), 3, 13);
  assert.deepEqual(q.errors, []);
  assert.deepEqual(q.avoid, [[0, 2], [1], [0], [], [], []]);
});

test("the search with limits honours them on every week of a grid, and an odd league's Vacancy is not a team to limit", () => {
  for (const [n, weeks] of [[6, 20], [10, 33], [12, 26], [16, 34]]) {
    const s = bowlingSchedule({ teams: names(n), weeks, start: START, laneAvoid: `Team 1: last\nTeam ${n}: first`, positionWeeks: [weeks] });
    assert.deepEqual(s.errors, [], `${n}x${weeks}`);
    assert.deepEqual(validateBowling(s), []);
    for (const wk of s.weeks) if (wk.kind === "round") for (const m of wk.matches) assert.ok(!(s.avoid[m.a] ?? []).includes(m.pair) && !(s.avoid[m.b] ?? []).includes(m.pair));
  }
  const odd = bowlingSchedule({ teams: names(7), weeks: 10, start: START, laneAvoid: "Vacancy: 1" });
  assert.match(odd.errors[0], /"Vacancy" is not one of the teams/);
  const none = bowlingSchedule({ teams: names(8), weeks: 15, start: START, laneAvoid: "  \n" });
  assert.equal(none.avoid, null);
});

test("lane-limit shapes match up to renaming teams and pairs, and nothing else", () => {
  const avoid = (n, list) => { const a = Array.from({ length: n }, () => []); for (const [t, ps] of list) a[t].push(...ps); return a; };
  // Two teams on one pair: any two teams, any pair.
  assert.deepEqual(matchShape(avoid(20, [[6, [4]], [13, [4]]]), "0:0;1:0", 10), { slotTeam: [6, 13], pairOf: [4], slots: [0, 1] });
  assert.equal(matchShape(avoid(20, [[6, [4]], [13, [5]]]), "0:0;1:0", 10), null);
  // A team on two pairs and a team on one of them: the slots follow the shape, not the input order.
  assert.deepEqual(matchShape(avoid(20, [[2, [7]], [9, [7, 1]]]), "0:0,1;1:0", 10), { slotTeam: [9, 2], pairOf: [7, 1], slots: [0, 1] });
  assert.equal(matchShape(avoid(20, [[2, [7]], [9, [3, 1]]]), "0:0,1;1:0", 10), null);
  assert.equal(matchShape(avoid(20, [[2, [7]]]), "0:0;1:0", 10), null);
  // Dealing: the limited teams take the shape's slots, the rest keep their order.
  const slots = avoidShapeSlots(20, 30, avoid(20, [[19, [9]]]), 10);
  assert.ok(slots, "20 x 30 has a stored answer for one team off one pair");
  assert.deepEqual(slots, [19, ...Array.from({ length: 19 }, (_, i) => i)]);
  assert.equal(avoidShapeSlots(20, 29, avoid(20, [[19, [9]]]), 10), null);
});

test("20 teams x 30 weeks with lane limits: every team in target from a stored shape answer (the search alone misses)", () => {
  assert.ok(Object.keys(LANE_SHAPES).some((k) => k.startsWith("20,30|")));
  for (const laneAvoid of ["Team 7: last", "Team 3: last\nTeam 12: last", "Team 7: ends"]) {
    for (const seed of [1, 2]) {
      const s = bowlingSchedule({ teams: names(20), weeks: 30, start: START, laneAvoid, seed });
      assert.deepEqual(s.errors, [], laneAvoid);
      assert.deepEqual(validateBowling(s), [], laneAvoid);
      for (const wk of s.weeks) for (const m of wk.matches) for (const t of [m.a, m.b]) assert.ok(!s.avoid[t].includes(m.pair), `${laneAvoid}: week ${wk.week}`);
      const r = laneReport(s);
      assert.equal(r.rows.filter((x) => x.inTarget).length, 20, `${laneAvoid} seed ${seed}`);
      // Still a double-and-a-bit round robin: every pair of teams meets once or twice.
      const met = new Map();
      for (const wk of s.weeks) for (const m of wk.matches) { const k = Math.min(m.a, m.b) * 20 + Math.max(m.a, m.b); met.set(k, (met.get(k) ?? 0) + 1); }
      assert.equal(met.size, 190);
      for (const c of met.values()) assert.ok(c === 1 || c === 2);
    }
  }
  // With no limits the fixtures are the plain circle method, as before.
  const plain = bowlingSchedule({ teams: names(20), weeks: 30, start: START });
  const cyc = roundRobin(20);
  const key = (ms) => ms.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort().join(" ");
  assert.equal(key(plain.weeks[0].matches.map((m) => [m.a, m.b])), key(cyc[0].matches));
});

test("lane-limit shapes that are UNSAT on slots 0 and 1 are stored on other slots and the page uses them", () => {
  const avoid = (n, list) => { const a = Array.from({ length: n }, () => []); for (const [t, ps] of list) a[t].push(...ps); return a; };
  // 18 x 8, two teams each off the same two pairs: UNSAT on slots 0-1, SAT on 12 and 17 (17 is fixed).
  // 22 x 23, two teams off one pair: the search alone finds an answer on slots 0 and 1 (eval/bowling-avoid-lns.py
  // starts from it), where the whole-season SAT model timed out; the page's own dealing missed by 2.
  // 20 x 9, two teams off one pair: UNSAT with the teams on slots 0-1 (0-2, 0-3, 0-4 too), SAT on 0 and 5.
  assert.deepEqual(matchShape(avoid(20, [[6, [4]], [13, [4]]]), "0:0;5:0", 10), { slotTeam: [6, 13], pairOf: [4], slots: [0, 5] });
  const slots = avoidShapeSlots(20, 9, avoid(20, [[6, [4]], [13, [4]]]), 10);
  assert.equal(slots[0], 6);
  assert.equal(slots[5], 13);
  assert.deepEqual([...slots].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i));
  for (const [n, weeks, laneAvoid] of [[20, 9, "Team 4: 9-10\nTeam 11: 9-10"], [18, 8, "Team 2: 1-2, 3-4\nTeam 15: 1-2, 3-4"], [22, 23, "Team 3: last\nTeam 9: last"]]) {
    const s = bowlingSchedule({ teams: names(n), weeks, start: START, laneAvoid });
    assert.deepEqual(s.errors, [], laneAvoid);
    assert.deepEqual(validateBowling(s), [], laneAvoid);
    for (const wk of s.weeks) for (const m of wk.matches) for (const t of [m.a, m.b]) assert.ok(!s.avoid[t].includes(m.pair), `${laneAvoid}: week ${wk.week}`);
    assert.equal(laneReport(s).rows.filter((x) => x.inTarget).length, n, `${n} x ${weeks}: ${laneAvoid}`);
    // Still a plain round robin: no pair of teams meets twice within one cycle.
    const met = new Set();
    for (const wk of s.weeks.slice(0, n - 1)) for (const m of wk.matches) { const k = Math.min(m.a, m.b) * n + Math.max(m.a, m.b); assert.ok(!met.has(k)); met.add(k); }
  }
});

test("five or more limited teams: a week with no legal deal on slot t = team t is re-dealt, and a provably impossible one still refused", () => {
  const spread = (n, k, pairsOf) => {
    const avoid = Array.from({ length: n }, () => []);
    for (let i = 0; i < k; i++) avoid[(i * 7 + 3) % n] = pairsOf(n / 2);
    return avoid;
  };
  // 10 teams, five off the last pair: slot t = team t puts the five in five different matches in
  // week 1 (refused before); another dealing gives every round a match of two unlimited teams.
  for (const [n, k, pairsOf, weeks] of [[10, 5, (P) => [P - 1], 26], [16, 7, (P) => [0, P - 1], 30]]) {
    const avoid = spread(n, k, pairsOf);
    const s = bowlingSchedule({ teams: names(n), weeks, start: START, laneAvoid: avoid });
    assert.deepEqual(s.errors, [], `${n} teams`);
    assert.equal(s.redealt, true);
    const meet = new Map();
    for (const wk of s.weeks) for (const m of wk.matches) {
      assert.ok(!avoid[m.a].includes(m.pair) && !avoid[m.b].includes(m.pair), "a limit broken");
      const key = [m.a, m.b].sort((x, y) => x - y).join("-");
      meet.set(key, (meet.get(key) ?? 0) + 1);
    }
    // still a round robin: every two teams meet floor or ceil of weeks / (n - 1) times
    assert.equal(meet.size, (n * (n - 1)) / 2);
    const lo = Math.floor(weeks / (n - 1)), hi = Math.ceil(weeks / (n - 1));
    for (const c of meet.values()) assert.ok(c >= lo && c <= hi);
  }
  // A season whose identity dealing already has a deal every week is untouched.
  const ok = spread(12, 5, (P) => [P - 1]);
  assert.deepEqual(feasibleDealing(12, 26, ok, 6), Array.from({ length: 12 }, (_, t) => t));
  assert.equal(bowlingSchedule({ teams: names(12), weeks: 26, start: START, laneAvoid: ok }).redealt, false);
  // 8 teams, four off the last pair: the four others meet 6 times a cycle, 7 rounds need one each.
  const no = spread(8, 4, (P) => [P - 1]);
  assert.equal(feasibleDealing(8, 26, no, 4), null);
  assert.match(bowlingSchedule({ teams: names(8), weeks: 26, start: START, laneAvoid: no }).errors[0], /no dealing of the teams/);
  // ...but a 6-week season plays only six of the seven rounds, and has a dealing.
  assert.ok(feasibleDealing(8, 6, no, 4));
});

test("five or more limited teams: the most even of several legal dealings is kept, and dealings: 1 keeps the first", async () => {
  const { dealingScore } = await import("./bowling.mjs");
  const avoid = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < 5; i++) avoid[(i * 7 + 3) % 10] = [4];
  const plan = (s) => s.weeks.map((wk) => wk.matches.map((m) => [m.a, m.b, m.pair]));
  const first = bowlingSchedule({ teams: names(10), weeks: 26, start: START, laneAvoid: avoid, dealings: 1 });
  const even = bowlingSchedule({ teams: names(10), weeks: 26, start: START, laneAvoid: avoid });
  assert.deepEqual(first.errors, []); assert.deepEqual(even.errors, []);
  assert.equal(first.dealingsTried, 1);
  assert.ok(even.dealingsTried > 1);
  const a = dealingScore(plan(first), 10, 5, avoid), b = dealingScore(plan(even), 10, 5, avoid);
  // the measured 10 x 26 season: 2 teams off target on the first dealing, 0 on the most even one
  assert.ok(b[0] < a[0], `teams off ${b[0]} vs ${a[0]}`);
  for (const wk of even.weeks) for (const m of wk.matches) assert.ok(!avoid[m.a].includes(m.pair) && !avoid[m.b].includes(m.pair));
  assert.deepEqual(validateBowling(even), []);
  // same input, same season
  assert.deepEqual(bowlingSchedule({ teams: names(10), weeks: 26, start: START, laneAvoid: avoid }).weeks, even.weeks);
});

test("the bowling page builds in a Web Worker that runs the same functions, with a page-thread fallback", async () => {
  const html = page("bowling-league-schedule.html");
  assert.match(html, /new Worker\("\.\/bowling-worker\.mjs", \{ type: "module" \}\)/);
  assert.match(html, /catch \{ return fallback\(\); \}/);
  const worker = page("bowling-worker.mjs");
  assert.match(worker, /import \{ bowlingSchedule, laneReport, validateBowling \} from "\.\/bowling\.mjs"/);
  // Run the worker's handler in-process: it posts the same season bowlingSchedule builds.
  const posted = [];
  const prev = globalThis.self;
  globalThis.self = { postMessage: (m) => posted.push(m) };
  try {
    await import(`./bowling-worker.mjs?t=${Date.now()}`);
    const spec = { teams: ["A", "B", "C", "D", "E", "F"], weeks: 10, start: START, laneAvoid: "" };
    globalThis.self.onmessage({ data: spec });
    globalThis.self.onmessage({ data: { ...spec, teams: ["Solo"] } });
  } finally { globalThis.self = prev; }
  const direct = bowlingSchedule({ teams: ["A", "B", "C", "D", "E", "F"], weeks: 10, start: START });
  assert.equal(posted[0].ok, true);
  assert.deepEqual(posted[0].season, direct);
  assert.deepEqual(posted[0].report, laneReport(direct));
  assert.deepEqual(posted[0].problems, []);
  assert.ok(posted[1].season.errors.length && !posted[1].report);
});

test("22 teams over 10 weeks: every team on every pair at most once (stored 2026-11-24; 11 weeks is proved out of reach)", () => {
  assert.ok(OUT_OF_REACH.includes("22,11"));
  const s = bowlingSchedule({ teams: names(22), weeks: 10, start: START });
  const r = laneReport(s);
  assert.equal(r.atBound, 22);
});
