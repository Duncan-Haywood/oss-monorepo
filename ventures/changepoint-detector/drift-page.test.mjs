// The wandering-level model (`--model drift`) on the page: drift-view.mjs words driftResult for the
// page, analyze-job.mjs runs it in the page's worker, index.html wires the option. These pin that
// the page shows what the CLI computes, that the job survives a worker's structured clone, the
// penalty mapping, the slope fix to the jump size, and the page wiring. Browser run:
// eval/drift-page-browser.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeJob } from './analyze-job.mjs';
import { driftResult } from './drift-cli.mjs';
import { driftLevel } from './drift-level.mjs';
import { parseSeries } from './engine.mjs';
import {
  driftPagePenalty, driftIgnored, driftSummary, driftNotes, driftChartSvg, driftTableHtml, driftSegmentsHtml, driftCsv,
} from './drift-view.mjs';

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const nile = read('data/nile.csv');

test('the job equals driftResult and survives structured clone', () => {
  for (const opts of [{ csv: nile }, { csv: nile, penalty: 20 }, { csv: read('data/austres.csv'), slope: true }]) {
    const out = analyzeJob({ kind: 'drift', opts });
    assert.equal(out.error, undefined);
    assert.deepEqual(structuredClone(out.result), driftResult(opts));
  }
  assert.match(analyzeJob({ kind: 'drift', opts: { csv: 'v\n1\n2' } }).error, /at least 4/);
  assert.match(analyzeJob({ kind: 'drift', opts: { csv: nile, penalty: -1 } }).error, /penalty/);
});

test('Nile: the page says 1899 alone, with the CLI numbers', () => {
  const r = driftResult({ csv: nile });
  assert.equal(r.values.length, 100);
  assert.deepEqual(r.changes.map((c) => c.label), ['1899']);
  const sum = driftSummary(r);
  assert.match(sum, /^volume, 100 values\. 1 jump too big for the drift: 1899 \(-249, -2\.1 noise sd\)\./);
  assert.match(sum, /sd 118/);
  const t = driftTableHtml(r);
  assert.match(t, /<td>1899<\/td><td class="n">1098<\/td><td class="n">849<\/td><td class="n">-249<\/td><td class="n">-2\.11<\/td>/);
  assert.equal((driftSegmentsHtml(r).match(/<tr>/g) || []).length, 3); // header and two stretches
  const svg = driftChartSvg(r);
  assert.ok(svg.startsWith('<svg') && !svg.includes('NaN'));
  assert.equal((svg.match(/stroke-dasharray/g) || []).length, 1);
  assert.equal((svg.match(/stroke="#c0392b" stroke-width="2.5"/g) || []).length, 2); // level drawn per stretch
  const csv = driftCsv(r).split('\n');
  assert.equal(csv.length, 101);
  assert.equal(csv[0], 'label,value,stretch,fitted_level');
  assert.match(csv[28], /^1898,\d+,1,/);
  assert.match(csv[29], /^1899,\d+,2,/);
});

test('notes: the TCPD figures always, the heavy-tail check when it fires, in page words', () => {
  const nileNotes = driftNotes(driftResult({ csv: nile }));
  assert.equal(nileNotes.length, 1);
  assert.match(nileNotes[0], /F1 0\.694 \(31 series\) and 0\.527 \(7 held out\)/);
  const gold = driftNotes(driftResult({ csv: read('data/gold.csv') }));
  assert.equal(gold.length, 2);
  assert.match(gold[0], /^Heavy-tail check: the noise around the level is heavy-tailed/);
  const walk = { ...driftResult({ csv: nile }), tails: { kind: 'walk', stepKurtosis: 9 } };
  const w = driftNotes(walk)[0];
  assert.match(w, /"Level and volatility" model on its differences/);
  assert.doesNotMatch(w, /--model/);
});

test('penalty boxes map to the model: BIC or a number, AIC and Hannan-Quinn refused', () => {
  assert.equal(driftPagePenalty('bic'), 'bic');
  assert.equal(driftPagePenalty('custom', '12.5'), 12.5);
  assert.throws(() => driftPagePenalty('aic'), /BIC penalty or a custom number/);
  assert.throws(() => driftPagePenalty('hannan-quinn'), /BIC penalty or a custom number/);
  assert.deepEqual(driftIgnored({ log: true, period: 12, ar1: false }), ['take logs first', 'seasonal period']);
  assert.deepEqual(driftIgnored({}), []);
});

test('with a steady growth taken out, a jump no longer includes one step of that growth', () => {
  const { values } = parseSeries(read('data/austres.csv'), null, null);
  const r = driftLevel(values, { slope: true, noise: 'ml' });
  assert.ok(r.slope > 40);
  for (const c of r.changes) {
    assert.ok(Math.abs(c.after - c.before - r.slope - c.jump) < 1e-9);
    assert.ok(Math.abs(c.jump / r.sigma - c.jumpSd) < 1e-9);
  }
  // Without the slope, nothing is subtracted.
  const p = driftLevel(parseSeries(nile, null, null).values, { noise: 'ml' });
  assert.equal(p.changes[0].jump, p.changes[0].after - p.changes[0].before);
});

test('a flat series draws no NaN', () => {
  const r = driftResult({ csv: '1\n1\n1\n1\n1\n1' });
  assert.ok(!driftChartSvg(r).includes('NaN'));
  assert.ok(!driftSegmentsHtml(r).includes('undefined'));
});

test('labels are escaped everywhere the page puts them', () => {
  const csv = 'when,v\n' + Array.from({ length: 60 }, (_, i) => `<b>${i}</b>,${i < 30 ? 0 : 10}`).join('\n');
  const r = driftResult({ csv });
  for (const html of [driftTableHtml(r), driftSegmentsHtml(r), driftChartSvg(r)]) assert.ok(!html.includes('<b>'));
});

test('page wiring: the option, the worker job, the view module and the counter', () => {
  const html = read('index.html');
  assert.match(html, /<option value="drift">Sudden jumps on a level that wanders/);
  assert.match(html, /id="driftSlope"/);
  assert.match(html, /startMain\(\{ kind: "drift"/);
  assert.match(html, /from "\.\/drift-view\.mjs"/);
  assert.match(html, /record\("drift_run"\)/);
  assert.match(html, /<code>drift_run<\/code>/);
  assert.match(html, /doi\s+= \{10\.1080\/01621459\.2021\.1909598\}/);
  // drift-view imports only siblings, so the agent tool and the worker can load it.
  assert.deepEqual([...read('drift-view.mjs').matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./report.mjs', './drift-cli.mjs']);
});
