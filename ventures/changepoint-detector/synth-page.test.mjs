import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeJob } from './analyze-job.mjs';
import { synthHtml, synthChartSvg, synthCsv, csvCell } from './synth-view.mjs';
import { PROP99_CSV, PROP99_COVARIATES, PROP99_DONORS } from './example-prop99.mjs';

// The synthetic control on the page (README "A synthetic control on the page"): the donor and covariate boxes feed
// synth-cli.mjs synthResult through the page's worker job, and the page shows what the CLI prints.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const synth = { csv: PROP99_CSV, column: 'CA', date: '1989', donors: PROP99_DONORS.split(','), log: false, covariatesCsv: PROP99_COVARIATES };

test('example: the embedded Proposition 99 panel is the data files cut at 2000, with the 38-state pool', () => {
  const packs = read('./data/us-cigarette-packs-per-capita.csv').trim().split('\n').filter((l, i) => i === 0 || Number(l.split(',')[0]) <= 2000).join('\n');
  assert.equal(PROP99_CSV, packs);
  assert.equal(PROP99_COVARIATES, read('./data/prop99-covariates-1989.csv').trim());
  assert.equal(PROP99_DONORS.split(',').length, 38);
});

test('worker job: the page example gives the CLI\'s California numbers and the income warning', () => {
  const out = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA', knownDate: '1989' }, synth });
  assert.equal(out.error, undefined);
  const h = out.result.synth;
  assert.equal(h.rank, 1);
  assert.equal(h.p.toFixed(3), '0.026');
  assert.equal(h.effectAverage.toFixed(1), '-19.5');
  assert.deepEqual(h.balance.filter((c) => c.placeboWarning).map((c) => c.name), ['ln income 1980-88']);
  assert.ok(out.result.knownDate, 'the one-column known-date test still runs');
});

test('worker job: a bad donor leaves the one-column result and reports synthError', () => {
  const out = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth: { ...synth, donors: ['ZZ'] } });
  assert.ok(out.result.pelt);
  assert.match(out.result.synthError, /No numeric column named "ZZ"/);
  assert.equal(analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' } }).result.synth, undefined);
});

test('view: summary, weights, balance table with its warning row, chart and CSV', () => {
  const h = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth }).result.synth;
  const html = synthHtml(h);
  assert.match(html, /rank 1 of 39, p 0\.026/);
  assert.match(html, /UT 0\.391, MT 0\.227, NV 0\.207/);
  assert.match(html, /<table id="synth-balance">/);
  assert.equal((html.match(/<strong>Warning<\/strong>/g) || []).length, 1);
  assert.match(html, /Warning on ln income 1980-88:/);
  assert.match(html, /does not say what caused it/);
  const noCov = synthHtml({ ...h, balance: undefined });
  assert.doesNotMatch(noCov, /synth-balance/);
  assert.match(synthChartSvg(h), /^<svg[^>]*aria-label="CA and its synthetic control, 1970 to 2000"/);
  const csv = synthCsv(h).split('\n');
  assert.equal(csv[0], 'label,treated,synthetic,gap');
  assert.equal(csv.length, 32);
  assert.ok(synthHtml({ ...h, treated: '<b>' }).includes('&lt;b&gt;'));
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-5'), '-5');
  assert.equal(csvCell('@a'), "'@a");
});

test('page: the donor and covariate boxes, the example button and the counted run are wired', () => {
  const html = read('./index.html');
  assert.match(html, /<input id="donors" type="text"/);
  assert.match(html, /<textarea id="covariates"/);
  assert.match(html, /id="example-prop99"/);
  assert.match(html, /startMain\(\{ kind: "one", opts, \.\.\.\(synth \? \{ synth \} : \{\}\) \}/);
  assert.match(html, /record\(r\.synth\.balance \? "synth_balance_run" : "synth_run"\)/);
  assert.match(html, /import \{ synthHtml, synthChartSvg, synthCsv \} from "\.\/synth-view\.mjs"/);
});

test('page: the points-seen-coming box backdates the fit, as the CLI\'s --anticipation does', () => {
  const html = read('./index.html');
  assert.match(html, /<input id="anticipation" type="text" value="0" pattern=/);
  assert.match(html, /anticipation: \$\("#anticipation"\)\.value\.trim\(\) \|\| 0[,}]/);
  const h = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth: { ...synth, anticipation: '1' } }).result.synth;
  assert.equal(h.fitEnd, '1987');
  assert.equal(h.rank, 1);
  const v = synthHtml(h);
  assert.match(v, /Backdated 1 point:<\/strong> the synthetic control is fitted on the points up to 1987/);
  assert.match(v, /matching every point from 1970 to 1987/);
  assert.doesNotMatch(v, /Points people saw it coming/);
  const h0 = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth }).result.synth;
  assert.match(synthHtml(h0), /Points people saw it coming/);
  const bad = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth: { ...synth, anticipation: '40' } });
  assert.match(bad.result.synthError, /--anticipation 40/);
});

test('page: a range of leads shows every lead in a table and the range p (README "An uncertain lead")', () => {
  const h = analyzeJob({ kind: 'one', opts: { csv: PROP99_CSV, column: 'CA' }, synth: { ...synth, covariatesCsv: null, anticipation: '0-1' } }).result.synth;
  assert.equal(h.leadRange.leads.length, 2);
  const html = synthHtml(h);
  assert.match(html, /<table id="synth-leads">/);
  assert.match(html, /Range test: p 0\.\d{3}\./);
  assert.doesNotMatch(html, /set &ldquo;Points people saw it coming&rdquo;/);
  assert.doesNotMatch(html, /@@/);
  assert.doesNotMatch(synthHtml({ ...h, leadRange: undefined }), /synth-leads/);
});
