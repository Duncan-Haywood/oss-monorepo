// Every secondary *prose* page ships structured data.
//
// `faqEntries()` in build.mjs derives `FAQPage` schema from rendered copy, but
// it only runs for entry pages (`isEntry`). Secondary landing pages author
// their own JSON-LD by hand, and `faq-visible.test.mjs` guards the pages that
// *have* it -- it skips a page with no JSON-LD at all, because there is
// nothing to compare against the copy. So nothing caught the opposite failure:
// a secondary page shipping no structured data whatsoever.
//
// That gap was real. On 2026-08-30 eight prose explainers -- the pages written
// to answer one high-intent search each ("FBA vs FBM", "why PayPal costs
// more", "how much does DoorDash take from restaurants") -- carried none,
// while their 198 siblings did. They are the portfolio's whole organic-search
// and AI-discovery surface, and they were the pages assistants could parse
// least. Like the 188 invisible-FAQ pages before them, they accumulated one at
// a time, each session copying whichever neighbour it happened to open.
//
// The distinction this makes is prose vs tool. A secondary page carrying form
// controls is an app view -- `3pl-quote-normalizer`'s compare, export, and
// sensitivity screens -- and `FAQPage` markup does not describe it. A page
// with no controls is an article, and an article with no schema is invisible
// to rich results.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectPages } from './clauses.mjs';

/**
 * Interactive controls on the page.
 *
 * The signal is deliberately structural rather than a filename convention:
 * these pages are named for the question they answer, not for what they are,
 * so `compare.html` and `etsy-vs-ebay-fees.html` are indistinguishable by
 * path. What separates them is that one takes input and the other reads.
 */
function controlCount(html) {
  return (html.match(/<(input|select|textarea|button|form)\b/gi) ?? []).length;
}

/** Secondary pages only: entry pages get their schema derived by the builder. */
const isSecondary = (displayPath) => !displayPath.endsWith('/index.html');

test('every secondary prose page ships structured data', async () => {
  const { pages } = await collectPages();
  const offenders = [];
  let checked = 0;

  for (const [displayPath, html] of pages) {
    if (!isSecondary(displayPath)) continue;
    // An app view is exempt: FAQPage markup would describe a form, not an
    // answer, and Google treats schema that misdescribes a page as spam.
    if (controlCount(html) > 0) continue;
    checked += 1;
    if (!html.includes('application/ld+json')) offenders.push(displayPath);
  }

  assert.ok(checked > 0, 'found no secondary prose pages to check — the walk is broken, not the pages');

  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} of ${checked} secondary prose page(s) ship no JSON-LD.\n` +
      `Add a FAQPage block whose Q&A is also visible on the page (faq-visible.test.mjs\n` +
      `enforces the visibility half), following any sibling in the same venture:\n` +
      offenders.map((p) => `  ${p}`).join('\n'),
  );
});
