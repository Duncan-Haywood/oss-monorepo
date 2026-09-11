// Structural assertions about the two published pages.
//
// The class of bug these catch is the one this repository keeps paying for: a
// figure written into prose that the arithmetic no longer produces. Both pages
// quote the worked example in words, so every quoted number here is recomputed
// from `calc.mjs` and compared, rather than pinned to a literal. Change the
// defaults and these fail, naming the sentence that went stale.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePlacement, markupToMargin, ALL_INPUT_IDS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./markup-vs-margin.html', import.meta.url), 'utf8');

/** The form's own default values, read out of the markup rather than restated. */
function defaultsFromPage() {
  const raw = { compExcludesOtPremium: true };
  for (const id of ALL_INPUT_IDS) {
    const match = index.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(match, `input #${id} is declared in calc.mjs but absent from the page`);
    raw[id] = match[1];
  }
  return raw;
}

test('the page collects every input the calculator declares', () => {
  const raw = defaultsFromPage();
  const result = calculatePlacement(raw);
  assert.equal(result.ok, true, `the page's own defaults must price: ${JSON.stringify(result.errors)}`);
});

test('the page declares no input the calculator does not read', () => {
  // Every `id="..."` on a number input has to be a known field, or the page is
  // collecting something that silently goes nowhere.
  const ids = [...index.matchAll(/<input id="([^"]+)" type="number"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.ok(ALL_INPUT_IDS.includes(id), `#${id} is on the form but calc.mjs never reads it`);
  }
  assert.equal(new Set(ids).size, ids.length, 'no duplicate input ids');
});

test('every result field the script writes to exists in the markup', () => {
  const targets = [...index.matchAll(/el\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
  const declared = new Set([...index.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const id of new Set(targets)) {
    assert.ok(declared.has(id), `the script writes to #${id}, which the markup does not declare`);
  }
});

test('both pages carry the no-warranty clause', () => {
  for (const [name, html] of [['index', index], ['markup-vs-margin', article]]) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, accounting, insurance, or employment advice/, name);
    assert.match(html, /accept no liability/, name);
  }
});

test('both pages promise, and keep, that nothing is uploaded', () => {
  for (const [name, html] of [['index', index], ['markup-vs-margin', article]]) {
    assert.match(html, /Nothing leaves your browser/, name);
    // The claim is only true if the page makes no request. Any of these would
    // break it, and a promise the code contradicts is worse than no promise.
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not make network requests`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, name);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} must not load a third-party script`);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, `${name} must not load a remote image`);
  }
});

test('the usage counter is opt-out-able and never records a figure', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\)/);
  // The only events recorded are named literals, never a value from the form.
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(events)].sort(), ['link_copied', 'placement_priced']);
});

