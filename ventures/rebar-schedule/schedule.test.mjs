import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule, parseDia, run, scheduleCsv, cuttingCsv, EXAMPLE } from './schedule.mjs';

test('sizes in the usual spellings', () => {
  for (const [s, d] of [['12', 12], ['H12', 12], ['T16', 16], ['B500B 20', 20], ['25mm', 25]]) assert.equal(parseDia(s), d, s);
});

test('a header row is read by name, in any order', () => {
  const { rows, errors } = parseSchedule('Bar mark\tShape code\tSize\tNo of members\tNo in each\tA\tB\n7\t11\tH16\t3\t5\t1200\t400\n');
  assert.deepEqual(errors, []);
  assert.equal(rows[0].dia, 16); assert.equal(rows[0].shape, '11'); assert.equal(rows[0].members, 3); assert.equal(rows[0].each, 5);
  assert.deepEqual(rows[0].dims, { A: 1200, B: 400 });
});

test('no header: positional mark, size, shape, members, each, A..E; shape "0" means 00', () => {
  const { rows } = parseSchedule('a1,10,0,2,3,4000\n');
  assert.equal(rows[0].shape, '00'); assert.equal(rows[0].dims.A, 4000);
});

test('bad lines are named, good ones kept', () => {
  const { rows, errors } = parseSchedule('mark,dia,shape,members,each,A\nok,12,00,1,1,3000\nbad,12,99,1,1,3000\nnosize,,00,1,1,3000\nhalf,12,00,1.5,1,3000\n');
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /bad.*shape code "99"/);
});

test('weights by hand: 48 H12 bars of 5400 mm weigh 48 x 5.4 x 0.888 = 230.2 kg', () => {
  const r = run('mark,dia,shape,members,each,A\n01,H12,00,4,12,5400\n');
  assert.ok(Math.abs(r.lines[0].kg - 48 * 5.4 * Math.PI * 36 * 7850 / 1e6) < 1e-9);
  assert.ok(Math.abs(r.lines[0].kg - 230.2) < 0.15);
  // 5400 + 5400 per 12 m bar: 24 bars, 1200 offcut each.
  assert.equal(r.plans[0].bars, 24);
  assert.equal(r.plans[0].patterns[0].offcut, 1200);
});

test('the example: optimiser 32 H12 bars where first-fit decreasing takes 34, all four sizes proven', () => {
  const r = run(EXAMPLE);
  assert.deepEqual(r.errors, []);
  const h12 = r.plans.find(p => p.dia === 12);
  assert.equal(h12.bars, 32); assert.equal(h12.firstFit.bars, 34);
  assert.ok(r.plans.every(p => p.proven));
});

test('too-long cut lengths are reported per size, not thrown', () => {
  const r = run('m,dia,shape,members,each,A\n1,20,00,1,1,13000\n2,12,00,1,1,3000\n'.replace('m,', 'mark,'));
  assert.match(r.plans.find(p => p.dia === 20).error, /lap or order special lengths/);
  assert.equal(r.plans.find(p => p.dia === 12).bars, 1);
});

test('CSV exports guard against spreadsheet formulas and carry every mark', () => {
  const r = run('mark,dia,shape,members,each,A\n=HYPERLINK(1),12,00,1,1,3000\n');
  const csv = scheduleCsv(r);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(cuttingCsv(r), /12,12000,1,1 x 3000,9000/);
});
