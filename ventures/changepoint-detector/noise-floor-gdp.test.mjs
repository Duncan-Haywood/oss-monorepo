import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-gdp.mjs output is current; no k in {0,1,2} leaves fewer than 7 changes on log real GDP', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-gdp.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-gdp.out.txt', import.meta.url), 'utf8'));
  for (const m of out.matchAll(/k=\d: (\d+) \[/g)) assert.ok(+m[1] >= 7);
});
