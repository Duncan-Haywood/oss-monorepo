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
  leftoverBoxPlan,
  leftoverBoxNote,
  compareOwnerSupply,
  ownerSupplyNote,
  compareAccess,
  accessNote,
  suggestedScopeKit,
  suggestedPatternKit,
  suggestedWallKit,
  suggestedExtraKit,
} from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-to-charge-for-a-kitchen-tile-backsplash.html', import.meta.url), 'utf8');
const leftoverSeo = readFileSync(new URL('./do-leftover-tile-boxes-cover-the-next-wall.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-customer-supplied-backsplash-tile.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-tile-a-backsplash-after-hours.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /leftoverBoxNote/, 'leftover-box note is missing from the executable script');
  assert.match(scriptSource, /formatBidSummary/, 'copy-summary helper is missing from the executable script');
  assert.match(scriptSource, /formatBoxPlanNote/, 'box-plan copy helper is missing from the executable script');
  assert.match(scriptSource, /compareOwnerSupply/, 'owner-supply comparison is missing from the executable script');
  assert.match(scriptSource, /ownerSupplyNote/, 'owner-supply note is missing from the executable script');
  assert.match(scriptSource, /compareAccess/, 'access comparison is missing from the executable script');
  assert.match(scriptSource, /accessNote/, 'access note is missing from the executable script');
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
    'supply', 'supplyNote', 'access', 'accessNote',
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
  assert.match(html, /leftoverBoxNote/);
  assert.match(html, /do-leftover-tile-boxes-cover-the-next-wall\.html/);
  assert.match(html, /Same wall, who bought the tile/);
  assert.match(html, /should-i-install-customer-supplied-backsplash-tile\.html/);
  assert.match(html, /Same wall, when you can work/);
  assert.match(html, /should-i-tile-a-backsplash-after-hours\.html/);
});

test('leftover SEO page uses the same worked example the tests lock', () => {
  const miss = leftoverBoxPlan({
    wallSf: 30,
    edgeLf: 12,
    outlets: 2,
    scope: 'tile-only',
    pattern: 'subway-running',
    wall: 'painted-drywall',
    travelMiles: 8,
    includeCooktop: false,
    includeSchluter: false,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...suggestedScopeKit('tile-only'),
    ...suggestedPatternKit('subway-running'),
    ...suggestedWallKit('painted-drywall'),
    ...suggestedExtraKit(),
    sfPerBox: 10,
    leftoverBoxes: 0,
    secondWallSf: 8,
  });
  assert.equal(miss.kitchenNeedSf, 33);
  assert.equal(miss.boxesToBuy, 4);
  assert.ok(Math.abs(miss.leftoverAfterKitchen - 7) < 1e-9);
  assert.ok(Math.abs(miss.secondNeedSf - 8.8) < 1e-9);
  assert.equal(miss.secondBoxesToBuy, 1);
  assert.match(leftoverSeo, /33 SF/);
  assert.match(leftoverSeo, /four boxes/);
  assert.match(leftoverSeo, /7\.0 SF/);
  assert.match(leftoverSeo, /8\.8 SF/);
  assert.match(leftoverSeo, /1 box/);
  assert.match(leftoverSeo, /6\.6 SF/);
  assert.match(leftoverSeo, /No warranty/);
  assert.match(leftoverSeo, /Best-effort hosting, no SLA/);
  assert.match(leftoverSeo, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(leftoverBoxNote(miss), /does not cover/);
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
  assert.match(seo, /Customer-supplied tile is not a free set/i);
  assert.match(seo, /Saturday is not the weekday bid/i);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the owner-supply article quotes the herringbone demo arithmetic', () => {
  const kit = {
    ...suggestedScopeKit('demo-and-replace'),
    ...suggestedPatternKit('herringbone'),
    ...suggestedWallKit('existing-tile'),
    ...suggestedExtraKit(),
  };
  const rows = compareOwnerSupply({
    wallSf: 42,
    edgeLf: 18,
    outlets: 6,
    scope: 'demo-and-replace',
    pattern: 'herringbone',
    wall: 'existing-tile',
    travelMiles: 16,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  }, { installOnlyPrice: 1470 });
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  assert.ok(you.installOnly.belowBreakEven);
  assert.ok(covers.installOnly.belowBreakEven);
  assert.match(ownerSupplyNote(rows), /\$2,698\.84/);
  assert.match(supplySeo, /Should I install customer-supplied backsplash tile/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$1,470/);
  assert.match(supplySeo, /\$2,698\.84/);
  assert.match(supplySeo, /\$3,858\.00/);
  assert.match(supplySeo, /short \/ wrong lot/i);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /No warranty/);
  assert.match(supplySeo, /no SLA/i);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the after-hours article quotes the herringbone demo and subway Saturday arithmetic', () => {
  const kit = {
    ...suggestedScopeKit('demo-and-replace'),
    ...suggestedPatternKit('herringbone'),
    ...suggestedWallKit('existing-tile'),
    ...suggestedExtraKit(),
  };
  const rows = compareAccess({
    wallSf: 42,
    edgeLf: 18,
    outlets: 6,
    scope: 'demo-and-replace',
    pattern: 'herringbone',
    wall: 'existing-tile',
    travelMiles: 16,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
    hourlyWage: 38,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 55,
    otherCost: 0,
    ...kit,
  }, { installOnlyPrice: 1470 });
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.ok(empty.installOnly.belowBreakEven);
  assert.ok(afterHours.installOnly.belowBreakEven);
  assert.match(accessNote(rows), /\$4,201\.01/);
  assert.match(accessSeo, /Should I tile a backsplash after hours/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$1,470/);
  assert.match(accessSeo, /\$4,201\.01/);
  assert.match(accessSeo, /\$3,858\.00/);
  assert.match(accessSeo, /\$5,251\.26/);
  assert.match(accessSeo, /\$1,134\.41/);
  assert.match(accessSeo, /\$181\.90/);
  assert.match(accessSeo, /time-and-a-half/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});
