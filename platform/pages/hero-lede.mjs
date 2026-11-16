#!/usr/bin/env node
// Words in the paragraph right under each tool page's h1 (`ventures/*/index.html`).
// That paragraph is the first thing a visitor reads and what a search snippet or an
// assistant quotes. On 2026-11-16 five ran 121 to 179 words (where-to-sell-calculator
// was 552 px tall on a phone, with the first input at 1,391 px); a cross-link list or a
// <details> below the lede holds the rest. `hero-lede.test.mjs` keeps every page under
// HERO_LEDE_MAX_WORDS. Run `node platform/pages/hero-lede.mjs [n]` for the longest n.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERO_LEDE_MAX_WORDS = 120;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Word count of the first <p> after the page's first </h1>, skipping other tags between them; null when there is none. */
export function heroLedeWords(html) {
  const at = html.search(/<h1[\s>]/);
  if (at < 0) return null;
  const m = /<\/h1>\s*(?:<(?!p[\s>])[^>]*>\s*)*<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/.exec(html.slice(at));
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim().split(/\s+/).filter(Boolean).length;
}

/** `[{ slug, words }]` for every venture with an index.html and a hero lede, longest first. */
export function heroLedes(root = ROOT) {
  const dir = path.join(root, 'ventures');
  const out = [];
  for (const slug of readdirSync(dir)) {
    const file = path.join(dir, slug, 'index.html');
    if (!existsSync(file)) continue;
    const words = heroLedeWords(readFileSync(file, 'utf8'));
    if (words != null) out.push({ slug, words });
  }
  return out.sort((a, b) => b.words - a.words || a.slug.localeCompare(b.slug));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const n = Number(process.argv[2]) || 15;
  const all = heroLedes();
  console.log(`${all.length} tool pages; ${all.filter((r) => r.words > 90).length} past 90 words, ${all.filter((r) => r.words > HERO_LEDE_MAX_WORDS).length} past ${HERO_LEDE_MAX_WORDS}.`);
  for (const r of all.slice(0, n)) console.log(`${String(r.words).padStart(4)}  ${r.slug}`);
}
