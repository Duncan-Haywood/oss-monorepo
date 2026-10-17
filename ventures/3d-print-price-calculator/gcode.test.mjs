import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGcode, parseDuration } from './gcode.mjs';

test('parseDuration handles compact, spelled-out and day forms', () => {
  assert.equal(parseDuration('3h 12m 5s'), 3 * 3600 + 12 * 60 + 5);
  assert.equal(parseDuration('1d 2h'), 86400 + 7200);
  assert.equal(parseDuration('3 hours 12 minutes'), 3 * 3600 + 720);
  assert.equal(parseDuration('45m 10s'), 2710);
  assert.equal(parseDuration('soon'), null);
});

test('PrusaSlicer-style footer gives grams and time directly', () => {
  const r = parseGcode('G1 X1\n; filament used [mm] = 15000.5\n; filament used [g] = 45.2\n; estimated printing time (normal mode) = 3h 12m 36s\n');
  assert.equal(r.ok, true);
  assert.equal(r.grams, 45.2);
  assert.equal(r.hours, 3.21);
  assert.deepEqual(r.derived, []);
});

test('Orca/Bambu weight and header time', () => {
  const r = parseGcode('; total estimated time: 1h 30m 0s\n; total filament weight [g] : 12.5\n');
  assert.deepEqual([r.ok, r.grams, r.hours], [true, 12.5, 1.5]);
});

test('multi-material values are summed', () => {
  const r = parseGcode('; filament used [g] = 10.5, 4.5\n; estimated printing time (normal mode) = 1h\n');
  assert.equal(r.grams, 15);
});

test('Cura reports length: grams are derived from diameter and density and the page is told', () => {
  const r = parseGcode(';TIME:7200\n;Filament used: 10m\n', { diameterMm: 1.75, densityGPerCm3: 1.24 });
  // 10 m of 1.75 mm filament = 24.053 cm3 -> 29.82 g at 1.24
  assert.equal(r.slicer, 'Cura');
  assert.equal(r.hours, 2);
  assert.ok(Math.abs(r.grams - 29.82) < 0.02, String(r.grams));
  assert.equal(r.derived.length, 1);
  const heavier = parseGcode(';TIME:60\n;Filament used: 10m\n', { densityGPerCm3: 1.27 });
  assert.ok(heavier.grams > r.grams);
});

test('Simplify3D block', () => {
  const r = parseGcode(';   Build time: 3 hours 12 minutes\n;   Filament length: 12345.6 mm (12.35 m)\n;   Plastic weight: 36.80 g ( 0.08 lb )\n');
  assert.deepEqual([r.ok, r.grams, r.hours, r.slicer], [true, 36.8, 3.2, 'Simplify3D']);
});

test('an unrecognised file names what is missing rather than guessing', () => {
  const r = parseGcode('G28\nG1 X10 Y10\n');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['filament weight', 'print time']);
  assert.equal(parseGcode(undefined).ok, false);
  const partial = parseGcode('; filament used [g] = 5\n');
  assert.deepEqual(partial.missing, ['print time']);
});

test('gcode.mjs does no I/O', async () => {
  const { readFileSync } = await import('node:fs');
  assert.doesNotMatch(readFileSync(new URL('./gcode.mjs', import.meta.url), 'utf8'), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|^import /m);
});
