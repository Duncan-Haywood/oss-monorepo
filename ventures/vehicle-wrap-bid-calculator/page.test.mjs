// Structural tests for index.html. Until now this venture had calc.test.mjs
// and proposal.test.mjs (pure logic) plus usage.test.mjs, but nothing that
// reads index.html itself — so the save-and-share feature added alongside
// this file had no guard tying the page's real fields to what a bid link
// actually carries, which is exactly the drift share.mjs's own header warns
// about and platform/proposal/term-ids.test.mjs was written to catch for the
// proposal terms specifically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const index = page('index.html');

test('the calculator page carries the required disclaimer, privacy line, and schema.org markup', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Everything on this page runs in your browser/);
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(index, /how-much-to-charge-for-a-vehicle-wrap\.html/, 'the docs page must be linked from the calculator');
});

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
  assert.ok(sitemap.includes('how-much-to-charge-for-a-vehicle-wrap.html'), 'the docs page is missing from the sitemap');
});

// ---------------------------------------------------------------------------
// Shareable / saved bid link
//
// Added alongside this file: the calculator had 13 pricing inputs and a full
// customer-proposal panel (deposit, payment terms, exclusions) but no way to
// save a draft between visits or send a partner the same numbers — every
// other field on the page was already covered by localStorage except the
// price itself. These guards hold the feature to the page's real fields
// rather than re-implementing it.
const scriptMatch = index.match(/<script type="module">([\s\S]*)<\/script>\s*<\/body>/);
const scriptSource = scriptMatch ? scriptMatch[1] : '';
const declaredIds = new Set([...index.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));

test('the module script survives parsing', () => {
  assert.notEqual(scriptSource, '', 'the module script was not found; the page structure changed');
  assert.match(scriptSource, /calculateQuote/);
});

test('save-and-share is wired to the page', () => {
  assert.match(scriptSource, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The bid rides in the URL fragment, never the query string: a fragment is
  // not sent in the request line a server logs, nor in the `Referer` header a
  // later click would carry, so the numbers a shop typed stay off any log.
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
});

test('every pricing field the calculator reads is carried by the bid spec', () => {
  const defaultsBlock = readFileSync(new URL('./calc.mjs', import.meta.url), 'utf8')
    .match(/export const DEFAULTS = \{([\s\S]*?)\};/);
  assert.ok(defaultsBlock, 'could not find DEFAULTS in calc.mjs');
  const fieldIds = [...defaultsBlock[1].matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
  assert.ok(fieldIds.length > 0);
  assert.match(scriptSource, /numbers:\s*\[\.\.\.FIELD_IDS,\s*\.\.\.ACTUAL_FIELD_IDS\]/,
    'BID_SPEC does not carry FIELD_IDS directly, so the two can drift');
  for (const id of fieldIds) {
    assert.ok(declaredIds.has(id), `calc.mjs reads ${id} but no input on the page declares it`);
  }
});

test('the optional actual-usage fields ride in the bid spec too, not just the required pricing fields', () => {
  // actualVinylSqFtUsed/actualInstallHours are deliberately outside DEFAULTS
  // (calculateQuote treats them as optional, not required pricing inputs), so
  // the FIELD_IDS-drift guard above cannot see them. A bid link that dropped
  // them once already (the field existed on the page and in calc.mjs, but
  // BID_SPEC's `numbers` was FIELD_IDS alone) is exactly the failure this
  // guards against recurring.
  assert.match(scriptSource, /const ACTUAL_FIELD_IDS = \[('|")actualVinylSqFtUsed\1,\s*('|")actualInstallHours\2\]/);
  for (const id of ['actualVinylSqFtUsed', 'actualInstallHours']) {
    assert.ok(declaredIds.has(id), `calc.mjs reads ${id} but no input on the page declares it`);
  }
});

test('the proposal terms ride in the same link as the price, via withProposalTerms', () => {
  assert.match(scriptSource, /withProposalTerms\(BID_SPEC\)/);
  assert.match(scriptSource, /readProposalTerms\(readInput\(\), el\)/);
});

// The featureList and FAQ answer both used to describe a page that could not
// yet share or save a quote. Shipping the feature without updating either
// would leave the schema.org markup a search engine or an AI answer engine
// reads stale the moment it merged.
test('the featureList and FAQ answer describe the share/save feature that now exists', () => {
  assert.match(index, /shareable bid link/i, 'featureList does not mention the share link');
  assert.match(index, /saved quote that reopens/i, 'featureList does not mention the local draft save');
  assert.ok(index.includes('Does anything about my costs or roll usage get uploaded?'));
  const jsonLdAnswer = /"Does anything about my costs or roll usage get uploaded\?","acceptedAnswer":\{"@type":"Answer","text":"([^"]*(?:\\.[^"]*)*)"\}/
    .exec(index);
  assert.ok(jsonLdAnswer, 'the FAQPage JSON-LD entry for this question is missing');
  assert.match(jsonLdAnswer[1], /Copy bid link/, 'the JSON-LD privacy answer does not mention the share link');
  assert.match(jsonLdAnswer[1], /saves? to this browser|saved.*next visit/i,
    'the JSON-LD privacy answer does not mention the local draft save');
  const visibleFaq = index.slice(index.indexOf('<section><h2>Common questions</h2>'));
  const visibleAnswer = /Does anything about my costs or roll usage get uploaded\?<\/h3><p>([\s\S]*?)<\/p>/.exec(visibleFaq);
  assert.ok(visibleAnswer, 'the visible FAQ paragraph for this question is missing');
  assert.match(visibleAnswer[1], /Copy bid link/, 'the visible privacy answer does not mention the share link');
  assert.match(visibleAnswer[1], /saves? to this browser|saved.*next visit/i,
    'the visible privacy answer does not mention the local draft save');
});

test('the privacy section no longer claims nothing is saved, now that a quote persists locally', () => {
  const privacy = index.slice(index.indexOf('<h2>Private by default</h2>'), index.indexOf('</section>', index.indexOf('<h2>Private by default</h2>')));
  assert.doesNotMatch(privacy, /nothing is saved when you close the tab/i);
  assert.match(privacy, /saves to this browser|local storage/i);
});
