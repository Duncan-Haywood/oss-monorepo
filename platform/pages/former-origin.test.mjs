// Does a page that still names the pre-rename origin come out pointing at the
// live one?
//
// WHY THIS EXISTS
//
// The repository was renamed from `monorepo-projects` to `fp-monorepo`, and
// GitHub does not redirect a renamed repository's project site. Measured
// 2026-10-05 with a logged-out curl: `duncan-haywood.github.io/monorepo-projects/`
// answers 404, `duncan-haywood.github.io/fp-monorepo/` answers 200. Until that
// day every canonical tag, sitemap `<loc>` and IndexNow submission named the
// dead path.
//
// The tree was moved to the new origin in one commit. Branches opened before
// it still carry the old one, and venture pages get copied from siblings, so
// it will be written again. `build.mjs`'s `FORMER_BASE_URLS` rewrites it at
// build time like the `example.invalid` placeholder. This file pins that, with
// a body link, because the build computes canonical tags itself, so only a
// copied-through link proves the rewrite ran (see custom-domain.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { buildSite, DEFAULT_BASE_URL, FORMER_BASE_URLS } from './build.mjs';

const [FORMER] = FORMER_BASE_URLS;

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  `<link rel="canonical" href="${FORMER}gamma-calculator/">` +
  `<meta name="description" content="A free calculator that does arithmetic in your browser."></head>` +
  `<body>${body}<p>No warranty: this is an estimate, not advice.</p></body></html>`;

async function allFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await allFiles(full)));
    else out.push(full);
  }
  return out;
}

test('the former origin is a different path from the default', () => {
  assert.ok(FORMER, 'FORMER_BASE_URLS is empty');
  assert.notEqual(FORMER, DEFAULT_BASE_URL);
  assert.ok(!DEFAULT_BASE_URL.includes('monorepo-projects'), DEFAULT_BASE_URL);
});

test('a page naming the former origin is built pointing at the live one', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'former-origin-'));
  const ventures = path.join(out, 'ventures');
  await fs.mkdir(path.join(ventures, 'gamma-calculator'), { recursive: true });
  await fs.writeFile(
    path.join(ventures, 'gamma-calculator', 'index.html'),
    page(
      'Gamma Calculator',
      `<h1>Gamma Calculator</h1><p>See <a href="${FORMER}gamma-calculator/guide.html">the guide</a>.</p>`,
    ),
  );
  await fs.writeFile(path.join(ventures, 'gamma-calculator', 'guide.html'), page('Guide', '<h1>Guide</h1>'));

  const outDir = path.join(out, 'dist');
  await buildSite({ venturesDir: ventures, outDir, baseUrl: DEFAULT_BASE_URL, log: () => {}, disableWorker: true });

  const offenders = [];
  for (const file of await allFiles(outDir)) {
    if (!/\.(html|xml|txt|json|mjs|js|css|webmanifest)$/.test(file)) continue;
    if ((await fs.readFile(file, 'utf8')).includes(FORMER)) offenders.push(path.relative(outDir, file));
  }
  assert.deepEqual(offenders, [], `these built files still name ${FORMER}, which answers 404`);

  const index = await fs.readFile(path.join(outDir, 'gamma-calculator', 'index.html'), 'utf8');
  assert.ok(
    index.includes(`href="${DEFAULT_BASE_URL}gamma-calculator/guide.html"`),
    'the body link was not rewritten to the live origin',
  );
});
