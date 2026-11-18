// The synthetic control on two real 17-unit panels (README "Few donors: the Basque Country and West Germany",
// eval/synth-few-donors-prereg-2026-11-18.md, eval/synth-few-donors-real.out.txt): the recorded numbers, the
// few-donors note (p <= 0.05 unreachable under 19 donors) and the list of placebos ranked above the treated unit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { synthResult, synthText } from './synth-cli.mjs';
import { synthHtml, fewDonorsNote } from './synth-view.mjs';

const read = (f) => readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8');
const germany = () => synthResult({ csv: read('oecd-gdp-per-capita-1960-2003.csv'), column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003' });
const basque = () => synthResult({ csv: read('spain-regions-gdp-per-capita.csv'), column: 'BAS', date: 1970, donors: ['all'], window: '1955:1997', covariatesCsv: read('spain-regions-covariates-1969.csv') });

test('West Germany 1990: the recorded fit, rank 3 of 17 floored and 1 by the paper\'s ratio, Netherlands and Norway above', () => {
  const h = germany();
  assert.equal(h.donors, 16);
  assert.deepEqual(h.weights.slice(0, 2).map((w) => w.name), ['USA', 'Austria']);
  assert.ok(Math.abs(h.effectAverage - -1297.25) < 1, h.effectAverage);
  assert.equal(h.rank, 3);
  assert.equal(h.tests.ratio.rank, 1);
  assert.ok(Math.abs(h.minP - 1 / 17) < 1e-12);
  assert.deepEqual(h.above.map((q) => q.name), ['Netherlands', 'Norway']);
  assert.equal(h.above.length, h.rank - 1);
  const t = synthText(h);
  assert.match(t, /FEW DONORS: With 17 units the placebo p cannot go below 0\.059: p <= 0\.05 is out of reach/);
  assert.match(t, /Ranked at or above WestGermany .*: Netherlands 16\.9 .*Norway 13\.8/);
});

test('Basque Country 1970: rank 4 of 17 with the fit warning; three regions above; the industry-share warning', () => {
  const h = basque();
  assert.equal(h.rank, 4);
  assert.equal(h.fitWarning, true);
  assert.deepEqual(h.above.map((q) => q.name), ['AST', 'CNT', 'VAL']);
  assert.ok(Math.abs(h.effectAverage - -0.895) < 0.001, h.effectAverage);
  assert.ok(h.balance.find((c) => c.name.startsWith('industry share')).placeboWarning);
  const html = synthHtml(h);
  assert.match(html, /id="synth-few-donors"/);
  assert.match(html, /id="synth-above">Ranked at or above BAS/);
});

test('the few-donors note is arithmetic: none at 19 donors or more, one below', () => {
  assert.equal(fewDonorsNote({ donors: 19, minP: 1 / 20 }), null);
  assert.equal(fewDonorsNote({ donors: 38, minP: 1 / 39 }), null);
  assert.match(fewDonorsNote({ donors: 18, minP: 1 / 19 }), /cannot go below 0\.053/);
});

test('rank 1 lists nobody above, and the page says rank 1 is the smallest p few units allow', () => {
  // The paper's in-time check on Germany's own early window ranks it 2nd; the rank-1 case is California against 38
  // states (no few-donors note) and West Germany with Netherlands and Norway out of the pool (a pool chosen after
  // seeing the result, so this is a test of the wording, not a result).
  const csv = read('oecd-gdp-per-capita-1960-2003.csv');
  const pool = csv.split('\n')[0].split(',').slice(1).filter((c) => !['WestGermany', 'Netherlands', 'Norway'].includes(c));
  const h = synthResult({ csv, column: 'WestGermany', date: 1990, donors: pool, window: '1960:2003' });
  assert.equal(h.rank, 1);
  assert.deepEqual(h.above, []);
  assert.doesNotMatch(synthText(h), /Ranked at or above/);
  assert.match(synthHtml(h), /the largest of all 15 units \(the smallest p this many units allow\)/);
});
