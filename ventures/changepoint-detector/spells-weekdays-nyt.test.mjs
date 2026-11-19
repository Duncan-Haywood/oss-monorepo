// README "The weekday spell score on NYT's state series": the line's spells (search plus printed edge spells) and
// the committed verdicts of eval/update-rate-spells-weekdays-nyt.mjs (NYT's file is fetched, not committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineSpells, JHU_SPELLS_WEEKDAYS } from './eval/update-rate-spells-weekdays-nyt.mjs';

test('the line counts a search spell and an edge spell, but not an edge the search already overlaps', () => {
  const r = {
    spells: [{ from: 100, to: 140, fromLabel: 'a', toLabel: 'b' }],
    edgeSpells: [{ from: 130, to: 170, fromLabel: 'c', toLabel: 'd' }, { from: 300, to: 340, fromLabel: 'e', toLabel: 'f' }],
  };
  const l = lineSpells(r);
  assert.deepEqual(l.map((s) => [s.source, s.from]), [['search', 100], ['edge', 300]]);
  assert.deepEqual(lineSpells({ refused: 'x' }), []);
  assert.deepEqual(lineSpells(null), []);
});

test('Kentucky\'s JHU spell is taken to 2022-04-05, as the weekday score reports it; the others are unchanged', () => {
  assert.equal(JHU_SPELLS_WEEKDAYS.find((s) => s.state === 'Kentucky').to, '2022-04-05');
  assert.equal(JHU_SPELLS_WEEKDAYS.length, 8);
});

test('the committed NYT verdicts: W1 passes 3 of 4, W2 fails 4 of 8, Nevada gone', () => {
  const out = readFileSync(new URL('./eval/update-rate-spells-weekdays-nyt.out.txt', import.meta.url), 'utf8');
  assert.match(out, /W1 3 of 4 \(bar >= 3\): pass/);
  assert.match(out, /Alaska\s+return 2021-08-02: HIT 2021-06-04\.\.2021-07-31 \(58 days, edge\)/);
  assert.match(out, /Nebraska\s+return 2021-09-25: missed/);
  assert.match(out, /W2 4 unexplained of 8 search spells .*: FAIL/);
  assert.match(out, /Nevada\s+weekdays: -\s+dow: 2022-05-07\.\.2022-08-09/);
  assert.match(out, /Verdict: FAIL \(W2\)/);
});
