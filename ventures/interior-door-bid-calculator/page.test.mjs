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
  suggestedScopeKit,
  suggestedDoorKit,
  suggestedSizeKit,
  suggestedExtraKit,
} from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-to-charge-to-replace-interior-doors.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-hang-a-customer-supplied-door.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-hang-doors-on-saturday.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareDoor/, 'leaf comparison is missing from the executable script');
  assert.match(scriptSource, /compareOwnerSupply/, 'owner-supply comparison is missing from the executable script');
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
    'scope', 'door', 'size', 'doorCount', 'travelMiles',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'compare', 'doors', 'supply', 'supplyNote', 'access', 'accessNote', 'copySummary', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Interior Door Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*interior door/i);
  assert.match(html, /Bid the opening, the leaf, and the extras/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /Same opening, four leaves/);
  assert.match(html, /vs hollow slab/);
  assert.match(html, /should-i-hang-a-customer-supplied-door\.html/);
  assert.match(html, /should-i-hang-doors-on-saturday\.html/);
  assert.match(html, /Same opening, who bought the leaf/);
  assert.match(html, /Same opening, when you can work/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not building-code, fire-rating, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to replace interior doors/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /hang-only/i);
  assert.match(seo, /Hollow slab versus solid-core on the same opening/i);
  assert.match(seo, /Customer-supplied leaves are not a free hang/i);
  assert.match(seo, /Saturday is not the weekday bid/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the hang-only SEO article answers the customer-supplied question', () => {
  assert.match(supplySeo, /Should I hang a customer-supplied door/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$150/);
  assert.match(supplySeo, /index\.html/);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the Saturday article quotes the hollow-slab hang and pocket-conversion arithmetic', () => {
  const kit = {
    ...suggestedScopeKit('hang-only'),
    ...suggestedDoorKit('hollow-slab'),
    ...suggestedSizeKit('80-single'),
    ...suggestedExtraKit(),
  };
  const rows = compareAccess({
    doorCount: 1,
    scope: 'hang-only',
    door: 'hollow-slab',
    size: '80-single',
    travelMiles: 6,
    includePaint: false,
    includeHaul: false,
    includeHardware: false,
    hourlyWage: 42,
    burdenRate: 30,
    overheadRate: 15,
    targetMargin: 20,
    travelAndEquipment: 45,
    otherCost: 0,
    ...kit,
  }, { hangOnlyPrice: 349 });
  const afterHours = rows.find((row) => row.access === 'after-hours');
  assert.equal(afterHours.hangOnly.belowBreakEven, true);
  assert.match(accessNote(rows), /\$70\.19/);
  assert.match(accessSeo, /Should I hang doors on Saturday/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$349/);
  assert.match(accessSeo, /\$70\.19/);
  assert.match(accessSeo, /\$419\.19/);
  assert.match(accessSeo, /\$339\.14/);
  assert.match(accessSeo, /\$523\.98/);
  assert.match(accessSeo, /\$2,823\.66/);
  assert.match(accessSeo, /\$3,360\.52/);
  assert.match(accessSeo, /\$2,688\.41/);
  assert.match(accessSeo, /\$150/);
  assert.match(accessSeo, /time-and-a-half/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});

test('the bid link is wired into the page', () => {
  // The link is what lets a contractor come back to a bid tomorrow, or hand
  // it to whoever prices with them. Losing any one of these four pieces
  // breaks that quietly: the button disappears, or it copies a URL nothing
  // reads back.
  assert.match(html, /id="copyBidLink"/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /restoreSharedBid\(\)/);
  assert.match(html, /bid_link_copied/);
  assert.match(html, /bid_link_opened/);
  // The privacy claim on the page has to stay true: the fragment is the only
  // place the numbers may go, because a query string reaches the server.
  assert.match(html, /never send to a server/);
});
