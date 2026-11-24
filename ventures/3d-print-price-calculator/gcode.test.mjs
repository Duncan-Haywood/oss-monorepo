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

test('Bambu Studio header: both times on one line, as GCodeProcessor writes it', () => {
  const r = parseGcode('; HEADER_BLOCK_START\n; BambuStudio 01.10.01.50\n; model printing time: 1h 52m 3s; total estimated time: 1h 58m 40s\n; total filament weight [g] : 29.46\n; HEADER_BLOCK_END\n');
  assert.deepEqual([r.ok, r.grams, r.hours], [true, 29.46, 1.98]);
});

test('Orca (non-Bambu printer) weight and header time', () => {
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
  // No moves and no summary: nothing to read.
  const r = parseGcode('M104 S200\n; a note\n');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['filament weight', 'print time']);
  // Moves without extrusion: the time can be estimated, the filament cannot.
  const travel = parseGcode('G28\nG1 X10 Y10\n');
  assert.deepEqual(travel.missing, ['filament weight']);
  assert.equal(parseGcode(undefined).ok, false);
  const partial = parseGcode('; filament used [g] = 5\n');
  assert.deepEqual(partial.missing, ['print time']);
});

test('gcode.mjs and gcode-motion.mjs do no I/O and import only each other', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['./gcode.mjs', './gcode-motion.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, f);
    for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) assert.equal(m[1], './gcode-motion.mjs', f);
    assert.doesNotMatch(src.replace(/^import .* from '\.\/gcode-motion\.mjs';$/m, ''), /^import /m, f);
  }
});

test("Cura's unfilled header template (;TIME:6666, 0m, 2.14748e+06 bounds) is not read as figures", () => {
  const head = ';FLAVOR:Marlin\n;TIME:6666\n;Filament used: 0m\n;MINX:2.14748e+06\n;MAXX:-2.14748e+06\n';
  const body = 'G21\nG90\nM82\nG92 E0\nG1 F3000 X0 Y0\nG1 F1200 X100 Y0 E5\nG1 X100 Y100 E10\n';
  const r = parseGcode(head + body);
  assert.equal(r.ok, true);
  assert.equal(r.slicer, 'no slicer summary');
  assert.ok(r.hours < 0.01, String(r.hours)); // 200 mm at 20 mm/s is about 10 s, not 6666 s
  // 10 mm of 1.75 mm filament at 1.24 g/cm3
  assert.ok(Math.abs(r.grams - 0.03) < 0.006, String(r.grams));
  assert.ok(r.derived.some((d) => /estimated from the \d+ moves/.test(d)));
});

test('a file with no summary is read from its moves and says so', () => {
  const r = parseGcode('G90\nM83\nG1 F600 X10 E1\nG1 X20 E1\nG1 E-0.8 F2400\nG1 E0.8\n');
  assert.equal(r.ok, true);
  assert.equal(r.motion.moves, 4);
  assert.ok(Math.abs(r.motion.filamentMm - 2) < 1e-9);
  assert.ok(r.derived.length >= 2); // time from moves, grams from length
});

test('volumetric extrusion (M200 D) turns E into cubic millimetres', () => {
  const r = parseGcode('M200 D1.75\nM83\nG1 F600 X10 E1000\n', { densityGPerCm3: 1.25 });
  assert.equal(r.grams, 1.25); // 1000 mm3 = 1 cm3
  assert.ok(r.derived.some((d) => /volumetric/.test(d)));
});

test('a slicer summary wins over the moves; the moves are not read', () => {
  const r = parseGcode('; filament used [g] = 45.2\n; estimated printing time (normal mode) = 3h\nG1 F600 X10 E1\n');
  assert.equal(r.hours, 3);
  assert.equal(r.motion, null);
});

test('PrusaSlicer with no filament density writes 0.00 g: the cm3 figure is used, not a free print', () => {
  const r = parseGcode('; filament used [mm] = 4441.35\n; filament used [cm3] = 10.68\n; total filament used [g] = 0.00\n; estimated printing time (normal mode) = 1h 5m 37s\n', { densityGPerCm3: 1.24 });
  assert.equal(r.ok, true);
  assert.equal(r.grams, 13.24); // 10.68 * 1.24
  assert.ok(r.derived.some((d) => /no density/.test(d)));
});
