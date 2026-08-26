// Structural tests for index.html and the SEO article.
//
// calc.test.mjs stays green if the page never executes. These checks are
// dependency-free (no jsdom) so CI stays a plain `node --test`. They catch
// the class of defect that actually shipped on another calculator: an
// unclosed raw-text element that swallowed the app script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compareAccess,
  accessNote,
  suggestedRailKit,
  suggestedChairKit,
  suggestedAttachKit,
  suggestedExtraKit,
} from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-to-charge-to-install-a-stair-lift.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-a-customer-supplied-stair-lift.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-expedite-a-stair-lift-for-hospital-discharge.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareRail/, 'rail comparison is missing from the executable script');
  assert.match(scriptSource, /compareChair/, 'chair comparison is missing from the executable script');
  assert.match(scriptSource, /compareOwnerSupply/, 'owner-supply comparison is missing from the executable script');
  assert.match(scriptSource, /ownerSupplyNote/, 'owner-supply verdict is missing from the executable script');
  assert.match(scriptSource, /compareAccess/, 'access comparison is missing from the executable script');
  assert.match(scriptSource, /accessNote/, 'access verdict is missing from the executable script');
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
    'rail', 'chair', 'attach', 'liftCount', 'travelMiles',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'compare', 'chairs', 'supply', 'supplyNote', 'access', 'accessNote', 'copySummary', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Stair Lift Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*stair lift/i);
  assert.match(html, /Bid the rail, the chair, and the extras/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /Same stair, five chairs/);
  assert.match(html, /vs standard/);
  assert.match(html, /Same stair, who bought the lift/);
  assert.match(html, /should-i-install-a-customer-supplied-stair-lift\.html/);
  assert.match(html, /Same stair, when they need it/);
  assert.match(html, /should-i-expedite-a-stair-lift-for-hospital-discharge\.html/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not building-code, accessibility, medical-device, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and points back to the calculator', () => {
  assert.match(seo, /How much to charge to install a stair lift/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /index.html/);
  assert.match(seo, /\$3,995/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /wheelchair ramp/i);
  assert.match(seo, /should-i-install-a-customer-supplied-stair-lift\.html/);
  assert.match(seo, /Hospital discharge is not the weekday bid/);
  assert.match(seo, /should-i-expedite-a-stair-lift-for-hospital-discharge\.html/);
});

test('the owner-supply article answers the search phrase and stays crawlable', () => {
  assert.match(supplySeo, /Should I install a customer-supplied stair lift/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$795/);
  assert.match(supplySeo, /wrong rail/i);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /No warranty/);
  assert.match(supplySeo, /no SLA/i);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the landing page links the customer-supplied lift question', () => {
  assert.match(html, /should-i-install-a-customer-supplied-stair-lift\.html/);
});

test('the discharge article quotes the cheap-special and curved-rail arithmetic', () => {
  const kit = {
    ...suggestedRailKit('straight-one'),
    ...suggestedChairKit('standard'),
    ...suggestedAttachKit('wood'),
    ...suggestedExtraKit(),
  };
  const rows = compareAccess({
    liftCount: 1,
    rail: 'straight-one',
    chair: 'standard',
    attach: 'wood',
    travelMiles: 8,
    includeFoldingRail: false,
    includeExtraCharge: false,
    includeCircuit: false,
    includeRemoveExisting: false,
    includePermit: false,
    includeWeatherKit: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 95,
    otherCost: 0,
    ...kit,
  }, { installOnlyPrice: 4500 });
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(afterHours.installOnly.belowBreakEven, true);
  assert.match(accessNote(rows), /\$854\.39/);
  assert.match(accessSeo, /Should I expedite a stair lift for hospital discharge/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$4,500/);
  assert.match(accessSeo, /\$854\.39/);
  assert.match(accessSeo, /\$5,354\.39/);
  assert.match(accessSeo, /\$5,333\.37/);
  assert.match(accessSeo, /\$6,190\.67/);
  assert.match(accessSeo, /\$6,692\.99/);
  assert.match(accessSeo, /\$20,983\.85/);
  assert.match(accessSeo, /\$23,222\.14/);
  assert.match(accessSeo, /\$18,577\.71/);
  assert.match(accessSeo, /\$3,995/);
  assert.match(accessSeo, /next-day/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});
