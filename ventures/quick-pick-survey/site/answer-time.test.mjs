// node --test site/answer-time.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { answerTime, timeToken, parseTimes, pace, teamPace, timeToStop, TIME_CAP_DS, MIN_TIMED } from "./answer-time.mjs";
import { encodeAnswers, decodeAnswers } from "./rank-core.mjs";

const items = ["Dark mode", "CSV export", "Faster search", "Mobile app", "Team accounts", "Calendar sync"];
const screen = (best, worst, ...rest) => ({ set: [best, worst, ...rest], best, worst });

test("an answer time is tenths of a second, and none when the page was hidden or the clock is odd", () => {
  assert.equal(answerTime(1000, 3449), 24);
  assert.equal(answerTime(1000, 3449, true), null);
  assert.equal(answerTime(5000, 4000), null);
  assert.equal(answerTime(NaN, 4000), null);
  assert.equal(answerTime(0, TIME_CAP_DS * 100), TIME_CAP_DS);
  assert.equal(answerTime(0, TIME_CAP_DS * 100 + 100), null);
});

test("codes carry times one per answer, mixed with screens and unknowns, and round-trip", () => {
  const answers = [[0, 1, false], screen(2, 3, 4, 5), [4, 5, true], screen(1, 0, 2, 3)];
  const times = [23, 61, null, 1234];
  const d = decodeAnswers(encodeAnswers({ items, answers, name: "Ana", times }), items);
  assert.deepEqual(d.answers, answers);
  assert.deepEqual(d.times, times);
  assert.equal(d.name, "Ana");
});

test("no times are sent when they do not line up, are all unknown, or are left out", () => {
  const answers = [[0, 1, false], [2, 3, false]];
  for (const times of [undefined, null, [5], [null, null], [5, 6, 7]]) {
    const d = decodeAnswers(encodeAnswers({ items, answers, times }), items);
    assert.equal(d.error, undefined);
    assert.equal(d.times, undefined, JSON.stringify(times));
  }
  // An old code (before times) still reads.
  assert.deepEqual(decodeAnswers(encodeAnswers({ items, answers }), items).answers, answers);
});

test("a code with a damaged time field is refused, not half-read", () => {
  const answers = [[0, 1, false], [2, 3, false]];
  const code = encodeAnswers({ items, answers, times: [10, 20] });
  const raw = JSON.parse(Buffer.from(code.slice(4), "base64url").toString("utf8"));
  for (const t of ["a", "a,b,c", "a,B", "a,,", "a,zzzz", `a,${(TIME_CAP_DS + 1).toString(36)}`, 7, ["a", "b"]]) {
    const bad = "QP1." + Buffer.from(JSON.stringify({ ...raw, t }), "utf8").toString("base64url");
    assert.match(decodeAnswers(bad, items).error ?? "", /damaged/, JSON.stringify(t));
  }
  assert.equal(parseTimes("-,a", 2).times[0], null);
  assert.equal(timeToken(-1), "-");
  assert.equal(timeToken(2.5), "-");
});

test("a person's pace splits pairs (ties included) from screens, in seconds, by the median", () => {
  const answers = [[0, 1, false], [2, 3, true], [4, 5, false], screen(0, 1, 2, 3), screen(2, 4, 1, 5)];
  const p = pace(answers, [20, 30, null, 50, 70]);
  assert.deepEqual(p.pairs, { timed: 2, median: 2.5 });
  assert.deepEqual(p.screens, { timed: 2, median: 6 });
  assert.deepEqual(pace(answers, [1, 2]).pairs, { timed: 0, median: null });
});

test("a team's pace is the median of people's medians, and counts only people with enough timed answers", () => {
  const pairs = (ts) => ({ answers: ts.map((_, i) => [i % 6, (i + 1) % 6, false]), times: ts });
  const screens = (ts) => ({ answers: ts.map(() => screen(0, 1, 2, 3)), times: ts });
  const people = [pairs([20, 20, 20]), pairs([30, 30, 30, 30, 30, 30, 30, 30, 30, 30]), pairs([40, 40, 40]), pairs([900, 900]), screens([50, 60, 70]), screens([80, 80, 80, 80])];
  assert.ok(MIN_TIMED === 3);
  const t = teamPace(people);
  assert.deepEqual(t.pairs, { people: 3, median: 3 });
  assert.deepEqual(t.screens, { people: 2, median: 7 });
  const s = timeToStop(t, 40, 13);
  assert.equal(s.pairs, 120);
  assert.equal(s.screens, 91);
  assert.ok(Math.abs(s.screenRatio - 7 / 3) < 1e-12);
  assert.ok(Math.abs(s.breakEven - 40 / 13) < 1e-12);
  assert.equal(timeToStop(teamPace([pairs([20, 20, 20])]), 40, 13).screens, null);
});

test("the rank page times each question, undoes times with answers, and shows the team's pace", () => {
  const page = readFileSync(new URL("rank.html", import.meta.url), "utf8");
  assert.match(page, /from "\.\/answer-time\.mjs"/);
  assert.equal(page.match(/startClock\(\);/g)?.length, 2, "a clock starts when a pair and when a screen is shown");
  assert.equal(page.match(/state\.times\.push\(stopClock\(\)\)/g)?.length, 2, "both kinds of answer record a time");
  assert.equal(page.match(/state\.answers\.pop\(\); state\.times\.pop\(\);/g)?.length, 2, "both undos drop the time too");
  assert.match(page, /visibilitychange/);
  assert.match(page, /id="send-times" checked/);
  assert.match(page, /times: \$\("#send-times"\)\.checked \? state\.times : null/);
  assert.match(page, /times: d\.times/);
  assert.match(page, /\$\{paceHtml\(people\)\}/);
});
