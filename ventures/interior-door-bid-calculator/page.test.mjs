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
