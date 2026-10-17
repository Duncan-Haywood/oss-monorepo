import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1];

test('a rejected input clears every derived figure instead of leaving a stale audit', () => {
  // Without this, a rejected input overwrote only #message and left
  // #effectiveRate, #passThrough, #markup and both band lines showing the
  // previous statement's split. Nothing on the page says those figures are
  // stale, so they read as the answer for the numbers now in the form.
  assert.ok(script, 'app script not found');
  const catchBlock = script.match(/\} catch \(error\) \{([\s\S]*?)\n {4}\}/);
  assert.ok(catchBlock, 'render() catch block not found');
  const body = catchBlock[1];
  for (const id of ['effectiveRate', 'perTransaction', 'passThrough', 'passThroughBand', 'markup', 'markupBand']) {
    assert.match(body, new RegExp(`'${id}'`), `#${id} is not cleared on a rejected input`);
  }
  assert.match(body, /#notes'\)\.textContent = ''/, 'the per-statement notes are left on screen');
  assert.match(body, /#message'\)\.textContent = error\.message/, 'the error message is never shown');
});

test('the notes list is built with textContent, never innerHTML', () => {
  // auditNotes() interpolates user-entered numbers into its sentences. They
  // are validated as finite numbers before they get there, but assigning any
  // of it through innerHTML would make that validation the only thing
  // standing between a typed value and the DOM.
  assert.ok(script, 'app script not found');
  assert.doesNotMatch(script, /innerHTML/, 'index.html assigns innerHTML somewhere');
  assert.match(script, /item\.textContent = note/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const htmlFiles = readdirSync(new URL('./', import.meta.url)).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('every page carries the no-warranty clause and names what it is not advice about', () => {
  const htmlFiles = readdirSync(new URL('./', import.meta.url)).filter((name) => name.endsWith('.html'));
  assert.ok(htmlFiles.length >= 2);
  for (const name of htmlFiles) {
    const page = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.match(page, /No warranty\./, `${name} is missing the no-warranty clause`);
    assert.match(page, /not financial, accounting, or legal advice/, `${name} does not say what it is not advice about`);
  }
});

test('the estimate is never presented without its band', () => {
  // The product's central honesty claim: a merchant taking a markup figure to
  // their processor needs the range and the reason it is a range, because a
  // precise number they cannot defend is worse than none. If a redesign drops
  // the band from the results panel, the claim in README.md and the FAQ
  // becomes false without any test failing.
  assert.match(html, /id="passThroughBand"/);
  assert.match(html, /id="markupBand"/);
  assert.match(html, /estimate from published card-brand rate ranges/);
});

test('the page offers the usage opt-out and the optional sponsor link', () => {
  assert.match(html, /id="disable"/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /never changes what the tool does/);
});

test('the tool makes no network request', () => {
  // The privacy line promises "there is no network request in the page at
  // all", which is a stronger claim than "we do not upload your data" and is
  // worth a guard rather than a habit.
  assert.ok(script, 'app script not found');
  assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});

// Closest payments sibling: the same merchant, the other half of the job.
// This tool answers "what is card acceptance costing me"; the packet builder
// answers "how do I fight this one disputed charge". Related-tool chrome
// rotates alphabetically inside a subcategory and these two sit in different
// ones, so without an explicit one-hop a crawler here may never reach it.
test('index links one hop to the chargeback-evidence-packet sibling', () => {
  assert.match(
    html,
    /href="\.\.\/chargeback-evidence-packet\/"/,
    'index must link ../chargeback-evidence-packet/ so crawlers reach the chargeback packet builder in one hop',
  );
  assert.match(html, /chargeback evidence packet builder/i);
});

test('index links one hop to the card-surcharge-vs-cash-discount-calculator sibling', () => {
  assert.match(html, /href="\.\.\/card-surcharge-vs-cash-discount-calculator\/"/);
});
