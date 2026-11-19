import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parsePlayersList, newNight, setScore, getScore, otherSide, roundDone, currentRound, finishedGames,
  drawNextRound, leaderboard, leaderboardText, nightCsv, checkNight, encodeNight, decodeNight,
} from "./night.mjs";
import { validateAmericano } from "./calc.mjs";

const names = (k) => Array.from({ length: k }, (_, i) => `P${i + 1}`);

test("player list: lines, commas, duplicates and limits", () => {
  assert.deepEqual(parsePlayersList("Ana\nBen\nCy\nDee").players, ["Ana", "Ben", "Cy", "Dee"]);
  assert.deepEqual(parsePlayersList("Ana, Ben, Cy, Dee, Eve").players, ["Ana", "Ben", "Cy", "Dee", "Eve"]);
  assert.match(parsePlayersList("Ana\nana\nBen\nCy\nDee").errors.join(), /twice/);
  assert.match(parsePlayersList("Ana\nBen\nCy").errors.join(), /at least 4/);
  assert.match(parsePlayersList(names(65).join("\n")).errors.join(), /Up to 64/);
});

test("americano night: 8 players, 2 courts is the whole whist design, every round fixed", () => {
  const night = newNight({ players: names(8), courts: 2, target: 24 });
  assert.equal(night.rounds.length, 7);
  assert.equal(night.design?.whist, true);
  const plan = { rounds: night.rounds };
  assert.deepEqual(validateAmericano(night.players, plan), []);
  assert.equal(currentRound(night), 0);
});

test("scores: stored, cleared, refused and warned; the input night is never changed", () => {
  const n0 = newNight({ players: names(8), courts: 2, target: 24 });
  const { night: n1, warning } = setScore(n0, 0, 1, 15, 9);
  assert.equal(warning, undefined);
  assert.deepEqual(getScore(n1, 0, 1), [15, 9]);
  assert.equal(getScore(n0, 0, 1), null);
  assert.match(setScore(n1, 0, 2, 13, 9).warning, /not 24/);
  assert.match(setScore(n1, 0, 2, -1, 9).error, /whole numbers/);
  assert.match(setScore(n1, 0, 2, 2.5, 9).error, /whole numbers/);
  assert.match(setScore(n1, 0, 9, 1, 2).error, /No such game/);
  assert.equal(getScore(setScore(n1, 0, 1, "", "").night, 0, 1), null);
  assert.equal(otherSide(n0, 15), 9);
  assert.equal(otherSide(n0, 30), null);
  assert.equal(otherSide(newNight({ players: names(8), courts: 2 }), 15), null);
});

test("table: both partners get their side's points; a full round moves currentRound", () => {
  let night = newNight({ players: ["Ana", "Ben", "Cy", "Dee"], courts: 1, rounds: 3, target: 21 });
  const m = night.rounds[0].matches[0];
  night = setScore(night, 0, 1, 14, 7).night;
  assert.ok(roundDone(night, 0));
  assert.equal(currentRound(night), 1);
  const rows = leaderboard(night);
  for (const i of m.a) assert.equal(rows.find((r) => r.i === i).pf, 14);
  for (const i of m.b) assert.equal(rows.find((r) => r.i === i).pa, 14);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.rank), [1, 1]); // partners tie
  assert.equal(rows[2].rank, 3);
});

test("sit-out credit: none, own average, half the target; only once the round is scored", () => {
  const players = names(5);
  const base = newNight({ players, courts: 1, rounds: 5, target: 24, sitOut: "none" });
  const sitter = base.rounds[0].byes[0];
  const scoreAll = (night, upto) => {
    for (let r = 0; r < upto; r++) night = setScore(night, r, 1, 16, 8).night;
    return night;
  };
  const row = (night) => leaderboard(night).find((r) => r.i === sitter);
  assert.equal(row(base).satOut, 0);
  const none = scoreAll(base, 5);
  assert.equal(row(none).satOut, 1);
  assert.equal(row(none).credit, 0);
  const avg = scoreAll({ ...base, sitOut: "average" }, 5);
  assert.equal(row(avg).credit, row(avg).avg);
  assert.equal(row(avg).total, row(avg).pf + row(avg).credit);
  const half = scoreAll({ ...base, sitOut: "half" }, 5);
  assert.equal(row(half).credit, 12);
  // 5 players, 5 rounds: everyone sits out once, so totals with "half" are pf + 12 for all
  for (const r of leaderboard(half)) assert.equal(r.total, r.pf + 12);
});

