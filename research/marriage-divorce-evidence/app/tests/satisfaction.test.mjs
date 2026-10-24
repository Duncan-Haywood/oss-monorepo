// Satisfaction by years married: series lookup, band matching, the headline dip and an
// accessible chart built from the shipped aggregates.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { seriesFor, groupsFor, bandFor, dip, chartSvg } from '../satisfaction.js';

const data = JSON.parse(readFileSync(new URL('../data/satisfaction_by_duration.json', import.meta.url)));

test('series, groups and bands', () => {
  const g = seriesFor(data, 'GSS 1973-1994');
  assert.ok(g && g.points.length >= 6);
  assert.ok(groupsFor(data, 'GSS 1973-1994').includes('Sex: Women'));
  assert.equal(bandFor(g, 0).level, '0-2');
  assert.equal(bandFor(g, 2.5).level, '0-2');
  assert.equal(bandFor(g, 7).level, '6-10');
  assert.equal(bandFor(g, 55).level, '41+');
  assert.equal(bandFor(g, NaN), null);
  assert.equal(seriesFor(data, 'nope'), null);
});

test('the dip is measured from the first band to the lowest later band', () => {
  const d = dip(seriesFor(data, 'GSS 1973-1994'));
  assert.equal(d.first.level, '0-2');
  assert.ok(d.drop > 0.05, 'newlyweds report "very happy" more often than spouses married longer');
  assert.ok(d.first.very_happy_lo > d.low.very_happy_hi, 'the intervals do not overlap');
});

test('the chart is an accessible SVG with one dot per point', () => {
  const lines = [{ name: 'GSS', points: seriesFor(data, 'GSS 1973-1994').points }, { name: 'HCMST', points: seriesFor(data, 'HCMST 2009').points }];
  const svg = chartSvg(lines);
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /aria-label="Share giving the top answer by years married\./);
  assert.equal((svg.match(/<circle /g) || []).length, lines[0].points.length + lines[1].points.length);
  assert.ok(!/NaN/.test(svg));
});
