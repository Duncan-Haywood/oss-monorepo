import { test } from "node:test";
import assert from "node:assert/strict";
import { bowlingSchedule, laneReport, validateBowling, hungarian, bowlingCsv, bowlingText, parseWeekList, pairLabels, teamLaneGrid, assignLanes, offBound, VACANCY } from "./bowling.mjs";
import { LANE_TABLE } from "./bowling-lane-table.mjs";
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
  assert.match(ev, /polished: every team at the bound in 30 of 36 seasons; worst spread 2/);
  assert.match(ev, /rotate: every team at the bound in 1 of 36 seasons; worst spread 13/);
  assert.match(html, /30 of the 36/);
  assert.equal((page("eval/bowling-lane-sat.txt").match(/: SAT$/gm) || []).length, 6);
  assert.match(page("sitemap.xml"), new RegExp(name));
  assert.match(page("index.html"), new RegExp(`href="\\./${name}"`));
});
