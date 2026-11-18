import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDivisions, buildDivisionsWithBlackouts, fitDivisionsToBlackouts, divisionMatchNights, applyDivisionBlackouts, parseDivisionBlackouts, readDivisionsSpec, validateDivisions, blackoutFitNote } from "./divisions.mjs";

const ex = JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8"));
const { spec } = readDivisionsSpec(ex);

test("divisionMatchNights gives every match the night buildDivisions puts it on (skip dates, closures, split rounds)", () => {
  for (const extra of [{}, { splitRounds: true, courts: spec.courts.slice(0, 2) }]) {
    const sp = { ...spec, ...extra };
    const s = buildDivisions(sp);
    const nights = divisionMatchNights(sp);
    nights.forEach((list, di) => {
      const got = list.map(([h, a, d]) => `${h}-${a}@${d}`).sort();
      const want = s.nights.flatMap((n) => n.matches.filter((m) => m.div === di).map((m) => `${m.home}-${m.away}@${n.day}`)).sort();
      assert.deepEqual(got, want);
    });
  }
});

test("renamed teams keep a valid league and every match on the same night position", () => {
  const perms = spec.divisions.map((d) => Array.from({ length: d.teams.length }, (_, i) => (i * 5 + 1) % d.teams.length));
  // 5 is coprime with 6 and 8, so these are permutations
  for (const p of perms) assert.equal(new Set(p).size, p.length);
  const s = buildDivisions({ ...spec, perms });
  assert.ok(validateDivisions(s).ok, validateDivisions(s).errors.join(" "));
  assert.equal(s.nights.length, buildDivisions(spec).nights.length);
});

test("the fit never moves more matches than the build without it, and is the same season for the same seed", () => {
  const nights = divisionMatchNights(spec).flatMap((l) => l.map((x) => x[2]));
  const days = [...new Set(nights)].sort((a, b) => a - b);
  for (let k = 0; k < 6; k++) {
    const blackouts = {};
    spec.divisions.forEach((d, di) => d.teams.forEach((_, ti) => { blackouts[`${di}/${ti}`] = [days[(di * 7 + ti * 3 + k * 5) % days.length]]; }));
    const old = buildDivisionsWithBlackouts({ ...spec, blackoutFit: false }, blackouts);
    const neu = buildDivisionsWithBlackouts(spec, blackouts);
    assert.equal(old.fit, null);
    assert.ok(neu.errors.length < old.errors.length || (neu.errors.length === old.errors.length && neu.moves.length <= old.moves.length));
    assert.ok(validateDivisions(neu.schedule).ok);
    // no match sits on a blackout of one of its teams unless the mover said it could not move it
    if (!neu.errors.length) for (const n of neu.schedule.nights) for (const m of n.matches) for (const t of [m.home, m.away]) assert.ok(!(blackouts[`${m.div}/${t}`] || []).includes(n.day));
    assert.deepEqual(buildDivisionsWithBlackouts(spec, blackouts).schedule, neu.schedule);
    assert.equal(neu.fit.before.moves, old.moves.length);
  }
});

test("a team's blackout on a night its odd division has a bye: the fit finds it", () => {
  const sp = { ...spec, divisions: [{ name: "U9", teams: ["A", "B", "C", "D", "E"], double: false }], skipDays: [], courtClosures: {} };
  const nights = divisionMatchNights(sp)[0];
  const days = [...new Set(nights.map((x) => x[2]))];
  const blackouts = {};
  for (let t = 0; t < 5; t++) blackouts[`0/${t}`] = [days[(t * 2) % days.length]];
  const f = fitDivisionsToBlackouts(sp, blackouts);
  assert.equal(f.displaced[0].after, 0);
  const r = buildDivisionsWithBlackouts(sp, blackouts);
  assert.equal(r.moves.length, 0);
  assert.match(blackoutFitNote(r.fit), /Blackout fit: .* -> 0 matches moved/);
});

test("no blackouts: the same season as buildDivisions, and no fit note", () => {
  const r = buildDivisionsWithBlackouts(spec, {});
  assert.deepEqual(r.schedule, buildDivisions(spec));
  assert.equal(blackoutFitNote(r.fit), "");
});

test("blackout box text from the page goes through parseDivisionBlackouts to the fit", () => {
  const pb = parseDivisionBlackouts("U10/Hawks: 2026-10-06, 2026-10-08\nU12/Bears: 2026-10-13\nAdult/Rams: 2026-10-20", spec.divisions);
  assert.deepEqual(pb.errors, []);
  const old = applyDivisionBlackouts(buildDivisions(spec), pb.blackouts);
  const neu = buildDivisionsWithBlackouts(spec, pb.blackouts);
  assert.ok(neu.moves.length <= old.moves.length);
});
