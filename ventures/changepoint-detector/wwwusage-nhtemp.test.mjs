import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Two real R series (data/www-usage.csv, data/nhtemp.csv). Neither has a documented break, so these tests pin
// what the detector does today, not what it should do. WWWusage wanders (100 minutes, no steps); nhtemp is a
// 60-year temperature record with a slow warming.
const load = (f) => readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const www = load('www-usage.csv'), nh = load('nhtemp.csv');
const wv = www.map((r) => +r[1]), wl = www.map((r) => r[0]);
const nv = nh.map((r) => +r[1]), nl = nh.map((r) => r[0]);
const w = (opt) => analyze({ values: wv, labels: wl, ...opt }).pelt.changepoints;
const n = (opt) => analyze({ values: nv, labels: nl, ...opt }).pelt.changepoints;

test('real WWWusage: a wandering series is cut into 20+ steps by default, none by --ar1, one by --ar1 joint', () => {
  assert.equal(wv.length, 100);
  assert.ok(w({}).length >= 20);
  assert.equal(w({ ar1: true }).length, 0);
  const j = w({ ar1: 'joint' });
  assert.equal(j.length, 1);
  assert.equal(j[0].label, '82');
});

test('real nhtemp: one rise at 1944, a very wide range; a linear trend explains it with no change', () => {
  assert.equal(nv.length, 60);
  for (const opt of [{}, { ar1: true }, { ar1: 'joint' }]) {
    const c = n(opt);
    assert.equal(c.length, 1);
    assert.equal(c[0].label, '1944');
    assert.ok(c[0].meanAfter > c[0].meanBefore);
  }
  const r = n({})[0].range95;
  assert.ok(nl[r.fromIndex] <= '1930' && nl[r.toIndex] >= '1948');
  assert.equal(n({ trend: 'bend' }).length, 0);
});
