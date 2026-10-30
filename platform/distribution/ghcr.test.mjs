import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageRef, dockerfile, writeContext, run, MAX_PER_RUN } from './ghcr.mjs';
import { buildPackage } from './npm.mjs';
import { parseAllowlist } from './versions.mjs';

/** An allow-list and a versions manifest naming `slugs` for npm at 0.1.0. */
const listed = (slugs) => ({
  allow: parseAllowlist({ tools: slugs.map((slug) => ({ slug, channels: ['npm'], why: 'test' })) }),
  versions: Object.fromEntries(slugs.map((slug) => [slug, { version: '0.1.0', hash: 'sha256-x' }])),
});

async function fixture(slugs) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ghcrtest-'));
  for (const s of slugs) {
    const d = path.join(root, 'ventures', s);
    await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, 'cli.mjs'), '#!/usr/bin/env node\nconsole.log("hi");\n');
    await fs.writeFile(path.join(d, 'LICENSE'), 'MIT License\n\nCopyright (c) x');
    await fs.writeFile(path.join(d, 'VENTURE.yaml'), 'name: x\ndescription: Checks a "thing".\n');
  }
  return root;
}

test('imageRef lowercases the owner and rejects invalid parts', () => {
  assert.equal(imageRef('Duncan-Haywood', 'deal-keeper'), 'ghcr.io/duncan-haywood/deal-keeper:0.1.0');
  assert.equal(imageRef('', 'x'), null);
  assert.equal(imageRef('me', 'Bad_Name'), null);
  assert.equal(imageRef('-me', 'x'), null);
});

test('dockerfile carries the source label, runs as non-root, and cannot be broken by quotes or newlines', () => {
  const df = dockerfile({ slug: 'a-b', description: 'Has "quotes"\nand a newline' });
  assert.match(df, /org\.opencontainers\.image\.source="https:\/\/github\.com\/Duncan-Haywood\/oss-monorepo"/);
  assert.match(df, /^USER node$/m);
  assert.match(df, /ENTRYPOINT \["node", "\/opt\/tool\/bin\.mjs"\]/);
  assert.doesNotMatch(df, /description="[^"]*"[^"\\\n]*"/);
  assert.equal(df.match(/image\.description="([^"]*)"/)[1], "Has 'quotes' and a newline");
});

test('writeContext produces a runnable build context', async () => {
  const root = await fixture(['one']);
  const pkg = await buildPackage({ slug: 'one', dir: path.join(root, 'ventures', 'one') });
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'ghcrctx-'));
  await writeContext(pkg, out);
  for (const f of ['Dockerfile', '.dockerignore', 'bin.mjs', 'cli.mjs', 'package.json']) await fs.stat(path.join(out, f));
});

test('dry run pushes nothing; live run pushes only missing images, capped per run', async () => {
  const slugs = Array.from({ length: MAX_PER_RUN + 3 }, (_, i) => `tool-${String.fromCharCode(97 + i)}`);
  const root = await fixture(slugs);
  const pushed = [];
  const hooks = { root, log: () => {}, owner: 'Me', ...listed(slugs), exists: async (r) => r.includes('tool-a:'), buildPush: async (r, dir) => { pushed.push([r, await fs.readdir(dir)]); } };
  const dry = await run({ ...hooks, env: {} });
  assert.deepEqual(dry, { pushed: 0, planned: MAX_PER_RUN });
  assert.equal(pushed.length, 0);
  const live = await run({ ...hooks, env: { DISTRIBUTE_GHCR: 'true' } });
  assert.equal(live.pushed, MAX_PER_RUN);
  assert.ok(!pushed.some(([r]) => r.includes('tool-a:')), 'existing image skipped');
  assert.ok(pushed.every(([, files]) => files.includes('Dockerfile')));
  assert.ok(pushed.every(([r]) => r.startsWith('ghcr.io/me/')));
});
