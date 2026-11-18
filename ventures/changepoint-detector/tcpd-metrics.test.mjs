// The doctest examples of TCPDBench analysis/scripts/metrics.py, which the port must reproduce exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truePositives, fMeasure, partitionFromCps, coverSingle, covering } from './eval/tcpd-metrics.mjs';

const sorted = (s) => [...s].sort((a, b) => a - b);

test('true positives without double counting', () => {
  assert.deepEqual(sorted(truePositives([1, 10, 20, 23], [3, 8, 20])), [1, 10, 20]);
  assert.deepEqual(sorted(truePositives([1, 10, 20, 23], [1, 3, 8, 20])), [1, 10, 20]);
  assert.deepEqual(sorted(truePositives([1, 10, 20, 23], [1, 3, 5, 8, 20])), [1, 10, 20]);
  assert.deepEqual(sorted(truePositives([], [1, 2, 3])), []);
  assert.deepEqual(sorted(truePositives([1, 2, 3], [])), []);
});

test('F1 against several annotators', () => {
  assert.equal(fMeasure({ 1: [10, 20], 2: [11, 20], 3: [10], 4: [0, 5] }, [10, 20]).F, 1.0);
  assert.equal(fMeasure({ 1: [], 2: [10], 3: [50] }, [10]).F, 0.9090909090909091);
  assert.equal(fMeasure({ 1: [], 2: [10], 3: [50] }, []).F, 0.8);
});

test('partitions and covering', () => {
  assert.deepEqual(partitionFromCps([], 5), [[0, 1, 2, 3, 4]]);
  assert.deepEqual(partitionFromCps([3, 5], 8), [[0, 1, 2], [3, 4], [5, 6, 7]]);
  assert.deepEqual(partitionFromCps([1, 2, 7], 8), [[0], [1], [2, 3, 4, 5, 6], [7]]);
  assert.deepEqual(partitionFromCps([0, 4], 6), [[0, 1, 2, 3], [4, 5]]);
  assert.equal(coverSingle([[1, 2, 3], [4, 5, 6]], [[1, 2, 3], [4, 5], [6]]), 0.8333333333333334);
  assert.equal(coverSingle([[1, 2, 3, 4, 5, 6]], [[1, 2, 3, 4], [5, 6]]), 0.6666666666666666);
  assert.equal(coverSingle([[1, 2, 3], [4, 5, 6]], [[1, 2], [3, 4], [5, 6]]), 0.6666666666666666);
  assert.equal(coverSingle([[1], [2], [3], [4, 5, 6]], [[1, 2, 3, 4, 5, 6]]), 0.3333333333333333);
  assert.equal(covering({ 1: [10, 20], 2: [10], 3: [0, 5] }, [10, 20], 45), 0.7962962962962963);
  assert.equal(covering({ 1: [], 2: [10], 3: [40] }, [10], 45), 0.7954144620811286);
  assert.equal(covering({ 1: [], 2: [10], 3: [40] }, [], 45), 0.8189300411522634);
});

test('the measured tier rates in consensus.mjs match eval/tcpd.out.txt', async () => {
  const { readFileSync } = await import('node:fs');
  const { TCPD_RATES, TCPD_NOTE, consensus, consensusText } = await import('./consensus.mjs');
  const out = readFileSync(new URL('./eval/tcpd.out.txt', import.meta.url), 'utf8');
  const names = { all: 'every setting', most: 'half or more', few: 'fewer than half' };
  for (const [t, label] of Object.entries(names)) {
    const r = TCPD_RATES[t];
    const re = new RegExp(`${label}\\s+${r.changes} changes; marked by an annotator\\s+${r.marked} \\(\\d+%\\); by a majority\\s+${r.majority} `);
    assert.match(out, re, t);
  }
  assert.match(out, new RegExp(`TCPD: ${TCPD_RATES.series} univariate series`));
  assert.match(out, /largest difference from the published F1 or cover: [0-9.]+e-(1[0-9]|[2-9][0-9])\./, 'the metric port reproduces the published scores');
  assert.match(TCPD_NOTE, /39% of every-setting changes, 28% of half-or-more and 25% of fewer-than-half/);
  const c = consensus({ values: [1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 1, 1, 1, 1, 1] });
  assert.equal(c.measured, TCPD_NOTE);
  assert.ok(consensusText(c).includes(TCPD_NOTE));
});
