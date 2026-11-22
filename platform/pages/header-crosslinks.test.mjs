// A venture page's header carries at most one note that sends the reader to
// another tool. More "see also" pointers belong in a "Related guides and
// tools" card near the end of the page, where a reader who finished with this
// tool looks for the next one.
//
// WHY: on 2026-11-22 five pages stacked two to five such notes (plus links to
// their own guide pages) between the intro and the form: 4 to 9 phone lines
// each, and none of the five showed its first form field on a 390x844 screen
// (appointment-deposit-calculator's started at 1,613 px). Moving the notes
// into a card before "Common questions" put the field on the first screen on
// all five (median 1,234 -> 775 px) with every link still on the page.
// Privacy notes ("Nothing is uploaded") stay in the header.
// Report: docs/reports/polish-2026-11-22-header-crosslinks.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENTURES = join(ROOT, 'ventures');
export const MAX_HEADER_CROSSLINK_NOTES = 1;

/** How many `p.note` in the page's first <header> link to another venture. */
export function headerCrosslinkNotes(html) {
  const header = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html);
  if (!header) return 0;
  const notes = header[1].match(/<p class="note"[^>]*>[\s\S]*?<\/p>/g) || [];
  return notes.filter((n) => /href="\.\.\/[a-z0-9-]+\/[^"]*"/.test(n) && !/Nothing is uploaded/.test(n)).length;
}

/**
 * The same count for pages with no <header>: the muted `p.privacy` notes
 * between <main> and its first <section> (the lede above the tool's first card).
 * WHY: on 2026-11-22 the 1099 pair stacked 2 and 3 such notes there
 * (polish-2026-11-22-lede-crosslinks.md); the header check did not see them.
 */
export function ledeCrosslinkNotes(html) {
  const lede = /<main\b[^>]*>([\s\S]*?)<section\b/.exec(html);
  if (!lede) return 0;
  const notes = lede[1].match(/<p class="privacy"[^>]*>[\s\S]*?<\/p>/g) || [];
  return notes.filter((n) => /href="\.\.\/[a-z0-9-]+\/[^"]*"/.test(n) && !/Nothing is uploaded/.test(n)).length;
}

test('ledeCrosslinkNotes counts privacy notes before the first card only', () => {
  const html = '<main><h1>x</h1><p class="privacy">See <a href="../a/">a</a>.</p><p class="privacy">Or <a href="../b/">b</a>.</p>'
    + '<p class="privacy">Nothing is uploaded; <a href="../c/">c</a>.</p><section class="card"><p class="privacy"><a href="../d/">d</a></p></section></main>';
  assert.equal(ledeCrosslinkNotes(html), 2);
  assert.equal(ledeCrosslinkNotes('<main><section></section></main>'), 0);
});

test('headerCrosslinkNotes counts only notes that point at another tool', () => {
  const html = '<header><p class="note">Nothing is uploaded. See <a href="../x/">x</a>.</p>'
    + '<p class="note">Also <a href="../a-b/">a</a>.</p><p class="note"><a href="guide.html">own guide</a></p>'
    + '<p class="note">Or <a href="../c/page.html">c</a>.</p></header><main><p class="note"><a href="../d/">d</a></p></main>';
  assert.equal(headerCrosslinkNotes(html), 2);
  assert.equal(headerCrosslinkNotes('<main></main>'), 0);
});

test(`no venture header stacks more than ${MAX_HEADER_CROSSLINK_NOTES} cross-tool note above the tool`, () => {
  const over = [];
  for (const slug of readdirSync(VENTURES)) {
    const p = join(VENTURES, slug, 'index.html');
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    const n = Math.max(headerCrosslinkNotes(html), ledeCrosslinkNotes(html));
    if (n > MAX_HEADER_CROSSLINK_NOTES) over.push(`${slug}: ${n}`);
  }
  assert.deepEqual(over, [], 'move the extra "see also" notes into a "Related guides and tools" card before "Common questions"');
});

/**
 * Every paragraph in the first <header> whose job is a link: to another tool
 * (`../slug/`) or to the page's own guide and comparison pages (`*.html`),
 * whatever its class (`p.note`, `p.lede`, `p.seo-link`, `p.tagline`, `p.fine`).
 * The answer lead (`data-answer-lead`, kept for answer engines) and privacy
 * notes are not counted.
 * WHY: on 2026-11-22 six pages stacked 3 to 5 such paragraphs above the tool
 * (polish-2026-11-22-related-links-cards.md); `headerCrosslinkNotes` saw only
 * `p.note` with a cross-tool link, so none of them failed it.
 */
export const MAX_HEADER_LINK_PARAGRAPHS = 2;
export function headerLinkParagraphs(html) {
  const header = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html);
  if (!header) return 0;
  const paras = header[1].match(/<p\b(?![^>]*data-answer-lead)[^>]*>[\s\S]*?<\/p>/g) || [];
  return paras.filter((p) => /href="(\.\.\/[a-z0-9-]+\/[^"]*|(\.\/)?[a-z0-9-]+\.html)"/.test(p)
    && !/[Nn]othing is uploaded|never leaves/.test(p)).length;
}

test('headerLinkParagraphs counts link paragraphs of any class, not the answer lead', () => {
  const html = '<header><p class="answer-source" data-answer-lead>Fact. <a href="guide.html">g</a></p>'
    + '<p class="seo-link"><a href="vs-x.html">vs x</a></p><p class="tagline">Or <a href="../b/">b</a>.</p>'
    + '<p>Plain lede, no link.</p><p class="note">Nothing is uploaded. <a href="../c/">c</a></p>'
    + '<p class="fine"><a href="./how.html">how</a></p></header><p><a href="y.html">y</a></p>';
  assert.equal(headerLinkParagraphs(html), 3);
  assert.equal(headerLinkParagraphs('<main></main>'), 0);
});

test(`no venture header stacks more than ${MAX_HEADER_LINK_PARAGRAPHS} link paragraphs above the tool`, () => {
  const over = [];
  for (const slug of readdirSync(VENTURES)) {
    const p = join(VENTURES, slug, 'index.html');
    if (!existsSync(p)) continue;
    const n = headerLinkParagraphs(readFileSync(p, 'utf8'));
    if (n > MAX_HEADER_LINK_PARAGRAPHS) over.push(`${slug}: ${n}`);
  }
  assert.deepEqual(over, [], 'move the guide and "see also" paragraphs into a "Related guides and tools" card before "Common questions"');
});
