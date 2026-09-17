import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should movers charge for a local move/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// Bid-link regression guards. share.test.mjs exercises the generic
// encode/decode transform against a stand-in spec; these tie it to *this*
// page so a cost field or the inventory rows can never go quietly missing
// from what a shared link and a saved draft carry.
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'could not find the module script');
const scriptSource = scriptMatch[1];

function bodyOf(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `could not find ${opener} in the script`);
  const first = source.slice(start).search(/[[{]/);
  assert.notEqual(first, -1, `${opener} has no bracketed body`);
  const open = source[start + first];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start + first; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open}${close} after ${opener}`);
}

function idListsIn(source) {
  return new Set([...source.matchAll(/\b([A-Z][A-Z_]*_IDS)\b/g)].map((m) => m[1]));
}

test('the bid link travels as a URL fragment, never a query string', () => {
  // A fragment (`#...`) is never sent in the request line a server logs nor
  // in the `Referer` header a later off-site click carries; a query string
  // (`?...`) is both. A mover's wage and burden rate leaking into server
  // logs is the failure this guards.
  assert.match(scriptSource, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the bid link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(scriptSource),
    'the bid link must not be built with a query string');
  assert.match(scriptSource, /search: location\.hash/,
    'the bid must be restored from the fragment, matching how the link is built');
});

test('the share/restore controls exist on the page', () => {
  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid']) {
    assert.match(scriptSource, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
});

test('every flat field the form reads is a field the bid link carries', () => {
  const read = idListsIn(bodyOf(scriptSource, 'function readInput('));
  const spec = idListsIn(bodyOf(scriptSource, 'const BID_SPEC ='));
  const dropped = [...read].filter((name) => !spec.has(name));
  assert.deepEqual(
    dropped,
    [],
    `readInput() reads ${dropped.join(', ')} but BID_SPEC does not carry them; `
      + 'a shared link would price a different job than the sender saw',
  );
});

test('the inventory rows are named consistently across the spec, save, and restore', () => {
  assert.match(bodyOf(scriptSource, 'const BID_SPEC ='), /param:\s*'inventory'/,
    'BID_SPEC must carry the inventory list under the "inventory" row param');
  assert.match(bodyOf(scriptSource, 'function applyValues('), /values\.inventory/,
    'applyValues must rebuild the inventory rows from a restored bid');
});

test('the link caution copy names what it carries', () => {
  assert.match(html, /A bid link carries your whole job/, 'the bid link does not say what it carries');
});

// Closest cleaning sibling: same property clear-out, but a junk haul rather
// than a household move. Related-tool chrome rotates inside the cleaning
// subcategory, so without an explicit one-hop a crawler on this page may never
// land on that tool.
test('index links one hop to the junk-removal-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/junk-removal-bid-calculator\/"/,
    'index must link ../junk-removal-bid-calculator/ so crawlers reach the junk calculator in one hop',
  );
  assert.match(html, /junk removal bid calculator/i);
});
