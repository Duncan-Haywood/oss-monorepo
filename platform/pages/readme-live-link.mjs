#!/usr/bin/env node
// Adds a "Live tool" link to the top of every published venture's README.
//
// Why: the repository is indexed by GitHub and search engines, and a README
// that says what the thing is but never links to the page a visitor can use
// sends searchers to a dead end (prompts/goals.md, SEO standing direction).
// The published set is platform/pages/launched.json; the URL is the same
// path build.mjs serves. Idempotent: a README that already links to its live
// page is left alone.
//
//   node platform/pages/readme-live-link.mjs           # rewrite READMEs
//   node platform/pages/readme-live-link.mjs --check   # exit 1 if any lack it

import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const SITE = 'https://duncan-haywood.github.io/monorepo-projects/';

export function liveUrl(slug) {
  return `${SITE}${slug}/`;
}

// Returns the new README text, or null when no change is needed.
export function addLiveLink(text, slug) {
  if (text.includes(liveUrl(slug))) return null;
  const lines = text.split('\n');
  const h1 = lines.findIndex((l) => /^# \S/.test(l));
  if (h1 === -1) return null;
  lines.splice(h1 + 1, 0, '', `**Live tool:** <${liveUrl(slug)}>`);
  return lines.join('\n');
}

async function main() {
  const check = process.argv.includes('--check');
  const { launched } = JSON.parse(await fs.readFile(path.join(HERE, 'launched.json'), 'utf8'));
  const stale = [];
  for (const slug of Object.keys(launched)) {
    const file = path.join(REPO_ROOT, 'ventures', slug, 'README.md');
    if (!existsSync(file)) continue;
    const next = addLiveLink(await fs.readFile(file, 'utf8'), slug);
    if (next === null) continue;
    stale.push(slug);
    if (!check) await fs.writeFile(file, next);
  }
  console.log(`${check ? 'missing' : 'updated'}: ${stale.length} README(s)`);
  if (check && stale.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
