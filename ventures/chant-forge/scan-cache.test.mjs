// eval/scan-cache.mjs: the shared archive.org page cache the scan evals use.
// No network: pages are pre-seeded as PGM files, so prefetch must skip them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCache, pool, pageUrl } from './eval/scan-cache.mjs';

const pgm = (w, h, fill) => Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), Buffer.alloc(w * h, fill)]);

test('pool never runs more than the limit at once and runs every job', async () => {
  let live = 0, peak = 0;
  const done = [];
  const jobs = Array.from({ length: 13 }, (_, i) => async () => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 2 + (i % 3)));
    live--; done.push(i);
  });
  await pool(jobs, 4);
  assert.equal(peak, 4);
  assert.deepEqual(done.sort((a, b) => a - b), [...Array(13).keys()]);
  await pool([], 4); // no jobs, no hang
});

test('prefetch fetches nothing already cached, and page reads the cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scan-cache-'));
  const cache = scanCache(dir);
  writeFileSync(cache.paths('book', 12).pgm, pgm(3, 2, 7));
  const logs = [];
  const n = await cache.prefetch([['book', 12], ['book', 12]], { log: (l) => logs.push(l) });
  assert.equal(n, 0);
  assert.deepEqual(logs, []);
  const img = cache.page('book', 12);
  assert.equal(img.width, 3);
  assert.equal(img.height, 2);
  assert.deepEqual(readdirSync(dir), ['book-n12-w2000.pgm']);
});

test('page URLs keep the archive.org form the evals always used', () => {
  assert.equal(pageUrl('gradualesacrosan0000cath', 874), 'https://archive.org/download/gradualesacrosan0000cath/page/n874_w2000.jpg');
});
