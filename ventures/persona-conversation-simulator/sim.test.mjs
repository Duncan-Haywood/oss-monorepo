import test from "node:test";
import assert from "node:assert/strict";
import { makePersona, makeCast, profile, traitsFromText, checkFictional, conflictStyle } from "./persona.mjs";
import { SCENARIOS, scenarioById, simulate, runMany, transcriptText } from "./sim.mjs";
import { pair, group, airtime } from "./dynamics.mjs";

const mk = (seed, t) => makePersona({ seed, traits: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50, ...t } });

test("a seed always gives the same cast and the same conversation", () => {
  const a = makeCast("s", 4), b = makeCast("s", 4);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((p) => p.name.split(" ")[0])).size, 4);
  for (const sc of SCENARIOS) assert.deepEqual(simulate(sc, a, { seed: 3 }), simulate(sc, b, { seed: 3 }));
});

test("trait scores stay in 0-100 and the profile reads every trait", () => {
  for (const p of makeCast("range", 30).concat(makePersona({ seed: 1, traits: { openness: 400, neuroticism: -5 } }))) {
    for (const v of Object.values(p.traits)) assert.ok(v >= 0 && v <= 100);
    const pr = profile(p);
    assert.equal(pr.reads.length, 5);
    assert.ok(pr.tips.length >= 1);
  }
});

test("conflict style follows assertiveness and cooperativeness", () => {
  assert.equal(conflictStyle({ openness: 50, conscientiousness: 50, extraversion: 90, agreeableness: 10, neuroticism: 50 }).style, "competing");
  assert.equal(conflictStyle({ openness: 50, conscientiousness: 50, extraversion: 10, agreeableness: 90, neuroticism: 50 }).style, "accommodating");
  assert.equal(conflictStyle({ openness: 80, conscientiousness: 50, extraversion: 90, agreeableness: 80, neuroticism: 50 }).style, "collaborating");
  assert.equal(conflictStyle({ openness: 20, conscientiousness: 50, extraversion: 10, agreeableness: 30, neuroticism: 50 }).style, "avoiding");
  assert.equal(conflictStyle({ openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 }).style, "compromising");
});

test("a description sets traits from words, with negation and intensity", () => {
  const { traits, matched } = traitsFromText("A very blunt, organised and calm person who is not shy");
  assert.ok(traits.agreeableness < 25);
  assert.ok(traits.conscientiousness > 65);
  assert.ok(traits.neuroticism < 35);
  assert.ok(traits.extraversion > 65, "not shy reads as more extraverted");
  assert.equal(traits.openness, 50);
  assert.equal(matched.length, 4);
});

test("inputs pointing at a real person are refused", () => {
  for (const bad of ["linkedin.com/in/jane", "see https://example.com/me", "@janedoe", "jane@example.com", "call +1 415 555 0100", "her Instagram"]) {
    assert.equal(checkFictional(bad).ok, false, bad);
  }
  assert.equal(checkFictional("a blunt founder who loves spreadsheets").ok, true);
});

test("agreeable, calm negotiators reach a deal more often than disagreeable, anxious ones", () => {
  const sc = scenarioById("salary");
  const soft = runMany(sc, [mk("a", { agreeableness: 85, neuroticism: 20 }), mk("b", { agreeableness: 85, neuroticism: 20 })], { runs: 300 });
  const hard = runMany(sc, [mk("c", { agreeableness: 15, neuroticism: 80 }), mk("d", { agreeableness: 15, neuroticism: 80 })], { runs: 300 });
  const deal = (m) => m.outcomes.find((o) => o.outcome === "deal")?.share ?? 0;
  assert.ok(deal(soft) > deal(hard) + 0.2, `${deal(soft)} vs ${deal(hard)}`);
});

test("negotiated prices stay inside both sides' limits", () => {
  for (const id of ["salary", "freelance-rate", "used-car"]) {
    const sc = scenarioById(id);
    for (let i = 0; i < 80; i++) {
      const cast = makeCast(`lim-${i}`, 2);
      const r = simulate(sc, cast, { seed: i });
      if (r.outcome.result !== "deal") continue;
      const [s, b] = cast.map((p) => r.outcome.limits[p.id]);
      assert.ok(r.outcome.price >= s - sc.step && r.outcome.price <= b + sc.step, `${id} ${r.outcome.price} outside ${s}-${b}`);
    }
  }
});

test("extraverts take more turns in a group", () => {
  const cast = [mk("loud", { extraversion: 95 }), mk("quiet", { extraversion: 5 }), mk("mid", { extraversion: 50 })];
  const m = runMany(scenarioById("offsite"), cast, { runs: 200 });
  assert.ok(m.perPerson[0].airtime > m.perPerson[2].airtime && m.perPerson[2].airtime > m.perPerson[1].airtime);
  const a = airtime(cast);
  assert.ok(Math.abs(a.reduce((s, x) => s + x.share, 0) - 1) < 1e-9);
});

test("group decisions end in a stated outcome and a readable transcript", () => {
  const cast = makeCast("g", 5);
  for (const id of ["team-deadline", "offsite", "chores"]) {
    const sc = scenarioById(id);
    for (let i = 0; i < 40; i++) {
      const r = simulate(sc, cast, { seed: i });
      assert.ok(["decided", "postponed", "no decision"].includes(r.outcome.result));
      if (r.outcome.result === "decided") assert.ok(sc.options.some((o) => o.id === r.outcome.option));
      for (const t of r.turns) assert.doesNotMatch(t.text, /undefined|NaN|\bWe (a|an|the) /);
    }
    assert.match(transcriptText(simulate(sc, cast, { seed: 1 }), cast), /\n\n\[.+\]$/);
  }
  assert.throws(() => simulate(scenarioById("chores"), cast.slice(0, 1)));
  assert.throws(() => simulate(scenarioById("salary"), cast.slice(0, 1)));
});

test("pair notes name the traits behind the friction", () => {
  const p = pair(mk("x", { agreeableness: 10 }), mk("y", { agreeableness: 20 }));
  assert.equal(p.verdict, "some friction");
  assert.match(p.notes[0].text, /low on agreeableness/);
  const g = group([mk("x", { extraversion: 95 }), mk("y", { extraversion: 10 }), mk("z", {})]);
  assert.equal(g.pairs.length, 3);
  assert.ok(g.notes.some((n) => /speak least/.test(n)));
});
