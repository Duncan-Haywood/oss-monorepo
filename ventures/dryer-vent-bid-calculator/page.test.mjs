// Structural tests for index.html and the SEO article.
//
// calc.test.mjs stays green if the page never executes. These checks are
// dependency-free (no jsdom) so CI stays a plain `node --test`. They catch
// the class of defect that actually shipped on another calculator: an
// unclosed raw-text element that swallowed the app script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-to-charge-for-dryer-vent-cleaning.html', import.meta.url), 'utf8');

const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed by an earlier element');
  assert.match(scriptSource, /calculateBid/, 'the app script did not parse as a script element');
  assert.match(scriptSource, /formatBidSummary/, 'copy-summary helper is missing from the executable script');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/el\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('inputs and result fields for the primary journey are present', () => {
  for (const id of [
    'stories', 'runFeet', 'extraDryers', 'jobType',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'copySummary', 'usageOptOut', 'jobPresets', 'copyLink',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the shareable bid link is wired to the same fields the form actually reads', () => {
  assert.match(scriptSource, /from '.\/share\.mjs'/, 'share.mjs is not imported');
  assert.match(scriptSource, /encodeInputs\(readInput\(\)\)/, 'copyLink does not encode the form\'s own reader');
  assert.match(scriptSource, /decodeInputs\(incoming\.payload\)/, 'restoreShare does not decode the incoming link');
  assert.match(scriptSource, /restoreShare\(\);/, 'restoreShare is never called on load, so a pasted link never opens');
  // The five proposal terms (deposit, valid days, exclusions, payment terms,
  // notes) ride beside the venture's own payload -- see proposal-terms.mjs --
  // so a shared link cannot silently reopen at the venture's default deposit
  // while the recipient's printed proposal quotes a different number than the
  // sender's screen, the defect class documented in platform/proposal/README.md.
  assert.match(scriptSource, /withTerms\(/, 'the link does not carry the proposal terms');
  assert.match(scriptSource, /splitTerms\(/, 'the link cannot separate the terms back out on load');
  assert.match(scriptSource, /applyTerms\(/, 'a link\'s terms are decoded but never written back onto the panel');
  assert.match(scriptSource, /readTerms\(/, 'the link is built without reading the panel\'s own terms');
  assert.match(scriptSource, /overlongTermsNote\(/, 'a term too long to fit in the link is dropped silently');
});

test('the landing page names the problem in the tech\'s words', () => {
  assert.match(html, /<title>[^<]*Dryer Vent Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*stories/i);
  assert.match(html, /Bid the stories, the run, and the roof cap/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not fire-safety, building-code, construction, appliance, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge for dryer vent cleaning/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /stories/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});
