import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(new URL('./is-it-safe-to-delete-this-branch.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  // This venture shipped for weeks as prose with no form controls: a visitor
  // arriving from search met a page describing a CLI they could not run. The
  // sweep classified it `links-only`. These assertions are what stops that
  // regressing to a brochure again.
  assert.match(index, /<textarea/);
  assert.match(index, /id="run"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /scan\.mjs/);
  assert.match(index, /examples\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded|Nothing was uploaded|nothing is uploaded/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test('the page never asserts that a branch is safe to delete', () => {
  // The one claim this product must not make. Guarded as the assertive forms
  // only — the page deliberately *asks* "is it safe to delete this Git branch?",
  // which is the search query it ranks for, so a blanket ban on the phrase would
  // forbid the honest question along with the dishonest answer.
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+(?:safe\s+to\s+delete|cleared\s+(?:for|to)\s+delet\w*)/gi;
  for (const match of prose.matchAll(claims)) {
    // A denial ("it never says a branch is safe to delete") states the promise
    // rather than breaking it, so the guard looks back for the negation instead
    // of banning the words outright.
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    // The title and FAQ headings pose this as the visitor's own question, which
    // is the search intent the page answers honestly below it.
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified safety claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not permission to delete a ref/);
});

test('the page tells the visitor how to produce a snapshot', () => {
  // Without this the tool is unusable: a browser cannot read commit ancestry,
  // so the page is only reachable value if it names the command that emits one.
  assert.match(index, /--emit-snapshot/);
  assert.match(index, /gh pr list/);
  assert.match(index, /--pr-json/);
});

test('secondary FAQ answers the search question without a warranty', () => {
  assert.match(secondary, /safe to delete/i);
  assert.match(secondary, /FAQPage/);
  assert.match(secondary, /No warranty/);
  assert.match(secondary, /no SLA/i);
});

// Regression: sitemap.xml was missing is-it-safe-to-delete-this-branch.html,
// a real page linked from index.html, so a crawler following robots.txt ->
// sitemap.xml never discovered it. Same defect class fixed for
// public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

import { readFileSync as readIndexForSiblingCheck } from 'node:fs';

// Closest sibling: the same developer on the same repository, in the browser
// with nothing uploaded — shipped dependencies there, stale branches here.
// Rotating chrome may never pair them, so link explicitly.
test('index links one hop to the npm-deployment-evidence sibling', () => {
  const siblingHtml = readIndexForSiblingCheck(
    new URL('./index.html', import.meta.url),
    'utf8',
  );
  assert.match(
    siblingHtml,
    /href="\.\.\/npm\-deployment\-evidence\/"/,
    'index must link ../npm-deployment-evidence/ so a crawler reaches that tool in one hop',
  );
  assert.match(siblingHtml, /npm deployment evidence/i);
});
