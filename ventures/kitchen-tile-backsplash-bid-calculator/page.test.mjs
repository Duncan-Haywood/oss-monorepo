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

// The saved-and-shared bid is only trustworthy if it carries every field the
// calculator reads. This repo has already shipped the opposite once: a
// `share.mjs` kept its own hand-written field list, the form grew two fields
// past it, and a shared link silently dropped them — the recipient's page
// computed a different price than the sender had quoted, with nothing on
// screen to say so. These tests pin the derivation rather than the list, so a
// field added to the form is covered without anyone remembering to.
test('save-and-share is wired to the page', () => {
  assert.match(scriptSource, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  // The bid rides in the URL fragment, never the query string. A query string
  // is sent in the request line a server logs and in the `Referer` header a
  // later off-site click carries; a fragment is sent in neither. On a page that
  // promises nothing you type is uploaded, that is the difference between the
  // claim holding and not. Pin it here so a future edit cannot quietly move the
  // bid into `?...` and start leaking the setter's rates.
  assert.match(scriptSource, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the bid link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(scriptSource),
    'the bid link must not be built with a query string');
  assert.match(scriptSource, /search: location\.hash/,
    'the bid must be restored from the fragment, matching how the link is built');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid']) {
    assert.match(scriptSource, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  // What a bid link contains has to be on the page beside the button that
  // makes one. A contractor who pastes it to the customer is handing over
  // their wage, burden, overhead, and margin, and the address bar does not
  // say so. This copy is a guardrail, not decoration — it stays.
  assert.match(html, /A bid link carries your own rates/, 'the bid link does not say what it carries');
  assert.match(html, /wage, burden, overhead, and target margin/, 'the link caution does not name the rates it carries');
  assert.match(html, /The customer should get the price, not the link/, 'the link caution does not say who not to send it to');
  assert.match(html, /never sent to a server/, 'the on-page note does not say the link fragment stays client-side');
  assert.match(html, /Your bid is saved in this browser/, 'the privacy note does not disclose that the bid is stored');
  assert.match(html, /treat one like your rate sheet/, 'the privacy note does not warn what a copied link holds');
});

function idListsIn(source) {
  return new Set([...source.matchAll(/\b([A-Z][A-Z_]*_IDS)\b/g)].map((m) => m[1]));
}

// What the bid link carries is CHOICE_IDS plus BID_SPEC — and either may defer
// to another id list rather than restate it, so resolve one level of that
// before comparing. Reusing an existing list is the correct thing for a
// venture to do; the guard should not push it into keeping a second copy.
function specSource() {
  let out = bodyOf(scriptSource, 'const CHOICE_IDS =') + bodyOf(scriptSource, 'const BID_SPEC =');
  for (const name of idListsIn(out)) {
    if (scriptSource.includes(`const ${name} =`)) out += bodyOf(scriptSource, `const ${name} =`);
  }
  return out;
}

// Returns the declaration at `opener` up to the close of its first bracketed
// body, so a `{...}` object and an `[...]` array both work.
function bodyOf(source, opener) {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, `could not find ${opener} in the script`);
  const first = source.slice(start).search(/[[{]/);
  assert.notEqual(first, -1, `${opener} has no bracketed body`);
  const open = source[start + first];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let i = start + first; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${open}${close} after ${opener}`);
}

test('every field the form reads is a field the bid link carries', () => {
  const read = idListsIn(bodyOf(scriptSource, 'function readInput('));
  const shared = idListsIn(specSource());
  const dropped = [...read].filter((name) => !shared.has(name));
  assert.deepEqual(
    dropped,
    [],
    `readInput() reads ${dropped.join(', ')} but BID_SPEC does not carry them; `
      + 'a shared link would price a different job than the sender saw',
  );
});

test('every select the visitor can set travels as a validated choice', () => {
  // Read the selects out of the markup, not out of the script, so a select
  // added to the form is caught even if nobody touched the wiring. #jobPresets
  // is excluded on purpose: it is a "start from this job" shortcut that writes
  // the other fields, and it holds no state of its own worth carrying.
  const selects = [...markup.matchAll(/<select\s+id="([\w-]+)"/g)]
    .map((m) => m[1])
    .filter((id) => id !== 'jobPresets');
  assert.ok(selects.length > 0, 'no selects found; the markup probably did not parse');
  const carried = specSource();
  for (const id of selects) {
    assert.match(
      carried,
      new RegExp(`'${id}'`),
      `select #${id} is not in CHOICE_IDS, so a shared link would carry it unvalidated or not at all`,
    );
  }
});

// Closest kitchen-remodel sibling: quartz/granite countertops (slabs, cutouts,
// edge, waterfalls) rather than tile wall SF and pattern. Related-tool chrome
// rotates alphabetically inside each subcategory, so without an explicit
// one-hop a crawler on this page may never land on that tool.
test('index links one hop to the countertop-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/countertop-bid-calculator\/"/,
    'index must link ../countertop-bid-calculator/ so crawlers reach the countertop calculator in one hop',
  );
  assert.match(html, /countertop bid calculator/i);
});
