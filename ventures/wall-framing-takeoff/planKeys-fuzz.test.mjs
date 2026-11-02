import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_PLAN_KEYS, misspeltPlanKeys, misspeltPlanKeysNote } from "./planKeys.mjs";

// Property test for the misspelt-key check: known keys are never flagged, a one-letter slip in a
// known key is flagged with a known key as the suggestion, the plan is not mutated, and hostile
// inputs never throw.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("fuzz: known keys are never flagged, whatever the plan holds", () => {
  const rand = rng(11);
  for (let i = 0; i < 300; i++) {
    const plan = {};
    for (const k of KNOWN_PLAN_KEYS) if (rand() < 0.5) plan[k] = rand() < 0.5 ? 1 : { a: "x" };
    assert.deepEqual(misspeltPlanKeys(plan), []);
  }
});

test("fuzz: a one-letter slip in a known key is flagged and the suggestion is a known key", () => {
  const rand = rng(12);
  let flagged = 0;
  for (let i = 0; i < 400; i++) {
    const real = KNOWN_PLAN_KEYS[Math.floor(rand() * KNOWN_PLAN_KEYS.length)];
    const p = Math.floor(rand() * real.length);
    const kind = Math.floor(rand() * 3);
    const ch = "qxz"[Math.floor(rand() * 3)];
    const bad = kind === 0 ? real.slice(0, p) + ch + real.slice(p + 1) : kind === 1 ? real.slice(0, p) + real.slice(p + 1) : real.slice(0, p) + ch + real.slice(p);
    if (KNOWN_PLAN_KEYS.includes(bad)) continue;
    const plan = { [bad]: 1 };
    const before = JSON.stringify(plan);
    const found = misspeltPlanKeys(plan);
    assert.equal(JSON.stringify(plan), before, "plan not mutated");
    for (const f of found) {
      assert.ok(KNOWN_PLAN_KEYS.includes(f.didYouMean), `${f.didYouMean} is a known key`);
      assert.equal(f.name, bad);
    }
    // a slip in a key long enough to survive the length guard must be caught
    if (real.length >= 6 && bad.length >= 6) { assert.equal(found.length, 1, `${bad} (from ${real}) flagged`); flagged++; }
    const note = misspeltPlanKeysNote(found);
    assert.equal(note === "", found.length === 0);
  }
  assert.ok(flagged > 100, `only ${flagged} slips checked`);
});

test("fuzz: hostile inputs never throw", () => {
  for (const v of [null, undefined, 5, "x", [], [1], true, () => 1, { "": 1 }, { "__proto__x": 1 }, { constructor: 1 }]) {
    const out = misspeltPlanKeys(/** @type {any} */ (v));
    assert.ok(Array.isArray(out));
    assert.equal(typeof misspeltPlanKeysNote(out), "string");
  }
});
