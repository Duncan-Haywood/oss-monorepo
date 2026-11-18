// The level hinge test (hinge-test.mjs): synthetic checks and the pre-registered real results
// (eval/hinge-test-prereg-2026-11-13.md, eval/hinge-test-real.out.txt), at fewer replicates so the suite stays quick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hingeTest, randomWalkCutBar, stepOrBend, stepOrBendTest } from './hinge-test.mjs';
import { analyze } from './engine.mjs';
import { main } from './cli.mjs';

const load = (f) => { const rows = readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, rho, k, dSlope, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const x = []; let u = g() / Math.sqrt(1 - rho * rho);
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(0.02 * t + dSlope * Math.max(0, t - k) + u); }
  return x;
}

test('a clear hinge in AR(1) noise is found and dated near its knot', () => {
  const h = hingeTest(series(150, 0.5, 100, 0.15, 3), { reps: 99 });
  assert.equal(h.refused, false);
  assert.ok(h.p <= 0.02, `p ${h.p}`);
  assert.ok(Math.abs(h.index - 100) <= 10, `knot ${h.index}`);
  assert.ok(h.slopeAfter - h.slopeBefore > 0.08);
});

test('straight lines in AR(1) noise: rejections stay near the nominal rate', () => {
  let rej = 0;
  for (let i = 0; i < 40; i++) if (hingeTest(series(120, 0.5, 60, 0, 500 + i), { reps: 59, seed: i + 1 }).p <= 0.05) rej++;
  assert.ok(rej <= 6, `${rej} of 40 rejected`); // full table: eval/hinge-test-sim-size.out.txt
});

test('a random walk is refused (unit-root guard)', () => {
  const r = rng(9), x = []; let v = 0;
  for (let t = 0; t < 200; t++) { v += Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); x.push(v); }
  const h = hingeTest(x, { reps: 19 });
  assert.equal(h.refused, true);
  assert.match(h.reason, /unit root/);
});

test('pre-registered: global temperature 1880-2024 (GCAG and GISTEMP), knot 1976, p at the floor; log GDP refused', () => {
  for (const f of ['global-temp-annual.csv', 'gistemp-annual.csv']) {
    const { labels, x } = load(f), h = hingeTest(x, { reps: 199 });
    assert.equal(labels[h.index], '1976', f);
    assert.equal(h.p, 1 / 200, f);
  }
  const g = load('us-real-gdp.csv');
  assert.equal(hingeTest(g.x.map(Math.log), { reps: 19 }).refused, true);
});

test('analyze and the CLI report it', async () => {
  const { labels, x } = load('global-temp-annual.csv');
  const r = analyze({ values: x, labels, hingeTest: { reps: 99 } });
  assert.equal(r.hingeTest.label, '1976');
  assert.equal(r.hingeTest.significant, true);
  assert.throws(() => analyze({ values: x.slice(0, 20), hingeTest: true }), /at least 30/);
  let out = '';
  await main([new URL('./data/global-temp-annual.csv', import.meta.url).pathname, '--column', 'anomaly', '--hinge-test'], { out: (s) => { out += s; } });
  assert.match(out, /One change of slope, tested on the levels:\n {2}A change of slope: best knot 1976/);
});

test('hinge-residual guard (eval/hinge-guard-prereg-2026-11-15.md): admits GCAG 1930-2024, which the shipped line guard refuses; not the default', () => {
  const g = load('global-temp-annual.csv'), i = g.labels.indexOf('1930'), x = g.x.slice(i), labels = g.labels.slice(i);
  assert.equal(hingeTest(x, { reps: 19, guard: 'line' }).refused, true); // the old line guard refuses it
  const h = hingeTest(x, { reps: 199, guard: 'hinge' });
  assert.equal(h.refused, false);
  assert.equal(labels[h.index], '1974');
  assert.equal(h.p, 1 / 200);
  assert.equal(hingeTest(load('us-real-gdp.csv').x.map(Math.log), { reps: 19, guard: 'hinge' }).refused, true);
});

test('rho-cut guard (eval/hinge-cut-guard-prereg-2026-11-15.md): admits GCAG 1930-2024 by the cut, still refuses log GDP and a random walk', () => {
  const g = load('global-temp-annual.csv'), i = g.labels.indexOf('1930'), x = g.x.slice(i), labels = g.labels.slice(i);
  const h = hingeTest(x, { reps: 199, guard: 'cut' });
  assert.equal(h.refused, false);
  assert.equal(h.admittedByCut, true);
  assert.ok(h.rhoLine - h.rhoHinge > h.cutBar);
  assert.equal(labels[h.index], '1974');
  assert.equal(h.p, 1 / 200);
  assert.equal(hingeTest(x, { reps: 19 }).admittedByCut, true); // the default since all four bars held
  const gdp = hingeTest(load('us-real-gdp.csv').x.map(Math.log), { reps: 19, guard: 'cut' });
  assert.equal(gdp.refused, true);
  assert.match(gdp.reason, /still above the guard/);
  // a series the line guard admits is untouched by the cut guard
  const s = series(145, 0.3, 90, 0.1, 11);
  const strip = (o) => { const { guard, admittedByCut, cutBar, ...rest } = o; return rest; };
  assert.deepEqual(strip(hingeTest(s, { reps: 49, guard: 'cut' })), strip(hingeTest(s, { reps: 49, guard: 'line' })));
});

test('random-walk cut bar shrinks with length and is deterministic', () => {
  const a = randomWalkCutBar(60), b = randomWalkCutBar(145), c = randomWalkCutBar(300);
  assert.ok(a > b && b > c && c > 0);
  assert.equal(randomWalkCutBar(60), a);
});

