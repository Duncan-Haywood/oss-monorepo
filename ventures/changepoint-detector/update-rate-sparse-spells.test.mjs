// README "Short sparse spells: the return pass reversed" (eval/update-rate-sparse-spells.mjs, .out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestReturnCost, shortSpells, SHORT_SPELLS_DOW as SHORT_SPELLS, SHORT_RETURNS, updateRateChanges } from './update-rate.mjs';
import { spellCandidates, SPELL_CELLS, NULLS_ALL, GUARDS } from './eval/update-rate-sparse-spells.mjs';
import { valuesFrom } from './eval/update-rate-returns.mjs';
import { makeRng } from './eval/update-rate-sim.mjs';

const pen = (n) => SHORT_SPELLS.mult * 2 * Math.log(n + 1);

test('sparse: true searches the other direction; the default search is unchanged', () => {
  const rnd = makeRng(7), z = Array.from({ length: 500 }, (_, t) => (rnd() < (t >= 200 && t < 260 ? 0.8 : 0.3) ? 1 : 0));
  const days = z.map((_, s) => s % 7);
  const sp = bestReturnCost(z, 0, z.length, { kind: 'chain', days, sparse: true });
  assert.ok(sp && Math.abs(sp.a - 200) <= 10 && Math.abs(sp.b - 260) <= 10, JSON.stringify(sp));
  const ret = bestReturnCost(z, 0, z.length, { kind: 'chain', days });
  assert.deepEqual(ret, bestReturnCost(z, 0, z.length, { kind: 'chain', days, sparse: false }));
  const inside = (q) => z.slice(q.a, q.b).reduce((s, v) => s + v, 0) / (q.b - q.a);
  assert.ok(inside(ret) < 0.3, 'the default still looks for fewer repeats inside');
});

test('a Wednesdays-only spell inside Monday-Friday is found with its edges; a same-count shift is not a spell', () => {
  const rnd = makeRng(31);
  const z = SPELL_CELLS.P1w60(rnd), v = valuesFrom(z), days = z.map((_, s) => s % 7);
  const { spells } = shortSpells(v, { days, u: updateRateChanges(v, { catchUp: { method: null } }), score: 'dow' });
  assert.equal(spells.length, 1);
  assert.ok(Math.abs(spells[0].from - 1 - 500) <= 10 && Math.abs(spells[0].to - 560) <= 10, JSON.stringify(spells[0]));
  assert.ok(spells[0].shareInside > 0.7 && spells[0].shareOutside < 0.4);
  for (const cell of ['S2t n1100', 'S1t n1100']) {
    const zs = NULLS_ALL[cell](rnd), vs = valuesFrom(zs);
    assert.equal(shortSpells(vs, { days: zs.map((_, s) => s % 7), u: updateRateChanges(vs, { catchUp: { method: null } }), score: 'dow' }).spells.length, 0, cell);
  }
});

test('the module function matches the eval file at the chosen setting', () => {
  const rnd = makeRng(32), z = SPELL_CELLS.P3w60(rnd), v = valuesFrom(z), days = z.map((_, s) => s % 7);
  const u = updateRateChanges(v, { catchUp: { method: null } });
  const a = spellCandidates(v, days, GUARDS.z01, { u }).filter((q) => q.gain > pen(z.length)).map((q) => q.a + 1);
  assert.deepEqual(shortSpells(v, { days, u, score: 'dow' }).spells.map((s) => s.from), a);
  assert.throws(() => shortSpells(v, {}));
});

test('committed verdict: z01 at m 3.5 passes S1-S4, K1 dates Alaska and South Dakota', () => {
  const out = readFileSync(new URL('./eval/update-rate-sparse-spells.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Chosen: guard 'z01', m 3\.5/);
  assert.match(out, /S1 every null cell <= 0\.020 \(worst 0\.015\): pass/);
  assert.match(out, /S2 each 60-step cell found >= 120 \(P1w60 200, P3w60 195, P5d60 157\): pass/);
  assert.match(out, /S3 60-step cells' gain over shipped >= 60 \(363\): pass/);
  assert.match(out, /S4 every shift cell <= 0\.010 \(worst 0\.005\): pass/);
  assert.match(out, /K1 dated 2 of 2 \(bar: both\): pass/);
  assert.deepEqual({ mult: SHORT_SPELLS.mult, guard: SHORT_SPELLS.guard }, { mult: 3.5, guard: GUARDS.z01 });
  assert.equal(SHORT_RETURNS.mult, null, 'the return pass stays off');
});
