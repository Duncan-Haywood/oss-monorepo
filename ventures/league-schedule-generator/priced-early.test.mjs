import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mulberry32 } from "./calc.mjs";
import { lowCarryOverRounds, lowCarryOverCappedRounds } from "./carryover.mjs";

// The annealers count a move's carry-over only as far as the acceptance draw needs (rand.peek, see
// anneal in carryover.mjs). That must change no season: these digests were taken from the code
// before the change, which priced every move in full (docs/history/ci-perf-2026-11-17-league-priced-early.md).

test("mulberry32's peek is the next draw, and peeking draws nothing", () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const p = a.peek();
    assert.equal(a.peek(), p);
    assert.equal(a(), p);
    assert.equal(b(), p);
  }
});

test("searches that stop counting rejected moves early give the same seasons as pricing every move in full", () => {
  const digest = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
  assert.equal(digest(lowCarryOverRounds(9, { seed: 3, effort: 0.2, breakWeight: 10 })), "4fa28241dee107e0", "weighted, odd");
  assert.equal(digest(lowCarryOverRounds(10, { seed: 2, effort: 0.2, cyclic: true })), "429eb05fbd4c67f0", "cyclic");
  assert.equal(digest(lowCarryOverCappedRounds(10, { seed: 4, effort: 0.2, maxBreaks: 12 })), "ae172bcfdff23ff0", "capped, even");
  assert.equal(digest(lowCarryOverCappedRounds(9, { seed: 6, effort: 0.2, maxBreaks: 8 })), "d801816b50a78776", "capped, odd");
});
