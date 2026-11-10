// The page's "Agreed changes" line (consensus.mjs agreedText) and the held-out figures it quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { consensus, agreedText, TCPD_HELDOUT } from './consensus.mjs';

const step = (n, at, lo, hi) => Array.from({ length: n }, (_, i) => (i < at ? lo : hi) + 0.3 * Math.sin(i * 1.7));

test('a clear step is agreed by every setting and named with its direction', () => {
  const c = consensus({ values: step(80, 40, 0, 10) });
  const t = agreedText(c);
  assert.match(t, /^Every one of 6 settings agrees on 1 change: \d+ \(up\)\./);
  assert.match(t, /held out from tuning/);
});

test('a flat series says no change is agreed and calls the rest candidates', () => {
  const c = consensus({ values: Array.from({ length: 60 }, (_, i) => 5 + 0.4 * Math.sin(i * 2.3)) });
  assert.equal(c.changes.filter((x) => x.tier === 'all').length, 0);
  assert.match(agreedText(c), /^No change is found by all 6 settings/);
});

test('the quoted held-out figures match the committed eval output', () => {
  const out = readFileSync(new URL('./eval/tcpd-heldout.out.txt', import.meta.url), 'utf8');
  const row = (name) => Number(out.split('\n').find((l) => l.includes(name) && /\d\.\d{3}\s+\d\.\d{3}\s+\d+$/.test(l)).trim().replace(/^\*\s*/, '').slice(name.length).trim().split(/\s+/)[0]);
  assert.match(out, new RegExp(`^TCPD held-out: ${TCPD_HELDOUT.series} univariate`));
  assert.equal(row('consensus: every setting'), TCPD_HELDOUT.every);
  assert.equal(row('level (default)'), TCPD_HELDOUT.level);
  assert.equal(row('bocpd (default)'), TCPD_HELDOUT.bocpd);
  assert.equal(row('zero'), TCPD_HELDOUT.zero);
  assert.equal(row('binseg'), TCPD_HELDOUT.binseg);
  const pooled = out.slice(out.indexOf('Pooled'));
  assert.match(pooled, new RegExp(`= ${TCPD_HELDOUT.pooledSeries} series`));
  assert.match(pooled, new RegExp(`consensus: every setting\\s+${TCPD_HELDOUT.pooledEvery}`));
  assert.match(pooled, new RegExp(`level \\(default\\)\\s+${TCPD_HELDOUT.pooledLevel}`));
});
