// worker-startup.mjs's pure parts (wrangler itself is not run here).
// Run: node --test platform/perf/worker-startup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { floorConfig, median, parseActive, resolveConfig } from './worker-startup.mjs';

test('median of odd and even lists, unsorted input left alone', () => {
  const xs = [3, 1, 2];
  assert.equal(median(xs), 2);
  assert.deepEqual(xs, [3, 1, 2]);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('parseActive reads the figure wrangler prints', () => {
  const out = '│   Profile window: 103.1 ms\n│   Sampled time: 98.8 ms\n│   Active: 50.1 ms (including 3.3 ms garbage collection)\n';
  assert.equal(parseActive(out), 50.1);
  assert.equal(parseActive('✘ [ERROR] startup failed'), null);
});

test('the floor Worker keeps the compatibility date and flags, nothing else', () => {
  const cfg = { name: 'app', main: 'index.js', compatibility_date: '2026-11-01', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB' }] };
  assert.deepEqual(floorConfig(cfg), { name: 'startup-floor', main: 'index.js', compatibility_date: '2026-11-01', compatibility_flags: ['nodejs_compat'], no_bundle: true });
  assert.deepEqual(floorConfig({}), { name: 'startup-floor', main: 'index.js', no_bundle: true });
});

test('a dist dir resolves to its wrangler.json', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
  assert.equal(resolveConfig(d), path.join(d, 'wrangler.json'));
  const f = path.join(d, 'wrangler.json');
  fs.writeFileSync(f, '{}');
  assert.equal(resolveConfig(f), f);
});
