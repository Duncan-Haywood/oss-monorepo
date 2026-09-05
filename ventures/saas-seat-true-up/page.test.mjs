import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('an invalid input clears stale results instead of leaving them next to a silent error', () => {
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only #message with the error sentence and left #unused,
  // #unusedLabel, #utilization, #monthly, #monthlyLabel, #remaining, and
  // #remainingLabel all showing the last valid true-up. A visitor could
  // easily miss the callout text change and read those stale figures as the
  // answer for the inputs now on screen.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/\} catch \(error\) \{([\s\S]*?)\n {4}\}\n {2}\}/);
  assert.ok(catchBlock, 'render() catch block not found');
  const body = catchBlock[1];
  for (const id of ['unused', 'unusedLabel', 'utilization', 'monthly', 'monthlyLabel', 'remaining', 'remainingLabel']) {
    assert.match(
      body,
      new RegExp(`querySelector\\('#${id}'\\)\\.textContent = ''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /querySelector\('#message'\)\.textContent = error\.message/, 'the error message is never shown');
});

// Regression: sitemap.xml carried only the index page -- both
// how-many-unused-saas-seats-am-i-paying-for.html and vs-zylo.html, real
// pages linked from index.html, were missing, so a crawler following
// robots.txt -> sitemap.xml never discovered them. Same defect class fixed
// for public-record-watch in #3289.
test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});
