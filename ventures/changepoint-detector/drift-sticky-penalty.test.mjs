// A doubled drift penalty on sticky series (README "A doubled penalty on sticky series"; eval/
// drift-sticky-penalty.mjs, pre-registered). The TCPD half needs eval/tcpd-fetch.sh, so this pins the
// committed output and recomputes the frozen-juice half, whose data ships here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frozenJuice, cutsAt } from './eval/drift-sticky-penalty.mjs';

const out = readFileSync(new URL('./eval/drift-sticky-penalty.out.txt', import.meta.url), 'utf8');

test('frozen juice: 4 log n keeps only 5 of the 8 freezes (R3 fails), 2 log n keeps all 8', () => {
  const fj = frozenJuice();
  const ship = fj.score(cutsAt(fj.price, 2)), dbl = fj.score(cutsAt(fj.price, 4));
  assert.equal(fj.freezes.length, 8);
  assert.deepEqual([ship.cuts, ship.found.length], [67, 8]);
  assert.deepEqual([dbl.cuts, dbl.found.length], [9, 5]);
  assert.deepEqual(dbl.found, ['1963-01', '1977-02', '1981-02', '1984-01', '1990-01']);
});

test('the committed run: R1, R2 and R4 pass, R3 fails, so the warning is unchanged', () => {
  assert.match(out, /fires: bank, children_per_woman, ratner_stock, scanline_42049 \(pre-registered/);
  assert.match(out, /mean at 2 log n: F1 0\.380\s+cover 0\.524/);
  assert.match(out, /mean at 4 log n: F1 0\.381\s+cover 0\.609/);
  assert.match(out, /R3 FAIL: 5 of 8 freezes found/);
  assert.match(out, /verdict: FAIL, the warning text is not changed/);
});
