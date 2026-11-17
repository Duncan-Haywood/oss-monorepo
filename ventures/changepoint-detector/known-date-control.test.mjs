import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownDateTest } from './known-date.mjs';

// The control-series option of knownDateTest (README "A control series", eval/known-date-prereg-control-2026-11-17.md).
// The pre-registration failed its placebo bar (R3), so it is not in the CLI, the engine or the page; these tests pin
// the module option the eval scripts use.
const d = (() => { const [h, ...rows] = readFileSync(new URL('./data/uk-road-casualties.csv', import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), rows: rows.map((l) => l.split(',')) }; })();
const col = (name) => d.rows.map((r) => Math.log(+r[d.head.indexOf(name)]));
const k = d.rows.findIndex((r) => r[0] === '1983-02');

test('difference: drivers against rear-seat passengers, the shared post-1983 slope cancels and the step stays', () => {
  const h = knownDateTest(col('drivers'), k, { period: 12, reps: 199, rhoGenMethod: 'gated', control: col('rear') });
  assert.equal(h.controlMode, 'difference');
  assert.ok(h.step < -0.2 && h.step > -0.35 && h.pStep <= 0.01, JSON.stringify(h.step));
  assert.ok(Math.abs(h.slopeChange) < 0.002 && h.pSlope > 0.5);
  const plain = knownDateTest(col('drivers'), k, { period: 12, reps: 199, rhoGenMethod: 'gated' });
  assert.ok(plain.slopeChange > 0.005);
});

test('regress: the control as a fixed regressor reports its coefficient', () => {
  const h = knownDateTest(col('drivers'), k, { period: 12, reps: 99, rhoGenMethod: 'gated', control: col('rear'), controlMode: 'regress' });
  assert.equal(h.controlMode, 'regress');
  assert.ok(h.controlCoef > 0 && h.controlCoef < 1);
});

test('a control of the wrong length is refused; an unknown mode throws', () => {
  assert.equal(knownDateTest(col('drivers'), k, { control: [1, 2, 3] }).refused, true);
  assert.throws(() => knownDateTest(col('drivers'), k, { control: col('rear'), controlMode: 'ratio' }), /controlMode/);
});

test('a wander both series share: the step is lost in it alone and found with the control', () => {
  function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const r = mulberry(99), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  let c = 0; const x = [], ctl = [];
  for (let t = 0; t < 120; t++) { c += 3 * g(); x.push(c + g() + (t >= 60 ? 3 : 0)); ctl.push(c + g()); }
  const alone = knownDateTest(x, 60, { reps: 99, rhoGenMethod: 'gated' });
  assert.ok(alone.refused || alone.admittedByCut || alone.p > 0.05, 'alone: no calibrated small p');
  const h = knownDateTest(x, 60, { reps: 99, rhoGenMethod: 'gated', control: ctl });
  assert.equal(h.refused, false);
  assert.ok(h.p <= 0.05 && Math.abs(h.step - 3) < 1.2);
});

// The step alone with a control (README "The step alone, with a control series", pre-registered; failed on real pairs):
// California's packs per head against the 38 donor states' mean is refused as a wander, the reason nothing shipped.
test('state tobacco pairs: Proposition 99 against the donor mean is refused, Mississippi is tested', () => {
  const [hd, ...rs] = readFileSync(new URL('./data/us-cigarette-packs-per-capita.csv', import.meta.url), 'utf8').trim().split('\n');
  const head = hd.split(','), data = rs.map((l) => l.split(',').map(Number)).filter((r) => r[0] <= 2000);
  const excluded = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
  const donors = head.slice(1).filter((s) => !excluded.has(s));
  assert.equal(donors.length, 38);
  assert.equal(data.length, 31);
  const pair = (s) => {
    const ds = donors.filter((d) => d !== s);
    return [data.map((r) => Math.log(r[head.indexOf(s)])), data.map((r) => Math.log(ds.reduce((a, d) => a + r[head.indexOf(d)], 0) / ds.length))];
  };
  const [ca, caCtl] = pair('CA');
  const h = knownDateTest(ca, 19, { reps: 99, rhoGenMethod: 'gated', control: caCtl });
  assert.equal(h.refused, true);
  assert.match(h.reason, /random walks/);
  const [ms, msCtl] = pair('MS');
  const m = knownDateTest(ms, 19, { reps: 99, rhoGenMethod: 'gated', control: msCtl });
  assert.equal(m.refused, false);
  assert.ok(m.pStep > 0.05);
});