test("mexicano: draw refused until the round is scored, then drawn from the table; planned cap", () => {
  let night = newNight({ players: names(8), courts: 2, mode: "mexicano", rounds: 2, target: 24 });
  assert.equal(night.rounds.length, 1);
  assert.match(drawNextRound(night).error, /Score every game of round 1/);
  for (const m of night.rounds[0].matches) night = setScore(night, 0, m.court, m.court === 1 ? 20 : 13, m.court === 1 ? 4 : 11).night;
  night = drawNextRound(night).night;
  assert.equal(night.rounds.length, 2);
  // court 1 of round 2 holds the top four of the table
  const top = leaderboard(night).slice(0, 4).map((r) => r.i).sort();
  const c1 = night.rounds[1].matches[0];
  assert.deepEqual([...c1.a, ...c1.b].sort(), top);
  for (const m of night.rounds[1].matches) night = setScore(night, 1, m.court, 12, 12).night;
  assert.match(drawNextRound(night).error, /All 2 planned/);
  assert.match(drawNextRound(newNight({ players: names(8), courts: 2 })).error, /fixed/);
  assert.equal(finishedGames(night).length, 4);
});

test("text and CSV exports; CSV guards spreadsheet formulas", () => {
  let night = newNight({ players: ["=Ana", "Ben", "Cy, Jr", "Dee"], courts: 1, rounds: 3 });
  night = setScore(night, 0, 1, 11, 6).night;
  const txt = leaderboardText(night, "Friday padel");
  assert.match(txt, /^Friday padel\nAmericano standings after 1 of 3 games/);
  assert.match(txt, /1\. .+ 11 pts {2}\+5 {2}1W 1 played/);
  const csv = nightCsv(night);
  assert.match(csv, /'=Ana/);
  assert.match(csv, /"Cy, Jr"/);
  assert.match(csv, /^Round,Court,Side A,Score A,Score B,Side B$/m);
});

test("link round trip, damaged links refused, checkNight catches bad shapes", () => {
  let night = newNight({ players: ["Ána", "Bén", "Cy", "Dee", "Eve"], courts: 1, rounds: 5, target: 21 });
  night = setScore(night, 0, 1, 12, 9).night;
  const back = decodeNight(encodeNight(night));
  assert.deepEqual(back.night, night);
  assert.ok(decodeNight("not-a-night").error);
  assert.ok(decodeNight(encodeNight(night).slice(0, 20)).error);
  const bad = structuredClone(night);
  bad.rounds[0].matches[0].a[0] = 99;
  assert.match(checkNight(bad).join(), /places a player wrongly/);
  const badScore = structuredClone(night);
  badScore.scores["7-1"] = [1, 2];
  assert.match(checkNight(badScore).join(), /Score 7-1/);
  assert.deepEqual(checkNight(night), []);
});

test("every size 4-64 on full courts gives a valid night that checks clean", () => {
  for (let k = 4; k <= 64; k++) {
    const night = newNight({ players: names(k), courts: Math.floor(k / 4) });
    assert.deepEqual(checkNight(night), [], `k=${k}`);
    assert.deepEqual(validateAmericano(night.players, { rounds: night.rounds }), [], `k=${k}`);
  }
});

test("page wires the module, carries the disclaimer, tracking and links", () => {
  const html = readFileSync(new URL("./americano-night.html", import.meta.url), "utf8");
  assert.match(html, /from "\.\/night\.mjs"/);
  assert.match(html, /from "\.\/usage\.mjs"/);
  assert.match(html, /No warranty/);
  assert.match(html, /<link rel="canonical" href="\.\/americano-night\.html">/);
  assert.match(readFileSync(new URL("./index.html", import.meta.url), "utf8"), /href="\.\/americano-night\.html"/);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /americano-night\.html/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /americano-night\.html/);
});

test("average sit-out credit uses the unrounded average (quality audit 2026-11-19)", () => {
  // 5 players on 1 court over 10 rounds: everyone sits out twice. Uneven scores make averages non-round.
  let night = newNight({ players: names(5), courts: 1, rounds: 10, target: 24, sitOut: "average" });
  const scores = [[16, 9], [15, 13], [17, 7], [14, 10], [13, 11], [16, 8], [15, 9], [17, 11], [12, 12], [16, 7]];
  for (let r = 0; r < 10; r++) night = setScore(night, r, 1, ...scores[r]).night;
  let checked = 0;
  for (const row of leaderboard(night)) {
    assert.equal(row.satOut, 2);
    const exact = Math.round((row.pf / row.played) * row.satOut * 10) / 10;
    assert.equal(row.credit, exact);
    if (Math.round(row.avg * row.satOut * 10) / 10 !== exact) checked++;
  }
  assert.ok(checked > 0, "the scores should include a case where rounding first would differ");
});


test("README does not claim minimum breaks for the mirrored double round robin unqualified", () => {
  // Mirrored double: 3(n-2) breaks; reversing leg one's rounds gives 2(n-2) (quality audit 2026-11-19).
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /\(the minimum possible breaks\)/);
  assert.match(readme, /mirrored double has 3\(n−2\)/);
});
