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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const BUILD = pathToFileURL(fileURLToPath(new URL('./build.mjs', import.meta.url))).href;
const BASE = 'https://example.test/site/';

// buildSite keeps per-build state at module level (SITE_COUNTER_URL and
// friends), so two builds cannot share a process. Each one runs in its own
// child process instead, both at once: the file takes one build's time, not
// two (backlog P062), and the two processes share nothing, which makes the
// "does not depend on build order" claim a stronger test, not a weaker one.
async function buildInChild(outDir) {
  const code = `import { buildSite } from ${JSON.stringify(BUILD)};
    const r = await buildSite({ outDir: ${JSON.stringify(outDir)}, baseUrl: ${JSON.stringify(BASE)} });
    process.stdout.write(JSON.stringify({ outDir: r.outDir, cacheName: r.offline.cacheName }));`;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', code], { maxBuffer: 1 << 28 });
  return JSON.parse(stdout.slice(stdout.lastIndexOf('{')));
}

test('an identical build produces an identical cache name', async () => {
  // Two builds in different temp directories, run side by side.
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-a-'));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-sw-b-'));
  try {
    const [a, b] = await Promise.all([buildInChild(first), buildInChild(second)]);
    assert.notEqual(a.outDir, b.outDir);
    assert.equal(a.cacheName, b.cacheName, 'the hash must not depend on build order or paths');
  } finally {
    await fs.rm(first, { recursive: true, force: true });
    await fs.rm(second, { recursive: true, force: true });
  }
});
