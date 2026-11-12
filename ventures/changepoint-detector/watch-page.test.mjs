// The watch on the page and in the agent tool: watch-core.mjs's watchCheck, the call both make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watchCheck, recordText, WATCH_DEFAULTS } from './watch-core.mjs';
import * as cli from './watch.mjs';

// A deterministic series: a level of 10 with a fixed wobble, then a 3-unit step (about 3 noise sd).
const wobble = (i) => [0.9, -0.4, 0.2, -1.1, 0.6, -0.2, 1.0, -0.7, 0.3, -0.5, 0.1, -0.9][i % 12];
const rows = (n, stepAt = Infinity) => Array.from({ length: n }, (_, i) => `2025-01-${String(1 + (i % 28)).padStart(2, '0')}-${i},${(10 + (i >= stepAt ? 3 : 0) + wobble(i)).toFixed(2)}`);
const csvOf = (r) => ['day,orders', ...r].join('\n');

test('first check records a baseline, later checks report a new change once, then stay quiet', () => {
  const hist = rows(120, 60); // a step already in the history
  const a = watchCheck({ csv: csvOf(hist) });
  assert.equal(a.alerts.length, 0);
  assert.ok(a.baseline.length >= 1, 'the step in the history is the baseline');
  assert.match(a.text, /First check/);
  // A JSON round trip, as the page stores it in localStorage.
  let state = JSON.parse(JSON.stringify(a.state));
  // New rows: a second step at 160, data through 200.
  const full = rows(200, 60).map((r, i) => (i >= 160 ? r.replace(/,([\d.]+)$/, (_, v) => `,${(Number(v) + 4).toFixed(2)}`) : r));
  let reported = 0, firstAt = null;
  for (let n = 121; n <= 200; n++) {
    const out = watchCheck({ csv: csvOf(full.slice(0, n)), state });
    state = JSON.parse(JSON.stringify(out.state));
    if (out.alerts.length) { reported += out.alerts.length; firstAt ??= n; assert.match(out.text, /New change/); assert.match(out.text, /orders changed from/); }
  }
  assert.equal(reported, 1, 'the new step is reported exactly once');
  assert.ok(firstAt >= 160 + WATCH_DEFAULTS.confirm && firstAt <= 175, `reported at ${firstAt}`);
  assert.match(recordText(state), /in the history at the first check/);
  assert.match(recordText(state), /reported at point/);
});

test('the page and the CLI share one copy of the logic', () => {
  for (const k of ['advance', 'detectChanges', 'statusText', 'WATCH_DEFAULTS', 'watchCheck']) assert.ok(k in cli, k);
  assert.equal(cli.watchCheck, watchCheck);
  const src = readFileSync(new URL('./watch-core.mjs', import.meta.url), 'utf8');
  // The agent tool's safety gate: no node builtins, no network, no eval in what the page imports.
  assert.doesNotMatch(src, /from ['"]node:|\bfetch\s*\(|process\.|\beval\s*\(/);
});

test('bad input says what is wrong', () => {
  assert.throws(() => watchCheck({}), /CSV text/);
  assert.throws(() => watchCheck({ csv: '1\n2\n3' }), /at least 4/);
  assert.throws(() => watchCheck({ csv: csvOf(rows(30)), model: 'trend' }), /mean, meanvar or poisson/);
  assert.throws(() => watchCheck({ csv: csvOf(rows(30)), detector: 'magic' }), /detector takes/);
});

test('the page wires the watch card to watchCheck with the state in the browser', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /import \{ watchCheck, recordText \} from "\.\/watch-core\.mjs"/);
  assert.match(html, /id="watch-check"/);
  assert.match(html, /localStorage\.setItem\(WATCH_PREFIX/);
  assert.match(html, /record\("watch_check"\)/);
  assert.match(html, /<code>watch_check<\/code>/);
});
