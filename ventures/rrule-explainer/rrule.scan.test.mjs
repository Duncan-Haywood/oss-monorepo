// The expansion loop tests only the candidate days yearCandidates and
// monthCandidates hand it, instead of every day of the period (perf,
// 2026-11-17). That is exact only if no candidate list ever drops a day
// dayMatches would pass; this pins that over random rules and 30 years.
import { test } from "node:test";
import assert from "node:assert/strict";
import { _scan, parseRule, dayNumber, daysInMonth, WEEKDAYS } from "./rrule.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function randomRule(rand, freq) {
  const pick = (xs, k) => [...new Set(Array.from({ length: k }, () => xs[Math.floor(rand() * xs.length)]))];
  const parts = [`FREQ=${freq}`];
  const some = (p) => rand() < p;
  const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((x) => x !== 0);
  if (some(0.4)) parts.push(`BYMONTH=${pick(range(1, 12), 1 + Math.floor(rand() * 3)).join(",")}`);
  if (some(0.4)) parts.push(`BYMONTHDAY=${pick(range(-31, 31), 1 + Math.floor(rand() * 3)).join(",")}`);
  if (freq === "YEARLY" && some(0.3)) parts.push(`BYYEARDAY=${pick(range(-366, 366), 1 + Math.floor(rand() * 3)).join(",")}`);
  if (freq === "YEARLY" && some(0.3)) parts.push(`BYWEEKNO=${pick(range(-53, 53), 1 + Math.floor(rand() * 3)).join(",")}`);
  if (some(0.6)) {
    const days = pick(WEEKDAYS, 1 + Math.floor(rand() * 3)).map((d) => (some(0.4) ? `${pick(range(-5, 5), 1)[0]}${d}` : d));
    parts.push(`BYDAY=${days.join(",")}`);
  }
  parts.push(`WKST=${pick(WEEKDAYS, 1)[0]}`);
  return parts.join(";");
}

test("candidate days never drop a day that passes the BYxxx filters", () => {
  const rand = rng(20261117);
  const start = { day: dayNumber(2019, 3, 14), sec: 0 };
  let checked = 0;
  for (let i = 0; i < 300; i++) {
    const freq = i % 2 ? "YEARLY" : "MONTHLY";
    const text = randomRule(rand, freq);
    const r = _scan.normalize(parseRule(text).rule, start);
    for (const mode of ["union", "intersect"]) {
      for (let y = 2020; y < 2050; y++) {
        const periods = freq === "YEARLY" ? [[dayNumber(y, 1, 1), dayNumber(y + 1, 1, 1), _scan.yearCandidates(r, y, mode)]] : Array.from({ length: 12 }, (_, k) => [dayNumber(y, k + 1, 1), dayNumber(y, k + 1, 1) + daysInMonth(y, k + 1), _scan.monthCandidates(r, y, k + 1, mode)]);
        for (const [lo, hi, cands] of periods) {
          for (let j = 1; j < cands.length; j++) assert.ok(cands[j - 1] < cands[j], `${text}: candidates out of order`);
          const want = [];
          for (let n = lo; n < hi; n++) if (_scan.dayMatches(n, r, mode)) want.push(n);
          assert.deepEqual(cands.filter((n) => _scan.dayMatches(n, r, mode)), want, `${text} (${mode}, ${y})`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 10000);
});
