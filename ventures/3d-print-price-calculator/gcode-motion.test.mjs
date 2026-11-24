import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateMotion, parseLine } from './gcode-motion.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
// Hand-checkable limits: one acceleration, no axis caps that bind, and the
// stated cornering rule.
const flat = (extra = {}) => ({
  ignoreFileLimits: true,
  limits: {
    maxFeed: { X: 1e6, Y: 1e6, Z: 1e6, E: 1e6 }, maxAccel: { X: 1e9, Y: 1e9, Z: 1e9, E: 1e9 },
    printAccel: 1000, travelAccel: 1000, retractAccel: 1000, jerk: { X: 0, Y: 0, Z: 0, E: 0 }, ...extra,
  },
});

test('parseLine strips comments, line numbers and checksums', () => {
  assert.deepEqual(parseLine('N12 G1 X1.5 Y-2 E.3 F1200*77 ; move'), { cmd: 'G1', words: { X: 1.5, Y: -2, E: 0.3, F: 1200 } });
  assert.deepEqual(parseLine('G0 (paren comment) X5'), { cmd: 'G0', words: { X: 5 } });
  assert.equal(parseLine('; only a comment'), null);
  assert.equal(parseLine('   '), null);
});

test('one move from rest: accelerate, cruise, decelerate', () => {
  // 100 mm at 100 mm/s, a = 1000: 5 mm to reach speed each end, 0.1 s each, 90 mm cruising.
  const r = estimateMotion('G1 F6000 X100\n', flat());
  near(r.seconds, 1.1, 1e-9);
});

test('a move too short to reach its speed is a triangle', () => {
  // 1 mm: peak sqrt(a * L) = 31.62 mm/s, time 2 * 31.62 / 1000.
  near(estimateMotion('G1 F6000 X1\n', flat()).seconds, 2 * Math.sqrt(1000) / 1000, 1e-9);
});

test('collinear segments run through without slowing', () => {
  const one = estimateMotion('G1 F6000 X100\n', flat()).seconds;
  const four = estimateMotion('G1 F6000 X25\nG1 X50\nG1 X75\nG1 X100\n', flat()).seconds;
  near(four, one, 1e-9);
});

test('zero jerk stops at a right-angle corner; jerk lets it carry speed', () => {
  const corner = 'G1 F6000 X100\nG1 Y100\n';
  const stopped = estimateMotion(corner, flat()).seconds;
  near(stopped, 2.2, 1e-9);
  // Jerk 10 on X and Y: the joint can run at 10 mm/s (X stops from 10, Y starts at 10).
  const r = estimateMotion(corner, flat({ jerk: { X: 10, Y: 10, Z: 0, E: 0 } }));
  // Each ramp that starts or ends at 10 mm/s instead of 0 saves 10/1000 - 10^2/(2*1000)/100 = 0.0095 s:
  // the corner saves two, and the start from rest saves one (jerk is also the
  // speed a move may start at, Marlin's "safe speed"); the end still stops.
  near(r.seconds, 2.2 - 3 * 0.0095, 1e-9);
});

test('a reversal is held to the jerk on one side, as Marlin reads it', () => {
  // X out and straight back: velocity on X flips sign, the limit is jerk / max(|r|) = 10.
  const r = estimateMotion('G1 F6000 X100\nG1 X0\n', flat({ jerk: { X: 10, Y: 10, Z: 0, E: 0 } }));
  near(r.seconds, 2.2 - 3 * 0.0095, 1e-9);
  // Read as a plain velocity difference (20 mm/s) it would allow only 5 mm/s.
});

test('junction deviation at a right angle', () => {
  // v^2 = a * jd * s / (1 - s), s = sin(45 deg): with a = 1000 and jd = 0.05, v = 10.99 mm/s.
  const v = Math.sqrt(1000 * 0.05 * Math.SQRT1_2 / (1 - Math.SQRT1_2));
  const r = estimateMotion('G1 F6000 X100\nG1 Y100\n', flat({ junctionDeviation: 0.05 }));
  assert.equal(r.cornering, 'junction deviation');
  const saved = 2 * (v / 1000 - (v * v) / (2 * 1000) / 100);
  near(r.seconds, 2.2 - saved, 1e-9);
});

