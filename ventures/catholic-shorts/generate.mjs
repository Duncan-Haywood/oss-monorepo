#!/usr/bin/env node
// Regenerates the site from shorts/*.md and video/manifest.json.
//
//   node generate.mjs           write index.html, <slug>.html, cards/<slug>.svg, sitemap.xml
//   node generate.mjs --check   exit 1 if a generated file is stale or a short breaks PRODUCTION.md
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkShort, parseShort, renderCard, renderIndex, renderShortPage, renderSitemap, wordCount } from './shorts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function loadShorts(root = ROOT) {
  const dir = path.join(root, 'shorts');
  return readdirSync(dir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .sort()
    .map((f) => {
      const s = parseShort(readFileSync(path.join(dir, f), 'utf8'), f);
      if (f !== `${String(s.number).padStart(3, '0')}-${s.slug}.md`) throw new Error(`${f}: file name must be NNN-<slug>.md from its front matter`);
      return s;
    });
}

export function loadMedia(root = ROOT) {
  const file = path.join(root, 'video', 'manifest.json');
  const media = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  // A WebVTT file from make_captions.py next to the video adds a captions track.
  for (const slug of Object.keys(media)) media[slug].captions = existsSync(path.join(root, 'captions', `${slug}.vtt`));
  return media;
}

/** Every generated file, as { relative path: contents }. */
export function buildAll(root = ROOT) {
  const shorts = loadShorts(root);
  const media = loadMedia(root);
  const files = { 'index.html': renderIndex(shorts, media), 'sitemap.xml': renderSitemap(shorts) };
  for (const s of shorts) {
    files[`${s.slug}.html`] = renderShortPage(s, media);
    files[`cards/${s.slug}.svg`] = renderCard(s);
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const s of loadShorts()) {
    const problems = checkShort(s);
    if (problems.length || !check) console.log(`${s.slug}: ${wordCount(s.script)} words${problems.length ? `; ${problems.join('; ')}` : ', ok'}`);
    bad += problems.length;
  }
  for (const [rel, contents] of Object.entries(buildAll())) {
    const target = path.join(ROOT, rel);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === contents) continue;
    if (check) { console.log(`stale: ${rel}`); bad += 1; continue; }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.log(`wrote ${rel}`);
  }
  if (bad) process.exit(1);
}
