import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { readdirSync } from 'node:fs';
import { MAX_ITEMS, VISIBLE_ITEMS } from './app.mjs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Cash Runway Planner/);
  assert.match(html, /No warranty/);
  assert.match(html, /not financial, tax, or legal advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /app\.mjs/);
  assert.match(html, /Download CSV/);
  assert.match(html, /id="share"[^>]*>Copy share link/);
  assert.match(html, /id="shareStatus"/);
});

test('the page carries every one-off row the module reads', () => {
  // app.mjs reads item1..itemMAX by name. A row missing from the page is a
  // payment a visitor can never enter; a row past MAX_ITEMS is one they can
  // type into and that the forecast would silently ignore.
  for (let index = 1; index <= MAX_ITEMS; index += 1) {
    assert.match(html, new RegExp(`id="item-row-${index}"`), `row ${index} missing`);
    for (const field of ['Name', 'Amount', 'Week', 'Kind', 'Repeat']) {
      assert.match(html, new RegExp(`name="item${index}${field}"`), `item${index}${field} missing`);
    }
  }
  assert.doesNotMatch(html, new RegExp(`name="item${MAX_ITEMS + 1}Amount"`));
});

test('rows past the visible ones start hidden, behind the add button', () => {
  const hidden = [...html.matchAll(/id="item-row-(\d+)"([^>]*)>/g)]
    .filter(([, , attrs]) => attrs.includes('hidden')).map(([, index]) => Number(index));
  assert.deepEqual(hidden, Array.from({ length: MAX_ITEMS - VISIBLE_ITEMS }, (_, i) => VISIBLE_ITEMS + 1 + i));
  assert.match(html, /id="add-item" type="button"/);
});

test('the forecast length is settable, because a quarterly bill is 13 weeks out', () => {
  assert.match(html, /name="weeks"[^>]*max="52"/);
});

test('the feature names itself where an answer engine reads', () => {
  // featureList is what a search or answer engine reads when someone asks for
  // a tool that plans around a tax bill. A capability absent from it is
  // invisible to the only channel that brings this page traffic.
  const [, features] = html.match(/"featureList"\s*:\s*"([^"]+)"/) ?? [];
  assert.ok(features, 'no featureList in the structured data');
  assert.match(features, /one-off/i);
  assert.match(features, /tax/i);
});

// Regression: sitemap.xml was missing when-will-i-run-out-of-cash.html, a
// real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: adjacent steps in one job. That tool produces the date an
// invoice actually pays, which is the input this forecast consumes. Rotating
// chrome may never pair them inside the back-office subcategory.
test('index links one hop to the invoice-payment-terms-calculator sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/invoice\-payment\-terms\-calculator\/"/,
    'index must link ../invoice-payment-terms-calculator/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /invoice payment terms calculator/i);
});
