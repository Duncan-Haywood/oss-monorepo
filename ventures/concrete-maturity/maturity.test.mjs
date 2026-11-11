import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLoggerCsv, parseTimestamp, maturitySeries, maturityRate, labMaturity, fitStrength,
  predictStrength, indexForStrength, estimate, calibrationPoints, parseCalibrationText,
  toCsv, exampleCsv, EXAMPLE_CALIBRATION, MODELS,
} from './maturity.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('timestamps: ISO, US with AM/PM, day-first and d-Mon-yyyy', () => {
  assert.equal(parseTimestamp('2026-11-02 14:30'), Date.UTC(2026, 10, 2, 14, 30));
  assert.equal(parseTimestamp('2026-11-02T14:30:15Z'), Date.UTC(2026, 10, 2, 14, 30, 15));
  assert.equal(parseTimestamp('11/2/2026 2:30 PM'), Date.UTC(2026, 10, 2, 14, 30));
  assert.equal(parseTimestamp('11/2/2026 12:05 AM'), Date.UTC(2026, 10, 2, 0, 5));
  assert.equal(parseTimestamp('03/04/2026 08:00', { dayFirst: true }), Date.UTC(2026, 3, 3, 8));
  assert.equal(parseTimestamp('25/12/2026 08:00'), Date.UTC(2026, 11, 25, 8)); // unambiguous day first
  assert.equal(parseTimestamp('02-Nov-2026 14:00'), Date.UTC(2026, 10, 2, 14));
  assert.ok(Number.isNaN(parseTimestamp('hello')));
});

test('logger CSV: timestamps, two sensors in deg F, humidity ignored', () => {
  const csv = 'Logger X export\nDate/Time,Probe A (°F),Probe B (°F),RH (%)\n11/2/2026 2:00 PM,50,59,80\n11/2/2026 3:00 PM,68,77,81\n11/2/2026 4:00 PM,86,95,82\n';
  const r = parseLoggerCsv(csv);
  assert.deepEqual(r.errors, []);
  assert.equal(r.sensors.length, 2);
  assert.equal(r.sensors[0].name, 'Probe A');
  assert.deepEqual(r.sensors[0].hours, [0, 1, 2]);
  assert.deepEqual(r.sensors[0].tempC.map(v => +v.toFixed(6)), [10, 20, 30]);
  assert.deepEqual(r.sensors[1].tempC.map(v => +v.toFixed(6)), [15, 25, 35]);
});

test('logger CSV: elapsed minutes, semicolons and decimal commas', () => {
  const r = parseLoggerCsv('Elapsed (min);Temp °C\n0;10,5\n30;11,5\n60;12,5\n');
  assert.deepEqual(r.sensors[0].hours, [0, 0.5, 1]);
  assert.deepEqual(r.sensors[0].tempC, [10.5, 11.5, 12.5]);
});

test('logger CSV: no unit in header defaults to deg C with a note; forced F converts', () => {
  const csv = 'Time (h),Sensor\n0,20\n1,22\n';
  const r = parseLoggerCsv(csv);
  assert.deepEqual(r.sensors[0].tempC, [20, 22]);
  assert.ok(r.notes.some(n => /no unit/.test(n)));
  close(parseLoggerCsv(csv, { unit: 'F' }).sensors[0].tempC[0], -6.6667, 1e-3);
});

test('logger CSV: bad rows skipped, unsorted and duplicate times handled, empty input errors', () => {
  const r = parseLoggerCsv('Hours,T (C)\n2,30\n0,10\n1,20\n1,99\n3,oops\n');
  assert.deepEqual(r.sensors[0].hours, [0, 1, 2]);
  assert.deepEqual(r.sensors[0].tempC, [10, 20, 30]);
  assert.ok(r.notes.some(n => /skipped/.test(n)));
  assert.ok(parseLoggerCsv('').errors.length);
  assert.ok(parseLoggerCsv('just,words\nno,numbers\n').errors.length);
});

