import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FF_K, FL_K, fNumber, lineSamples, straightedgeGaps, analyseSection, overall, checkSpec,
  grindEstimate, csvCell, tokens, parseLines, gridSurvey, parseGrid, parseXyz, latticeFromPoints, exampleGrid, toInches,
} from './flatness.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('FF and FL follow 4.57/(3S+|mean|) and 12.5/(3S+|mean|), worked by hand', () => {
  // z = 0, .1, 0, .1, 0 : 12-in steps .1 -.1 .1 -.1, curvatures -.2 .2 -.2
  const { q } = lineSamples([0, 0.1, 0, 0.1, 0]);
  assert.deepEqual(q.map(v => +v.toFixed(12)), [-0.2, 0.2, -0.2]);
  const m = -0.2 / 3;
  const s = Math.sqrt(((-0.2 - m) ** 2 * 2 + (0.2 - m) ** 2) / 2);
  close(fNumber(q, FF_K).F, 4.57 / (3 * s + Math.abs(m)));
  // 10-ft differences: 12 readings give 2
  const z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.1];
  const { d } = lineSamples(z);
  assert.deepEqual(d.map(v => +v.toFixed(12)), [0.2, 0.1]);
  const sd = Math.sqrt(((0.2 - 0.15) ** 2 + (0.1 - 0.15) ** 2) / 1);
  close(fNumber(d, FL_K).F, 12.5 / (3 * sd + 0.15));
});

test('a straight sloped line has no curvature; its slope costs FL, not FF', () => {
  const flat = Array.from({ length: 30 }, () => 0);
  const sloped = flat.map((_, i) => i * 0.01);
  const bumpy = flat.map((_, i) => 0.05 * Math.sin(i * 1.3));
  const a = analyseSection({ z: bumpy, lines: [bumpy.map((_, i) => i)] });
  const b = analyseSection({ z: bumpy.map((v, i) => v + sloped[i] + 3), lines: [bumpy.map((_, i) => i)] });
  close(a.ff.F, b.ff.F, 1e-9);
  assert.ok(b.fl.F < a.fl.F);
  assert.equal(fNumber(lineSamples(sloped).q.map(v => +v.toFixed(12)), FF_K).F, Infinity);
});

test('F-numbers are inversely proportional to roughness: twice the bumps, half the FF', () => {
  const z = Array.from({ length: 50 }, (_, i) => 0.04 * Math.sin(i * 0.9) + 0.02 * Math.cos(i * 2.1));
  const one = analyseSection({ z, lines: [z.map((_, i) => i)] });
  const two = analyseSection({ z: z.map(v => 2 * v), lines: [z.map((_, i) => i)] });
  close(one.ff.F / two.ff.F, 2, 1e-9);
  close(one.fl.F / two.fl.F, 2, 1e-9);
});

test('a missing reading splits the line rather than bridging it', () => {
  const { q, d } = lineSamples([0, 0, 0, null, 5, 5, 5]);
  assert.deepEqual(q, [0, 0]);
  assert.deepEqual(d, []);
});

test('sections pool every line; short lines are named in warnings', () => {
  const { sections, errors } = parseLines('## Bay A, area 1200\nA1: 0 .1 0 .1 0\nA2: 0 .05 0 .05 0 .05 0\n## Bay B area=800\n0 0 0 0 0 0 0 0 0 0 0.1 0.2');
  assert.deepEqual(errors, []);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].name, 'Bay A');
  assert.equal(sections[0].areaSqFt, 1200);
  assert.equal(sections[1].areaSqFt, 800);
  const r = analyseSection(sections[0].survey);
  const pooled = fNumber([...lineSamples([0, .1, 0, .1, 0]).q, ...lineSamples([0, .05, 0, .05, 0, .05, 0]).q], FF_K);
  close(r.ff.F, pooled.F);
  assert.equal(r.fl.F, null);
  assert.ok(r.warnings.some(w => /FL cannot be computed/.test(w)));
});

test('overall is area-weighted; the spec check names what fails', () => {
  const s = [
    { name: 'A', areaSqFt: 3000, result: { ff: { F: 40 }, fl: { F: 30 } } },
    { name: 'B', areaSqFt: 1000, result: { ff: { F: 20 }, fl: { F: 30 } } },
  ];
  const t = overall(s);
  close(t.ff, 35); close(t.fl, 30);
  const c = checkSpec(s, t, { ffOverall: 35, flOverall: 25, ffLocal: 24, flLocal: null });
  assert.deepEqual(c.map(x => [x.what, x.pass]), [['Overall FF', true], ['Overall FL', true], ['A FF (local)', true], ['B FF (local)', false]]);
});

