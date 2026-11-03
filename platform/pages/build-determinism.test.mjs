// Split out of build.test.mjs (2026-10-30). Each test file is its own
// process and the runner runs files in parallel, but tests inside a file run
// one after another, so a test that does a full build of its own makes
// build.test.mjs, the longest file, longer by that build. Here it runs beside it.
// (The kill-switch test, the other one that built twice, now renders its
// worker over a one-page directory instead.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { buildSite } from './build.mjs';

const BASE = 'https://example.test/site/';

test('an identical build produces an identical cache name', async () => {
  // Two builds in different temp directories, run one after the other.
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-a-'));
  const a = await buildSite({ outDir: first, baseUrl: BASE });
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-b-'));
  const b = await buildSite({ outDir: second, baseUrl: BASE });
  assert.notEqual(a.outDir, b.outDir);
  assert.equal(a.offline.cacheName, b.offline.cacheName, 'the hash must not depend on build order or paths');
  await fs.rm(first, { recursive: true, force: true });
  await fs.rm(second, { recursive: true, force: true });
});
