// Catalogue-wide ratchet on overlong og:description (share-card text).
//
// Link previews (Slack, LinkedIn, iMessage, X, Facebook) show about two lines
// of a page's <meta property="og:description">, roughly 200 characters at
// most, and cut the rest. The meta-description ratchet
// (description-length.mjs) holds search snippets to 160; this one holds share
// cards to 200, so a paid product's page does not reach a buyer in a chat
// thread cut mid-sentence. Same shape: a page outside the baseline must fit,
// a listed page that now fits must leave the list. noindex pages are skipped
// as in the meta ratchet.
//
//   node platform/pages/og-description-length.mjs           # report
//   node platform/pages/og-description-length.mjs --write   # rewrite the baseline
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, REPO } from './title-length.mjs';
import { scan as scanWith, compare } from './description-length.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(HERE, 'og-description-length-baseline.json');
export const MAX = 200;
export { compare };

// Length a reader sees, or null when the page has none or is noindex.
export function ogDescriptionLength(htmlText) {
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(htmlText)) return null;
  const m = htmlText.match(/<meta[^>]+property=["']og:description["'][^>]*content=(["'])([\s\S]*?)\1/i);
  if (!m) return null;
  const t = decode(m[2].replace(/\s+/g, ' ').trim());
  return t ? [...t].length : null;
}

export function scan(root = join(REPO, 'ventures'), max = MAX) {
  return scanWith(root, max, ogDescriptionLength);
}

export function readBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).pages;
}

export function writeBaseline(found, path = BASELINE_PATH) {
  const pagesList = Object.keys(found).sort();
  writeFileSync(path, JSON.stringify({
    note: `Venture pages whose og:description is over ${MAX} characters. May only shrink: node platform/pages/og-description-length.mjs --write after shortening them.`,
    max: MAX,
    count: pagesList.length,
    pages: pagesList,
  }, null, 1) + '\n');
  return pagesList.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = scan();
  if (process.argv.includes('--write')) {
    console.log(`wrote ${writeBaseline(found)} pages to ${relative(REPO, BASELINE_PATH)}`);
  } else {
    const { added, fixed } = compare(found, readBaseline());
    console.log(`${Object.keys(found).length} venture pages with og:description over ${MAX} characters; ${added.length} not in the baseline, ${fixed.length} listed but now fit`);
    for (const p of added) console.log(`  new:   ${p} (${found[p]})`);
    for (const p of fixed) console.log(`  fixed: ${p}`);
    process.exitCode = added.length || fixed.length ? 1 : 0;
  }
}
