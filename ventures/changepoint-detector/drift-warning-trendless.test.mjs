import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// eval/drift-warning-trendless.mjs: the output is committed in eval/drift-warning-trendless.out.txt and the README.
test('driftWarning on trendless monthly series: the January 1976 spike is a cancelling pair, and the null series warns too', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-trendless.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  const lines = out.split('\n').filter((l) => l.includes('warning'));
  assert.equal(lines.length, 16);
  const shock = lines.slice(0, 12), nul = lines.slice(12);
  assert.equal(shock.filter((l) => l.includes('1976-02+ 1976-04-')).length, 12, out);
  assert.equal(shock.filter((l) => l.includes('warning yes')).length, 11, out);
  assert.equal(nul.filter((l) => l.includes("warning yes")).length, 3, out); // a false alarm on a series with no documented shock
});
