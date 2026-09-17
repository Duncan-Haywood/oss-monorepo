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
const seo = readFileSync(new URL('./how-much-to-charge-for-spray-foam-insulation.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareCellBids/, 'cell comparison is missing from the executable script');
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
    'area', 'cell', 'pitch', 'barrier', 'lengthFeet', 'widthFeet', 'thicknessInches',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'copySummary', 'usageOptOut', 'jobPresets', 'cellCompare',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the shop\'s words', () => {
  assert.match(html, /<title>[^<]*Spray Foam Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*attic-square-foot special/i);
  assert.match(html, /Bid the board feet, the rim, and the coating/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not construction, legal, tax, financial, or engineering advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge for spray foam insulation/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /board feet/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the rim fields are guarded before they reach a function that throws', () => {
  // `suggestedRimBf` rejects a negative with a throw, `applyGeometryKits` runs
  // before `update()` in every handler that calls it, and a throw there means
  // `update()` never runs. Measured in Chromium: a typed minus sign in the rim
  // height left an uncaught error in the console and froze every derived
  // board-foot figure on the form. The plane fields have always returned early
  // instead; these do now too.
  const kits = scriptSource.slice(scriptSource.indexOf('function applyGeometryKits'));
  const body = kits.slice(0, kits.indexOf('function readInput'));
  const guard = body.indexOf('[rimLf, rimHeight, rimThickness].every(Number.isFinite)');
  assert.ok(guard > -1, 'the rim inputs are read straight into suggestedRimBf');
  assert.ok(guard < body.indexOf('suggestedRimBf('), 'the guard must come before the call');
  assert.match(body, /rimLf < 0 \|\| rimHeight < 0 \|\| rimThickness < 0/);
});

// Closest sibling: same insulation trade, but blown-in attic bags / R-delta
// rather than spray-foam board feet. Related-tool chrome rotates inside the
// subcategory, so without an explicit one-hop a crawler on this page may never
// land on that tool.
test('index links one hop to the attic-insulation-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/attic-insulation-bid-calculator\/"/,
    'index must link ../attic-insulation-bid-calculator/ so crawlers reach the blown-in attic calculator in one hop',
  );
  assert.match(html, /attic insulation bid calculator/i);
});