test('straightedge: a 1/4 in dip under a 10 ft straightedge reads 1/4 in; a crown rocks on its top', () => {
  const dip = [0, 0, 0, 0, 0, -0.25, 0, 0, 0, 0, 0];
  const g = straightedgeGaps(dip, 10);
  assert.equal(g.length, 1);
  close(g[0].gap, 0.25); assert.equal(g[0].at, 5);
  // A symmetric crown: the edge rests on the crown and one end, so the gap
  // is at the far side of the crown, not under a line between the two ends.
  const crown = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.2, 0.15, 0.1, 0.05, 0];
  const c = straightedgeGaps(crown, 10)[0];
  assert.ok(c.gap > 0.2, `crown gap ${c.gap}`);
  // a straight slope has no gap
  assert.equal(straightedgeGaps(Array.from({ length: 15 }, (_, i) => i * 0.02), 10).every(x => x.gap < 1e-12), true);
});

test('grid survey runs lines both ways, shares points and trims an edge band', () => {
  const g = [[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const s = gridSurvey(g);
  assert.equal(s.lines.length, 8);
  assert.equal(s.z.length, 16);
  const trimmed = gridSurvey(exampleGrid(), { edgeFt: 2 });
  assert.equal(trimmed.grid.rows, 31);
  assert.ok(trimmed.z.length === (31 - 4) * (41 - 4));
});

test('grid text: commas keep holes, spaces split, units convert', () => {
  const { grid, errors } = parseGrid('1,,3\n4 5 6\n# note\n7;8;x', 'mm');
  assert.deepEqual(errors, []);
  close(grid[0][0], 1 / 25.4); assert.equal(grid[0][1], null); assert.equal(grid[2][2], null);
  close(toInches(1, 'ft'), 12);
  assert.throws(() => toInches(1, 'yd'));
});

test('point cloud resampled to a 12-in lattice reproduces a tilted plane', () => {
  const pts = [];
  for (let x = 0; x <= 5; x += 0.05) for (let y = 0; y <= 3; y += 0.05) pts.push(`${x.toFixed(2)} ${y.toFixed(2)} ${(0.001 * x + 0.002 * y).toFixed(6)}`);
  const { points, errors } = parseXyz('X Y Z\n' + pts.join('\n'), 'm');
  assert.deepEqual(errors, []);
  const { grid } = latticeFromPoints(points, { radiusIn: 2 });
  assert.equal(grid.length, Math.floor(3000 / 25.4 / 12) + 1);
  const s = gridSurvey(grid);
  const r = analyseSection(s);
  assert.ok(r.ff.F > 1000, `plane FF ${r.ff.F}`);
});

test('grind estimate only lowers, reaches a modest target on the example, and leaves the start alone', () => {
  const survey = gridSurvey(exampleGrid());
  const before = survey.z.slice();
  const start = analyseSection(survey).ff.F;
  const g = grindEstimate(survey, { targetFF: start * 1.25 });
  assert.deepEqual(survey.z, before);
  assert.ok(g.reached, `reached ${g.endFF} of ${g.targetFF}`);
  assert.ok(g.endFF >= start * 1.25);
  assert.ok(g.ground.every(p => p.depthIn > 0));
  g.z.forEach((v, i) => assert.ok(v <= before[i] + 1e-12));
  // every reported depth is exactly what came off that reading, and nothing else moved
  const depth = new Map(g.ground.map(p => [p.point, p.depthIn]));
  g.z.forEach((v, i) => close(before[i] - v, depth.get(i) ?? 0, 1e-12));
  close(g.volumeCuFt, g.ground.reduce((t, p) => t + p.depthIn, 0) / 12, 1e-12);
  assert.throws(() => grindEstimate(survey, {}), /target FF/);
});

test('the example bay is deterministic and lands in a plausible band', () => {
  assert.deepEqual(exampleGrid(), exampleGrid());
  const r = analyseSection(gridSurvey(exampleGrid()));
  assert.ok(r.ff.F > 10 && r.ff.F < 60, `FF ${r.ff.F}`);
  assert.ok(r.fl.F > 5 && r.fl.F < 80, `FL ${r.fl.F}`);
});

test('CSV cells cannot run as spreadsheet formulas, numbers stay numbers', () => {
  for (const bad of ['=1+1', '+A1', '-cmd', '@x', '\tx', '\rx']) assert.equal(csvCell(bad).replace(/^"|"$/g, '')[0], "'", bad);
  assert.equal(csvCell(-0.125), '-0.125');
  assert.equal(csvCell('Bay "A", east'), '"Bay ""A"", east"');
});

test('a thousands comma inside a space-separated row stays one number', () => {
  assert.deepEqual(tokens('1,523.4 1,524.0 1,522.9'), ['1523.4', '1524.0', '1522.9']);
  assert.deepEqual(tokens('0.1,0.2;0.3'), ['0.1', '0.2', '0.3']);
  assert.deepEqual(tokens('0.1, 0.2, 0.3'), ['0.1', '0.2', '0.3']);
  assert.deepEqual(tokens('A 1,2'), ['A', '1', '2']);
  const { sections } = parseLines('## Slab, area 12,500\n1,523.4 1,524.0 1,522.9', 'mm');
  assert.equal(sections[0].areaSqFt, 12500);
  assert.equal(sections[0].name, 'Slab');
  close(sections[0].survey.z[0], 1523.4 / 25.4);
});
