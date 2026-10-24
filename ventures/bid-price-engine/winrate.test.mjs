import { test } from "node:test";
import assert from "node:assert/strict";
import { winRateCurve, bidMarginPct } from "./winrate.mjs";

// Deterministic synthetic history: true win chance falls with margin.
function history(n, seed = 7) {
  let s = seed; const r = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  return Array.from({ length: n }, () => {
    const m = 8 + r() * 30;
    return { marginPct: m, won: r() < 1 / (1 + Math.exp((m - 24) / 4)) };
  });
}

test("margin of a bid is profit over price, and bad inputs give null", () => {
  assert.equal(bidMarginPct(1250, 1000), 20);
  assert.equal(bidMarginPct(1000, 1000), null);
  assert.equal(bidMarginPct(0, 5), null);
});

test("too few bids, or only wins, gives no curve and says what is missing", () => {
  const few = winRateCurve(history(5));
  assert.equal(few.ready, false); assert.equal(few.reason, "too-few"); assert.equal(few.need, 3);
  const wins = winRateCurve(Array.from({ length: 10 }, (_, i) => ({ marginPct: 10 + i, won: true })));
  assert.equal(wins.ready, false); assert.equal(wins.reason, "one-sided");
  const flat = winRateCurve(Array.from({ length: 10 }, (_, i) => ({ marginPct: 20, won: i % 2 === 0 })));
  assert.equal(flat.reason, "no-spread");
});

test("a history where higher margins lose finds a downward curve and an interior best margin", () => {
  const r = winRateCurve(history(200));
  assert.equal(r.found, true);
  assert.ok(r.slopePerPoint < 0);
  assert.ok(r.winChanceAt(10) > r.winChanceAt(35));
  assert.ok(r.bestMarginPct > 8 && r.bestMarginPct < 40);
  // The best margin beats the average margin on expected profit per bid.
  assert.ok(r.evPer100AtBest >= r.evPer100AtAvg);
  // The grid optimum matches a brute-force check on the fitted curve.
  let best = -1, at = 0;
  for (let m = 5; m <= 41; m += 0.25) { const ev = (r.winChanceAt(m) / 100) * (m / (100 - m)); if (ev > best) { best = ev; at = m; } }
  assert.ok(Math.abs(at - r.bestMarginPct) <= 0.5);
});

test("with many bids the bootstrap range brackets the best margin and is repeatable", () => {
  const a = winRateCurve(history(300)), b = winRateCurve(history(300));
  assert.deepEqual(a.interval, b.interval);
  assert.ok(a.interval.low <= a.bestMarginPct + 1 && a.interval.high >= a.bestMarginPct - 1);
});

test("when margin does not move the win rate it refuses to recommend", () => {
  // Wins and losses interleaved at every margin: no price signal.
  const bids = Array.from({ length: 20 }, (_, i) => ({ marginPct: 10 + (i >> 1), won: i % 2 === 0 }));
  const r = winRateCurve(bids);
  assert.equal(r.ready, true); assert.equal(r.found, false); assert.equal(r.reason, "no-price-signal");
});

test("perfectly separated history stays finite", () => {
  const bids = Array.from({ length: 12 }, (_, i) => ({ marginPct: 10 + i * 2, won: i < 6 }));
  const r = winRateCurve(bids);
  assert.equal(r.found, true);
  assert.ok(Number.isFinite(r.bestMarginPct));
});
