import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Numbers match eval/fx-bootstrap-tail.out.txt (a negative result: neither tail-preserving standardisation helps).
const out = readFileSync(new URL('./eval/fx-bootstrap-tail.out.txt', import.meta.url), 'utf8');

test('per-segment MAD scale leaves the franc answer unchanged (6 changes, same dates as the sd scale)', () => {
  const seg = out.match(/chf seg .*?(\d+) changes (.*)/), mad = out.match(/chf mad .*?(\d+) changes (.*)/);
  assert.equal(seg[1], '6');
  assert.deepEqual(mad.slice(1), seg.slice(1));
});

test('one global MAD scale pushes the franc penalty past the shock itself and finds nothing', () => {
  const g = out.match(/chf glob\s+penalty\s+([\d.]+)\s+(\d+) changes/);
  assert.ok(+g[1] > 500);
  assert.equal(g[2], '0');
});
