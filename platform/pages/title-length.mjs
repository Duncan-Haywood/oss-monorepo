// Catalogue-wide ratchet on overlong page titles.
//
// Search results cut a <title> at about 60 characters, so a title over 70
// (entities decoded, whitespace collapsed) loses its tail. This is the bar
// platform/ci/check_title_meta.py reports; that script only prints counts,
// so nothing stopped a new venture page shipping a 100-character title.
// title-length-baseline.json lists every venture page that was over the bar
// when the check went in. A page outside the list must fit; a listed page that
// now fits must leave the list (so it cannot grow back unnoticed).
//
//   node platform/pages/title-length.mjs           # report
//   node platform/pages/title-length.mjs --write   # rewrite the baseline
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..', '..');
export const BASELINE_PATH = join(HERE, 'title-length-baseline.json');
export const MAX = 70;
const SKIP = new Set(['node_modules', '.next', '.git']);

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c', middot: '\u00b7', times: '\u00d7' };
// An out-of-range reference (past U+10FFFF) stays as written instead of throwing.
const cp = (n, raw) => (n <= 0x10ffff ? String.fromCodePoint(n) : raw);
export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => cp(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => cp(+d, m))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

// Length a reader sees, or null when the page has no title.
export function titleLength(htmlText) {
  const m = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = decode(m[1].replace(/\s+/g, ' ').trim());
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

// { 'ventures/x/page.html': length } for every venture page over MAX.
export function scan(root = join(REPO, 'ventures'), max = MAX) {
  const out = {};
  for (const f of pages(root)) {
    const text = readFileSync(f, 'utf8');
    if (!/<html/i.test(text)) continue;
    const n = titleLength(text);
    if (n !== null && n > max) out[relative(REPO, f).split('\\').join('/')] = n;
  }
  return out;
}

export function readBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8')).pages;
}

// Pages over the bar that the baseline does not list, and listed pages that
// now fit (or are gone).
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
    note: `Venture pages whose <title> is over ${MAX} characters. May only shrink: node platform/pages/title-length.mjs --write after shortening titles.`,
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
