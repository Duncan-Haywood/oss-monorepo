// README "Short spells on a second provider": the spell search looks inside the update-rate line's stretches, so a
// spell whose two edges that line already cut is restated from those two changes (edgeSpellsOf), not lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeSpellsOf, spellsLine, spellsResult, EDGE_SPELL_MAX_STEPS } from './update-rate.mjs';

const st = (from, to, share) => ({ from, to, steps: to - from + 1, share });
const ch = (index, direction) => ({ index, direction });

test('a fewer-then-more pair of default changes is one edge spell; a long or same-direction pair is not', () => {
  const u = { changes: [ch(100, 'less often'), ch(158, 'more often'), ch(400, 'less often')],
    stretches: [st(1, 99, 0.3), st(100, 157, 0.6), st(158, 399, 0.3), st(400, 600, 0.85)] };
  assert.deepEqual(edgeSpellsOf(u).map((e) => [e.from, e.to, e.steps]), [[100, 157, 58]]);
  const long = { changes: [ch(100, 'less often'), ch(100 + EDGE_SPELL_MAX_STEPS + 1, 'more often')],
    stretches: [st(1, 99, 0.3), st(100, 100 + EDGE_SPELL_MAX_STEPS, 0.6), st(101 + EDGE_SPELL_MAX_STEPS, 500, 0.3)] };
  assert.equal(edgeSpellsOf(long).length, 0);
  const same = { changes: [ch(100, 'less often'), ch(150, 'less often')], stretches: [st(1, 99, 0.1), st(100, 149, 0.3), st(150, 300, 0.6)] };
  assert.equal(edgeSpellsOf(same).length, 0);
});

test('the line says the default line already dates the spell when the search finds none inside', () => {
  const e = { from: 100, to: 157, steps: 58, shareInside: 0.59, shareBefore: 0.31, shareAfter: 0.31, fromLabel: '2021-06-04', toLabel: '2021-07-31' };
  const line = spellsLine({ spells: [], edgeSpells: [e], penalty: 49 });
  assert.match(line, /none inside the update-rate line's stretches/);
  assert.match(line, /already dates a spell as two changes.*2021-06-04 to 2021-07-31 \(58 steps, 59% repeats inside, 31% before, 31% after\)/);
  assert.match(spellsLine({ spells: [], edgeSpells: [], penalty: 49 }), /none found/);
});

test('the committed JHU states are unchanged: no edge spells, South Dakota\'s spell as before', () => {
  const rows = readFileSync(new URL('./data/covid-schedules.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  for (const s of ['South Dakota', 'Minnesota']) {
    const r = rows.filter((x) => x[1] === s), res = spellsResult(r.map((x) => Number(x[2])), r.map((x) => x[0]));
    assert.equal(res.edgeSpells.length, 0, s);
    if (s === 'South Dakota') assert.deepEqual(res.spells.map((p) => [p.fromLabel, p.toLabel]), [['2021-07-03', '2021-08-10']]);
  }
});

test('the NYT verdict file records the pre-registered FAIL and the post hoc Alaska reading', () => {
  const out = readFileSync(new URL('./eval/update-rate-spells-nyt.out.txt', import.meta.url), 'utf8');
  assert.match(out, /N1 2 of 4 \(bar >= 3\): FAIL/);
  assert.match(out, /N2 5 unexplained of 9 spells \(bar <= 3\): FAIL/);
  const why = readFileSync(new URL('./eval/update-rate-spells-nyt-why.out.txt', import.meta.url), 'utf8');
  assert.match(why, /NYT Alaska\s+2021-06-04\.\.2021-07-31 \(58 steps\)/);
});
