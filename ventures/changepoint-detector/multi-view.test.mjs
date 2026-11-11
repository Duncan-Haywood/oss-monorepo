import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseColumns, analyzeMulti, multiText, jointOvercut, JOINT_OVERCUT_EVERY } from './multivariate.mjs';
import { multiChartSvg, agreedTableHtml, jointTableHtml, multiSummary, multiCsv } from './multi-view.mjs';
import { FX_CSV } from './example-fx.mjs';

const fxFile = readFileSync(new URL('./data/fx-daily-returns.csv', import.meta.url), 'utf8').replace(/\r/g, '');

test('the page example is exactly data/fx-daily-returns.csv', () => {
  assert.equal(FX_CSV.trim(), fxFile.trim());
});

test('the page example: the 2015 franc floor and the 2016 Brexit vote, each in its own column', () => {
  const p = parseColumns(FX_CSV);
  assert.deepEqual(p.names, ['chf', 'gbp', 'jpy']);
  const r = analyzeMulti({ ...p, model: 'meanvar' });
  const agreed = Object.fromEntries(r.agreed.map((c) => [c.label, c.columns]));
  assert.deepEqual(agreed['2015-01-20'], ['chf']);
  assert.deepEqual(agreed['2016-06-24'], ['gbp']);
  assert.ok(r.joint.some((j) => j.label === '2015-01-15'), 'joint fit dates the SNB floor removal to the day');
  assert.equal(r.overcutWarning, undefined, `${r.joint.length} joint cuts on ${r.n} points should not warn`);
  const svg = multiChartSvg(p, r);
  assert.match(svg, /^<svg viewBox="0 0 900 \d+"/);
  assert.equal((svg.match(/stroke-width="2.5"/g) || []).length, r.agreed.length, 'one solid mark per agreed column change');
  assert.match(agreedTableHtml(r), /<td>2015-01-20<\/td><td class="n">1 of 3<\/td><td>chf<\/td>/);
  assert.match(jointTableHtml(r), /chf shift \(noise sd\)/);
  // 2013-04-04 is a volatility change: every mean moves under 0.2 sd, but the table shows the sd ratio.
  const jt = jointTableHtml(r, p);
  assert.match(jt, /sd after\/before/);
  const row = jt.split('<tr>').find((x) => x.startsWith('<td>2015-01-15'));
  assert.match(row, /font-weight:600">-1\.09 \(-2\.2\) · sd ×\d/);
  assert.match(multiSummary(r), /^3 columns, 1751 points\. Changes every setting agrees on/);
  const csv = multiCsv(p, r).split('\n');
  assert.equal(csv.length, 1752);
  assert.equal(csv[0], 'label,chf,gbp,jpy,joint_segment,agreed_change_in');
  assert.match(csv.find((l) => l.startsWith('2015-01-20')), /,chf$/);
  assert.match(csv.at(-1), new RegExp(`,${r.joint.length + 1},$`));
});

test('over-cut warning: fires on a smooth real pair, not on white noise with one shared step', () => {
  assert.equal(JOINT_OVERCUT_EVERY, 50);
  assert.equal(jointOvercut(4, 200), false);
  assert.equal(jointOvercut(5, 200), true);
  assert.equal(jointOvercut(4, 100), true);
  const de = readFileSync(new URL('./data/german-unemployment.csv', import.meta.url), 'utf8');
  const r = analyzeMulti({ csv: de });
  assert.ok(r.joint.length > 10, `${r.joint.length}`);
  assert.match(r.overcutWarning, /probably cutting smooth/);
  assert.match(multiText(r), /Read with care: The one segmentation/);
  let a = 11;
  const u = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  let warned = 0;
  for (let s = 0; s < 20; s++) {
    const cols = Array.from({ length: 4 }, () => Array.from({ length: 200 }, (_, i) => g() + (i >= 100 ? 1 : 0)));
    if (analyzeMulti({ cols }).overcutWarning) warned++;
  }
  assert.equal(warned, 0, `${warned} of 20 white-noise series warned`);
});

test('labels are escaped in every view', () => {
  const p = { cols: [[1, 1, 1, 9, 9, 9], [2, 2, 2, 8, 8, 8]], names: ['<a>', 'b'], labels: ['1', '2', '3', '<x>', '5', '6'] };
  const r = analyzeMulti({ ...p, tolerance: 1 });
  for (const h of [multiChartSvg(p, r), agreedTableHtml(r), jointTableHtml(r)]) assert.doesNotMatch(h, /<a>|<x>/);
});
