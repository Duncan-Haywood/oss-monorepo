import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/gdp-growth.mjs output is current; meanvar on GDP growth isolates 1984Q3', () => {
  const out = execFileSync('node', [new URL('./eval/gdp-growth.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/gdp-growth.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /model meanvar: 1 \[1984Q3\]/);
});
