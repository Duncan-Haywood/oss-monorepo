import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_PLAN_KEYS, misspeltPlanKeys, misspeltPlanKeysNote } from "./planKeys.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

// Property test for the misspelt-key check: random plans with known keys, one-edit typos,
// case slips and unrelated extras. Known keys are never flagged, a single-edit typo of a
// long key is flagged with a known key, the plan is never mutated, hostile input never
// throws, and the CLI keeps exit code 0 with the note only on the text report.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const ALPHA = "abcdefghijklmnopqrstuvwxyz";
function typo(r, k) {
  const i = Math.floor(r() * k.length);
  const c = ALPHA[Math.floor(r() * 26)];
  switch (Math.floor(r() * 3)) {
    case 0: return k.slice(0, i) + c + k.slice(i); // insert
    case 1: return k.slice(0, i) + k.slice(i + 1); // delete
    default: return k.slice(0, i) + c + k.slice(i + 1); // substitute
  }
}

test("fuzz: known keys never flagged; typos of long keys are; plan untouched", () => {
  const r = rng(20261102);
  for (let n = 0; n < 400; n++) {
    const plan = {};
    for (const k of KNOWN_PLAN_KEYS) if (r() < 0.3) plan[k] = r() < 0.5 ? 1 : {};
    const known = Object.keys(plan);
    const base = KNOWN_PLAN_KEYS[Math.floor(r() * KNOWN_PLAN_KEYS.length)];
    let bad = typo(r, base);
    if (r() < 0.2) bad = base[0].toUpperCase() + base.slice(1);
    const wantFlag = base.length >= 6 && !KNOWN_PLAN_KEYS.includes(bad);
    if (!KNOWN_PLAN_KEYS.includes(bad)) plan[bad] = 24;
    plan["zz_note_" + n] = "free text";
    const before = JSON.stringify(plan);
    const found = misspeltPlanKeys(plan);
    assert.equal(JSON.stringify(plan), before, "plan mutated");
    for (const f of found) {
      assert.ok(KNOWN_PLAN_KEYS.includes(f.didYouMean), "suggestion is a known key");
      assert.ok(!KNOWN_PLAN_KEYS.includes(f.name) && f.name in plan);
      assert.ok(!f.name.startsWith("zz_note_"));
    }
    for (const k of known) assert.ok(!found.some((f) => f.name === k), `known key ${k} flagged`);
    if (wantFlag && !KNOWN_PLAN_KEYS.includes(bad)) {
      assert.ok(found.some((f) => f.name === bad), `typo ${bad} of ${base} not flagged`);
    }
    const note = misspeltPlanKeysNote(found);
    assert.equal(note === "", found.length === 0);
  }
});

test("fuzz: hostile inputs never throw", () => {
  const weird = [null, undefined, 0, "x", [], [1], { "": 1 }, JSON.parse('{"__proto__": 1, "constructor": 2}'),
    { ["a".repeat(5000)]: 1 }, { "\u0000walls": 1 }, { "wallz": 1 }, { Walls: 1 }, { ro: 1 }];
  for (const w of weird) {
    const f = misspeltPlanKeys(w);
    assert.ok(Array.isArray(f));
    assert.equal(typeof misspeltPlanKeysNote(f), "string");
  }
});

test("fuzz: CLI stays 0, note only on text output", () => {
  const r = rng(7);
  for (let n = 0; n < 15; n++) {
    const plan = { ...samplePlan() };
    const base = ["studSpacing", "defaultHeaderHeight", "cornerExtraStuds", "topPlateLap"][Math.floor(r() * 4)];
    const bad = typo(r, base);
    if (KNOWN_PLAN_KEYS.includes(bad)) continue;
    plan[bad] = 24;
    const t = main(["plan.json"], () => JSON.stringify(plan));
    assert.equal(t.code, 0);
    assert.match(t.out, /did you mean/);
    const j = main(["plan.json", "--json"], () => JSON.stringify(plan));
    assert.equal(j.code, 0);
    assert.doesNotThrow(() => JSON.parse(j.out));
  }
});