test('per-axis maximum feedrate caps a Z move', () => {
  const r = estimateMotion('G1 F6000 Z10\n', flat({ maxFeed: { X: 1e6, Y: 1e6, Z: 5, E: 1e6 } }));
  // 10 mm at 5 mm/s with a = 1000: 2 * 0.005 s ramps, 9.975 mm cruising.
  near(r.seconds, 0.01 + (10 - 0.025) / 5, 1e-9);
});

test('limits the file sets apply from where they appear', () => {
  const body = 'G1 F6000 X100\n';
  const fileAccel = estimateMotion('M204 S500\n' + body, { limits: flat().limits }).seconds;
  // a = 500: 10 mm each ramp at 0.2 s, 80 mm cruising.
  near(fileAccel, 0.4 + 0.8, 1e-9);
  near(estimateMotion('M204 S500\n' + body, flat()).seconds, 1.1, 1e-9); // ignored
  const travel = estimateMotion('M204 P2000 T500\nG0 F6000 X100\n', { limits: flat().limits }).seconds;
  near(travel, 1.2, 1e-9); // a travel move uses T
});

test('arcs: a quarter circle of radius 10 is 15.71 mm', () => {
  // From (10,0) around the origin to (0,10), counter-clockwise, slow enough to be cruise-dominated.
  const r = estimateMotion('G1 X10 Y0 F60\nG4 P0\nG3 X0 Y10 I-10 J0 F600\n', flat());
  const len = Math.PI * 5;
  const first = 10 / 1 + 1 / 1000; // 10 mm at 1 mm/s
  near(r.seconds - first, len / 10 + 10 / 1000, 1e-6);
  assert.equal(r.arcs, 1);
  const byR = estimateMotion('G1 X10 Y0 F60\nG4 P0\nG3 X0 Y10 R10 F600\n', flat());
  near(byR.seconds, r.seconds, 1e-6);
});

test('dwells add, heater waits are counted', () => {
  const r = estimateMotion('G4 P500\nG4 S2\nM109 S200\nM190 S60\n', flat());
  near(r.seconds, 2.5, 1e-12);
  assert.equal(r.heaterWaits, 2);
});

test('filament: absolute and relative E, G92 resets, retractions cancel', () => {
  const abs = estimateMotion('M82\nG92 E0\nG1 X10 E1\nG1 E0.2\nG1 E1\nG1 X20 E2\nG92 E0\nG1 X30 E3\n', flat());
  near(abs.filamentMm, 5, 1e-12);
  const rel = estimateMotion('M83\nG1 X10 E1\nG1 E-0.8\nG1 E0.8\nG1 X20 E1\n', flat());
  near(rel.filamentMm, 2, 1e-12);
  assert.equal(rel.moves, 4);
  assert.ok(rel.breakdown.retract > 0);
});

test('inches and relative XYZ', () => {
  const inch = estimateMotion('G20\nG1 F236.2205 X1\n', flat()); // 25.4 mm at 100 mm/s
  near(inch.seconds, 2 * 0.1 + (25.4 - 10) / 100, 1e-6);
  const rel = estimateMotion('G91\nG1 F6000 X50\nG1 X50\n', flat());
  near(rel.seconds, 1.1, 1e-9);
});

test('homing is timed as a move back to zero, from a stop to a stop', () => {
  const r = estimateMotion('G1 F6000 X100\nG28 X\n', flat());
  near(r.seconds, 2.2, 1e-9);
  assert.equal(r.homes, 1);
});

test('empty and junk input do not throw', () => {
  assert.equal(estimateMotion('').seconds, 0);
  assert.equal(estimateMotion(undefined).moves, 0);
  assert.equal(estimateMotion('hello world\nX10 Y10\n').unsupported['coordinates without G0/G1'], 1);
});
