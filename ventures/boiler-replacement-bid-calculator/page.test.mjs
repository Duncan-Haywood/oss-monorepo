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
const seo = readFileSync(new URL('./how-much-to-charge-to-replace-a-boiler.html', import.meta.url), 'utf8');
const patch = readFileSync(new URL('./should-i-patch-this-boiler-for-one-more-winter.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-a-customer-supplied-boiler.html', import.meta.url), 'utf8');
const saturdaySeo = readFileSync(new URL('./should-i-take-a-saturday-boiler-call.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareRepairVsReplace/, 'repair comparison is missing from the executable script');
  assert.match(scriptSource, /repairVsReplaceNote/, 'repair verdict helper is missing from the executable script');
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
    'scope', 'system', 'fuel', 'inputMbh', 'zones', 'travelMiles',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'hoursRepair', 'repairParts', 'extraCallsThisWinter', 'remainingWinters', 'patchPrice',
    'price', 'breakEven', 'compare', 'repair', 'repairNote', 'supply', 'supplyNote', 'access', 'accessNote', 'copySummary', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Boiler Replacement Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*boiler/i);
  assert.match(html, /Bid the plant, the system, and the extras/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not heat-loss, fuel-gas-code, chimney-design, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to replace a boiler/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /like-for-like/i);
  assert.match(seo, /index\.html/);
  assert.match(seo, /should-i-patch-this-boiler-for-one-more-winter\.html/);
  assert.match(seo, /should-i-install-a-customer-supplied-boiler\.html/);
  assert.match(seo, /should-i-take-a-saturday-boiler-call\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the landing page links the customer-supplied and Saturday questions', () => {
  assert.match(html, /should-i-install-a-customer-supplied-boiler\.html/);
  assert.match(html, /should-i-take-a-saturday-boiler-call\.html/);
});

test('the patch article answers the no-heat question and stays crawlable', () => {
  assert.match(patch, /Should I patch this boiler for one more winter/i);
  assert.match(patch, /FAQPage/);
  assert.match(patch, /\$280/);
  assert.match(patch, /index\.html/);
  assert.match(patch, /No warranty/);
  assert.match(patch, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(patch, /<textarea/i);
});

test('the supply article answers the customer-supplied question and stays crawlable', () => {
  assert.match(supplySeo, /Should I install a customer-supplied boiler/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$4,500/);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /No warranty/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the Saturday article answers the no-heat overtime question and stays crawlable', () => {
  assert.match(saturdaySeo, /Should I take a Saturday boiler call/i);
  assert.match(saturdaySeo, /FAQPage/);
  assert.match(saturdaySeo, /\$5,800/);
  assert.match(saturdaySeo, /\$4,500/);
  assert.match(saturdaySeo, /index\.html/);
  assert.match(saturdaySeo, /No warranty/);
  assert.match(saturdaySeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(saturdaySeo, /<textarea/i);
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

// Closest sibling: same "HVAC, plumbing & electrical" subcategory, but a
// toilet closet-versus-scope bid rather than a boiler plant-versus-scope bid.
// Without a crawlable link here, a crawler entering on the boiler calculator
// never reaches the toilet calculator in one hop.
test('index links one hop to the toilet-replacement-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/toilet-replacement-bid-calculator\/"/,
    'index must link ../toilet-replacement-bid-calculator/ so crawlers reach the toilet calculator in one hop',
  );
});
