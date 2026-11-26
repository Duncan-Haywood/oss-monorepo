// page-bench.mjs: argument parsing, the summary table, and (when Playwright loads) a
// real timed load of a two-file page served with a per-request delay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, summarise, table, bench, DEFAULTS } from './page-bench.mjs';
import { revalidateServer } from '../perf/revalidate-serve.mjs';
import { loadPlaywright } from './load-playwright.mjs';

const playwright = await loadPlaywright();
const skip = !playwright && 'playwright not installed';

test('parseArgs: defaults, pages split and stripped of a leading slash, flags', () => {
  const o = parseArgs(['--pages=/a/,a/index-b.html', '--runs=3', '--repeat']);
  assert.deepEqual(o.pages, ['a/', 'a/index-b.html']);
  assert.equal(o.runs, 3);
  assert.equal(o.repeat, true);
  assert.equal(o.cpu, DEFAULTS.cpu);
  assert.equal(o.json, false);
});

test('parseArgs: refuses no pages, unknown options and non-numbers', () => {
  assert.throws(() => parseArgs([]), /--pages/);
  assert.throws(() => parseArgs(['--pages=a/', '--bogus=1']), /unknown option --bogus/);
  assert.throws(() => parseArgs(['--pages=a/', '--runs=x']), /--runs needs a number/);
  assert.throws(() => parseArgs(['--pages=a/', '--runs=0']), /at least 1/);
  assert.throws(() => parseArgs(['pages=a/']), /not an option/);
});

test('summarise: per-page medians, every run of DCL kept, missing metrics shown as n/a', () => {
  const rows = [
    { page: 'a/', dcl: 100, ttfb: 10, lcp: null }, { page: 'b/', dcl: 300, ttfb: 30, lcp: 5 },
    { page: 'a/', dcl: 140, ttfb: 12, lcp: null }, { page: 'b/', dcl: 200, ttfb: 20, lcp: 7 },
    { page: 'a/', dcl: 120, ttfb: 11, lcp: null }, { page: 'b/', dcl: 250, ttfb: 25, lcp: 6 },
  ];
  const s = summarise(rows, ['a/', 'b/']);
  assert.equal(s[0].dcl, 120);
  assert.deepEqual(s[0].dclRuns, [100, 140, 120]);
  assert.equal(s[0].lcp, null);
  assert.equal(s[1].dcl, 250);
  assert.equal(s[1].lcp, 6);
  const t = table(s, { ...DEFAULTS, runs: 3, latency: 150, down: 1600 }).split('\n');
  assert.equal(t.length, 4);
  assert.match(t[0], /cpu 4x, 412x915, 60 ms\/request, network 150 ms, 1600 kbit\/s, first visit, median of 3/);
  assert.equal(t[0].split('|').length, t[1].split('|').length, 'header and rule have the same columns');
  assert.match(t[2], /^\| \/a\/ \| 11 \| n\/a \| 120 \|/);
});

test('revalidateServer: max-age=0 with an ETag, 304 on revalidation, no path escape', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reval-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<p>hi</p>');
  const server = revalidateServer(dir, 0);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const r1 = await fetch(`${base}/`);
    assert.equal(r1.status, 200);
    assert.equal(await r1.text(), '<p>hi</p>');
    assert.equal(r1.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    const r2 = await fetch(`${base}/`, { headers: { 'if-none-match': r1.headers.get('etag') } });
    assert.equal(r2.status, 304);
    const r3 = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    assert.equal(r3.status, 404);
    assert.deepEqual(server.requestLog.map((x) => x.st), [200, 304]);
  } finally {
    server.close();
  }
});

test('bench: times a real load; the per-request delay shows in DOMContentLoaded', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  fs.mkdirSync(path.join(dir, 'tool'));
  fs.writeFileSync(path.join(dir, 'tool', 'index.html'),
    '<!doctype html><title>t</title><h1>Tool</h1><script type="module" src="app.mjs"></script><img src="https://example.invalid/x.png" alt="">');
  fs.writeFileSync(path.join(dir, 'tool', 'app.mjs'), 'document.body.append("ready");');
  const o = { ...parseArgs(['--pages=tool/', '--runs=2', '--cpu=1', '--wait=50', '--delay=120']), dist: dir };
  const rows = await bench(o, { playwright });
  assert.equal(rows.length, 2);
  for (const r of rows) {
    // Page then module script, each held 120 ms: DOMContentLoaded waits for both.
    assert.ok(r.dcl >= 230, `DOMContentLoaded ${r.dcl} ms should include two 120 ms delays`);
    assert.ok(r.ttfb >= 110, `first byte ${r.ttfb} ms should include the delay`);
    assert.ok(r.requests >= 2, `requests ${r.requests}`);
  }
  const s = summarise(rows, o.pages);
  assert.equal(s[0].n, 2);
  assert.ok(Number.isFinite(s[0].dcl));
});

test('bench: a page that is not there is an error, not a fast reading', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  const o = { ...parseArgs(['--pages=missing/', '--runs=1', '--cpu=1', '--wait=0', '--delay=0']), dist: dir };
  await assert.rejects(bench(o, { playwright }), /answered 404/);
});

test('bench --repeat: the second visit revalidates (304s), so it moves fewer bytes', { skip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>t</title><script type="module" src="big.mjs"></script>');
  fs.writeFileSync(path.join(dir, 'big.mjs'), `const s = ${JSON.stringify(Array.from({ length: 4000 }, (_, i) => `row ${i} ${Math.sin(i)}`))}; document.title = s.length;`);
  const base = { ...parseArgs(['--pages=index.html', '--runs=1', '--cpu=1', '--wait=0', '--delay=0']), dist: dir };
  const [cold] = await bench(base, { playwright });
  const [warm] = await bench({ ...base, repeat: true }, { playwright });
  assert.ok(cold.kb > 20, `first visit ${cold.kb} KB`);
  assert.ok(warm.kb < cold.kb / 4, `repeat visit ${warm.kb} KB should be revalidations, not a refetch of ${cold.kb} KB`);
});
