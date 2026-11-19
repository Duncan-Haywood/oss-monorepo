// README "Short spells under different series openings": which line dates a planted spell (the search inside the
// update-rate stretches, or the default line's own two cuts restated by edgeSpellsOf), and the committed verdicts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from './eval/update-rate-sim.mjs';
import { makeSeries, readSeries, CELLS, OPENINGS } from './eval/update-rate-spells-openings.mjs';

test('the series builder plants the spell after the opening, quiet start included', () => {
  const { z, S, D } = makeSeries(makeRng(1), 'Z50P250', 'P1w60', false);
  assert.equal(S, 300); assert.equal(D, 60); assert.equal(z.length, 300 + 599);
  assert.ok(z.slice(0, 50).filter(Boolean).length >= 45, 'quiet start repeats almost every day');
  const nul = makeSeries(makeRng(1), 'P120', 'W5', true);
  assert.equal(nul.D, 0); assert.equal(nul.z.length, 120 + 599);
  assert.equal(CELLS.length, Object.keys(OPENINGS).length * 9);
});

test('a Wednesdays-only spell is dated by the --spells line, by the search or by the restated edges', () => {
  const rnd = makeRng(20261231);
  let found = 0;
  for (let r = 0; r < 4; r++) {
    const { z, S } = makeSeries(rnd, 'P120', 'P1w60', false), x = readSeries(z), at = (q) => Math.abs(q.a - S) <= 10;
    if (x.search.some(at) || x.printedEdge.some(at)) found++;
    for (const e of x.printedEdge) assert.ok(!x.search.some((s) => s.a < e.b && e.a < s.b), 'a printed edge spell overlaps no search spell');
  }
  assert.equal(found, 4);
});

test('the committed verdicts: O1 and O2 fail, O3 and O4 pass; the post hoc weekday reading', () => {
  const out = readFileSync(new URL('./eval/update-rate-spells-openings.out.txt', import.meta.url), 'utf8');
  assert.match(out, /O1 line found within 30 of P500 at every opening: FAIL \(P3w30 P250 135 vs 181/);
  assert.match(out, /O2 60-step cells, neither <= 20 at every opening: FAIL \(P5d60 P120 neither 54/);
  assert.match(out, /O3 null cells, printed false spells <= 0\.020 \(worst 0\.000\): pass/);
  assert.match(out, /O4 null cells, edge false spells <= 0\.020 \(worst 0\.000\): pass/);
  assert.match(out, /P3w60\n {2}P120 {5}line 196 {3}search only {2}10 {2}edge only 186/);
  const why = readFileSync(new URL('./eval/update-rate-spells-openings-why.out.txt', import.meta.url), 'utf8');
  assert.match(why, /S 502 \(starts Sat\) {2}informative days {2}8 {2}found 120/);
  assert.match(why, /S 506 \(starts Wed\) {2}informative days {2}9 {2}found 174/);
});
