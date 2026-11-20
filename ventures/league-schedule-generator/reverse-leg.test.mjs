// Return leg in reverse order (quality audit round 87, 2026-11-19): a double round robin whose
// second half plays the first half's rounds backwards, venues swapped, so nobody has two home or
// two away games across the halfway line.
import test from "node:test";
import assert from "node:assert/strict";
import { roundRobin, buildSchedule, validateSchedule, countBreaks, rematchReport, readSpec, encodeFields, decodeFields, parseDate } from "./calc.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const build = (n, extra = {}) => buildSchedule({ teams: names(n), double: true, start: parseDate("2026-01-06"), weekdays: [2], courts: ["C1", "C2", "C3", "C4", "C5", "C6"], times: ["18:00", "19:00"], seed: 1, ...extra });
const total = (s) => countBreaks(s).reduce((a, b) => a + b, 0);

test("roundRobin reverseLeg plays leg one backwards with venues swapped", () => {
  for (const n of [4, 5, 6, 9, 12]) {
    const plain = roundRobin(n, { double: true });
    const rev = roundRobin(n, { double: true, reverseLeg: true });
    const leg0 = plain.filter((r) => r.leg === 0);
    assert.deepEqual(rev.slice(0, leg0.length), leg0);
    const back = rev.slice(leg0.length);
    assert.equal(back.length, leg0.length);
    back.forEach((r, i) => {
      const src = leg0[leg0.length - 1 - i];
      assert.equal(r.leg, 1);
      assert.equal(r.bye, src.bye);
      assert.deepEqual(r.matches, src.matches.map(([h, a]) => [a, h]));
    });
    assert.deepEqual(roundRobin(n, { reverseLeg: true }), roundRobin(n), "a single round robin ignores it");
  }
});

test("even leagues drop from 3(n-2) to 2(n-2) breaks; every schedule still validates", () => {
  for (const n of [4, 6, 8, 10, 12]) {
    const plain = build(n), rev = build(n, { reverseLeg: true });
    assert.equal(validateSchedule(rev).ok, true, `${n} teams: ${validateSchedule(rev).errors}`);
    assert.equal(total(plain), 3 * (n - 2), `${n} teams plain`);
    assert.equal(total(rev), 2 * (n - 2), `${n} teams reversed`);
    assert.equal(rev.config.reverseLeg, true);
    assert.equal(plain.config.reverseLeg, undefined);
  }
});

test("odd leagues never get worse, and the trade-off shows in the rematch report", () => {
  for (const n of [5, 7, 9]) {
    const plain = build(n), rev = build(n, { reverseLeg: true });
    assert.equal(validateSchedule(rev).ok, true);
    assert.ok(total(rev) <= total(plain), `${n} teams: ${total(rev)} > ${total(plain)}`);
  }
  // the cost: leg one's last pairs meet again the next week (7 days apart on a weekly league)
  assert.equal(rematchReport(build(6, { reverseLeg: true })).shortest, 7);
  assert.ok(rematchReport(build(6)).shortest > 7);
});

test("the form, share links and carry-over all treat it as a double-only option", () => {
  const base = { teams: names(6).join("\n"), start: "2026-01-06", weekdays: ["Tue"], courts: "C1\nC2\nC3", times: "18:00" };
  assert.equal(readSpec({ ...base, double: true, reverseLeg: true }).spec.reverseLeg, true);
  assert.equal(readSpec({ ...base, double: false, reverseLeg: true }).spec.reverseLeg, undefined);
  const f = decodeFields(encodeFields({ ...base, double: true, reverseLeg: true }));
  assert.equal(f.reverseLeg, true);
  assert.equal(decodeFields(encodeFields({ ...base, double: true })).reverseLeg, false);
  const co = build(6, { reverseLeg: true, carryOver: true });
  assert.equal(co.config.reverseLeg, undefined);
  assert.ok(co.notices.some((t) => /reverse order was not applied/.test(t)));
});

test("several games a night keeps the reversed return leg", () => {
  const s = build(8, { reverseLeg: true, gamesPerNight: 2, courts: ["C1", "C2"], times: ["18:00", "19:00", "20:00", "21:00"] });
  assert.equal(validateSchedule(s).ok, true, String(validateSchedule(s).errors));
  assert.equal(s.config.reverseLeg, true);
});
