import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCubeText, groupByTemperature, ols, rateReciprocal, rateHyperbolic, calibrateMix, collapseRmse, collapseFit, collapseReport, syntheticCubes, exampleCubeText } from './calibrate.mjs';
import { R_GAS } from './maturity.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tol ${tol})`);

test('parses cubes, setting lines, a header, comments, °F and ages in days', () => {
  const p = parseCubeText('Temp,Age,Strength\n# lab sheet\nset, 50, 13.1\n50, 1, 1200\n73.4; 2; 2400\nset 73.4 6\n', { tempUnit: 'F', ageUnit: 'd' });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.cubes, [{ tempC: 10, ageH: 24, strength: 1200 }, { tempC: 23, ageH: 48, strength: 2400 }]);
  assert.deepEqual(p.setting, [{ tempC: 10, hours: 13.1 }, { tempC: 23, hours: 6 }]);
});

test('reports bad lines by number', () => {
  const p = parseCubeText('10, 24, 900\n10, x, 5\n10, 24\nset 10\n10, -1, 900\n');
  assert.equal(p.cubes.length, 1);
  assert.equal(p.errors.length, 4);
  assert.match(p.errors[0], /^Line 2/);
});

test('groups by temperature, coldest first, ages sorted', () => {
  const g = groupByTemperature([{ tempC: 23, ageH: 48, strength: 1 }, { tempC: 10, ageH: 24, strength: 1 }, { tempC: 23, ageH: 12, strength: 1 }]);
  assert.deepEqual(g.map(x => x.tempC), [10, 23]);
  assert.deepEqual(g[1].cubes.map(c => c.ageH), [12, 48]);
});

test('ols matches hand arithmetic and its standard errors', () => {
  // y = 1 + 2x with residuals +0.1, -0.2, +0.1 at x = 0, 1, 2
  const f = ols([0, 1, 2], [1.1, 2.8, 5.1]);
  close(f.b, 2, 1e-12); close(f.a, 1, 1e-12);
  // sse = 0.06, s2 = 0.06, sxx = 2 -> seB = sqrt(0.03)
  close(f.seB, Math.sqrt(0.03), 1e-12);
  close(f.seA, Math.sqrt(0.06 * (1 / 3 + 1 / 2)), 1e-12);
});

test('both rate methods recover k, Su and t0 exactly from a noise-free hyperbola', () => {
  const k = 0.02; const su = 6000; const t0 = 6;
  const cubes = [12, 24, 48, 96, 192, 384].map(t => ({ tempC: 23, ageH: t, strength: su * k * (t - t0) / (1 + k * (t - t0)) }));
  const r = rateReciprocal(cubes, t0);
  close(r.k, k, 1e-12); close(r.su, su, 1e-8); close(r.r2Line, 1, 1e-12);
  const h = rateHyperbolic(cubes, t0);
  close(h.k, k, 1e-7); close(h.su, su, 1e-3);
  const free = rateHyperbolic(cubes, null);
  close(free.k, k, 1e-5); close(free.t0, t0, 1e-3);
});

test('the reciprocal line with t0 = 0 understates k when setting is late', () => {
  const k = 0.01; const t0 = 13;
  const cubes = [26, 52, 104, 208, 416, 832].map(t => ({ tempC: 10, ageH: t, strength: 6000 * k * (t - t0) / (1 + k * (t - t0)) }));
  assert.ok(rateReciprocal(cubes, 0).k < 0.9 * k);
});

test('a rate fit that cannot be determined says why', () => {
  assert.equal(rateReciprocal([{ ageH: 10, strength: 100 }, { ageH: 10, strength: 110 }]).ok, false);
  assert.match(rateHyperbolic([{ ageH: 10, strength: 100 }, { ageH: 20, strength: 200 }], null).reason, /three or more ages/);
});

test('noise-free Arrhenius cubes give back the activation energy exactly', () => {
  for (const E of [30000, 42000, 55000]) {
    const { cubes, setting } = syntheticCubes({ activationEnergy: E, cv: 0 });
    for (const rateMethod of ['hyperbolic', 'reciprocal']) {
      const c = calibrateMix(cubes, setting, { rateMethod });
      close(c.activation.activationEnergy, E, 1e-3 * E, rateMethod);
      close(c.activation.r2, 1, 1e-9);
      assert.ok(c.datum.r2 < 1, 'k against T curves for an Arrhenius mix');
    }
  }
});

