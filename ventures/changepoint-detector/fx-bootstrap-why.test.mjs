import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, bootstrapPenalty } from './engine.mjs';

// Numbers match eval/fx-bootstrap-why.out.txt.
const rows = readFileSync(new URL('./data/fx-daily-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const chf = rows.map((r) => +r[1]);

test('CHF: the 3x-BIC pilot isolates the 2015 shock in a short segment, so the bootstrap penalty stays below the 45 that drops the extra changes', () => {
  const cps = analyze({ values: chf, labels, model: 'meanvar', penalty: 3 * 22.4038 }).pelt.changepoints.map((c) => c.index);
  const b = [0, ...cps, chf.length];
  assert.ok(b.slice(1).some((e, i) => e - b[i] <= 12), 'a segment of 12 days or fewer');
  const bp = bootstrapPenalty(chf);
  assert.ok(bp > 22.4 && bp < 40, `bootstrap penalty ${bp}`);
  assert.equal(analyze({ values: chf, labels, model: 'meanvar', penalty: 45 }).pelt.changepoints.length, 3);
});
