// The planner's one-week look-ahead and steady ties (README "The planner picks a week's tie by what it leaves the next").
import test from "node:test";
import assert from "node:assert/strict";
import { planWeeks, sampleStaff, sampleShifts, keepFrom, rosterScoreUnder, parseStaff, parseShifts, buildRoster } from "./calc.mjs";

const shape = (r) => JSON.stringify(keepFrom(r));
const proven = (r) => ["optimal", "improved"].includes(r.optimality?.status);
const guideStaff = () => sampleStaff().replace(/^(Ana[^\n]*)$/m, "$1, off: 2026-12-01").replace(/^(Ben[^\n]*)$/m, "$1, off: 2026-12-04");
const O = { weeks: 4, weekStart: "2026-11-16", minRestHours: 10 };

test("the guide page's plan: week 3 leaves 17 h open, not 20, by the steady tie or by the look-ahead", () => {
  const old = planWeeks(guideStaff(), sampleShifts(), { ...O, deferCover: false });
  const bare = planWeeks(guideStaff(), sampleShifts(), { ...O, lookahead: false, steadyTies: false });
  const look = planWeeks(guideStaff(), sampleShifts(), { ...O, steadyTies: false });
  const both = planWeeks(guideStaff(), sampleShifts(), O);
  const open = (p) => p.weeks.map((w) => w.roster.unfilledHours);
  assert.deepEqual(open(old), [15, 15, 17, 15]);
  assert.deepEqual(open(bare), [15, 15, 20, 15], "column generation first, neither");
  assert.deepEqual(open(look), [15, 15, 17, 15]);
  assert.deepEqual(open(both), [15, 15, 17, 15]);
  // Look-ahead alone: week 2's first tie leaves week 3 20 h, its relaxation 17; the old order's tie of the same score leaves 17.
  const pick = look.weeks[1].tiePick;
  assert.ok(pick, "week 2 looked past its first tie");
  assert.equal(pick.order, "walk");
  assert.deepEqual([pick.defaultNextOpenHours, pick.nextOpenHours, pick.relaxedNextOpenHours], [20, 17, 17]);
  assert.ok(Math.abs(look.weeks[1].roster.score - bare.weeks[1].roster.score) < 1e-6, "the roster it took scores the same as the one passed over");
  assert.equal(look.lookahead.picks, 1);
  // The default: week 2 posts week 1's roster again (it ties), which already leaves week 3 at its relaxation, so nothing more
  // is built; week 3 (Ana and Ben off) is built toward week 2's roster, and week 4 goes back to it.
  assert.deepEqual(both.weeks.map((w) => w.steadied ?? null), [null, "same as week 1", "closer to week 2", "same as week 2"]);
  assert.deepEqual(both.weeks.map((w) => !!w.leave), [false, false, true, false]);
  assert.equal(both.lookahead.picks, 0);
  for (const p of [look, both]) for (const w of p.weeks) assert.ok(proven(w.roster), `week ${w.week}`);
});

test("steady ties: with nothing changing, the sample plan posts one rota every week; without them it cycles through ties", () => {
  const o = { weeks: 5, weekStart: "2026-11-16" };
  const steady = planWeeks(sampleStaff(), sampleShifts(), o);
  const loose = planWeeks(sampleStaff(), sampleShifts(), { ...o, steadyTies: false });
  assert.equal(new Set(steady.weeks.map((w) => shape(w.roster))).size, 1);
  assert.ok(new Set(loose.weeks.map((w) => shape(w.roster))).size > 1);
  assert.equal(steady.totalOpenHours, loose.totalOpenHours);
  assert.equal(steady.totalCost, loose.totalCost);
  steady.weeks.forEach((w, k) => assert.ok(Math.abs(w.roster.score - loose.weeks[k].roster.score) < 1e-6, `week ${k + 1} same score`));
  assert.equal(steady.weeks[1].steadied, "same as week 1");
  assert.deepEqual(steady.weeks.map((w) => w.sameAs ?? null), [null, null, 2, 2, 2]);
});

test("the old order (deferCover false) is the planner before: no look-ahead, no steady ties", () => {
  const p = planWeeks(guideStaff(), sampleShifts(), { ...O, deferCover: false });
  assert.equal(p.lookahead, null);
  assert.ok(p.weeks.every((w) => !w.tiePick && !w.steadied));
});

test("rosterScoreUnder: a roster's own score under its own staff, invalid when a person is gone", () => {
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const r = buildRoster(staff, slots, { exact: false });
  const sc = rosterScoreUnder(staff, slots, {}, r);
  assert.ok(sc.valid);
  assert.ok(Math.abs(sc.score - r.score) < 1e-6, `${sc.score} vs ${r.score}`);
  const worker = r.assignments.find((a) => a.person).person;
  assert.equal(rosterScoreUnder(staff.filter((p) => p.name !== worker), slots, {}, r).valid, false);
});

test("the page's plan table names a steadied week and a look-ahead pick", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /w\.steadied \? ` <span class="note">\$\{esc\(w\.steadied\)\} \(a tie\)<\/span>`/);
  assert.match(html, /picked to leave next week \$\{num\(w\.tiePick\.defaultNextOpenHours - w\.tiePick\.nextOpenHours\)\} h fewer open/);
});
