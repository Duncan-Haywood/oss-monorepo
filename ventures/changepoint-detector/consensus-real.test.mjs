import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('eval/consensus-real.mjs output is current', () => {
  const out = execFileSync('node', [new URL('./eval/consensus-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/consensus-real.out.txt', import.meta.url), 'utf8'));
});

test('the documented seat-belt and Nile changes are found by every setting; Lake Huron 1925 by four of six; 1946 temperature only three', () => {
  const out = readFileSync(new URL('./eval/consensus-real.out.txt', import.meta.url), 'utf8');
  assert.match(out, /documented 1983-02: 1983-02 found by 6\/6 \(all\)/);
  assert.match(out, /documented 1899: 1899 found by 6\/6 \(all\)/);
  assert.match(out, /documented 1925: 1925 found by 4\/6 \(most\)/);
  assert.match(out, /documented 1946: 1946 found by 3\/6 \(most\)/);
});

test('second batch: US inflation breaks by every setting (--ar1 keeps its cuts); real rate, Saudi oil and Michigan-Huron by most', () => {
  const out = readFileSync(new URL('./eval/consensus-real.out.txt', import.meta.url), 'utf8');
  assert.match(out, /documented 1973Q3: 1973Q3 found by 6\/6 \(all\)/);
  assert.match(out, /documented 1981Q4: 1981Q4 found by 6\/6 \(all\)/);
  assert.match(out, /documented 1980Q4: 1980Q4 found by 5\/6 \(most\)/);
  assert.match(out, /documented 1982: 1982 found by 5\/6 \(most\)/);
  assert.match(out, /documented 1999: 1999 found by 4\/6 \(most\)/);
});
