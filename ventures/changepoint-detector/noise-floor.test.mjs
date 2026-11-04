import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyze } from './engine.mjs';

test('noise floor: output committed; off by default; cuts the austres over-cut; never binds on a flat noisy series', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor.out.txt', import.meta.url), 'utf8'));
  const rows = readFileSync(new URL('./data/austres.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);
  const v = rows.map(Math.log);
  assert.equal(analyze({ values: v, model: 'trend' }).pelt.changepoints.length, 10);
  assert.ok(analyze({ values: v, model: 'trend', noiseFloor: 1 }).pelt.changepoints.length <= 3);
  const flat = Array.from({ length: 100 }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
  assert.equal(analyze({ values: flat, model: 'mean', noiseFloor: 0.5 }).noiseFloor, undefined);
});
