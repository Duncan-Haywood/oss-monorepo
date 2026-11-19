// Every flagship whose index page opens with a `<header>` hero puts its parts
// in one order: an eyebrow line (`p.eyebrow`), the headline (`h1`), the
// call-to-action pair (`p.cta-row`), then the lede and any detail.
//
// WHY: on 2026-11-19 the flagship heroes were in four different orders. Three
// put the buttons after a lede of seven to nine phone lines (sales-agent's
// first button sat 410 px down a 390 px-wide screen, against 132 to 193 px on
// the others), one had no eyebrow and its product name for a headline, and the
// eyebrow was plain muted `.note` text on six pages and a styled label on one.
// The same order on every flagship lets them read as one site, and puts the
// two buttons on the first screen of a phone.
// Report: docs/reports/polish-2026-11-19-flagship-hero-order.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Flagship venture slugs, in the order flagships.yaml lists them. */
export function flagshipVentures(yaml) {
  return [...yaml.matchAll(/^\s*-\s*venture:\s*([\w-]+)/gm)].map((m) => m[1]);
}

/** The first-level children of the page's first <header> inside <body>, as tag.class tokens. */
export function heroParts(html) {
  const body = html.indexOf('<body');
  if (body < 0) return null;
  const m = /^\s*<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html.slice(html.indexOf('>', body) + 1));
  if (!m) return null;
  const parts = [];
  const re = /<(\/?)(h1|p|nav|details|div|ul|section|figure)\b([^>]*)>/gi;
  let depth = 0;
  let t;
  while ((t = re.exec(m[1]))) {
    const [, close, tag, attrs] = t;
    if (close) { depth--; continue; }
    if (depth === 0) {
      const cls = /class="([^"]*)"/.exec(attrs);
      parts.push(tag.toLowerCase() + (cls ? '.' + cls[1].trim().split(/\s+/).join('.') : ''));
    }
    depth++;
  }
  return parts;
}

/** '' when the parts follow eyebrow > h1 > cta-row, else what is wrong. */
export function orderProblem(parts) {
  const has = (p, c) => p.split('.').slice(1).includes(c);
  if (!parts.length || !has(parts[0], 'eyebrow')) return `first part is ${parts[0] || 'nothing'}, not p.eyebrow`;
  if (parts[1] !== 'h1') return `second part is ${parts[1]}, not h1`;
  const cta = parts.findIndex((p) => has(p, 'cta-row'));
  if (cta >= 0 && cta !== 2) return `cta-row is part ${cta + 1}, not straight after the h1`;
  return '';
}

test('orderProblem accepts the agreed order and names a misplaced button row', () => {
  assert.equal(orderProblem(['p.note.eyebrow', 'h1', 'p.cta-row', 'p', 'p.note']), '');
  assert.equal(orderProblem(['p.eyebrow', 'h1', 'p.lede']), '');
  assert.match(orderProblem(['p.note.eyebrow', 'h1', 'p', 'p.cta-row']), /cta-row is part 4/);
  assert.match(orderProblem(['h1', 'p.cta-row']), /not p\.eyebrow/);
  assert.match(orderProblem(['p.note', 'h1']), /not p\.eyebrow/);
});

test('heroParts reads only first-level children of the header', () => {
  const html = '<html><head></head><body>\n<header><p class="eyebrow">X</p><h1>T</h1><details><ul><li>a</li></ul></details></header><main></main></body></html>';
  assert.deepEqual(heroParts(html), ['p.eyebrow', 'h1', 'details']);
  assert.equal(heroParts('<body><main><header><h1>x</h1></header></main></body>'), null);
});

test('flagship heroes run eyebrow, headline, buttons, then the lede', () => {
  const slugs = flagshipVentures(readFileSync(join(ROOT, 'portfolio', 'flagships.yaml'), 'utf8'));
  assert.ok(slugs.length >= 5, 'flagships.yaml lists flagships');
  const bad = [];
  let checked = 0;
  for (const slug of slugs) {
    const file = join(ROOT, 'ventures', slug, 'index.html');
    if (!existsSync(file)) continue;
    const parts = heroParts(readFileSync(file, 'utf8'));
    if (!parts) continue; // pages without a <header> hero (app shells) are out of scope
    checked++;
    const why = orderProblem(parts);
    if (why) bad.push(`ventures/${slug}/index.html: ${why} (${parts.join(' > ')})`);
  }
  assert.ok(checked >= 5, `checked ${checked} flagship heroes`);
  assert.deepEqual(bad, [], 'flagship heroes out of order:\n' + bad.join('\n'));
});
