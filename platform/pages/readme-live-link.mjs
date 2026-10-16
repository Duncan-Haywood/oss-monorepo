// Adds a "**Live tool:** <url>" line to each venture README that has an
// index.html but never links to its own Pages URL (SEO: a README should say
// what the thing is and link to the live page). Idempotent.
//   node platform/pages/readme-live-link.mjs          # rewrite READMEs
//   node platform/pages/readme-live-link.mjs --check  # exit 1 if any lack it
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = 'https://duncan-haywood.github.io/monorepo-projects/';

export function addLiveLink(readme, slug) {
  const url = `${BASE}${slug}/`;
  if (readme.includes(`monorepo-projects/${slug}`)) return readme;
  const lines = readme.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].startsWith('#'))) i++;
  let fence = false;
  while (i < lines.length && (fence || lines[i].trim() !== '')) {
    if (lines[i].startsWith('```')) fence = !fence;
    i++;
  }
  if (i >= lines.length) lines.push('');
  lines.splice(i, 0, '', `**Live tool:** ${url}`);
  return lines.join('\n');
}

export function run(root, check) {
  const dir = join(root, 'ventures');
  const missing = [];
  for (const slug of readdirSync(dir)) {
    const rd = join(dir, slug, 'README.md');
    if (!existsSync(rd) || !existsSync(join(dir, slug, 'index.html'))) continue;
    const old = readFileSync(rd, 'utf8');
    const next = addLiveLink(old, slug);
    if (next === old) continue;
    missing.push(slug);
    if (!check) writeFileSync(rd, next);
  }
  return missing;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const check = process.argv.includes('--check');
  const m = run(root, check);
  console.log(`${check ? 'missing' : 'updated'}: ${m.length} README(s)`);
  if (check && m.length) process.exit(1);
}
