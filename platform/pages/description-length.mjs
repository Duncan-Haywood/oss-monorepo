// Catalogue-wide ratchet on overlong meta descriptions.
//
// A search results page shows about 155 to 160 characters of a page's
// <meta name="description">; the rest is cut mid-sentence. The site build's
// clampMetaDescription only trims what is over 320, so a 250-character
// description still reaches Google as written and is shown cut. This file
// lists every venture page over 160 (entities decoded, whitespace collapsed),
// skipping `noindex` pages, which never show a snippet. A page outside the
// baseline must fit; a listed page that now fits must leave the list (so it
// cannot grow back unnoticed). Same shape as title-length.mjs.
//
//   node platform/pages/description-length.mjs           # report
//   node platform/pages/description-length.mjs --write   # rewrite the baseline
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, REPO } from './title-length.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = join(HERE, 'description-length-baseline.json');
export const MAX = 160;
// `paid-apps` is the paid products' workspace (ventures/paid-apps/): its pages
// are served by each app's own deploy, not by this catalogue, and its own CI
// checks them (ventures/paid-apps/PROVENANCE.md).
const SKIP = new Set(['node_modules', '.next', '.git', 'paid-apps']);

// Length a reader sees, or null when the page has no description or is noindex.
export function descriptionLength(htmlText) {
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(htmlText)) return null;
  const m = htmlText.match(/<meta[^>]+name=["']description["'][^>]*content=(["'])([\s\S]*?)\1/i);
  if (!m) return null;
  const t = decode(m[2].replace(/\s+/g, ' ').trim());
  return t ? [...t].length : null;
}

function* pages(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (e.isFile() && e.name.endsWith('.html')) yield p;
  }
}

// Git-ignored files under `root` (pages a venture's own tests generate, such as
// shed-designer's lumber pages): a fresh checkout and CI never have them, so a
// local run must not count them. Empty when git is unavailable.
function ignored(root) {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', '.'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
    return new Set(out.split('\0').filter(Boolean).map((p) => join(root, p)));
  } catch {
    return new Set();
  }
}

// { 'ventures/x/page.html': length } for every venture page over `max`, as
// measured by `measure` (og-description-length.mjs passes its own).
export function scan(root = join(REPO, 'ventures'), max = MAX, measure = descriptionLength) {
  const out = {};
  const skip = ignored(root);
  for (const f of pages(root)) {
    if (skip.has(f)) continue;
    const text = readFileSync(f, 'utf8');
    if (!/<html/i.test(text)) continue;
    const n = measure(text);
    if (n !== null && n > max) out[relative(REPO, f).split('\\').join('/')] = n;
  }
  return out;
}

export function readBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).pages;
}

export function compare(found, baseline) {
  const listed = new Set(baseline);
  return {
    added: Object.keys(found).filter((p) => !listed.has(p)).sort(),
    fixed: baseline.filter((p) => !(p in found)).sort(),
  };
}

export function writeBaseline(found, path = BASELINE_PATH) {
  const pagesList = Object.keys(found).sort();
  writeFileSync(path, JSON.stringify({
    note: `Venture pages whose meta description is over ${MAX} characters. May only shrink: node platform/pages/description-length.mjs --write after shortening descriptions.`,
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
    console.log(`${Object.keys(found).length} venture pages over ${MAX} characters; ${added.length} not in the baseline, ${fixed.length} listed but now fit`);
    for (const p of added) console.log(`  new:   ${p} (${found[p]})`);
    for (const p of fixed) console.log(`  fixed: ${p}`);
    process.exitCode = added.length || fixed.length ? 1 : 0;
  }
}
