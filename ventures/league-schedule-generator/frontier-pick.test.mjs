// The frontier picker (README "Pick any season on the frontier", 2026-11-12): gap tries widen the
// list a person picks from without moving any of the four choices, and a pick travels in the share
// link only for the settings it was made for.
import test from "node:test";
import assert from "node:assert/strict";
import { bestCarryOverRounds, carryOverTry, combineCarryOverTries, carryOverSummary, carryOverKeepText, carryOverKeepIndex, CARRY_OVER_GAP, CARRY_OVER_PICK } from "./carryover.mjs";
import { buildSchedule, readSpec, validateSchedule, encodeFields, decodeFields } from "./calc.mjs";

// 8 teams home-and-away, 4 weighted + 2 capped + 2 gap tries, searched once
const all = Array.from({ length: 8 }, (_, i) => carryOverTry(8, i, { double: true, seed: 1, weighted: 4 }));

test("gap tries never move the season any of the four choices keeps", () => {
  for (const pick of Object.values(CARRY_OVER_PICK)) {
    const ten = combineCarryOverTries(structuredClone(all.slice(0, 6)), pick);
    const wide = combineCarryOverTries(structuredClone(all), pick, { among: 6 });
    assert.equal(wide.chosen, ten.chosen, `pick ${pick}`);
    assert.deepEqual(wide.rounds, ten.rounds);
    assert.equal(wide.kept, false);
    assert.equal(wide.tries.length, 8);
    assert.equal(carryOverSummary(wide).among, 6);
  }
  // and the frontier is over every try, so a gap try can appear in it
  const f = combineCarryOverTries(structuredClone(all), 10, { among: 6 }).frontier;
  assert.ok(f.every((c) => !all.some((d) => d.coe <= c.coe && d.breaks <= c.breaks && (d.coe < c.coe || d.breaks < c.breaks))));
});

test("bestCarryOverRounds with gap tries is the same search the page pools", () => {
  const b = bestCarryOverRounds(8, { double: true, seed: 1, tries: 4, capped: 2, gap: 2, pick: 40 });
  const p = combineCarryOverTries(structuredClone(all), 40, { among: 6 });
  assert.deepEqual(carryOverSummary(b), carryOverSummary(p));
  assert.deepEqual(b.tries.slice(6).map((c) => c.maxBreaks), [6 * 3 + 24, 6 * 3 + 36], "gap tries continue the cap sequence");
  assert.equal(CARRY_OVER_GAP, 2);
});

test("a kept try wins over the choice, and the summary says it was picked", () => {
  for (let k = 0; k < all.length; k++) {
    const r = combineCarryOverTries(structuredClone(all), 10, { among: 6, keep: k });
    assert.equal(r.chosen, k);
    assert.equal(r.coe, all[k].coe);
    assert.equal(r.kept, true);
    assert.equal(carryOverSummary(r).kept, true);
  }
  // an index out of range is ignored
  assert.equal(combineCarryOverTries(structuredClone(all), 10, { among: 6, keep: 99 }).kept, false);
});

test("a pick names its settings and is refused for any other league", () => {
  const at = { n: 20, double: true, seed: 3 };
  const t = carryOverKeepText(11, at);
  assert.equal(t, "11@20d3");
  assert.equal(carryOverKeepIndex(t, { ...at, tries: 12 }), 11);
  assert.equal(carryOverKeepIndex(t, { ...at, n: 19, tries: 12 }), null);
  assert.equal(carryOverKeepIndex(t, { ...at, double: false, tries: 12 }), null);
  assert.equal(carryOverKeepIndex(t, { ...at, seed: 4, tries: 12 }), null);
  assert.equal(carryOverKeepIndex(t, { ...at, tries: 10 }), null, "an index past the tries is dropped");
  for (const junk of ["", null, undefined, "x@20d3", "11@20x3", "1e3@20d3"]) assert.equal(carryOverKeepIndex(junk, { ...at, tries: 12 }), null);
  assert.equal(carryOverKeepIndex("2@7s-5", { n: 7, double: false, seed: -5 }), 2);
});

const fields = (extra = {}) => ({ teams: "A\nB\nC\nD\nE\nF\nG\nH", start: "2026-01-05", weekdays: ["Mon"], carryOver: true, double: true, seed: 1, ...extra });

test("buildSchedule keeps a picked try, and ignores a pick made for another seed", () => {
  const base = readSpec(fields()).spec;
  const run = (spec) => buildSchedule({ ...spec, carryOverTries: 4, carryOverCapped: 2, carryOverGap: 2 });
  const plain = run(base);
  assert.equal(plain.carryOverSearch.kept, undefined);
  const want = all.findIndex((t, i) => i !== plain.carryOverSearch.chosen && (t.coe !== all[plain.carryOverSearch.chosen].coe || t.breaks !== all[plain.carryOverSearch.chosen].breaks));
  assert.ok(want >= 0);
  const picked = run(readSpec(fields({ carryOverKeep: carryOverKeepText(want, { n: 8, double: true, seed: 1 }) })).spec);
  assert.deepEqual(validateSchedule(picked).errors, []);
  assert.equal(picked.carryOverSearch.chosen, want);
  assert.equal(picked.carryOverSearch.kept, true);
  assert.equal(picked.stats.carryOver.value, all[want].coe, "the schedule's own recount is the kept try's");
  const stale = run(readSpec(fields({ carryOverKeep: carryOverKeepText(want, { n: 8, double: true, seed: 2 }) })).spec);
  assert.equal(stale.carryOverSearch.chosen, plain.carryOverSearch.chosen);
});

test("the share link carries a pick and drops anything malformed", () => {
  const f = fields({ carryOverPick: "breaks", carryOverKeep: "11@20d3" });
  assert.equal(decodeFields(encodeFields(f)).carryOverKeep, "11@20d3");
  assert.equal(decodeFields(encodeFields({ ...f, carryOverKeep: "<script>" })).carryOverKeep, "");
  assert.equal(decodeFields(encodeFields({ ...f, carryOverKeep: "" })).carryOverKeep, "");
  // a link made before the picker has no pick and builds the same season it always did
  assert.equal(decodeFields(encodeFields(fields())).carryOverKeep, "");
});