// The saved-and-shared placement is only trustworthy if it carries every field
// the calculator reads. This repository has already shipped the opposite: a
// `share.mjs` kept its own hand-written field list, the form grew past it, and
// a shared link silently dropped the new fields — the recipient's page priced
// a different job than the sender saw, with nothing on screen to say so. These
// tests pin the derivation (SHARE_SPEC built from ALL_INPUT_IDS/FLAG_IDS)
// rather than a restated list, so a field calc.mjs adds later is covered
// without anyone remembering to.
test('save-and-share is wired to the page', () => {
  assert.match(index, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The placement rides in the URL fragment, never the query string. A query
  // string is sent in the request line a server logs and in the `Referer`
  // header a later off-site click carries; a fragment is sent in neither. On a
  // page that promises nothing you type is uploaded, that is the difference
  // between the claim holding and not.
  assert.match(index, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the shared link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(index),
    'the shared link must not be built with a query string');
  assert.match(index, /search: location\.hash/,
    'the placement must be restored from the fragment, matching how the link is built');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid']) {
    assert.match(index, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  const declaredIds = new Set([...index.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ['copyLink', 'clearSaved', 'restoreNote', 'linkStatus']) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  assert.match(index, /carries your own pay rate, markup, burden rates and payment terms/,
    'the link caution does not name what it carries');
  assert.match(index, /never sent to a server/,
    'the on-page note does not say the link fragment stays client-side');
});

test('the shared link carries every field the form reads, not a hand-kept subset', () => {
  assert.match(index, /numbers:\s*ALL_INPUT_IDS/,
    'SHARE_SPEC must derive its numeric fields from ALL_INPUT_IDS, not a second, hand-kept list');
  assert.match(index, /flags:\s*FLAG_IDS/,
    'SHARE_SPEC must derive its checkboxes from FLAG_IDS, not a second, hand-kept list');
  const flagMatch = index.match(/const FLAG_IDS = (\[[^\]]*\])/);
  assert.ok(flagMatch, 'FLAG_IDS is not declared');
  assert.deepEqual(JSON.parse(flagMatch[1].replace(/'/g, '"')), ['compExcludesOtPremium'],
    'FLAG_IDS must list every checkbox readInput() reads');
});

test('the sponsor link is present, honest, and optional', () => {
  assert.match(index, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(index, /entirely optional and never changes what the tool does/);
});

test('the pages link to each other and out to related tools', () => {
  assert.match(index, /href="\.\/markup-vs-margin\.html"/, 'the tool links to its article');
  assert.match(article, /href="\.\/"/, 'the article links back to the tool');
  // Sitemap enumeration is unavailable on the current origin, so an internal
  // link is the only way a crawler or a reader arrives at a sibling tool.
  for (const slug of ['shop-rate-calculator', 'certified-payroll-calculator']) {
    assert.ok(index.includes(`../${slug}/`), `index should link to ${slug}`);
    assert.ok(article.includes(`../${slug}/`), `the article should link to ${slug}`);
  }
});

test('the headline figures in the copy are the ones the calculator produces', () => {
  const result = calculatePlacement(defaultsFromPage());
  const oneDp = (n) => n.toFixed(1);

  // Both pages state these; if a default moves, the sentence has to move too.
  const claims = [
    [oneDp(result.grossMarginPercent), 'the real gross margin'],
    [oneDp(result.breakEvenMarkupPercent), 'the break-even markup'],
    [oneDp(result.targetMarkupPercent), 'the markup for the target margin'],
    [oneDp(markupToMargin(45)), 'the margin the markup implies'],
  ];
  for (const [figure, what] of claims) {
    assert.ok(article.includes(figure), `markup-vs-margin.html no longer states ${what} (${figure}%)`);
  }
  // And the money figures the article tabulates.
  assert.ok(article.includes(Math.round(result.revenue).toLocaleString('en-US')), 'billings');
  assert.ok(article.includes(Math.round(result.grossProfit).toLocaleString('en-US')), 'gross profit');
  assert.ok(article.includes(result.billRate.toFixed(2)), 'bill rate');
  assert.ok(article.includes(result.loadedCostPerHour.toFixed(2)), 'loaded cost an hour');
  assert.ok(article.includes(result.burdenPerHour.toFixed(2)), 'burden an hour');
});

test('the burden table in the article matches the itemised burden', () => {
  const result = calculatePlacement(defaultsFromPage());
  for (const item of result.burden.items) {
    if (item.amount === 0) continue;
    const rounded = Math.round(item.amount).toLocaleString('en-US');
    assert.ok(article.includes(rounded), `the article's burden table is missing ${item.key} ($${rounded})`);
  }
  assert.ok(article.includes(Math.round(result.burden.total).toLocaleString('en-US')), 'burden total');
});

test('the FAQ answers on the tool page do not contradict the arithmetic', () => {
  const result = calculatePlacement(defaultsFromPage());
  const faq = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0];
  assert.ok(faq.includes(result.grossMarginPercent.toFixed(1)), 'the FAQ quotes a margin the calculator no longer produces');
  assert.ok(faq.includes(result.breakEvenMarkupPercent.toFixed(1)), 'the FAQ quotes a stale break-even markup');
  assert.ok(faq.includes(result.targetMarkupPercent.toFixed(1)), 'the FAQ quotes a stale target markup');
});

test('the pages are structured for a reader and a crawler', () => {
  for (const [name, html] of [['index', index], ['markup-vs-margin', article]]) {
    assert.match(html, /<html lang="en">/, name);
    assert.match(html, /<meta name="viewport"/, name);
    assert.match(html, /<link rel="canonical"/, name);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/, `${name} needs a real description`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${name} needs exactly one h1`);
    assert.match(html, /"@type":"FAQPage"/, `${name} should carry question-shaped structured data`);
  }
  assert.match(index, /"@type":"SoftwareApplication"/);
});

test('the structured data on both pages is valid JSON', () => {
  for (const [name, html] of [['index', index], ['markup-vs-margin', article]]) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length > 0, `${name} has no structured data`);
    for (const [, body] of blocks) {
      assert.doesNotThrow(() => JSON.parse(body), `${name} has a malformed JSON-LD block`);
    }
  }
});

test('every FAQ question is asked once', () => {
  for (const [name, html] of [['index', index], ['markup-vs-margin', article]]) {
    const names = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(names.length >= 5, `${name} should answer at least five questions`);
    assert.equal(new Set(names).size, names.length, `${name} repeats a question`);
  }
});

test('the result panel has an empty state and announces changes', () => {
  assert.match(index, /aria-live="polite"/);
  assert.match(index, /id="emptyState"/);
  assert.match(index, /id="errors"/);
  // An invalid field is marked for assistive technology, not only in colour.
  assert.match(index, /setAttribute\('aria-invalid', 'true'\)/);
});

test('every input on the form has an accessible name', () => {
  // The catalogue shipped 48 axe `label` violations once by putting bare
  // inputs in a table; every control here is inside its own <label>.
  const inputs = [...index.matchAll(/<input [^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 15);
  for (const input of inputs) {
    const id = input.match(/id="([^"]+)"/)?.[1];
    assert.ok(id, `an input has no id: ${input}`);
    const wrapped = new RegExp(`<label[^>]*>[^<]*(?:<[^>]+>[^<]*)*?<input id="${id}"`).test(index);
    const labelled = new RegExp(`<label[^>]*for="${id}"`).test(index) || /aria-label=/.test(input);
    assert.ok(wrapped || labelled, `#${id} has no accessible name`);
  }
});
