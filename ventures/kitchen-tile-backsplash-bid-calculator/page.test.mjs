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
const seo = readFileSync(new URL('./how-much-to-charge-for-a-kitchen-tile-backsplash.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareScope/, 'scope comparison is missing from the executable script');
  assert.match(scriptSource, /comparePattern/, 'pattern comparison is missing from the executable script');
  assert.match(scriptSource, /leftoverBoxPlan/, 'leftover-box plan is missing from the executable script');
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
    'scope', 'pattern', 'wall', 'wallSf', 'outlets', 'travelMiles',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'compare', 'patterns', 'copySummary', 'usageOptOut', 'jobPresets',
    'sfPerBox', 'leftoverBoxes', 'secondWallSf', 'boxesToBuy', 'leftoverAfter', 'boxVerdict',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Kitchen Tile Backsplash Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*backsplash/i);
  assert.match(html, /Bid the wall, the pattern, and the extras/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /Same wall, four patterns/);
  assert.match(html, /vs subway/);
  assert.match(html, /Leftover boxes and the next wall/);
  assert.match(html, /leftoverBoxPlan/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not tile-specification, waterproofing, building-code, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge for a kitchen tile backsplash/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /tile-only/i);
  assert.match(seo, /Subway versus herringbone on the same wall/i);
  assert.match(seo, /Leftover boxes do not automatically cover the laundry wall/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});
