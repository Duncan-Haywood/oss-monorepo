import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/ip-growth.mjs output is current; meanvar --dispersion on monthly IP growth keeps 1984-02', () => {
  const out = execFileSync('node', [new URL('./eval/ip-growth.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/ip-growth.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /meanvar --dispersion: 2 \[1961-01, 1984-02\]/);
});
