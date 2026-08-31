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
import { decodeEntities } from './entities.mjs';

const LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

/**
 * Tags that mark up part of a word rather than ending one.
 *
 * Phrasing content only. A block tag stays a separator, because sibling cells
 * and list items can abut in the source with no whitespace between them
 * (`</td><td>`), and running those together would invent words.
 */
const INLINE = [
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i',
  'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
  'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
];

/**
 * Page text as a visitor sees it: no script, no style, no tags.
 *
 * Entities are decoded through the shared table rather than a short local
 * list. The JSON-LD carries real characters (`τ`, `µ`, `“`) while the page
 * spells them `&tau;`, `&micro;`, `&ldquo;`, so a decoder that stops at six
 * names reports visible copy as missing -- which is exactly how this check
 * spent its time red on `rc-time-calculator`.
 */
function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      // Inline tags close up rather than separating, because they mark up a
      // word rather than ending one: `V<sub>out</sub>` reads "Vout" to a
      // visitor, and replacing the tags with spaces made it "V out" -- a
      // divergence report against copy that is on the page and correct. Any
      // real gap between two inline runs is a space in the source, which
      // survives this.
      .replace(new RegExp(`</?(?:${INLINE.join('|')})\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi'), '')
      .replace(/<[^>]+>/g, ' '),
  )
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

/**
 * Where an authored string stops matching the page, or `null` if it matches.
 *
 * A bare `includes` failure says only that a pair is missing, which reads as
 * "this FAQ is not written on the page" -- so a session that hits it tends to
 * rewrite prose that is already there, word for word. In practice the copy is
 * usually present and one character apart: `--` in the JSON-LD against the em
 * dash the page renders, a straight quote against a curly one. The longest
 * prefix that *does* match points at that character directly.
 *
 * Prefix matching is monotone -- if a prefix of length n is present so is
 * every shorter one -- so the boundary can be found by bisection rather than
 * by scanning a 500-character answer one character at a time.
 */
function divergence(needle, haystack) {
  if (haystack.includes(needle)) return null;
  let low = 0;
  let high = needle.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (haystack.includes(needle.slice(0, mid))) low = mid;
    else high = mid - 1;
  }
  const matched = needle.slice(0, low);
  // With no common prefix there is no anchor, and `indexOf('')` would answer 0
  // -- quoting the top of the page as though the text diverged there.
  const at = matched ? haystack.indexOf(matched) : -1;
  const window = 24;
  return {
    index: low,
    authored: `${matched.slice(-window)}${needle.slice(low, low + window)}`,
    onPage: at === -1 ? '' : haystack.slice(Math.max(0, at + low - window), at + low + window),
  };
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
    const notes = [];
    for (const [question, answer] of pairs) {
      for (const [role, text] of [
        ['question', question],
        ['answer', answer],
      ]) {
        const gap = divergence(squash(text), visible);
        if (!gap) continue;
        notes.push(
          `${role} of "${squash(question).slice(0, 60)}" diverges after ${gap.index} char(s)\n` +
            `      JSON-LD: …${gap.authored}…\n` +
            `      on page: …${gap.onPage}…`,
        );
      }
    }
    if (notes.length) offenders.push(`${displayPath}\n    ${notes.join('\n    ')}`);
  }

  assert.ok(checked > 0, 'expected to find pages carrying FAQPage markup');
  assert.deepEqual(
    offenders,
    [],
    `FAQPage markup must be visible to the visitor. Render the question as a heading and ` +
      `the answer as the prose beneath it, using the same strings the JSON-LD carries. ` +
      `Where the two lines below differ by punctuation only, the copy is already on the ` +
      `page and it is the JSON-LD that needs correcting:\n  ` +
      offenders.join('\n  '),
  );
});

test('divergence points at the character where the JSON-LD leaves the page', () => {
  const onPage = 'the volume where savings — and the gap — cancel out';
  const authored = 'the volume where savings -- and the gap -- cancel out';

  assert.equal(divergence(onPage, onPage), null, 'an exact match has no divergence');

  const gap = divergence(authored, onPage);
  assert.equal(gap.index, 'the volume where savings '.length);
  // The report has to show both sides at the same offset, or it cannot
  // distinguish "punctuation differs" from "this sentence is absent".
  assert.ok(gap.authored.includes('savings --'), gap.authored);
  assert.ok(gap.onPage.includes('savings —'), gap.onPage);

  // A genuinely absent answer still reports. Nothing matches from the first
  // character, which is what tells a reader "write this copy" rather than
  // "correct this punctuation".
  const absent = divergence('zebra crossing', onPage);
  assert.equal(absent.index, 0);
  assert.equal(absent.onPage, '');
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
