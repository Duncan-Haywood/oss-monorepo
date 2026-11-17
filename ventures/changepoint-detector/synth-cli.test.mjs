import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { synthResult, synthText, parseCovariates } from './synth-cli.mjs';

// `--known-date <label> --donors ...`: the synthetic control from the command line (README "A synthetic control from
// the command line"). On Proposition 99 it must print what eval/synth-balance-real.out.txt and the floored-ratio round
// recorded for California: rank 1 of 39, p 0.026, the same weights, the income warning.
const here = (p) => new URL(p, import.meta.url).pathname;
const cli = (args) => execFileSync(process.execPath, [here('./cli.mjs'), ...args], { encoding: 'utf8' });
const PACKS = here('./data/us-cigarette-packs-per-capita.csv'), COV = here('./data/prop99-covariates-1989.csv');
// The donor pool of eval/synth-balance-real.mjs: states with no large tax rise or programme 1988-2000.
function donorPool() {
  const [h, ...rows] = readFileSync(here('./data/us-cigarette-state-tax.csv'), 'utf8').trim().split('\n');
  const H = h.split(','), D = rows.map((l) => l.split(',').map(Number)), ys = D.map((r) => r[0]);
  const ex = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
  const i0 = ys.indexOf(1988), i1 = ys.indexOf(2000);
  return H.slice(1).filter((s) => !ex.has(s)).filter((s) => { const c = H.indexOf(s); let m = 0; for (let i = i0; i <= i1; i++) m = Math.max(m, D[i][c] - D[i0][c]); return m < 0.5; });
}
const pool = donorPool();
const caArgs = [PACKS, '--window', '1970:2000', '--column', 'CA', '--known-date', '1989', '--donors', pool.join(',')];

test('CLI JSON: Proposition 99 ranks California 1st of 39 with the recorded gap and weights', () => {
  assert.equal(pool.length, 38);
  const r = JSON.parse(cli([...caArgs, '--covariates', COV, '--json']));
  assert.equal(r.treated, 'CA');
  assert.equal(r.donors, 38);
  assert.equal(r.rank, 1);
  assert.equal(r.p.toFixed(3), '0.026');
  assert.equal(r.tests.ratio.rank, 3);
  assert.equal(r.effectAverage.toFixed(1), '-19.5');
  assert.equal(r.effectAtEnd.toFixed(1), '-26.5');
  assert.deepEqual(r.weights.slice(0, 3).map((w) => [w.name, w.weight.toFixed(3)]), [['UT', '0.391'], ['MT', '0.227'], ['NV', '0.207']]);
  assert.equal(r.fitWarning, false);
  const inc = r.balance.find((c) => c.name.startsWith('ln income'));
  assert.equal(inc.stdGap.toFixed(2), '1.66');
  assert.equal(Math.round(100 * inc.placeboShare), 89);
  assert.equal(inc.placeboWarning, true);
  assert.deepEqual(r.balance.filter((c) => c.placeboWarning).map((c) => c.name), ['ln income 1980-88']);
  assert.equal(r.labels.length, 31);
});

test('CLI text: the balance table names the warned covariate and the power caveat is printed', () => {
  const t = cli([...caArgs, '--covariates', COV]);
  assert.match(t, /\(1988 -> 1989\), 1970 to 2000, 38 donor series/);
  assert.match(t, /rank 1 of 39, p 0\.026/);
  assert.match(t, /ln income 1980-88 .* 1\.66 +89%  WARNING/);
  assert.match(t, /WARNING on ln income 1980-88: CA is matched worse/);
  assert.match(t, /a large p is not evidence of no effect/);
  assert.doesNotMatch(cli(caArgs), /Covariate balance/);
});

test('Massachusetts 1993 balances every covariate and still ranks 6th (eval/synth-balance-real.out.txt)', () => {
  // Same pool rule as the eval for MA: a 1993 date, its own window; uses only the outcome here.
  const r = synthResult({ csv: readFileSync(PACKS, 'utf8'), column: 'MA', date: '1993', window: '1970:2000', donors: pool });
  assert.equal(r.rank, 6);
  assert.equal(r.p.toFixed(3), '0.154');
});

test('errors: no --column, the treated column among the donors, a blank, a missing covariate row, flags without a date', () => {
  const csv = 't,a,b,c,d,e\n' + Array.from({ length: 12 }, (_, i) => `${i + 1},${i},${i + 1},${2 * i},${i % 3},${i * i}`).join('\n');
  assert.throws(() => synthResult({ csv, date: '8', donors: ['all'] }), /needs --column/);
  assert.throws(() => synthResult({ csv, column: 'a', date: '8', donors: ['a', 'b'] }), /take it out of --donors/);
  assert.throws(() => synthResult({ csv, column: 'a', date: '8', donors: ['b', 'zz'] }), /No numeric column named "zz"/);
  assert.throws(() => synthResult({ csv, column: 'a', date: '99', donors: ['all'] }), /no row in the window has that label/);
  assert.throws(() => synthResult({ csv: csv.replace('\n3,2,3,', '\n3,2,,'), column: 'a', date: '8', donors: ['all'] }), /b is blank at 3/);
  assert.throws(() => synthResult({ csv, column: 'a', date: '8', donors: ['all'], covariatesCsv: 'unit,x\na,1\nb,2\nc,3\nd,4\n' }), /no row for e/);
  assert.throws(() => cli(['--example', '--donors', 'all']), /go with --known-date/);
});

test('all donors, a window, the log scale and a headerless covariates file', () => {
  const csv = 't,a,b,c,d,e\n' + Array.from({ length: 20 }, (_, i) => `${i + 1},${10 + i + (i >= 14 ? 5 : 0) + ((i * 7) % 3)},${10 + i + ((i * 5) % 4)},${11 + i + ((i * 3) % 2)},${9 + i + ((i * 11) % 5)},${12 + i + ((i * 13) % 3)}`).join('\n');
  const r = synthResult({ csv, column: 'a', date: '15', donors: ['all'], window: '3:', log: true, covariatesCsv: 'a,1\nb,2\nc,3\nd,4\ne,5\n' });
  assert.equal(r.donors, 4);
  assert.equal(r.from, '3');
  assert.equal(r.scale, 'log');
  assert.ok(r.effectAverage > 0.1, String(r.effectAverage));
  assert.equal(r.balance[0].name, 'covariate 1');
  assert.match(synthText(r), /on the logs/);
  assert.deepEqual(parseCovariates('unit;x;y\nA;1;2\n').units.a, [1, 2]);
});

// Red team 2026-11-17: the covariates file is read like the data CSV. A semicolon file from a comma-decimal locale
// ("a;3,5") had split into two covariates, 3 and 5, under one header name; a quoted unit name lost its comma; a row
// repeated for one unit silently replaced the first.
test('covariates: decimal commas in a semicolon file, quoted names, and rows that disagree with the header', () => {
  const cv = parseCovariates('unit;income\na;3,5\nb;4,25\n');
  assert.deepEqual(cv.names, ['income']);
  assert.deepEqual(cv.units, { a: [3.5], b: [4.25] });
  assert.deepEqual(parseCovariates('unit,income\n"Washington, DC",7\n').units, { 'washington, dc': [7] });
  assert.throws(() => parseCovariates('unit,income\na,3,5\nb,4,1\n'), /row for a needs 1 number \(income\), got 2: a decimal comma/);
  assert.throws(() => parseCovariates('unit,x\nA,1\na,2\n'), /two rows for a/);
  assert.throws(() => parseCovariates('unit,x,y\na,1\n'), /row for a needs 2 numbers/);
});
