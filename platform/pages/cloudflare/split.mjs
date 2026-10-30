#!/usr/bin/env node
// Moves router.mjs's SHARD_DIRS out of the built site into the shard Worker's
// asset directory, copies 404.html beside them, and checks both halves fit the
// free plan: at most 20,000 files per Worker and 25 MiB per file.
//
//   node platform/pages/cloudflare/split.mjs platform/pages/dist platform/pages/dist-shard

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHARD_DIRS } from './router.mjs';

export const MAX_FILES = 20000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

async function survey(dir) {
  let files = 0;
  const big = [];
  async function walk(d) {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        files++;
        if ((await fs.stat(full)).size > MAX_FILE_BYTES) big.push(path.relative(dir, full));
      }
    }
  }
  await walk(dir);
  return { files, big };
}

export async function split(siteDir, shardDir) {
  await fs.mkdir(shardDir, { recursive: true });
  for (const d of SHARD_DIRS) {
    const from = path.join(siteDir, d);
    if (await fs.stat(from).catch(() => null)) await fs.rename(from, path.join(shardDir, d));
  }
  await fs.copyFile(path.join(siteDir, '404.html'), path.join(shardDir, '404.html'));
  const site = await survey(siteDir);
  const shard = await survey(shardDir);
  const problems = [];
  for (const [name, s] of [['site', site], ['shard', shard]]) {
    if (s.files > MAX_FILES) problems.push(`${name}: ${s.files} files, over the free plan's ${MAX_FILES}`);
    for (const f of s.big) problems.push(`${name}: ${f} is over 25 MiB`);
  }
  return { site: site.files, shard: shard.files, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [siteDir, shardDir] = process.argv.slice(2);
  if (!siteDir || !shardDir) {
    console.error('usage: split.mjs <built-site-dir> <shard-dir>');
    process.exit(2);
  }
  const r = await split(siteDir, shardDir);
  console.log(`site Worker: ${r.site} files; shard Worker: ${r.shard} files (limit ${MAX_FILES} each)`);
  for (const p of r.problems) console.log(`::error::${p}`);
  for (const [name, n] of [['site', r.site], ['shard', r.shard]]) {
    if (n > MAX_FILES * 0.9 && n <= MAX_FILES) console.log(`::warning::the ${name} Worker holds ${n} of ${MAX_FILES} files; move another directory into SHARD_DIRS (router.mjs)`);
  }
  process.exit(r.problems.length ? 1 : 0);
}
