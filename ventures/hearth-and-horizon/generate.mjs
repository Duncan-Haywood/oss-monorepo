#!/usr/bin/env node
// Regenerates the site from stories/*.md and audio/manifest.json.
//
//   node generate.mjs            write index.html, <slug>.html, feeds, sitemap, llms.txt
//   node generate.mjs --check    exit 1 if any generated file is stale
//   node generate.mjs --speech <slug>   print the text render_audio.py reads aloud
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHELVES, feedPath, markdownToSpeech, parseStory, renderAllFeed, renderFeed, renderIndex,
  renderLlms, renderSitemap, renderStoryPage, shelfById,
} from './stories.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export function loadStories(root = ROOT) {
  const dir = path.join(root, 'stories');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => parseStory(readFileSync(path.join(dir, f), 'utf8'), f.slice(0, -3)));
}

export function loadAudio(root = ROOT) {
  const file = path.join(root, 'audio', 'manifest.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

export function loadPodcast(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'podcast.json'), 'utf8'));
}

/** Every generated file, as { relative path: contents }. */
export function buildAll(root = ROOT) {
  const stories = loadStories(root);
  const audio = loadAudio(root);
  const podcast = loadPodcast(root);
  const files = {
    'index.html': renderIndex(stories, audio),
    'feed.xml': renderAllFeed(stories, audio),
    'sitemap.xml': renderSitemap(stories),
    'llms.txt': renderLlms(stories, audio),
  };
  for (const story of stories) files[`${story.slug}.html`] = renderStoryPage(story, audio);
  for (const shelf of SHELVES) files[feedPath(shelf.id)] = renderFeed(shelf, stories, audio, podcast);
  return files;
}

/** The words read aloud: an introduction, the story, and a closing credit. */
export function speechFor(slug, root = ROOT) {
  const story = loadStories(root).find((s) => s.slug === slug);
  if (!story) throw new Error(`no story "${slug}"`);
  const shelf = shelfById(story.shelf);
  return [
    `${shelf.title}. ${story.title}.`,
    `Written by Claude, an A.I. model made by Anthropic, and read by a synthetic voice.`,
    '[pause]',
    markdownToSpeech(story.body),
    '[pause]',
    `That was ${story.title}, from ${shelf.title}. It is free to share and adapt under a Creative Commons Attribution Share-Alike licence. You can read the text, and find more stories, on the Hearth and Horizon website.`,
  ].join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--speech') {
    process.stdout.write(speechFor(args[1]));
  } else {
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
}
