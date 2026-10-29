import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quantileBreaks, binOf, legendEntries, colorStep, choroplethSVG, legendHTML } from './map.mjs';

test('quantile breaks split values into five bins; nulls ignored', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null];
  const b = quantileBreaks(v, 5);
  assert.equal(b.length, 4);
  const bins = v.filter((x) => x !== null).map((x) => binOf(x, b));
  for (let i = 0; i < 5; i++) assert.equal(bins.filter((x) => x === i).length, 2);
});

test('few distinct values give fewer bins; a single value gives one', () => {
  assert.deepEqual(quantileBreaks([5, 5, 5, 5]), []);
  const skew = quantileBreaks([1, 1, 1, 9]);
  assert.ok(skew.length < 4);
  assert.equal(binOf(1, skew), 0);
  assert.equal(binOf(9, skew), skew.length);
  assert.deepEqual(quantileBreaks([3]), []);
  assert.equal(binOf(3, []), 0);
});

test('missing values bin to -1 and never to the lowest bin', () => {
  assert.equal(binOf(null, [1, 2]), -1);
  assert.equal(binOf(undefined, [1, 2]), -1);
  assert.equal(binOf(NaN, [1, 2]), -1);
  assert.equal(binOf(0, [1, 2]), 0, 'a real zero is the lowest bin, not missing');
  assert.equal(colorStep(-1, 5), -1);
  assert.equal(colorStep(0, 3), 0);
  assert.equal(colorStep(2, 3), 4);
});

test('legend covers min to max in order', () => {
  const v = [10, 20, 30, 40, 50];
  const b = quantileBreaks(v, 5);
  const e = legendEntries(v, b);
  assert.equal(e[0].from, 10);
  assert.equal(e[e.length - 1].to, 50);
  assert.equal(legendEntries([null], []).length, 0);
  assert.match(legendHTML(v, b, undefined, 2), /Not available \(2\)/);
});

test('SVG: missing counties hatched and labelled, values in bins, keyboard-focusable, no markers', () => {
  const geo = JSON.parse(readFileSync(new URL('./test/fixtures/data/geo/state_08.json', import.meta.url), 'utf8'));
  const ids = Object.keys(geo.paths);
  const values = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? null : i * 10]));
  const { svg } = choroplethSVG({ geo, values, names: { [ids[0]]: 'Fixture <A>' }, selected: ids[1] });
  const missing = svg.match(/class="area missing"/g) || [];
  assert.equal(missing.length, 1);
  assert.match(svg, /Fixture &lt;A&gt;: Not available/);
  assert.match(svg, /<pattern id="hatch"/);
  assert.equal((svg.match(/tabindex="0"/g) || []).length, ids.length);
  assert.match(svg, /class="area q\d selected"/);
  assert.ok(!/<circle|<image|<use/.test(svg), 'areas only, no point markers');
  const noValue = choroplethSVG({ geo, values: {} }).svg;
  assert.equal((noValue.match(/area missing/g) || []).length, ids.length, 'a county absent from the values is missing, not low');
});
