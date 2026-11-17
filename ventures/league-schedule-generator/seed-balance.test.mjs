import test from "node:test";
import assert from "node:assert/strict";
import { roundRobin, relabelPlan, seedStrength, balanceSeedStrength, readSpec, buildSchedule, validateSchedule, encodeFields, decodeFields } from "./calc.mjs";

const homeAway = (plan, n) => Array.from({ length: n }, (_, t) => plan.map((r) => { const m = r.matches.find(([h, a]) => h === t || a === t); return m ? (m[0] === t ? "H" : "A") : "-"; }).join(""));

test("the plain shorter season gives the bottom seed the top seeds", () => {
  const s = seedStrength(roundRobin(20).slice(0, 10), 20);
  assert.equal(s.teams[19].opponentMean, 5.5); // seeds 1-10
  assert.equal(s.worst, 4.5);
});

test("balancing keeps every pairing legal, never worsens, and keeps the home/away patterns", () => {
  for (const [n, k] of [[6, 3], [9, 5], [12, 8], [20, 10], [31, 9]]) {
    const plan = roundRobin(n).slice(0, k);
    const bal = balanceSeedStrength(plan, n, { seed: 3 });
    assert.ok(bal.summary.after <= bal.summary.before + 1e-9);
    assert.ok(Math.abs(seedStrength(bal.plan, n).worst - bal.summary.after) < 1e-9);
    assert.deepEqual(bal.plan, relabelPlan(plan, bal.perm));
    assert.deepEqual([...bal.perm].sort((a, b) => a - b), [...Array(n).keys()]);
    const seen = new Set();
    for (const r of bal.plan) {
      const inRound = new Set();
      for (const [h, a] of r.matches) {
        assert.ok(!inRound.has(h) && !inRound.has(a));
        inRound.add(h); inRound.add(a);
        const key = Math.min(h, a) * 100 + Math.max(h, a);
        assert.ok(!seen.has(key), "a pair meets twice");
        seen.add(key);
      }
    }
    // the multiset of home/away sequences is the plan's: places moved, patterns did not
    assert.deepEqual(homeAway(bal.plan, n).sort(), homeAway(plan, n).sort());
  }
});

test("matches the exact optimum on 8 teams, 5 rounds (all 40,320 relabellings, eval/seed-balance.txt)", () => {
  const bal = balanceSeedStrength(roundRobin(8).slice(0, 5), 8);
  assert.ok(Math.abs(bal.summary.after - 0.342857) < 1e-5);
});

test("20 teams, 10 rounds: worst gap well under one seed place, same seed same season", () => {
  const plan = roundRobin(20).slice(0, 10);
  const a = balanceSeedStrength(plan, 20, { seed: 1 });
  const b = balanceSeedStrength(plan, 20, { seed: 1 });
  assert.ok(a.summary.after < 1);
  assert.deepEqual(a.perm, b.perm);
});

test("the page option: spec, schedule, notice, validation, share link", () => {
  const teams = Array.from({ length: 14 }, (_, i) => `Team ${i + 1}`).join("\n");
  const f = { teams, start: "2027-01-05", weekdays: ["Tue"], rounds: "8", balanceSeeds: true, blackouts: "Team 2: 2027-01-12" };
  const { errors, spec } = readSpec(f);
  assert.deepEqual(errors, []);
  assert.equal(spec.balanceSeeds, true);
  const s = buildSchedule(spec);
  assert.deepEqual(validateSchedule(s).errors, []);
  assert.ok(s.seedBalance && s.seedBalance.after < 0.5);
  assert.ok(s.notices.some((x) => x.startsWith("Even strength of schedule")));
  // blackout fit may not undo it
  const played = { rounds: s.rounds.map((r) => ({ matches: r.matches.map((m) => [m.home, m.away]) })) };
  assert.ok(seedStrength(played.rounds, 14).worst <= s.seedBalance.after + 1e-9);
  // a full round robin ignores the box
  assert.equal(readSpec({ ...f, rounds: "" }).spec.balanceSeeds, undefined);
  assert.equal(decodeFields(encodeFields(f)).balanceSeeds, true);
  assert.equal(decodeFields(encodeFields({ ...f, balanceSeeds: false })).balanceSeeds, false);
});
