// A curvature word (README "A curvature word", pre-registered eval/synth-shape-curve-prereg-2026-11-18.md; all six bars
// held). Re-checks every bar against the confirmatory file, that CURVE quotes it, gapBend on fixed shapes, the
// simulation's determinism, and the reading on West Germany 1990 under --shape-word panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gapBend, gapShape, gapStraight, STRAIGHT_BAND } from './synth-control.mjs';
import { CURVE } from './synth-view.mjs';
import { synthResult, synthText } from './synth-cli.mjs';
import { CELLS, scorePanel } from './eval/synth-shape-curve-sim.mjs';
import { seedOf } from './eval/synth-floor-sim.mjs';

const txt = readFileSync(new URL('./eval/synth-shape-curve-confirm.out.txt', import.meta.url), 'utf8');
const block = (key) => { const i = txt.indexOf(`\n${key}: `); assert.ok(i >= 0, key); const j = txt.indexOf('\n\n', i + 1); return txt.slice(i, j < 0 ? undefined : j); };
const line = (key, name) => {
  const m = block(key).match(new RegExp(`\\n  ${name}\\s+grew\\s+(-?[\\d.]+)(?:%| pts)?\\s+flag\\s+(-?[\\d.]+)(?:%| pts)?`));
  assert.ok(m, `${key}: ${name}`);
  return { grew: Number(m[1]), flag: Number(m[2]) };
};
const SW = 'growing-all | switched';

test('the band is the frozen one', () => assert.deepEqual(STRAIGHT_BAND, [-0.15, 0.1]));
test('gapBend: 0 on a line, below 0 when it speeds up, above 0 when it slows, null when flat or short', () => {
  const lin = Array.from({ length: 12 }, (_, h) => 2 * (h + 1));
  assert.ok(Math.abs(gapBend(lin)) < 1e-12);
  assert.ok(gapBend(lin.map((_, h) => Math.exp(0.4 * h))) < -0.15);
  assert.ok(gapBend(lin.map((_, h) => 1 - Math.exp(-0.5 * h))) > 0.1);
  assert.equal(gapBend(Array(12).fill(1)), null);
  assert.equal(gapBend([1, 2, 3, 4, 5]), null);
  // a falling line is straight too: the bend is a share of the rise, whatever its sign
  assert.ok(Math.abs(gapBend(lin.map((v) => -v))) < 1e-12);
  assert.equal(gapStraight(gapShape(lin)), true);
  assert.equal(gapStraight(gapShape(lin.map((_, h) => Math.exp(0.4 * h)))), false);
});
test('bar 1 holds: slope lift at least plain grew + 8 points', () => {
  const r = line(SW, 'slope lift');
  assert.ok(r.flag >= r.grew + 8, `${r.flag} vs ${r.grew}`);
  assert.deepEqual(r, { grew: 21.4, flag: 36.6 });
});
test('bar 2 holds: odds ratio at least 1.2 times plain grew', () => {
  const r = line(SW, 'odds ratio');
  assert.ok(r.flag >= 1.2 * r.grew);
  assert.deepEqual(r, { grew: 3.37, flag: 4.74 });
});
test('bar 3 holds: clean units flagged at least 20 points below plain grew', () => {
  const r = line(SW, 'clean');
  assert.ok(r.grew - r.flag >= 20);
});
test('bar 4 holds: big slopes flagged at least 75%', () => assert.ok(line(SW, 'big slope').flag >= 75));
test('bar 5 holds: bar 1 in each growing generator', () => {
  for (const fam of ['growing', 'growing-ar0.7', 'growing-ar0.97']) {
    const r = line(`${fam} | switched`, 'slope lift');
    assert.ok(r.flag >= r.grew + 8, fam);
  }
});
test('bar 6 holds: pulses flagged at most 5%', () => assert.ok(line(SW, 'pulse').flag <= 5));
test('CURVE quotes the confirmatory switched-panel block', () => {
  assert.equal(CURVE.slopeStraight, line(SW, 'slope').flag);
  assert.equal(CURVE.slopeGrew, line(SW, 'slope').grew);
  assert.equal(CURVE.bigSlopeStraight, line(SW, 'big slope').flag);
  assert.equal(CURVE.cleanStraight, line(SW, 'clean').flag);
  assert.equal(CURVE.cleanGrew, line(SW, 'clean').grew);
  assert.equal(CURVE.cleanAboveStraight, line(SW, 'clean above').flag);
  assert.equal(CURVE.cleanAboveGrew, line(SW, 'clean above').grew);
  assert.equal(CURVE.precisionStraight, line(SW, 'precision').flag);
  assert.equal(CURVE.precisionGrew, line(SW, 'precision').grew);
});
test('the simulation: 80 cells, and a fixed seed gives a fixed panel', () => {
  const names = Object.keys(CELLS);
  assert.equal(names.length, 80);
  const ci = names.indexOf('KSE16'), a = scorePanel(CELLS.KSE16, seedOf(97000, ci, 0));
  assert.deepEqual(a, scorePanel(CELLS.KSE16, seedOf(97000, ci, 0)));
  assert.equal(a.shape, 'slope');
  assert.equal(a.clean.length, 14);
});

const wgCsv = () => readFileSync(new URL('./data/oecd-gdp-per-capita-1960-2003.csv', import.meta.url), 'utf8');
test('West Germany 1990, --shape-word panel: the Netherlands grew along a straight line, Norway bent', () => {
  const r = synthResult({ csv: wgCsv(), column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003', shapeWord: 'panel' });
  assert.deepEqual(r.above.map((x) => [x.name, x.gapShape, x.plainShape, x.straight]), [['Netherlands', 'held', 'grew', true], ['Norway', 'grew', 'grew', false]]);
  assert.ok(Math.abs(r.above[0].bend) < 0.01);
  assert.ok(r.above[1].bend < -0.15);
  const t = synthText(r);
  assert.match(t, /Netherlands [^)]*\)?[^;]*; its own gap held against the panel's growth, but grew towards the end on its own reading, along a straight line from the date \(the shape of a slope of its own\)/);
  assert.match(t, /Norway [^;]*; its own gap grew towards the end, bending like the panel's compounding gaps rather than along a straight line/);
  assert.match(t, new RegExp(`a donor's own slope was read as grown along a straight line ${Math.round(CURVE.slopeStraight)}% of the time`));
  assert.match(t, new RegExp(`${Math.round(CURVE.precisionStraight)}% of the units so read were that donor`));
  // the default reading is unchanged: no bend, no straight, no line clause
  const plain = synthResult({ csv: wgCsv(), column: 'WestGermany', date: 1990, donors: ['all'], window: '1960:2003' });
  assert.equal(plain.above[0].bend, undefined);
  assert.equal(plain.above[0].straight, undefined);
  assert.doesNotMatch(synthText(plain), /straight line/);
  assert.equal(r.p, plain.p);
});