test('the CLI says when a sticky series was admitted by the cut', async () => {
  const { readFileSync: rf, writeFileSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const rows = rf(new URL('./data/global-temp-annual.csv', import.meta.url), 'utf8').trim().split('\n');
  const i = rows.findIndex((l) => l.startsWith('1930,'));
  const f = join(mkdtempSync(join(tmpdir(), 'hinge-')), 'gcag-1930.csv');
  writeFileSync(f, [rows[0], ...rows.slice(i)].join('\n') + '\n');
  let out = '';
  await main([f, '--hinge-test'], { out: (s) => { out += s; } });
  assert.match(out, /best knot 1974/);
  assert.match(out, /more than 99% of random walks/);
});

test('step or bend (eval/hinge-step-or-bend-prereg-2026-11-15.md): the Nile rejects as a hinge but fits as the 1898 step; temperature fits as a bend; not in the output', () => {
  const nile = load('nile.csv');
  const h = hingeTest(nile.x, { reps: 199, seed: 1 });
  assert.equal(h.refused, false);
  assert.ok(h.p <= 0.05, `Nile hinge p ${h.p}`);
  assert.equal(nile.labels[h.index], '1913');
  assert.equal(h.stepOrBend, undefined, 'failed its bend bar, so not in hingeTest output');
  const s = stepOrBend(nile.x, h.rho);
  assert.equal(s.better, 'step');
  assert.equal(nile.labels[s.stepIndex], '1898');
  assert.ok(s.ratio < 0.95 && s.stepSize < -200);
  const g = load('global-temp-annual.csv'), hg = hingeTest(g.x, { reps: 49, seed: 1 });
  const sg = stepOrBend(g.x, hg.rho);
  assert.equal(sg.better, 'bend');
  assert.ok(sg.ratio > 1.1);
});

test('fresh real series under 100 points are refused (eval/hinge-step-or-bend-real.out.txt)', () => {
  for (const f of ['us-female-murder-rate.csv', 'lake-huron.csv', 'canada-fertility.csv', 'michigan-huron.csv']) {
    assert.equal(hingeTest(load(f).x, { reps: 9, seed: 1 }).refused, true, f);
  }
});

test('the report note says a level step can pass for a hinge', async () => {
  const nile = load('nile.csv');
  const r = analyze({ csv: 'year,v\n' + nile.labels.map((l, i) => `${l},${nile.x[i]}`).join('\n'), hingeTest: { reps: 49 } });
  assert.match(r.hingeTest.note, /level step can pass for a hinge/);
  assert.match(r.hingeTest.note, /1898/);
});

test('step or bend as two bootstrap tests (eval/hinge-step-or-bend-boot-prereg-2026-11-15.md): Nile is a step, temperature a bend, a wander is refused', () => {
  const nile = load('nile.csv'), s = stepOrBendTest(nile.x, { reps: 99, seed: 1 });
  assert.equal(s.call, 'step');
  assert.equal(nile.labels[s.stepIndex], '1898');
  assert.ok(s.pBend <= 0.05 && s.pStep > 0.05, `pStep ${s.pStep}, pBend ${s.pBend}`);
  const g = load('global-temp-annual.csv'), sg = stepOrBendTest(g.x, { reps: 99, seed: 1 });
  assert.equal(sg.call, 'bend');
  assert.equal(g.labels[sg.bendIndex], '1976');
  assert.equal(stepOrBendTest(load('michigan-huron.csv').x, { reps: 19 }).refused, true);
  assert.equal(stepOrBendTest(nile.x.slice(0, 20)).refused, true);
});

test('step or bend: a clear step and a clear bend in white noise are named; a straight line rarely is', () => {
  const step = (seed) => series(100, 0, 1000, 0, seed).map((v, t) => v + (t > 60 ? 2.5 : 0));
  assert.equal(stepOrBendTest(step(11), { reps: 99 }).call, 'step');
  assert.equal(stepOrBendTest(series(100, 0, 60, 0.1, 12), { reps: 99 }).call, 'bend');
  let called = 0;
  for (let i = 0; i < 20; i++) if (stepOrBendTest(series(100, 0.3, 1000, 0, 900 + i), { reps: 39, seed: i + 1 }).call !== 'unclear') called++;
  assert.ok(called <= 4, `${called} of 20 straight lines given a kind`); // full table: eval/hinge-step-or-bend-boot-sim.out.txt
});

test('step or bend as two tests failed bar W, so it is not in analyze or the CLI', () => {
  const r = analyze({ values: load('nile.csv').x, labels: load('nile.csv').labels, stepOrBend: true });
  assert.equal(r.stepOrBend, undefined);
});

test('with logs on, the report says the test ran on the logs (eval/hinge-log-prereg-2026-11-15.md)', async () => {
  const { labels, x } = load('us-real-gdp.csv');
  const r = analyze({ values: x, labels, log: true, hingeTest: { reps: 19 } });
  assert.equal(r.hingeTest.scale, 'log');
  assert.equal(r.hingeTest.refused, true); // log GDP is the unit-root case, as in bar R
  assert.match(r.hingeTest.note, /on the logs/);
  const g = load('global-temp-annual.csv'), lv = analyze({ values: g.x, labels: g.labels, hingeTest: { reps: 19 } });
  assert.equal(lv.hingeTest.scale, 'levels');
  assert.match(lv.hingeTest.note, /on the levels/);
  let out = '';
  await main([new URL('./data/us-real-gdp.csv', import.meta.url).pathname, '--log', '--hinge-test'], { out: (s) => { out += s; } });
  assert.match(out, /One change of slope, tested on the logs/);
});
