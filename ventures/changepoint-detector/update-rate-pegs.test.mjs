// README "Currency pegs: the update-rate check against documented dates" (eval/update-rate-pegs.mjs,
// .out.txt). data/fx-pegs.csv holds four windows of the Federal Reserve's daily noon rates (H.10 via FRED,
// repackaged under the PDDL by github.com/datasets/exchange-rates) around documented pegs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSeries, EVENTS } from './eval/update-rate-pegs.mjs';
import { updateRateChanges } from './update-rate.mjs';
import { staleLRMarkov, STALE_LR_MARKOV } from './rounded-walk.mjs';

const by = readSeries(new URL('./data/fx-pegs.csv', import.meta.url));
function window(country, from, to) {
  const s = by.get(country), i = s.dates.findIndex((d) => d >= from), j = s.dates.findIndex((d) => d >= to);
  return { dates: s.dates.slice(i, j < 0 ? undefined : j), values: s.values.slice(i, j < 0 ? undefined : j) };
}
const dated = (w, ch) => ({ at: w.dates[ch.index], from: w.dates[ch.from], to: w.dates[ch.to], direction: ch.direction });

test('the ringgit peg (1998-09-02) is dated to within days, and the check finishes', () => {
  const w = window('Malaysia', '1998-04-01', '1999-03-01');
  const t0 = Date.now();
  const u = updateRateChanges(w.values);
  assert.ok(Date.now() - t0 < 30000, 'ran for hours before maxJump: one print of 3.8950 among 3.8000s');
  assert.equal(u.changes.length, 1);
  const c = dated(w, u.changes[0]);
  assert.equal(c.direction, 'less often');
  assert.ok(c.from <= '1998-09-02' && c.to >= '1998-09-02', JSON.stringify(c));
  // The pegged stretch's one-tick moves read as rounding, since its one big print stops the stale-feed test.
  assert.equal(u.changes[0].rounding, true);
  assert.equal(u.changes[0].staleLR, null);
});

test('Venezuela exchange controls (trading suspended 2003-01-22, fixed rate 2003-02-05) are dated', () => {
  const w = window('Venezuela', '2002-07-01', '2003-08-01');
  const u = updateRateChanges(w.values);
  assert.equal(u.changes.length, 1);
  const c = dated(w, u.changes[0]);
  assert.equal(c.direction, 'less often');
  assert.ok(c.from <= '2003-01-22' && c.to >= '2003-01-22', JSON.stringify(c));
});

test('a stretch with a move over maxJump ticks is not tested (null), below it the test runs', () => {
  assert.equal(STALE_LR_MARKOV.maxJump, 50);
  const k = Array.from({ length: 40 }, (_, t) => (t % 5 === 0 ? 1 : 0));
  k[20] = 51;
  assert.equal(staleLRMarkov(k), null);
  assert.equal(staleLRMarkov(k, { maxJump: null, nus: [Infinity], iters: 4, rounds: 1 }) !== null, true);
});

test('the committed run: 4 of 7 documented events dated (D1 fails), median width 8.5 rows', () => {
  const out = readFileSync(new URL('./eval/update-rate-pegs.out.txt', import.meta.url), 'utf8');
  assert.equal(EVENTS.length, 7);
  assert.match(out, /D1 dated 4 of 7 \(bar >= 5\): FAIL/);
  assert.match(out, /D2 median range width 8\.5 rows \(bar <= 60\): pass/);
});
