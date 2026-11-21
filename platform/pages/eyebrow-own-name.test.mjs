// A venture page's eyebrow (the small capitals line above the h1) names its own
// tool, never a sibling's.
//
// WHY: on 2026-11-21 seven tool pages opened with another product's name in
// their eyebrow, left over from the page they were copied from: Ko-fi, Buy Me
// a Coffee and Teachable said "PATREON PAYOUT TO JOURNAL", Fiverr said "UPWORK
// EARNINGS TO JOURNAL", Shopify said "STRIPE PAYOUT TO JOURNAL", the phone
// repair calculator said "SHOE REPAIR SHOP PROFIT CALCULATOR" and the Teachers
// Pay Teachers analyzer said "FIVERR EARNINGS FEE ANALYZER". It is the first
// line a visitor reads, so a wrong name there reads as a broken page. Two pages
// already had a one-off guard in their own page.test.mjs; this covers all.
// Report: docs/reports/polish-2026-11-21-eyebrow-names.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENTURES = join(ROOT, 'ventures');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

/** Lower-case word tokens, as a sorted space-joined key ("ko-fi" -> "fi ko"). */
export function nameKey(text) {
  return [...new Set(decode(text).toLowerCase().match(/[a-z0-9]+/g) || [])].sort().join(' ');
}

/**
 * The first item of the hero eyebrow: the first `p.note` / `p.eyebrow` in the
 * first `<header>` that holds the page's h1, cut at the first " · ". Null when
 * the page has no such line.
 */
export function eyebrowName(html) {
  const body = html.indexOf('<body');
  if (body < 0) return null;
  const rest = html.slice(body);
  const hm = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(rest);
  if (!hm || !/<h1\b/.test(hm[1])) return null;
  const pm = /<p class="(?:note|eyebrow)"[^>]*>([\s\S]*?)<\/p>/.exec(hm[1]);
  if (!pm) return null;
  const text = decode(pm[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return text.split(/\s+·\s+/)[0].trim();
}

/**
 * Pages whose eyebrow name, as a set of words, equals another venture's slug.
 * `pages` maps slug -> html. Returns [{ slug, eyebrow, names }].
 */
export function foreignEyebrows(pages) {
  const bySlugKey = new Map();
  for (const slug of Object.keys(pages)) bySlugKey.set(nameKey(slug), slug);
  const out = [];
  for (const [slug, html] of Object.entries(pages)) {
    const eb = eyebrowName(html);
    if (!eb || /^for\b/i.test(eb)) continue;
    const other = bySlugKey.get(nameKey(eb));
    if (other && other !== slug) out.push({ slug, eyebrow: eb, names: other });
  }
  return out;
}

test('nameKey ignores case, order and punctuation', () => {
  assert.equal(nameKey('PATREON PAYOUT TO JOURNAL'), nameKey('patreon-payout-to-journal'));
  assert.equal(nameKey('KO-FI'), 'fi ko');
});

test('eyebrowName reads the first item of the header eyebrow', () => {
  const html = '<body><header><p class="note">PATREON PAYOUT TO JOURNAL · RUNS IN YOUR BROWSER</p><h1>Ko-fi</h1></header>';
  assert.equal(eyebrowName(html), 'PATREON PAYOUT TO JOURNAL');
  assert.equal(eyebrowName('<body><header><p class="note">x</p></header>'), null, 'no h1, not a hero');
  assert.equal(eyebrowName('<body><header><h1>x</h1></header>'), null);
});

test('foreignEyebrows flags a sibling name, not the page\'s own or an audience line', () => {
  const page = (eb) => `<body><header><p class="note">${eb} · RUNS IN YOUR BROWSER</p><h1>t</h1></header>`;
  const pages = {
    'patreon-payout-to-journal': page('PATREON PAYOUT TO JOURNAL'),
    'ko-fi-payout-to-journal': page('PATREON PAYOUT TO JOURNAL'),
    'teachable-payout-to-journal': page('TEACHABLE PAYOUT TO JOURNAL'),
    'roofing-bid-calculator': page('FOR RESIDENTIAL ROOFING CONTRACTORS'),
  };
  assert.deepEqual(foreignEyebrows(pages), [
    { slug: 'ko-fi-payout-to-journal', eyebrow: 'PATREON PAYOUT TO JOURNAL', names: 'patreon-payout-to-journal' },
  ]);
});

test('no venture page names another venture in its eyebrow', () => {
  const pages = {};
  for (const slug of readdirSync(VENTURES)) {
    const p = join(VENTURES, slug, 'index.html');
    if (existsSync(p)) pages[slug] = readFileSync(p, 'utf8');
  }
  assert.ok(Object.keys(pages).length > 100, 'expected the venture pages');
  const bad = foreignEyebrows(pages);
  assert.deepEqual(
    bad.map((b) => `${b.slug}: eyebrow "${b.eyebrow}" is ${b.names}'s name`),
    [],
  );
});
