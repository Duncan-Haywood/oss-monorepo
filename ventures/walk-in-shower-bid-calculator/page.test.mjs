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
const seo = readFileSync(new URL('./how-much-to-charge-to-install-a-walk-in-shower.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-customer-supplied-tile.html', import.meta.url), 'utf8');
const scopeSeo = readFileSync(new URL('./should-i-match-an-alcove-price-on-a-curbless-walk-in.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-tile-a-walk-in-shower-after-hours.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareTileSupply/, 'tile-supply comparison is missing from the executable script');
  assert.match(scriptSource, /compareScope/, 'scope comparison is missing from the executable script');
  assert.match(scriptSource, /compareAccess/, 'access comparison is missing from the executable script');
  assert.match(scriptSource, /accessNote/, 'access note is missing from the executable script');
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
    'wallTileSf', 'floorTileSf', 'bench', 'glass', 'linearDrain', 'curbless',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'copySummary', 'usageOptOut', 'jobPresets',
    'supply', 'supplyNote', 'scopes', 'scopeNote',
    'accessWindow', 'accessWindowNote',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Walk-In Shower Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*linear drain/i);
  assert.match(html, /Bid the drain, the slope, and the glass/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not plumbing, waterproofing, construction, legal, tax, or financial advice/i);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the landing page links the customer-supplied tile question', () => {
  assert.match(html, /should-i-install-customer-supplied-tile\.html/);
  assert.match(html, /who bought the tile/i);
});

test('the landing page links the alcove-vs-walk-in question', () => {
  assert.match(html, /should-i-match-an-alcove-price-on-a-curbless-walk-in\.html/);
  assert.match(html, /Same shop, four bathrooms/i);
});

test('the landing page links the Saturday / after-hours question', () => {
  assert.match(html, /should-i-tile-a-walk-in-shower-after-hours\.html/);
  assert.match(html, /Same shower, when you can work/i);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to install a walk-in shower/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /linear drain/i);
  assert.match(seo, /index\.html/);
  assert.match(seo, /should-i-install-customer-supplied-tile\.html/);
  assert.match(seo, /should-i-match-an-alcove-price-on-a-curbless-walk-in\.html/);
  assert.match(seo, /should-i-tile-a-walk-in-shower-after-hours\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the tile-supply SEO article answers the customer-supplied question', () => {
  assert.match(supplySeo, /Should I install customer-supplied tile/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$45/);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the scope SEO article answers the match-the-alcove question', () => {
  assert.match(scopeSeo, /Should I match an alcove price on a curbless walk-in/i);
  assert.match(scopeSeo, /FAQPage/);
  assert.match(scopeSeo, /linear drain/i);
  assert.match(scopeSeo, /index\.html/);
  assert.match(scopeSeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(scopeSeo, /<textarea/i);
});

test('the after-hours article quotes the curbless walk-in and alcove Saturday arithmetic', () => {
  assert.match(accessSeo, /Should I tile a walk-in shower after hours/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$5,175/);
  assert.match(accessSeo, /\$11,061\.97/);
  assert.match(accessSeo, /\$12,821\.25/);
  assert.match(accessSeo, /\$15,363\.84/);
  assert.match(accessSeo, /\$7,418\.51/);
  assert.match(accessSeo, /\$903\.94/);
  assert.match(accessSeo, /time-and-a-half/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});

test('the customer-facing proposal has every field and control it needs', () => {
  for (const id of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'depositPercent', 'validDays',
    'proposalScope', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
    'printProposal', 'forgetCompany', 'proposalStatus', 'proposalDoc',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  assert.match(scriptSource, /buildProposal/, 'the proposal builder is missing from the executable script');
  assert.match(scriptSource, /renderProposalHtml/);
  assert.match(scriptSource, /window\.print\(\)/, 'nothing actually sends the proposal to the printer');
});

test('printing sends the customer sheet and hides the contractor’s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(html);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the homeowner would receive the contractor's loaded labour rate.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});

test('the proposal promises the customer’s details are not stored', () => {
  assert.match(markup, /customer&rsquo;s details are never saved|customer’s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
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

// The two features touch the same page from opposite directions: the bid link
// deliberately carries the contractor's own rates, and the proposal deliberately
// carries the customer's name and address. Neither may pick up the other's
// payload. A bid link that quietly included the homeowner's address would be a
// third party's personal data pasted into a URL and a chat app.
test('a saved or shared bid carries no customer or business details', () => {
  const spec = /const BID_SPEC = \{[\s\S]*?\n    \};/.exec(scriptSource);
  assert.ok(spec, 'BID_SPEC not found; the save/share wiring changed shape');
  for (const field of [
    'clientName', 'clientAddress',
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'proposalScope', 'proposalNotes', 'proposalExclusions', 'paymentTerms',
  ]) {
    assert.doesNotMatch(spec[0], new RegExp(`\\b${field}\\b`),
      `${field} would be written into the saved bid and its shareable link`);
  }
});

// Closest sibling: same bathroom-remodel job, but a walk-in tub with a door
// rather than a tiled wet-area shower. Related-tool chrome rotates inside the
// bathroom subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the walk-in-tub-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/walk-in-tub-bid-calculator\/"/,
    'index must link ../walk-in-tub-bid-calculator/ so crawlers reach the tub calculator in one hop',
  );
  assert.match(html, /walk-in tub bid calculator/i);
});
