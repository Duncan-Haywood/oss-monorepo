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
  assert.match(page, /formatBidSummary\(currentBid\(\)\)/);
  assert.match(page, /shifts: readShifts\(\)/);
  assert.match(page, /projects: readProjects\(\)/);
  assert.match(page, /periodicServices: readPeriodic\(\)/);
});
