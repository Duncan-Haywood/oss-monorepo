// Two call-outs in one week: coverPairRisk and --second-callout-price (2026-11-14, eval/cover-pair-exposure.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk, coverSlackText } from "./calc.mjs";
import { parseArgs } from "./cli.mjs";
import { playFrom } from "./eval/steady-for-callouts.mjs";

const O = { minRestHours: 10 };
const HEAD = "name, wage, max hours, min hours, availability";
// Ana can only work Tuesday and Bo only Wednesday, so the build gives each their own day; Cy can stand in on either, up to a cap.
const team = (cyMax) => `${HEAD}\nAna, 20, 40, 0, Tue\nBo, 20, 40, 0, Wed\nCy, 20, ${cyMax}, 0, Tue; Wed`;
const FREE = "Tue, 9:00, 17:00, 1\nWed, 9:00, 17:00, 1";

function setup(cyMax) {
  const stf = team(cyMax), staff = parseStaff(stf).staff, slots = parseShifts(FREE).slots;
  const r = buildRoster(staff, slots, O);
  return { stf, staff, slots, r, ctx: buildContext(staff, slots, O) };
}

test("one stand-in for two call-outs: each day is safe alone, the pair clashes", () => {
  const { staff, r, ctx } = setup(8);
  assert.deepEqual(r.assignments.map((a) => a.person), ["Ana", "Bo"]); // the build gives each their own day
  const one = coverRisk(ctx, r.owner);
  assert.equal(one.riskyDays, 0); // Cy (8 h a week) can take either day
  const two = coverPairRisk(ctx, r.owner, { single: one, keep: true });
  assert.equal(two.pairs, 1);
  assert.equal(two.clashing, 1);
  assert.equal(two.hours, 8);
  assert.equal(staff[two.cases[0].a.person].name, "Ana");
  // The played week agrees: Ana out Tuesday, Bo out Wednesday, one of the two shifts ends open.
  const p = playFrom(team(8), FREE, r, [{ day: 1, out: ["Ana"], extras: [] }, { day: 2, out: ["Bo"], extras: [] }], O);
  assert.equal(p.added, 8);
});

test("room for both: no clashing pair, and the played week opens nothing", () => {
  const { r, ctx } = setup(16);
  const two = coverPairRisk(ctx, r.owner);
  assert.equal(two.pairs, 1);
  assert.equal(two.clashing, 0);
  const p = playFrom(team(16), FREE, r, [{ day: 1, out: ["Ana"], extras: [] }, { day: 2, out: ["Bo"], extras: [] }], O);
  assert.equal(p.added, 0);
});

test("risky days are left to the single count and the roster is left as found", () => {
  const stf = `${HEAD}\nAna, 20, 40, 0, Tue\nBo, 20, 40, 0, Wed`; // nobody can stand in at all
  const staff = parseStaff(stf).staff, slots = parseShifts(FREE).slots;
  const r = buildRoster(staff, slots, O);
  const ctx = buildContext(staff, slots, O);
  const before = r.owner.slice();
  const one = coverRisk(ctx, r.owner);
  assert.equal(one.riskyDays, 2);
  const two = coverPairRisk(ctx, r.owner, { single: one });
  assert.equal(two.pairs, 0);
  assert.deepEqual(r.owner, before);
});

test("a caller off Tuesday may still take a Wednesday shift for the second call-out", () => {
  // Ana works Tue, Bo works Wed; Cy can only do Tuesday. Ana (off Tuesday only) can take Bo's Wednesday.
  const stf = `${HEAD}\nAna, 20, 40, 0, Tue; Wed\nBo, 20, 40, 0, Wed\nCy, 20, 8, 0, Tue`;
  const staff = parseStaff(stf).staff, slots = parseShifts(FREE).slots;
  const ctx = buildContext(staff, slots, O);
  const owner = slots.map((s) => (s.day === 1 ? 0 : 1)); // Ana Tue, Bo Wed
  const two = coverPairRisk(ctx, owner);
  assert.equal(two.clashing, 0); // Cy takes Tuesday, Ana takes Wednesday
  assert.equal(coverPairRisk(ctx, owner, { callerTakes: false }).clashing, 1);
});

test("--second-callout-price reaches the build and the slack line names the pair hours", () => {
  const o = parseArgs(["--cover-price", "25", "--second-callout-price", "5"]);
  assert.equal(o.options.coverPairPrice, 5);
  assert.throws(() => parseArgs(["--second-callout-price", "x"]), /second-callout-price/);
  const { staff, slots } = setup(8);
  const r = buildRoster(staff, slots, { ...O, coverPrice: 25, coverPairPrice: 5 });
  assert.equal(r.coverSlack.pairPrice, 5);
  assert.equal(r.coverSlack.pairHours, 8);
  assert.match(coverSlackText(r.coverSlack, staff), /Second call-outs \(priced at \$5\.00 an hour\).*carry 8 h/);
  // Without the option nothing about pairs is computed or printed.
  const plain = buildRoster(staff, slots, { ...O, coverPrice: 25 });
  assert.equal(plain.coverSlack.pairHours, null);
  assert.doesNotMatch(coverSlackText(plain.coverSlack, staff), /Second call-outs/);
});

test("the page offers the second-call-out price beside the slack price and counts its use", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="pairprice"/);
  assert.match(html, /coverPairPrice: Number\(\$\("#pairprice"\)\.value\)/);
  assert.match(html, /second_callout_price_used/);
});

test("over the shift-copy cap the second-call-out price is skipped, and the slack line says why", () => {
  const { staff, slots } = setup(8);
  const r = buildRoster(staff, slots, { ...O, coverPrice: 25, coverPairPrice: 5, coverPairPriceSlots: 1 });
  assert.equal(r.coverSlack.pairPrice, 0);
  assert.deepEqual(r.coverSlack.pairSkipped, { slots: 2, cap: 1 });
  assert.match(coverSlackText(r.coverSlack, staff), /Second call-outs were not priced: the week has 2 shift copies, over the 1/);
});
