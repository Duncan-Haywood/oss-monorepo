// README "Short spells scored on the weekdays that differ": the differing-weekday score, its two arms, and the
// committed verdicts of eval/update-rate-spells-weekdays.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestReturnCost, bestSpellWeekdays, spellsFromWeekdayRows, spellsResult, spellsLine, weekdayNames, SHORT_SPELLS, SHORT_SPELLS_DOW } from './update-rate.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

function planted(seed) { // Monday-Friday with 60 steps of Mon/Wed/Fri from 120 (0 = Monday)
  const rnd = makeRng(seed), z = [];
  for (let t = 0; t < 300; t++) { const pub = t >= 120 && t < 180 ? [0, 2, 4].includes(t % 7) : t % 7 < 5; z.push(rnd() < (pub ? 0.03 : 0.95) ? 1 : 0); }
  return { z, days: z.map((_, s) => s % 7) };
}

test('at beta 0 the score is the weekday gain without falling weekdays; a beta keeps only the differing ones', () => {
  const { z, days } = planted(4242);
  const d = bestReturnCost(z, 0, 300, { kind: 'dow', days, sparse: true });
  const [b0, b4] = bestSpellWeekdays(z, 0, 300, { days, betas: [0, 4] });
  assert.ok(Math.abs(b0.a - 120) <= 5 && Math.abs(b0.b - 180) <= 5, 'the spell is found');
  assert.ok(b0.gain <= d.gain + 1e-9 && b0.gain > 0.9 * d.gain, 'close to, never above, the full weekday gain');
  assert.equal(b4.weekdays, (1 << 1) | (1 << 3), 'Tuesdays and Thursdays only');
  assert.ok(Math.abs(b4.a - 120) <= 5);
});

test('arm A keeps round 5\'s choice; arm B also tries the weekday score where the stretch is not weekly', () => {
  const sel = [{ a: 100, b: 160, gain: 30, shareInside: 0.3, shareOutside: 0.03, weekdays: 65 }];
  const rows = [{ L: 0, R: 600, weekly: false, chain: { a: 90, b: 170, gain: 10, shareInside: 0.2, shareOutside: 0.05 }, sel }];
  assert.equal(spellsFromWeekdayRows(rows, { arm: 'A', pen: 20 }).length, 0);
  const b = spellsFromWeekdayRows(rows, { arm: 'B', pen: 20 });
  assert.equal(b.length, 1); assert.equal(b[0].kind, 'weekdays'); assert.equal(b[0].from, 101);
  rows[0].chain.gain = 25;
  assert.equal(spellsFromWeekdayRows(rows, { arm: 'B', pen: 20 })[0].kind, 'chain', 'the chain first, as pre-registered');
  rows[0].weekly = true;
  assert.equal(spellsFromWeekdayRows(rows, { arm: 'A', pen: 20 })[0].kind, 'weekdays');
});

test('committed verdict: arm A, beta 4, m 2.5 chosen; C1-C5 and K1 pass, C6 (reported) fails', () => {
  const out = readFileSync(new URL('./eval/update-rate-spells-weekdays.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Chosen: arm A, beta 4, m 2\.5/);
  assert.match(out, /C1 every spells-round null cell <= 0\.020 \(worst 0\.010\): pass/);
  assert.match(out, /C2 every shift cell <= 0\.010 \(worst 0\.010\): pass/);
  assert.match(out, /C3 every openings null cell <= 0\.020 printed \(worst 0\.000\): pass/);
  assert.match(out, /C4 weak cells' LINE gain over shipped >= 150 \(283\): pass/);
  assert.match(out, /C5 no spell cell loses more than 10: pass/);
  assert.match(out, /C6 \(reported\) O1 within 30 of P500 at every opening: FAIL \(P3w30 Z50P250 148 vs 184\)/);
  assert.match(out, /K1 dated 2 of 2 \(bar: both\): pass/);
});

test('shortSpells ships the chosen setting; the round-5 search stays reachable as score dow', () => {
  assert.deepEqual({ score: SHORT_SPELLS.score, arm: SHORT_SPELLS.arm, beta: SHORT_SPELLS.beta, mult: SHORT_SPELLS.mult }, { score: 'weekdays', arm: 'A', beta: 4, mult: 2.5 });
  assert.equal(SHORT_SPELLS_DOW.mult, 3.5);
  const rows = readFileSync(new URL('./data/covid-schedules.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const sd = rows.filter((r) => r[1] === 'South Dakota'), v = sd.map((r) => +r[2]), d = sd.map((r) => r[0]);
  const neu = spellsResult(v, d), old = spellsResult(v, d, { score: 'dow' });
  assert.deepEqual(neu.spells.map((s) => [s.fromLabel, s.toLabel, s.kind]), [['2021-07-03', '2021-08-10', 'weekdays']]);
  assert.deepEqual(old.spells.map((s) => [s.fromLabel, s.toLabel, s.kind]), [['2021-07-03', '2021-08-10', 'dow']]);
  assert.equal(weekdayNames(neu.spells[0].weekdays), 'Mondays, Tuesdays, Thursdays and Fridays', 'Wednesdays only inside Monday-Friday');
  assert.match(spellsLine(neu), /read on the weekdays where the schedule changed \(Mondays, Tuesdays, Thursdays and Fridays\)/);
});
