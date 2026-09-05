// Structural tests for the venture's published pages. Until now this venture
// had calc.test.mjs and proposal.test.mjs (pure logic) plus usage.test.mjs,
// but nothing that reads index.html or how-to-bid-tree-removal.html — so a
// page that shipped without an og:* tag (how-to-bid-tree-removal.html did,
// until this change) had nothing to catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const index = page('index.html');

test('the calculator page carries the required disclaimer, privacy line, and schema.org markup', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Nothing leaves your browser/);
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(index, /how-to-bid-tree-removal\.html/, 'the docs page must be linked from the calculator');
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
test('every published page carries Open Graph tags', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected at least the 2 known pages in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
  }
});

test('the docs page is listed in the sitemap', () => {
  const sitemap = page('sitemap.xml');
  assert.ok(sitemap.includes('how-to-bid-tree-removal.html'), 'the docs page is missing from the sitemap');
});

// ---------------------------------------------------------------------------
// Shareable bid link
//
// Before this change, the trees on a stop lived nowhere but the DOM: closing
// the tab lost the whole priced job, and the only way to hand it to a second
// estimator or the office was a screenshot of the headline price. Every
// fixed-form calculator on this site already solved both problems with a
// per-venture `share.mjs`; this one could not use the same trick unmodified
// because its rows (the trees) are built at runtime, which is exactly the
// case `platform/pages/link.mjs`'s generic build-time injection explicitly
// declines to cover. `share.mjs`'s `rows` spec is what closes that gap here.
const scriptMatch = index.match(/<script type="module">([\s\S]*)<\/script>\s*<\/body>/);
const scriptSource = scriptMatch ? scriptMatch[1] : '';
const declaredIds = new Set([...index.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));

// Returns the declaration at `opener` up to the close of its first bracketed
// body, so a `{...}` object and an `[...]` array both work.
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

test('the module script survives parsing', () => {
  assert.notEqual(scriptSource, '', 'the module script was not found; the page structure changed');
  assert.match(scriptSource, /calculateBid/);
});

// The saved-and-shared stop is only trustworthy if it carries every field the
// calculator reads. This repo has already shipped the opposite once: a
// `share.mjs` kept its own hand-written field list, a form grew fields past
// it, and a shared link silently dropped them — the recipient's page computed
// a different price than the sender had quoted, with nothing on screen to say
// so. `platform/proposal/term-ids.test.mjs` and CLAUDE.md both record that
// this failure has shipped repeatedly across the fleet.
test('save-and-share is wired to the page', () => {
  assert.match(scriptSource, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The bid rides in the URL fragment, never the query string. A query string
  // is sent in the request line a server logs and in the `Referer` header a
  // later off-site click carries; a fragment is sent in neither. On a page
  // that promises nothing you type is uploaded, that is the difference
  // between the claim holding and not.
  assert.match(scriptSource, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the bid link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(scriptSource),
    'the bid link must not be built with a query string');
  assert.match(scriptSource, /search: location\.hash/,
    'the bid must be restored from the fragment, matching how the link is built');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid']) {
    assert.match(scriptSource, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  assert.match(index, /A bid link carries your own rates/, 'the bid link does not say what it carries');
  assert.match(index, /crew wage, burden, overhead, and target margin/, 'the link caution does not name the rates it carries');
  assert.match(index, /The customer should get the price, not the link/, 'the link caution does not say who not to send it to');
  assert.match(index, /Your stop is saved in this browser/, 'the privacy note does not disclose that the stop is stored');
  assert.match(index, /treat one like your rate sheet/, 'the privacy note does not warn what a copied link holds');
});

test('every tree field the row reads is a field the bid link carries', () => {
  const read = [...bodyOf(scriptSource, 'function readTreeRows(').matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /rows:/, 'BID_SPEC carries no rows, so a shared link would drop every tree');
  const carried = [...spec.matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  const dropped = read.filter(key => !carried.includes(key));
  assert.deepEqual(
    dropped,
    [],
    `readTreeRows() reads ${dropped.join(', ')} but BID_SPEC's rows do not carry them; `
      + 'a shared link would price a different stop than the sender saw',
  );
  // The tree's flags (near a structure, near power, a dead hazard, grind the
  // stump) each change the hours calc.mjs charges for that tree, so a link
  // that dropped one would reopen a cheaper, less hazardous job than the one
  // actually priced.
  for (const key of ['name', 'species', 'dbhInches', 'heightFeet', 'access', 'haul',
    'nearStructure', 'nearPower', 'deadHazard', 'grindStump']) {
    assert.ok(carried.includes(key), `the tree row does not carry ${key}`);
  }
  // The tree's name is free text a contractor types, not one of a fixed list
  // of presets, so it has to travel as text rather than a validated choice —
  // a `choice` field here would silently drop every custom label.
  assert.match(spec, /key: 'name', kind: 'text'/, 'the tree label is not carried as free text');
});

test('every cost field the calculator reads is in BID_SPEC.numbers', () => {
  const costIds = [...bodyOf(scriptSource, 'const COST_IDS =').matchAll(/'(\w+)'/g)].map(m => m[1]);
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /numbers: COST_IDS/, 'BID_SPEC does not carry COST_IDS directly, so the two can drift');
  assert.ok(costIds.length > 0);
});
