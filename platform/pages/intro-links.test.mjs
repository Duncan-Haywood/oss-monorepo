// A tool's intro is not its link hub (docs/reports/polish-2026-11-13-intro-walls.md).
// On a 390 px phone, a header paragraph carrying every guide link pushed the first
// input of etsy-profit-calculator to 1,451 px and of ebay-fee-calculator to 1,940 px
// (median tool: 750 px). Those links now live in a jump row and a "Questions this
// answers" list lower on the page. This test fails a new header paragraph with more
// than MAX_LINKS links, and lets the pages that already had one shrink but not grow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VENTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');
const MAX_LINKS = 8;

// Measured 2026-11-13: the most links in one header paragraph. Lower a number when you
// move links out; delete the entry once the page is at or under MAX_LINKS.
const KNOWN = {
  'clothing-design-studio': 40,
  'ai-bookkeeper': 33,
  'league-schedule-generator': 28,
  'shift-roster-builder': 21,
  'state-residency-day-counter': 10,
  '3pl-quote-normalizer': 10,
};

export function headerParagraphLinks(html) {
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  if (!header) return [];
  return [...header[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => (m[1].match(/<a\s/gi) || []).length);
}

test('headerParagraphLinks counts links per paragraph of the first header only', () => {
  const html = '<header><p><a href=a>1</a> <a href=b>2</a></p><p>none</p><nav><a href=c>3</a></nav></header><header><p><a href=d>x</a></p></header>';
  assert.deepEqual(headerParagraphLinks(html), [2, 0]);
  assert.deepEqual(headerParagraphLinks('<main><p><a href=a>1</a></p></main>'), []);
});

test(`no tool intro paragraph carries more than ${MAX_LINKS} links (known pages may only shrink)`, () => {
  const bad = [];
  for (const slug of fs.readdirSync(VENTURES).sort()) {
    const file = path.join(VENTURES, slug, 'index.html');
    if (!fs.existsSync(file)) continue;
    const most = Math.max(0, ...headerParagraphLinks(fs.readFileSync(file, 'utf8')));
    const allowed = KNOWN[slug] ?? MAX_LINKS;
    if (most > allowed) bad.push(`${slug}: ${most} links in one header paragraph (allowed ${allowed})`);
  }
  assert.deepEqual(bad, [], 'Move guide links to a jump row (<nav class="jump">) or a list lower on the page.');
});

test('KNOWN entries are still over the limit (delete the ones that are fixed)', () => {
  const stale = Object.keys(KNOWN).filter((slug) => {
    const file = path.join(VENTURES, slug, 'index.html');
    return !fs.existsSync(file) || Math.max(0, ...headerParagraphLinks(fs.readFileSync(file, 'utf8'))) <= MAX_LINKS;
  });
  assert.deepEqual(stale, []);
});