test('Nurse-Saul: interval mean above the datum times hours, nothing below the datum', () => {
  // 10 -> 20 -> 30 deg C over two hours: means 15 and 25, datum 0 => 40 deg C h.
  const { index } = maturitySeries([0, 1, 2], [10, 20, 30], { method: 'nurse-saul', datumC: 0 });
  assert.deepEqual(index, [0, 15, 40]);
  // datum -10 adds 10 per hour
  assert.deepEqual(maturitySeries([0, 1, 2], [10, 20, 30], { datumC: -10 }).index, [0, 25, 60]);
  const cold = maturitySeries([0, 5], [-3, -1], { datumC: 0 });
  assert.equal(cold.index[1], 0);
  assert.equal(cold.hoursAtOrBelowDatum, 5);
});

test('equivalent age: one hour at the reference temperature is one hour; warmer counts more', () => {
  close(maturityRate(20, { method: 'equivalent-age', referenceC: 20 }), 1, 1e-12);
  const warm = maturityRate(30, { method: 'equivalent-age', referenceC: 20, activationEnergy: 40000 });
  // exp(-(40000/8.314)(1/303.15 - 1/293.15)) = about 1.72
  close(warm, Math.exp(-(40000 / 8.314) * (1 / 303.15 - 1 / 293.15)), 1e-12);
  assert.ok(warm > 1.7 && warm < 1.75);
  assert.ok(maturityRate(5, { method: 'equivalent-age' }) < 1);
});

test('gaps longer than the limit are reported', () => {
  const { gaps } = maturitySeries([0, 1, 10, 11], [20, 20, 20, 20], { gapHours: 6 });
  assert.deepEqual(gaps, [{ fromHour: 1, toHour: 10 }]);
});

test('lab maturity: constant temperature times age', () => {
  assert.equal(labMaturity(7, { labCuringC: 23, datumC: 0 }), 23 * 7 * 24);
  close(labMaturity(1, { method: 'equivalent-age', labCuringC: 20, referenceC: 20 }), 24, 1e-9);
});

test('each curve recovers its own parameters from exact data', () => {
  const xs = [300, 700, 1500, 3000, 6000, 12000, 16000];
  const cases = {
    logarithmic: { a: -5000, b: 1000 },
    hyperbolic: { su: 5000, k: 0.0006, m0: 150 },
    exponential: { su: 6000, tau: 1300, alpha: 0.55 },
  };
  for (const [name, p] of Object.entries(cases)) {
    const pts = xs.map(x => ({ index: x, strength: MODELS[name].predict(p, x) }));
    const fit = fitStrength(pts, name);
    assert.ok(fit.chosen, name);
    for (const x of [500, 2000, 10000]) close(predictStrength(fit.chosen, x), MODELS[name].predict(p, x), 5, name);
    assert.ok(fit.chosen.r2 > 0.9999, `${name} r2 ${fit.chosen.r2}`);
  }
});

test('auto picks the lowest AICc; too few specimens rule curves out', () => {
  const pts = calibrationPoints(parseCalibrationText(EXAMPLE_CALIBRATION).rows);
  const fit = fitStrength(pts, 'auto');
  const okFits = fit.fits.filter(f => f.ok);
  assert.equal(fit.chosen.aicc, Math.min(...okFits.map(f => f.aicc)));
  const three = fitStrength(pts.slice(0, 3), 'auto');
  assert.equal(three.fits.find(f => f.name === 'hyperbolic').ok, false);
  assert.equal(three.chosen.name, 'logarithmic');
  assert.equal(fitStrength([], 'auto').chosen, null);
});

test('indexForStrength inverts predictStrength; above the plateau it is null', () => {
  const fit = { name: 'hyperbolic', params: { su: 5000, k: 0.001, m0: 0 } };
  const need = indexForStrength(fit, 2500); // u/(1+u)=0.5 => u=1 => M=1000
  close(need, 1000, 1e-6);
  assert.equal(indexForStrength(fit, 5000), null);
  const log = { name: 'logarithmic', params: { a: 0, b: 1000 } };
  close(indexForStrength(log, 3000), Math.exp(3), 1e-6);
});

