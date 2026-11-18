import { test } from "node:test";
import assert from "node:assert/strict";
import { bowlingSchedule, laneReport, validateBowling, hungarian, bowlingCsv, bowlingText, parseWeekList, pairLabels, teamLaneGrid, assignLanes, boundOutOfReach, VACANCY } from "./bowling.mjs";
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
