// Every authored `FAQPage` block must show its Q&A on the page.
//
// Google's structured-data policy requires the question and answer in a
// `FAQPage` to be visible to the visitor on the source page; markup that
// describes content nobody can see is at best ignored and at worst treated as
// spam. `faqEntries()` in build.mjs avoids the problem by *deriving* schema
// from rendered copy, but it only runs for entry pages (`isEntry`), so the
// portfolio's ~190 secondary landing pages author their own JSON-LD by hand --
// and 188 of them shipped with none of it on the page.
//
// This is the guard for that. It is deliberately a whole-portfolio scan rather
// than a per-venture check: the pages are written one at a time by different
// sessions copying whichever neighbour they happened to open, which is exactly
// how the original 188 accumulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectPages } from './clauses.mjs';

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/** Page text as a visitor sees it: no script, no style, no tags. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const squash = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** The [question, answer] pairs a page asserts in JSON-LD. */
function authoredFaq(html) {
  const pairs = [];
  for (const match of html.matchAll(LD)) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      // A malformed block is a different bug; `check.mjs` owns that.
      continue;
    }
    for (const node of [parsed].flat()) {
      if (node?.['@type'] !== 'FAQPage') continue;
      for (const entry of node.mainEntity ?? []) {
        const question = entry?.name;
        const answer = entry?.acceptedAnswer?.text;
        if (question && answer) pairs.push([question, answer]);
      }
    }
  }
  return pairs;
}

test('every authored FAQPage question and answer is visible on its page', async () => {
  const { pages } = await collectPages();
  const offenders = [];
  let checked = 0;

  for (const [displayPath, html] of pages) {
    const pairs = authoredFaq(html);
    if (pairs.length === 0) continue;
    checked += 1;
    const visible = visibleText(html);
    const hidden = pairs.filter(
      ([question, answer]) =>
        !visible.includes(squash(question)) || !visible.includes(squash(answer)),
    );
    if (hidden.length) {
      offenders.push(`${displayPath}: ${hidden.length}/${pairs.length} pair(s) not on the page`);
    }
  }

  assert.ok(checked > 0, 'expected to find pages carrying FAQPage markup');
  assert.deepEqual(
    offenders,
    [],
    `FAQPage markup must be visible to the visitor. Render the question as a heading and ` +
      `the answer as the prose beneath it, using the same strings the JSON-LD carries:\n  ` +
      offenders.join('\n  '),
  );
});

test('visibleText ignores markup, script, and style, and authoredFaq reads only FAQPage', () => {
  const html = `<style>h2{color:red}</style>
    <script>const q = "invisible question";</script>
    <h3>Does it pay?</h3><p>Only above the floor &amp; not below it.</p>
    <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Does it pay?",
       "acceptedAnswer":{"@type":"Answer","text":"Only above the floor & not below it."}}]}</script>`;

  const visible = visibleText(html);
  assert.ok(visible.includes('does it pay?'));
  assert.ok(visible.includes('only above the floor & not below it.'));
  // Script bodies are not visible copy, so a question that only exists there
  // must not count as shown -- that is the loophole this guard exists to close.
  assert.ok(!visible.includes('invisible question'));
  assert.ok(!visible.includes('color:red'));

  const pairs = authoredFaq(html);
  assert.equal(pairs.length, 1, 'BreadcrumbList must not be read as an FAQ');
  assert.deepEqual(pairs[0], ['Does it pay?', 'Only above the floor & not below it.']);
});

test('a page whose FAQ answer is only in JSON-LD is reported', () => {
  const html = `<h3>Does it pay?</h3><p>Sometimes.</p>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Does it pay?",
       "acceptedAnswer":{"@type":"Answer","text":"Only once the floor is cleared."}}]}</script>`;
  const visible = visibleText(html);
  const [[question, answer]] = authoredFaq(html);
  assert.ok(visible.includes(squash(question)), 'the question is shown');
  assert.ok(!visible.includes(squash(answer)), 'the answer is not, so the page must fail the scan');
});
