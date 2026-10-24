// Before an engagement: the HCMST dating-couple chain (marry each other vs break up first).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { datingRefusals, datingChain, datingObserved, datingViews, handover, DATING_MODEL } from '../dating.js';
import { hcmstRow } from '../lens-adapters.js';
import { predict } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const M = JSON.parse(readFileSync(new URL('hcmst_dating_marriage.json', dir)));
const B = JSON.parse(readFileSync(new URL('hcmst_dating_breakup.json', dir)));
const base = { degree: 'Bachelor', parentsView: 'Approve', party: 'Independent, other or no preference', raceEth: 'White', wages: 50000, priorMarriage: false };
const a = { ...base, sex: 'Woman', age: 27, quality: 'Excellent' };
const b = { ...base, sex: 'Man', age: 29, quality: 'Good', wages: 55000 };
const c = { status: 'Not married, living together', yearsTogether: '3', howMet: 'Through friends', childrenHome: '0' };

test('the chain follows the bundles’ how_to_combine recurrence exactly', () => {
  const ch = datingChain(M, B, a, b, c);
  assert.equal(ch.steps.length, M.periods.length);
  let still = 1, married = 0, broke = 0;
  const mm = M.models.find((x) => x.key === DATING_MODEL);
  const bm = B.models.find((x) => x.key === DATING_MODEL);
  ch.steps.forEach((s, k) => {
    const views = datingViews(a, b);
    const m = views.reduce((t, v) => t + predict(mm, hcmstRow(M, v, a, b, c, k)), 0) / views.length;
    const br = views.reduce((t, v) => t + predict(bm, hcmstRow(B, v, a, b, c, k)), 0) / views.length;
    assert.ok(Math.abs(s.m - m) < 1e-15 && Math.abs(s.b - br) < 1e-15);
    assert.ok(m + br <= 1, 'no period needed rescaling for this couple');
    married += still * m; broke += still * br; still *= 1 - m - br;
    assert.ok(Math.abs(s.married - married) < 1e-12 && Math.abs(s.brokeUp - broke) < 1e-12 && Math.abs(s.stillTogether - still) < 1e-12);
  });
  assert.ok(Math.abs(ch.married + ch.brokeUp + ch.stillTogether - 1) < 1e-12);
  assert.ok(Math.abs(ch.years - 8.417) < 1e-9);
  assert.equal(ch.perspectives, 2);
});

test('relationship quality moves the answer the way the survey saw it', () => {
  const good = datingChain(M, B, a, b, c);
  const fair = datingChain(M, B, { ...a, quality: 'Fair' }, { ...b, quality: 'Fair' }, { ...c, status: 'Not married, not living together' });
  assert.ok(good.married > fair.married && good.brokeUp < fair.brokeUp);
  // One rating is enough: the chain uses whoever answered.
  assert.equal(datingChain(M, B, a, { ...b, quality: '' }, c).perspectives, 1);
});

test('refusals: married couples, no rating, no years together, minors', () => {
  assert.deepEqual(datingRefusals(a, b, c), []);
  assert.ok(datingRefusals(a, b, { ...c, status: 'Married, living together' }).some((x) => x.includes('already married')));
  assert.ok(datingRefusals({ ...a, quality: '' }, { ...b, quality: '' }, c).some((x) => x.includes('Rate the relationship')));
  assert.ok(datingRefusals(a, b, { ...c, yearsTogether: '' }).some((x) => x.includes('years')));
  assert.ok(datingRefusals({ ...a, age: 17 }, b, c).some((x) => x.includes('18')));
  // Same-sex couples were in HCMST's data: no refusal.
  assert.deepEqual(datingRefusals(a, { ...b, sex: 'Woman' }, c), []);
});

test('observed reference and hand-over', () => {
  const o = datingObserved(M);
  assert.equal(o.couples, 939);
  assert.ok(o.married > 0.2 && o.brokeUp > 0.5);
  const ch = datingChain(M, B, a, b, c);
  assert.equal(handover(ch, 0.9), ch.married * 0.9);
  assert.equal(handover(ch, NaN), null);
});

test('two scored models: the full additive and the harmonized one checked on 2017', async () => {
  const { datingRange, datingExternal, DATING_MODELS } = await import('../dating.js');
  const r = datingRange(M, B, a, b, c);
  assert.equal(r.models, DATING_MODELS.length);
  for (const f of ['married', 'brokeUp', 'stillTogether']) assert.ok(r[f].min <= r[f].mean + 1e-15 && r[f].mean <= r[f].max + 1e-15);
  assert.ok(Math.abs(r.per.additive.married - datingChain(M, B, a, b, c).married) < 1e-15);
  assert.ok(Math.abs(r.married.mean + r.brokeUp.mean + r.stillTogether.mean - 1) < 1e-12);
  assert.equal(handover(r, 0.5), r.married.mean * 0.5);
  const em = datingExternal(M, 'married');
  const eb = datingExternal(B, 'broke_up');
  assert.ok(em && em.auc > 0.7 && eb && eb.auc > 0.8, 'A’s 2017-cohort AUCs');
});
