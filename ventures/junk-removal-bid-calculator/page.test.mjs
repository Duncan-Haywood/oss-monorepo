// Structural tests for index.html. These exist because a sibling calculator
// shipped with an unclosed raw-text element that swallowed the app script;
// calc tests stayed green because they import calc.mjs directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
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
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/);
  assert.match(scriptSource, /calculateBid/);
  assert.match(scriptSource, /formatBidSummary/);
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
    'piles', 'addPile', 'truckCapacityCubicYards', 'dumpFeePerTon', 'dumpMinimum',
    'surchargeRate', 'onSiteHours', 'stairsFlights', 'minutesPerFlight',
    'longCarryMinutes', 'oneWayMinutes', 'dumpMinutes', 'crewSize', 'hourlyWage',
    'burdenRate', 'fuelPerJob', 'otherJobCost', 'overheadRate', 'targetMargin',
    'minimumCharge', 'proposedPrice', 'price', 'priceLabel', 'volume', 'tons',
    'dump', 'labor', 'hours', 'overhead', 'cost', 'profit', 'perYard',
    'hourlyRate', 'breakEven', 'loads', 'verdict', 'copySummary', 'summaryStatus',
    'split', 'usageOptOut',
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test('the liability disclaimer and privacy note are real markup', () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Nothing leaves your browser/);
});

test('the landing copy names the search problem before the form', () => {
  assert.match(markup, /dump ticket/);
  assert.match(markup, /<title>Junk Removal Bid Calculator/);
});

// Closest cleaning sibling: same property clear-out, but a household move rather
// than a landfill haul. Related-tool chrome rotates inside the cleaning
// subcategory, so without an explicit one-hop a crawler on this page may never
// land on that tool.
test('index links one hop to the moving-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/moving-bid-calculator\/"/,
    'index must link ../moving-bid-calculator/ so crawlers reach the moving calculator in one hop',
  );
  assert.match(html, /moving company bid calculator/i);
});
