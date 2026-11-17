// The branded report for the wandering-level model (drift-report.mjs): it shows what the page shows for
// --model drift, escapes everything typed, names the options the model ignored, and the marketing sample
// is what the real code produces on Canada's fertility rate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftResult } from './drift-cli.mjs';
import { driftReportHtml } from './drift-report.mjs';
import { driftChartSvg, driftTableHtml, driftSegmentsHtml, driftSummary } from './drift-view.mjs';
import { esc } from './report.mjs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

test('Nile: the report carries the page chart, jumps, stretches, notes and assumptions', () => {
  const r = driftResult({ csv: read('data/nile.csv') });
  const h = driftReportHtml(r, { title: 'Nile', author: 'A. Analyst', date: '2026-11-11', contact: 'a@example.com' });
  assert.match(h, /<h1>Nile<\/h1>/);
  assert.match(h, /A\. Analyst · 2026-11-11 · a@example\.com/);
  for (const part of [driftChartSvg(r), driftTableHtml(r), driftSegmentsHtml(r), esc(driftSummary(r))]) assert.ok(h.includes(part));
  assert.match(h, /Jumps too big for the drift:<\/strong> 1, the largest 1899 \(-249, 2\.1 noise sd\)/);
  assert.match(h, /F1 0\.694/);
  assert.match(h, /does not show what caused the change/);
  assert.match(h, /no warranty/);
  assert.match(h, /Gaetano Romano, Guillem Rigaill, Vincent Runge and Paul Fearnhead/);
});

test('no jump: the lead says the movement is wander; default title names the model', () => {
  const r = driftResult({ csv: read('data/lake-huron.csv') });
  assert.equal(r.changes.length, 0);
  const h = driftReportHtml(r);
  assert.match(h, /No jump stands out from the drift\.<\/strong>/);
  assert.match(h, /<h1>Change report: jumps on a wandering level<\/h1>/);
});

test('typed text, labels and ignored options are escaped; logo and colour restricted', () => {
  const csv = 'when,v\n' + Array.from({ length: 30 }, (_, i) => `${i === 15 ? '<img src=x onerror=1>' : 'p' + i},${i < 15 ? 1 : 9}`).join('\n');
  const r = driftResult({ csv });
  const h = driftReportHtml(r, { title: '<script>x</script>', notes: '<u>n</u>', accent: 'red;}</style>', logo: 'data:image/svg+xml;base64,AAAA', ignored: ['<b>x</b>', 'seasonal period'] });
  assert.ok(!h.includes('<script>x') && !h.includes('<img src=x') && !h.includes('<u>n</u>') && !h.includes('<b>x</b>') && !h.includes('svg+xml'));
  assert.match(h, /these settings were ignored: &lt;b&gt;x&lt;\/b&gt;, seasonal period/);
  assert.match(h, /--a:#1f5f86/);
});

test('the wandering-level sample is the real code on Canada fertility; the marketing page links it', async () => {
  const { sampleDriftReport } = await import('./build-sample-report.mjs');
  assert.equal(read('sample-drift-change-report.html'), sampleDriftReport());
  const r = driftResult({ csv: read('data/canada-fertility.csv') });
  assert.deepEqual(r.changes.map((c) => c.label), ['1946', '1965', '1967']);
  assert.match(read('change-report-for-analysts.html'), /sample-drift-change-report\.html/);
});

test('the page opens the drift report for a wandering-level run instead of refusing', () => {
  const page = read('index.html');
  assert.match(page, /import \{ driftReportHtml \} from "\.\/drift-report\.mjs"/);
  assert.match(page, /driftReportHtml\(lastDrift, \{ \.\.\.brand, ignored: lastDriftIgnored \}\)/);
  assert.doesNotMatch(page, /branded report covers the other models/);
});
