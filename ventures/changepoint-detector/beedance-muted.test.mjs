// The ar1 + floor 2 lead on the fresh bee dance sequences (eval/beedance-multi.mjs, pre-registered 2026-11-16)
// and the muted-column description it led to (multivariate.mjs mutedColumns; eval/muted-sim.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBee, scoreBee, decide } from './eval/beedance-multi.mjs';
import { analyzeMulti, multiText, mutedColumns, multiPelt } from './multivariate.mjs';

test('bee dance 1-5: the pre-registered rule fails, as the committed output says', () => {
  const fresh = [1, 2, 3, 4, 5].map(loadBee);
  assert.deepEqual(fresh.map((s) => s.n), [1057, 1124, 602, 756, 813]);
  assert.deepEqual(fresh.map((s) => s.ann.set.length), [19, 22, 16, 17, 28]);
  const res = {};
  for (const s of fresh) res[s.name] = scoreBee(s);
  const d = decide(fresh, res);
  assert.equal(d.confirms, false);
  assert.equal(d.best, 'joint level, ar1');
  assert.equal(d.wins, 0);
  const mean = (nm) => fresh.reduce((a, s) => a + res[s.name][nm].f1, 0) / 5;
  assert.equal(mean('joint level, ar1 + floor 2').toFixed(3), '0.244');
  assert.equal(mean('joint level, floor auto (primary)').toFixed(3), '0.337');
  const out = readFileSync(new URL('./eval/beedance-multi.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Lead: FAILS/);
  assert.match(out, /joint level, ar1 \+ floor 2\s+0\.273\s+0\.245\s+0\.111\s+0\.267\s+0\.327\s+0\.244/);
});

test('mutedColumns: never the plain sd, and not white noise under a floor of 2', () => {
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
  for (let k = 0; k < 20; k++) {
    const cols = [0, 1, 2].map(() => Array.from({ length: 200 }, () => g()));
    const names = ['a', 'b', 'c'];
    assert.deepEqual(mutedColumns(cols, names, multiPelt(cols).sigmas), []);
    assert.deepEqual(mutedColumns(cols, names, multiPelt(cols, { floor: 2 }).sigmas), []);
  }
});

test('the joint fit with AR(1) and a floor of 2 names the bee columns it muted, in the text output', () => {
  const b = loadBee(3);
  const r = analyzeMulti({ cols: b.cols, names: b.names, ar1: true, floor: 2 });
  assert.deepEqual(r.mutedColumns.map((m) => m.column), ['x', 'y']);
  assert.equal(r.joint.length, 0);
  const t = multiText(r);
  assert.match(t, /Read with care: The one segmentation for all columns barely uses x \(noise sd 1\.88/);
  assert.match(t, /drop the AR\(1\) correction/);
  const d = analyzeMulti({ cols: b.cols, names: b.names });
  assert.equal(d.mutedWarning, undefined);
});
