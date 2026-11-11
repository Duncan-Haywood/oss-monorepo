import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestCarryOverRounds, lowCarryOverRounds, lowCarryOverDoubleRounds, carryOverSummary, CARRY_OVER_PICK } from "./carryover.mjs";
import { buildSchedule, readSpec, validateSchedule, encodeFields, decodeFields } from "./calc.mjs";

function pairsMet(rounds) {
  const m = new Map();
  for (const r of rounds) for (const [h, a] of r.matches) { const k = `${Math.min(h, a)}-${Math.max(h, a)}`; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

test("one try is the plain search at the same seed and the first weight", () => {
  const a = bestCarryOverRounds(6, { seed: 3, tries: 1 });
  const b = lowCarryOverRounds(6, { seed: 3, breakWeight: 10 });
  assert.deepEqual(a.rounds, b.rounds);
  const c = bestCarryOverRounds(6, { double: true, seed: 3, tries: 1 });
  const d = lowCarryOverDoubleRounds(6, { seed: 3, breakWeight: 10 });
  assert.deepEqual(c.rounds, d.rounds);
});

test("keeps the try with the least carry-over + pick x breaks, and is seeded", () => {
  for (const pick of [0, 10, 40]) {
    const r = bestCarryOverRounds(6, { double: true, seed: 2, tries: 4, pick });
    const scores = r.tries.map((c) => c.coe + pick * c.breaks);
    assert.equal(scores[r.chosen], Math.min(...scores));
    assert.equal(r.coe, r.tries[r.chosen].coe);
    assert.deepEqual(r.tries.map((c) => c.breakWeight), [10, 20, 40, 80]);
    const again = bestCarryOverRounds(6, { double: true, seed: 2, tries: 4, pick });
    assert.deepEqual(again.rounds, r.rounds);
  }
});

test("pick 0 never keeps more carry-over than any try; a large pick never keeps more breaks", () => {
  const fair = bestCarryOverRounds(6, { double: true, seed: 5, tries: 4, pick: 0 });
  assert.equal(fair.coe, Math.min(...fair.tries.map((c) => c.coe)));
  const few = bestCarryOverRounds(6, { double: true, seed: 5, tries: 4, pick: 1e6 });
  assert.equal(few.breaks, Math.min(...few.tries.map((c) => c.breaks)));
});

test("frontier holds exactly the tries nobody beats on both counts, sorted by carry-over", () => {
  const r = bestCarryOverRounds(6, { double: true, seed: 1, tries: 6 });
  const beats = (d, c) => d.coe <= c.coe && d.breaks <= c.breaks && (d.coe < c.coe || d.breaks < c.breaks);
  const want = r.tries.filter((c) => !r.tries.some((d) => beats(d, c)));
  assert.equal(r.frontier.length, want.length);
  for (let i = 1; i < r.frontier.length; i++) assert.ok(r.frontier[i - 1].coe <= r.frontier[i].coe);
  assert.ok(r.frontier.some((c) => c.index === r.chosen), "the kept try is on the frontier");
});

test("the kept double round robin is still a valid home-and-away season", () => {
  const r = bestCarryOverRounds(8, { double: true, seed: 1, tries: 2, effort: 0.25 });
  const met = pairsMet(r.rounds);
  assert.equal(met.size, 28);
  for (const c of met.values()) assert.equal(c, 2);
  assert.equal(r.repeats, 0);
  const s = carryOverSummary(r);
  assert.equal(s.tries, 2);
  assert.equal(JSON.parse(JSON.stringify(s)).candidates.length, 2);
});

test("rejects a bad number of tries", () => {
  assert.throws(() => bestCarryOverRounds(6, { tries: 0 }), /tries/);
});

const fields = (extra = {}) => ({ teams: "A\nB\nC\nD\nE\nF", start: "2026-01-05", weekdays: ["Mon"], carryOver: true, double: true, ...extra });

test("buildSchedule runs best-of-k with carryOverTries and reports it", () => {
  const { spec } = readSpec(fields({ carryOverPick: "fair" }));
  assert.equal(spec.carryOverPick, CARRY_OVER_PICK.fair);
  spec.carryOverTries = 3;
  const s = buildSchedule(spec);
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.equal(s.carryOverSearch.tries, 3);
  assert.equal(s.carryOverSearch.pick, 0);
  assert.equal(s.stats.carryOver.value, s.carryOverSearch.coe);
});

test("buildSchedule uses rounds searched in the worker, and ignores ones for another league", () => {
  const { spec } = readSpec(fields());
  const best = bestCarryOverRounds(6, { double: true, seed: spec.seed, tries: 3, pick: spec.carryOverPick });
  const plan = { teams: 6, double: true, rounds: best.rounds, summary: carryOverSummary(best) };
  const s = buildSchedule({ ...spec, carryOverPlan: plan });
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.equal(s.stats.carryOver.value, best.coe);
  assert.equal(s.carryOverSearch.tries, 3);
  const other = buildSchedule({ ...spec, carryOverPlan: { ...plan, teams: 8 } });
  assert.equal(other.carryOverSearch, undefined);
  assert.deepEqual(validateSchedule(other).errors, []);
});

test("an unknown trade falls back to balanced, and the share link keeps the choice", () => {
  assert.equal(readSpec(fields({ carryOverPick: "nonsense" })).spec.carryOverPick, CARRY_OVER_PICK.balanced);
  const back = decodeFields(encodeFields(fields({ carryOverPick: "breaks", skip: "", blackouts: "" })));
  assert.equal(back.carryOverPick, "breaks");
  assert.equal(decodeFields(encodeFields(fields({ carryOverPick: "<x>" }))).carryOverPick, "balanced");
});

test("the page runs the search in a worker, with a main-thread fallback and a trade picker", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /new Worker\(new URL\("\.\/carryover-worker\.mjs", import\.meta\.url\), \{ type: "module" \}\)/);
  assert.match(html, /id="carryOverPick"/);
  for (const v of ["balanced", "fair", "breaks"]) assert.match(html, new RegExp(`<option value="${v}"`));
  assert.match(html, /bestCarryOverRounds\(n,/, "fallback when workers are unavailable");
  const worker = readFileSync(new URL("./carryover-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /bestCarryOverRounds/);
  assert.match(worker, /type: "done"/);
});