test('estimate: target reached inside the record is interpolated', () => {
  // 20 deg C constant, datum 0: maturity 20 per hour. Linear-in-log curve S = 1000 ln(M/10).
  const fit = { name: 'logarithmic', params: { a: -1000 * Math.log(10), b: 1000 } };
  const s = { name: 'A', hours: [0, 10, 20, 30], tempC: [20, 20, 20, 20] };
  const need = 10 * Math.exp(2); // strength 2000
  const r = estimate([s], fit, { target: 2000, datumC: 0 });
  close(r.sensors[0].reached.hour, need / 20, 1e-9);
  close(r.sensors[0].maturityNow, 600, 1e-9);
});

test('estimate: projection at an assumed temperature, and a stall at the datum', () => {
  const fit = { name: 'logarithmic', params: { a: -1000 * Math.log(10), b: 1000 } };
  const s = { name: 'A', hours: [0, 10], tempC: [10, 10] }; // maturity 100 => 2303
  const need = 10 * Math.exp(4); // 4000
  const r = estimate([s], fit, { target: 4000, datumC: 0, futureC: 20 });
  close(r.sensors[0].projected.hoursMore, (need - 100) / 20, 1e-6);
  const stalled = estimate([s], fit, { target: 4000, datumC: 0, futureC: -2 });
  assert.equal(stalled.sensors[0].projected.status, 'stalled');
  // Without futureC, the last 24 h average (10 deg C) is used.
  close(estimate([s], fit, { target: 4000, datumC: 0 }).sensors[0].projected.assumedC, 10, 1e-12);
});

test('estimate: warnings for freezing, heat and extrapolation; governing is the lowest', () => {
  const fit = { name: 'logarithmic', params: { a: -5000, b: 1000 } };
  const cold = { name: 'Cold', hours: [0, 24, 48], tempC: [-2, 5, 5] };
  const hot = { name: 'Hot', hours: [0, 24, 48], tempC: [40, 65, 40] };
  const r = estimate([cold, hot], fit, { target: 3000, range: { min: 500, max: 1000 } });
  assert.equal(r.governing, 'Cold');
  assert.ok(r.sensors[0].warnings.some(w => /froze/.test(w)));
  assert.ok(r.sensors[1].warnings.some(w => /high early temperatures/.test(w)));
  assert.ok(r.sensors[1].warnings.some(w => /beyond the oldest calibration/.test(w)));
});

test('calibration text: ages, maturity column, comments and bad lines', () => {
  const { rows, errors } = parseCalibrationText('# breaks\nage,psi\n1, 1200\n3 2500\n7;3400\nlabel line skipped\n7,\n');
  assert.equal(rows.length, 3);
  assert.equal(errors.length, 1);
  const pts = calibrationPoints(rows, { labCuringC: 23, datumC: 0 });
  assert.deepEqual(pts.map(p => p.index), [552, 1656, 3864]);
  const idx = parseCalibrationText('800, 2000', { column: 'index' });
  assert.equal(calibrationPoints(idx.rows)[0].index, 800);
});

test('the made-up example runs end to end and exports CSV', () => {
  const logger = parseLoggerCsv(exampleCsv());
  assert.equal(logger.sensors.length, 2);
  assert.equal(logger.sensors[0].unit, 'F');
  close(logger.sensors[0].hours.at(-1), 120, 1e-9);
  const fit = fitStrength(calibrationPoints(parseCalibrationText(EXAMPLE_CALIBRATION).rows), 'auto');
  const r = estimate(logger.sensors, fit.chosen, { target: 3000, range: fit.range });
  for (const s of r.sensors) {
    assert.ok(s.strengthNow > 1500 && s.strengthNow < 3000, `${s.name} ${s.strengthNow}`);
    assert.equal(s.projected.status, 'projected');
  }
  assert.equal(r.governing, 'Slab edge');
  const csv = toCsv(r, 'psi');
  assert.match(csv.split('\n')[0], /^sensor,hour,temp_c,maturity_c_h,estimated_strength_psi$/);
  assert.ok(csv.split('\n').length > 400);
});
