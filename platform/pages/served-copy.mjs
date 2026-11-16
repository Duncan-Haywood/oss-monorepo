#!/usr/bin/env node
// The files one product ships, as the deploy writes them, without the full
// 3 to 20 minute site build.
//
//   node platform/pages/served-copy.mjs <slug> [<slug>...] [--out=<dir>] [--base=<url>]
//
// Why: the quality audits ("Check what ships", portfolio/quality/README.md)
// must not file a URL defect the deploy already fixes (category
// `source-only`, about 8% of defects on 2026-11-10). The check was "load
// https://marisstella.app/<slug>/", and some cloud sessions get a proxy 403
// for that host: four quality runs between 2026-11-12 and 2026-11-15 reported
// they could not do the step at all. This runs the same per-product steps the
// build runs (copyTree's origin rewrite and description clamp, the generated
// sitemap, the derived llms.txt when the product has none) into a scratch
// directory, then lists every URL in llms.txt, sitemap.xml, robots.txt and the
// HTML canonicals that still names the placeholder or a retired origin: what
// survives that list is a defect in what ships, not only in the source.
//
// Not reproduced: site chrome, share tags and link repair, which the full build
// adds after this (`node platform/pages/build.mjs --out=dist` for those).
// Sitemap <lastmod> dates are left out (the build takes them from git).

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE_URL,
  REPO_ROOT,
  RETIRED_BASE_URLS,
  copyTree,
  discoverSurfaces,
  publishedPages,
  readMeta,
  renderProductLlmsTxt,
  renderVentureSitemap,
} from './build.mjs';

/** Write one product's served files under `outDir/<slug>`; returns the directory. */
export async function servedCopy(surface, outDir, baseUrl = DEFAULT_BASE_URL) {
  const destination = path.join(outDir, surface.slug);
  await fs.rm(destination, { recursive: true, force: true });
  await copyTree(surface.sourceDir, destination, baseUrl);
  const pages = await publishedPages(destination);
  await fs.writeFile(path.join(destination, 'sitemap.xml'), renderVentureSitemap(surface.slug, pages, baseUrl));
  if (!existsSync(path.join(destination, 'llms.txt'))) {
    const html = await fs.readFile(surface.entryFile, 'utf8');
    const { title, description, fullDescription } = readMeta(html, surface.slug);
    await fs.writeFile(
      path.join(destination, 'llms.txt'),
      renderProductLlmsTxt({ slug: surface.slug, title, description, fullDescription }, baseUrl),
    );
  }
  return destination;
}

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
const CANONICAL_RE = /<link[^>]+rel=["']canonical["'][^>]*>/gi;
// Origins a served self-reference must not name: the placeholder the ventures
// were written against, the retired Pages addresses, and the default origin
// when building for another base.
const stale = (baseUrl) => [
  'https://example.invalid/',
  'http://example.invalid/',
  ...RETIRED_BASE_URLS,
  'https://duncan-haywood.github.io/',
  ...(baseUrl === DEFAULT_BASE_URL ? [] : [DEFAULT_BASE_URL]),
];

/**
 * URLs in the machine-read files (llms.txt, sitemap.xml, robots.txt) and the
 * canonical tags that still name a placeholder or retired origin after the
 * deploy's rewrite, as `{ file, url }`.
 */
export async function staleUrls(dir, baseUrl = DEFAULT_BASE_URL) {
  const origins = stale(baseUrl);
  const found = [];
  const pages = await publishedPages(dir);
  const files = ['llms.txt', 'sitemap.xml', 'robots.txt'].filter((f) => existsSync(path.join(dir, f)));
  for (const file of [...files, ...pages]) {
    const text = await fs.readFile(path.join(dir, file), 'utf8');
    const scope = file.endsWith('.html') ? (text.match(CANONICAL_RE) || []).join('\n') : text;
    for (const url of scope.match(URL_RE) || []) {
      if (origins.some((o) => url.startsWith(o))) found.push({ file, url });
    }
  }
  return found;
}

async function main(argv) {
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const slugs = argv.filter((a) => !a.startsWith('--'));
  if (slugs.length === 0) {
    console.error('usage: node platform/pages/served-copy.mjs <slug> [<slug>...] [--out=<dir>] [--base=<url>]');
    return 2;
  }
  const base = opt('base') || DEFAULT_BASE_URL;
  const outDir = path.resolve(opt('out') || path.join(os.tmpdir(), 'served-copy'));
  const surfaces = await discoverSurfaces(path.join(REPO_ROOT, 'ventures'));
  let status = 0;
  for (const slug of slugs) {
    const surface = surfaces.find((s) => s.slug === slug);
    if (!surface) {
      console.error(`${slug}: not a published product (no index.html the build would serve)`);
      status = 1;
      continue;
    }
    const dir = await servedCopy(surface, outDir, base);
    const found = await staleUrls(dir, base);
    console.log(`${slug}: served copy at ${dir} (base ${base})`);
    if (found.length === 0) console.log('  no placeholder or retired origin left in llms.txt, sitemap.xml, robots.txt or canonicals');
    for (const { file, url } of found) console.log(`  stale origin  ${file}  ${url}`);
    if (found.length) status = 1;
  }
  return status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
