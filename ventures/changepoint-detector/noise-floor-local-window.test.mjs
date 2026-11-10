import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localFitScale, analyze } from './engine.mjs';
const run = (f) => execFileSync('node', [new URL(`./eval/${f}.mjs`, import.meta.url).pathname], { encoding: 'utf8' });
const want = (f) => readFileSync(new URL(`./eval/${f}.out.txt`, import.meta.url), 'utf8');
const count = (out, series, setting) => { const b = out.split(/\n(?=\S)/).find((x) => x.startsWith(series)); return +b.split('\n').find((l) => l.trim().startsWith(setting + ':')).match(/: (\d+) \[/)[1]; };
test('eval/noise-floor-local-window-real.mjs output is current; a 25-point line floor brings Australian residents to one cut, quadratic fits do not', () => {
  const out = run('noise-floor-local-window-real');
  assert.equal(out, want('noise-floor-local-window-real'));
  assert.equal(count(out, 'Australian residents', 'line w=25 k=2'), count(out, 'Australian residents', 'd1 k=2'));
  assert.ok(count(out, 'Australian residents', 'line w=7 k=3') > 1);
  assert.ok(count(out, 'Australian residents', 'quad w=25 k=3') > 1);
  assert.equal(count(out, 'Nile flow', 'line w=25 k=2'), 1);
  assert.equal(count(out, 'New Haven temp', 'line w=25 k=1.5'), 1);
});
test('eval/noise-floor-local-window-sim.mjs output is current; at phi 0.8 the wide line floor leaves fewer false cuts than d1 k=1.5', { timeout: 120000 }, () => {
  const out = run('noise-floor-local-window-sim');
  assert.equal(out, want('noise-floor-local-window-sim'));
  const cell = (head, arm) => { const b = out.split(/\n(?=phi )/).find((x) => x.startsWith(head)); const l = b.split('\n').find((x) => x.trim().startsWith(arm + ':')); const [, hit, oc] = l.match(/found (\d+)\/60, other cuts ([\d.]+)/); return { hit: +hit, other: +oc }; };
  for (const sd of [1, 0.3]) assert.ok(cell(`phi 0.8, noise sd ${sd}`, 'line w=25 k=2').other < cell(`phi 0.8, noise sd ${sd}`, 'd1 k=1.5').other);
  assert.ok(cell('phi 0.2, noise sd 0.1', 'line w=25 k=2').hit > cell('phi 0.2, noise sd 0.1', 'd1 k=1.5').hit);
});
test('localFitScale is about 0.954 sd on white noise for every window and degree, and ignores a straight drift', () => {
  let s = 11; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const v = Array.from({ length: 20000 }, () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()));
  for (const deg of [1, 2]) for (const w of [7, 13, 25]) {
    assert.ok(Math.abs(localFitScale(v, w, deg) - 0.954) < 0.04, `w=${w} deg=${deg}`);
    assert.ok(Math.abs(localFitScale(v.map((x, t) => x + 0.5 * t), w, deg) - localFitScale(v, w, deg)) < 1e-6);
  }
  assert.ok(Math.abs(localFitScale(v.map((x, t) => x + 0.001 * t * t), 25, 2) - localFitScale(v, 25, 2)) < 1e-6);
  assert.throws(() => localFitScale(v, 3, 2), /at least 5/);
});
test('a series no longer than the window falls back to the first-difference floor', () => {
  const v = Array.from({ length: 20 }, (_, t) => t + (t % 3) * 0.1);
  const a = analyze({ values: v, model: 'trend', noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }).pelt.changepoints;
  const b = analyze({ values: v, model: 'trend', noiseFloor: 2 }).pelt.changepoints;
  assert.deepEqual(a, b);
});
