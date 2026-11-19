// README "Lasting moves to more days" (eval/update-rate-lasting-more.mjs, .out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELLS, runCell, sortEvent } from './eval/update-rate-lasting-more.mjs';

test('nine cells: three moves to more days, each for 120, 240 days or for good', () => {
  assert.deepEqual(CELLS.map((c) => c.name), ['W1>W5 120', 'W1>W5 240', 'W1>W5 good', 'W3>W5 120', 'W3>W5 240', 'W3>W5 good', 'W5>W7 120', 'W5>W7 240', 'W5>W7 good']);
});

test('a Wednesdays-only to Monday-Friday move is cut at its start and its end; a 120-day Mon-Fri to daily one needs the pass', () => {
  const a = runCell(0, 4);
  assert.ok(a.shipped >= 3 && a.end >= 3, JSON.stringify(a));
  assert.ok(a.before > 0.7 && a.inside < 0.4);
  const b = runCell(6, 4);
  assert.ok(b.both >= 3 && b.shipped <= 1, JSON.stringify(b));
});

test('the sorting rule: N when the drop is under half what the schedules imply, else E with a near cut, else C', () => {
  assert.equal(sortEvent(0.1, 0.26, true), 'N');
  assert.equal(sortEvent(0.2, 0.26, true), 'E');
  assert.equal(sortEvent(0.2, 0.26, false), 'C');
});

test('committed verdict: H1 fails on one cell (Mon-Fri to daily for 120 days), Part B sorts 3 N, 1 E, 4 C', () => {
  const out = readFileSync(new URL('./eval/update-rate-lasting-more.out.txt', import.meta.url), 'utf8');
  assert.match(out, /H1 shipped alone finds the start in >= 180 of 200 in every cell: FAIL/);
  assert.match(out, /W5>W7 120\s+29% ->\s+3%\s+13\s+197/);
  assert.match(out, /Sorted: N \(not in the data\) 3, E \(cut elsewhere\) 1, C \(in the data, not cut\) 4/);
});
