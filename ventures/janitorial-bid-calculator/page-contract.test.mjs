import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('bid handoff offers both copy and local text download', () => {
  assert.match(page, /id="copySummary"/);
  assert.match(page, /id="downloadSummary"/);
  assert.match(page, /link\.download = 'janitorial-bid-summary\.txt'/);
  assert.match(page, /count\('summary_downloaded'\)/);
});

test('download path creates and cleans up a local object URL', () => {
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(page, /fetch\(|navigator\.sendBeacon\(/);
});

test('download writes the same proposal draft as copy', () => {
  // Both handoffs go through `currentBid()`, and `currentBid()` prices exactly
  // what `update()` and the customer proposal price: one `readInput()`. The
  // contract this test defends is that a contract with four kinds of row —
  // areas, day-porter shifts, periodic services, one-time projects — cannot
  // come to be read one way for the screen and another for the file. It used
  // to assert the literal `shifts: readShifts()` at each call site, which was
  // the duplication rather than the guarantee.
  assert.match(page, /formatBidSummary\(currentBid\(\)\)/);
  assert.match(page, /function currentBid\(\)\s*\{\s*return calculateBid\(readInput\(\)\);/);

  // Sliced rather than matched with `\(([^)]*)\)`: the first `)` in
  // `readInput(areas = readAreas(), ...)` belongs to the default's own call.
  const from = page.indexOf('function readInput(');
  assert.notEqual(from, -1, 'the page defines one readInput()');
  const body = page.slice(from, page.indexOf('\n    }', from));
  for (const rows of ['areas', 'shifts', 'projects: readProjects()', 'periodicServices: readPeriodic()']) {
    assert.ok(body.includes(rows), `readInput() carries ${rows}`);
  }
  // The bid itself is read in exactly one place: no call site anywhere on the
  // page builds its own input literal. The scenario panels pass a deliberately
  // narrower object to the `compare*` functions, which is why this pins
  // `calculateBid` rather than every call.
  assert.equal(page.split('projects: readProjects()').length - 1, 1);
  assert.doesNotMatch(page, /calculateBid\(\{/);
});