test('datum temperature: a mix whose k is linear in T gives back its datum', () => {
  // k = 0.001 (T + 5): datum -5 deg C; setting at 0.12 / k
  const cubes = []; const setting = [];
  for (const T of [5, 20, 35]) {
    const k = 0.001 * (T + 5); const ts = 0.12 / k; setting.push({ tempC: T, hours: ts });
    for (const m of [2, 4, 8, 16, 32]) { const t = m * ts; cubes.push({ tempC: T, ageH: t, strength: 5000 * k * (t - ts) / (1 + k * (t - ts)) }); }
  }
  const c = calibrateMix(cubes, setting);
  close(c.datum.datumC, -5, 1e-4); close(c.datum.r2, 1, 1e-9);
  close(c.datum.slope, 0.001, 1e-8);
});

test('activation energy is -R times the ln k against 1/T slope (hand check, three rates)', () => {
  // build rates directly: k_i chosen, compare with an independent OLS
  const T = [10, 23, 38]; const k = [0.009, 0.021, 0.044];
  const cubes = []; const setting = [];
  T.forEach((t, i) => { const ts = 5; setting.push({ tempC: t, hours: ts }); for (const a of [10, 20, 40, 80, 160]) cubes.push({ tempC: t, ageH: a, strength: 6000 * k[i] * (a - ts) / (1 + k[i] * (a - ts)) }); });
  const c = calibrateMix(cubes, setting, { rateMethod: 'reciprocal' });
  const x = T.map(t => 1 / (t + 273.15)); const y = k.map(Math.log);
  const mx = x.reduce((s, v) => s + v) / 3; const my = y.reduce((s, v) => s + v) / 3;
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.reduce((s, v) => s + (v - mx) ** 2, 0);
  close(c.activation.activationEnergy, -b * R_GAS, 1e-6 * -b * R_GAS);
});

test('warnings: two temperatures, a narrow span, a setting time with no cubes, t0 = 0 lines', () => {
  const { cubes, setting } = syntheticCubes({ temps: [20, 30], cv: 0 });
  const c = calibrateMix(cubes, [...setting, { tempC: 5, hours: 20 }]);
  assert.ok(c.activation);
  assert.ok(c.warnings.some(w => /Only two temperatures/.test(w)));
  assert.ok(c.warnings.some(w => /span only 10.0/.test(w)));
  assert.ok(c.warnings.some(w => /5 °C has no cubes/.test(w)));
  const r = calibrateMix(cubes, [], { rateMethod: 'reciprocal' });
  assert.ok(r.warnings.some(w => /t0 = 0/.test(w)));
  const one = calibrateMix(cubes.filter(x => x.tempC === 20), setting);
  assert.equal(one.activation, null);
  assert.ok(one.warnings.some(w => /two or more temperatures/.test(w)));
});

test('the true activation energy collapses noise-free cubes onto one curve; the default does not', () => {
  const { cubes } = syntheticCubes({ cv: 0 });
  assert.ok(collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: 42000 }) < 1e-3);
  assert.ok(collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: 40000 }) > 10);
  const best = collapseFit(cubes, 'equivalent-age');
  close(best.value, 42000, 50);
  assert.equal(best.atEdge, false);
});

test('best single-curve datum beats the default and the k-line datum for an Arrhenius mix', () => {
  const { cubes, setting } = syntheticCubes({ cv: 0 });
  const cal = calibrateMix(cubes, setting);
  const best = collapseFit(cubes, 'nurse-saul');
  const rows = collapseReport(cubes, cal, { datum: best });
  const r = Object.fromEntries(rows.map(x => [x.label.replace(/,.*\(/, ' (').replace(/\)$/, ''), x.rmse]));
  assert.ok(r['Nurse-Saul (best single curve'] <= r['Nurse-Saul (default'] + 1e-9);
  assert.ok(r['Nurse-Saul (best single curve'] < r['Nurse-Saul (fitted']);
  assert.ok(best.value < 10);
});

test('the made-up example parses back and calibrates near the mix it was made from', () => {
  const p = parseCubeText(exampleCubeText());
  assert.deepEqual(p.errors, []);
  assert.equal(p.cubes.length, 54);
  assert.equal(p.setting.length, 3);
  const c = calibrateMix(p.cubes, p.setting);
  assert.ok(Math.abs(c.activation.activationEnergy - 42000) < 6000, String(c.activation.activationEnergy));
  assert.ok(c.datum.datumC > -10 && c.datum.datumC < 10);
});

test('a thousands comma stays inside its number', () => {
  const p = parseCubeText('10, 26.2, 6,000\n10; 52; 1,250.5\n10,104,3000\nset, 10, 13.1\n');
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.cubes.map(c => [c.ageH, c.strength]), [[26.2, 6000], [52, 1250.5], [104, 3000]]);
  assert.deepEqual(p.setting, [{ tempC: 10, hours: 13.1 }]);
});
