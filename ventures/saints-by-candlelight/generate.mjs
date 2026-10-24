#!/usr/bin/env node
// Regenerates the site from episodes/*.md and audio/manifest.json.
//
//   node generate.mjs                       write index.html, <slug>.html, feed.xml, sitemap.xml
//   node generate.mjs --check               exit 1 if any generated file is stale
//   node generate.mjs --check-script <slug> exit 1 if a script breaks PRODUCTION.md's rules
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScript, parseEpisode, renderEpisodePage, renderFeed, renderIndex, renderSitemap, wordCount } from './episodes.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function loadEpisodes(root = ROOT) {
  const dir = path.join(root, 'episodes');
  return readdirSync(dir)
    .filter((f) => /^\d{3}-.+\.md$/.test(f))
    .sort()
    .map((f) => {
      const ep = parseEpisode(readFileSync(path.join(dir, f), 'utf8'), f);
      if (f !== `${String(ep.number).padStart(3, '0')}-${ep.slug}.md`) throw new Error(`${f}: file name must be NNN-<slug>.md from its front matter`);
      return ep;
    });
}

export function loadAudio(root = ROOT) {
  const file = path.join(root, 'audio', 'manifest.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

/** Every generated file, as { relative path: contents }. */
export function buildAll(root = ROOT) {
  const episodes = loadEpisodes(root);
  const audio = loadAudio(root);
  const podcast = JSON.parse(readFileSync(path.join(root, 'podcast.json'), 'utf8'));
  const files = {
    'index.html': renderIndex(episodes, audio),
    'feed.xml': renderFeed(episodes, audio, podcast),
    'sitemap.xml': renderSitemap(episodes),
  };
  for (const ep of episodes) files[`${ep.slug}.html`] = renderEpisodePage(ep, audio);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--check-script') {
    const episodes = loadEpisodes().filter((ep) => !args[1] || ep.slug === args[1]);
    if (!episodes.length) throw new Error(`no episode "${args[1]}"`);
    let bad = 0;
    for (const ep of episodes) {
      const problems = checkScript(ep);
      console.log(`${ep.slug}: ${wordCount(ep.body)} words${problems.length ? `; ${problems.join('; ')}` : ', ok'}`);
      bad += problems.length;
    }
    process.exit(bad ? 1 : 0);
  }
  const stale = [];
  for (const [rel, contents] of Object.entries(buildAll())) {
    const target = path.join(ROOT, rel);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === contents) continue;
    stale.push(rel);
    if (!args.includes('--check')) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
  }
  if (args.includes('--check') && stale.length) {
    console.error(`Stale generated files (run node generate.mjs): ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(args.includes('--check') ? 'generated files are current' : `wrote ${stale.length} file(s)`);
}
