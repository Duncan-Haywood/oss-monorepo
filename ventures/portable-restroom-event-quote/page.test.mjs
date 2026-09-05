import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Porta Potty Event Quote Calculator/);
  assert.match(html, /portable restroom event rental/i);
  assert.match(html, /calculateQuote/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /health-department/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
});

test('SEO page answers the search question and does not claim a code table', () => {
  const html = page('how-many.html');
  assert.match(html, /How many porta potties for 200 people/i);
  assert.match(html, /not a health-code table/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /portable-restroom-event-quote\/<\/loc>/);
  assert.match(sitemap, /how-many\.html/);
});

// ---------------------------------------------------------------------------
// Shareable quote link
//
// This venture was one of 8 itemised calculators (dynamic per-row forms) that
// platform/pages/link.mjs's build-time bid-link injector declines to handle —
// a recipient's blank form could have a different row count than the
// sender's, so the platform refuses to offer a link it cannot keep honest.
// It was the last of the 8 still falling back to the platform's generic
// control instead of its own share.mjs. These guards close that gap and pin
// it shut: a hand-written allowlist and the form's real fields silently
// diverging is the recorded defect (share.mjs's own header, and the missing
// deposit/terms bug from 2026-08-29) that has already cost five other
// calculators a shared link that priced a different job than the one the
// sender saw.
const index = page('index.html');
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
  assert.match(scriptSource, /calculateQuote/);
});

test('save-and-share is wired to the page', () => {
  assert.match(scriptSource, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The quote rides in the URL fragment, never the query string. A query
  // string is sent in the request line a server logs and in the `Referer`
  // header a later off-site click carries; a fragment is sent in neither. On
  // a page that promises nothing you type is uploaded, that is the
  // difference between the claim holding and not.
  assert.match(scriptSource, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the quote link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(scriptSource),
    'the quote link must not be built with a query string');
  assert.match(scriptSource, /search: location\.hash/,
    'the quote must be restored from the fragment, matching how the link is built');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid', 'withProposalTerms', 'readProposalTerms']) {
    assert.match(scriptSource, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  // What the link carries has to be on the page beside the button that makes
  // one — a hidden capability nobody reads the fine print for is not consent.
  assert.match(index, /A quote link carries every unit type/, 'the quote link does not say what it carries');
  assert.match(index, /rent, pump-out prices, haul, and margin/, 'the link caution does not name the rates it carries');
  assert.match(index, /The customer should get the price, not the link/, 'the link caution does not say who not to send it to');
  assert.match(index, /Your quote is saved in this browser/, 'the privacy note does not disclose that the quote is stored');
  assert.match(index, /treat one like your rate sheet/, 'the privacy note does not warn what a copied link holds');
});

test('every unit-type field the row reads is a field the quote link carries', () => {
  const read = [...bodyOf(scriptSource, 'function readUnitRows(').matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /rows:/, 'BID_SPEC carries no rows, so a shared link would drop every unit type');
  const carried = [...spec.matchAll(/key: '(\w+)'/g)].map(m => m[1]);
  const dropped = read.filter(key => !carried.includes(key));
  assert.deepEqual(
    dropped,
    [],
    `readUnitRows() reads ${dropped.join(', ')} but BID_SPEC's rows do not carry them; `
      + 'a shared link would price a different fleet than the sender saw',
  );
  for (const key of ['type', 'quantity', 'rentPerDay', 'serviceEach']) {
    assert.ok(carried.includes(key), `the unit row does not carry ${key}`);
  }
  // The unit type is one of a fixed list of presets (or "other"), not free
  // text a yard types, so it travels as a validated choice tied to
  // UNIT_PRESETS rather than a hand-copied list of option strings — a preset
  // this build no longer offers must not survive a crafted or stale link.
  assert.match(spec, /key: 'type', kind: 'choice', options: TYPE_VALUES/,
    'the unit type is not carried as a choice validated against the presets');
  assert.match(scriptSource, /const TYPE_VALUES = UNIT_PRESETS\.map/,
    'TYPE_VALUES is not derived from UNIT_PRESETS, so a renamed or reordered preset could silently drift');
});

test('every cost and event field the calculator reads is in BID_SPEC.numbers', () => {
  const costIds = [...bodyOf(scriptSource, 'const COST_IDS =').matchAll(/'(\w+)'/g)].map(m => m[1]);
  const eventIds = [...bodyOf(scriptSource, 'const EVENT_IDS =').matchAll(/'(\w+)'/g)].map(m => m[1]);
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /numbers: \[\.\.\.COST_IDS, \.\.\.EVENT_IDS\]/,
    'BID_SPEC does not carry COST_IDS and EVENT_IDS directly, so the two can drift');
  assert.ok(costIds.length > 0);
  assert.ok(eventIds.length > 0);
  // The alcohol/food-service checkboxes change the fleet-size suggestion and
  // the price-per-attendee sanity check, so a link that dropped them would
  // reopen with a different suggested fleet than the one the sender saw.
  assert.match(spec, /flags: \['alcohol', 'foodService'\]/,
    'BID_SPEC does not carry the alcohol/food-service flags');
});

// The featureList and FAQ answer both used to describe a page that could not
// yet share or save a quote. Other ventures in this repo shipped the feature
// without updating either at least once, so the schema.org markup a search
// engine or an AI answer engine reads was stale the moment it merged —
// silently wrong rather than absent, which is the harder version of the
// defect to notice.
test('the featureList describes the share/save feature that now exists', () => {
  assert.match(index, /shareable quote link/i, 'featureList does not mention the share link');
  assert.match(index, /saved quote that reopens/i, 'featureList does not mention the local draft save');
});
