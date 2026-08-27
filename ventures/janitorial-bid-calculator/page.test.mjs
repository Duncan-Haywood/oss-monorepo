import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareSupplyResponsibility, compareInitialClean } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./5x-vs-3x-cleaning-price.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-let-them-buy-the-paper.html', import.meta.url), 'utf8');
const initialSeo = readFileSync(new URL('./should-i-throw-in-the-initial-clean.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

// Walk the document the way a browser does so an unclosed raw-text element
// really does swallow everything after it. A sibling calculator shipped dead
// that way while its unit tests stayed green by importing calc.mjs directly.
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];
function parseRawText(source) {
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
// Every derived value must come from the *parse*, never from the raw source.
// Kept as one function so the guards below can be re-run against deliberately
// broken input — see 'the structural guards actually fail on a swallowed
// document'. This suite has already been loosened once by accident: as the
// file grew, these two lines were replaced with plain regexes over `html`,
// which is precisely the blind spot the parse exists to close, and no test
// failed when that happened because a weakened guard passes.
function derive(source) {
  const { markup, scripts, unclosed } = parseRawText(source);
  return {
    markup,
    unclosed,
    scripts,
    scriptSource: scripts.join('\n'),
    declaredIds: new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1])),
  };
}
const { markup, scriptSource, declaredIds, unclosed } = derive(html);

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
  assert.match(scriptSource, /from '\.\/calc\.mjs'/, 'the calculation module is not imported');
  assert.match(scriptSource, /from '\.\/usage\.mjs'/, 'the usage module is not imported');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/\bel\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('the area-row template and the reader agree on class names', () => {
  for (const cls of ['a-type', 'a-name', 'a-sqft', 'a-rate', 'a-freq', 'remove']) {
    const inTemplate = new RegExp(`class="${cls}[ "]`).test(scriptSource);
    assert.ok(inTemplate, `the row template no longer emits .${cls}`);
    assert.ok(scriptSource.includes(`.${cls}`), `nothing reads .${cls} back`);
  }
});

test('other spaces have an editable name and the split escapes it before rendering', () => {
  assert.match(scriptSource, /class="a-name"/);
  assert.match(scriptSource, /maxlength="80"/);
  assert.match(scriptSource, /nameForRow\(preset\?\.label, row\.querySelector\('\.a-name'\)\.value, index\)/);
  assert.match(scriptSource, /escapeHtml\(item\.name\)/);
});

test('custom name is only shown for an Other space row', () => {
  assert.match(html, /\.select-other \.custom-name \{ display: grid; \}/);
  assert.match(scriptSource, /row\.classList\.toggle\('select-other', isOther\)/);
  assert.match(scriptSource, /Name this space/);
});

// A structural guard that cannot fail proves nothing, and this one was
// silently loosened once already. These cases assert the machinery still
// *notices* a swallowed document, so a future rewrite back to a raw-source
// regex breaks a test instead of quietly passing.
test('the structural guards actually fail on a swallowed document', () => {
  const broken = html.replace('</style>', '');
  assert.notEqual(broken, html, 'index.html no longer contains </style>; this case needs updating');

  const d = derive(broken);
  assert.equal(d.unclosed, 'style', 'an unclosed <style> was not detected');
  assert.doesNotMatch(d.markup, /<script type="module">/, 'the app script is still visible as markup after being swallowed');
  assert.doesNotMatch(d.scriptSource, /calculateBid/, 'swallowed script text was still collected as executable script');

  // The load-bearing one: ids after the swallow point must become invisible.
  // If `declaredIds` is ever re-derived from the raw source again, this set
  // stays full and this assertion is what catches it.
  assert.ok(
    d.declaredIds.size < declaredIds.size,
    `ids are being read from the raw file, not the parse: ${d.declaredIds.size} of ${declaredIds.size} still visible after the document was swallowed`,
  );
});

test('an unclosed module script is caught the same way', () => {
  // Drop the *last* </script> so the app script itself is the unclosed one.
  const at = html.lastIndexOf('</script>');
  assert.ok(at > 0, 'index.html has no </script>; this case needs updating');
  const d = derive(html.slice(0, at) + html.slice(at + '</script>'.length));
  assert.equal(d.unclosed, 'script');
});

test('the guards pass on the unmodified page (control)', () => {
  const d = derive(html);
  assert.equal(d.unclosed, null);
  assert.match(d.scriptSource, /calculateBid/);
  assert.ok(d.declaredIds.size > 0);
});

test('the bid page wires the frequency-cut comparison without a build step', () => {
  assert.match(html, /compareFrequencyReduction/);
  assert.match(html, /frequencyReductionNote/);
  assert.match(html, /id="currentWeekly"/);
  assert.match(html, /id="proposedWeekly"/);
  assert.match(html, /id="clientOfferMonthly"/);
  assert.match(html, /id="frequencyCompare"/);
  assert.match(html, /id="copyFrequencyNote"/);
  assert.match(html, /frequency_reduction_compared/);
  assert.match(html, /frequency_note_copied/);
  assert.match(html, /5x-vs-3x-cleaning-price\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the 5× vs 3× landing page is crawlable and sends people to the calculator', () => {
  assert.match(seo, /<title>5x vs 3x commercial cleaning price/);
  assert.match(seo, /name="description"/);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /href="\.\/"/);
  assert.match(seo, /Best-effort hosting, no SLA/);
  assert.match(seo, /\$1,069/);
});

test('the bid page wires the who-supplies comparison without a build step', () => {
  assert.match(html, /compareSupplyResponsibility/);
  assert.match(html, /supplyResponsibilityNote/);
  assert.match(html, /id="restroomSharePercent"/);
  assert.match(html, /id="emergencyFillMonthly"/);
  assert.match(html, /id="supplyOfferMonthly"/);
  assert.match(html, /id="supplyCompare"/);
  assert.match(html, /id="copySupplyNote"/);
  assert.match(html, /supply_responsibility_compared/);
  assert.match(html, /supply_note_copied/);
  assert.match(html, /should-i-let-them-buy-the-paper\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the paper-handoff landing page uses the same worked example the tests lock', () => {
  const comparison = compareSupplyResponsibility({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { restroomSharePercent: 65, emergencyFillMonthly: 35 });
  assert.match(supplySeo, /<title>Should I let the building buy the paper/);
  assert.match(supplySeo, /name="description"/);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /href="\.\/"/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.match(supplySeo, /\$1,720\.00/);
  assert.match(supplySeo, /\$1,682\.62/);
  assert.match(supplySeo, /\$1,662\.50/);
  assert.match(supplySeo, /\$1,732\.94/);
  assert.match(supplySeo, /\$12\.94/);
  assert.ok(Math.abs(comparison.theyBuyRestroom.monthlyPrice - 1682.6225) < 1e-9);
  assert.ok(Math.abs(comparison.theyBuyButYouFill.monthlyPrice - 1732.935) < 1e-9);
  assert.match(sitemap, /should-i-let-them-buy-the-paper\.html/);
});

test('the bid page wires the initial-clean comparison without a build step', () => {
  assert.match(html, /compareInitialClean/);
  assert.match(html, /initialCleanNote/);
  assert.match(html, /id="initialVisitMultiplier"/);
  assert.match(html, /id="initialExtraSupplies"/);
  assert.match(html, /id="initialAmortizeMonths"/);
  assert.match(html, /id="initialCancelAfterMonths"/);
  assert.match(html, /id="initialOfferMonthly"/);
  assert.match(html, /id="initialCompare"/);
  assert.match(html, /id="copyInitialNote"/);
  assert.match(html, /el\('initThrownMonth1'\)\.textContent = signedMoney/);
  assert.match(html, /initial_clean_compared/);
  assert.match(html, /initial_clean_note_copied/);
  assert.match(html, /should-i-throw-in-the-initial-clean\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
});

test('the initial-clean landing page uses the same worked example the tests lock', () => {
  const comparison = compareInitialClean({
    areas: [
      { name: 'Open office', squareFeet: 6000, productionRate: 4000, cleaningsPerWeek: 5 },
      { name: 'Restrooms', squareFeet: 600, productionRate: 1200, cleaningsPerWeek: 5 },
      { name: 'Break room', squareFeet: 400, productionRate: 2000, cleaningsPerWeek: 5 },
      { name: 'Lobby & corridors', squareFeet: 1000, productionRate: 5000, cleaningsPerWeek: 5 },
    ],
    hourlyWage: 17,
    burdenRate: 28,
    suppliesPerSqFtMonth: 0.005,
    equipmentMonthly: 25,
    otherMonthly: 0,
    overheadRate: 15,
    targetMargin: 20,
  }, { visitMultiplier: 5, extraSupplies: 80, amortizeMonths: 12, cancelAfterMonths: 1 });
  assert.match(initialSeo, /<title>Should I throw in the initial clean/);
  assert.match(initialSeo, /name="description"/);
  assert.match(initialSeo, /FAQPage/);
  assert.match(initialSeo, /href="\.\/"/);
  assert.match(initialSeo, /Best-effort hosting, no SLA/);
  assert.match(initialSeo, /\$490\.36/);
  assert.match(initialSeo, /\$1,720\.00/);
  assert.match(initialSeo, /\$48\.29/);
  assert.match(initialSeo, /\$1,768\.29/);
  assert.match(initialSeo, /\$1,760\.86/);
  assert.match(initialSeo, /\$442\.07/);
  assert.match(initialSeo, /GitHub Sponsors/);
  assert.ok(Math.abs(comparison.initialPrice - 490.36) < 0.005);
  assert.ok(Math.abs(comparison.thrownInMonth1Profit + 48.29) < 0.01);
  assert.match(sitemap, /should-i-throw-in-the-initial-clean\.html/);
});

// scriptSource / declaredIds come from parseRawText above so an unclosed
// raw-text element cannot make these share guards look at swallowed markup.

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
  // This venture's reader is `readSavable()`: unlike the fixed-form
  // calculators it also gathers the building's spaces, which are not an id list.
  const read = idListsIn(bodyOf(scriptSource, 'function readSavable('));
  const shared = idListsIn(specSource());
  const dropped = [...read].filter((name) => !shared.has(name));
  assert.deepEqual(
    dropped,
    [],
    `readSavable() reads ${dropped.join(', ')} but BID_SPEC does not carry them; `
      + 'a shared link would price a different job than the sender saw',
  );
});

test('the building of spaces travels, not just the flat rates', () => {
  const spec = bodyOf(scriptSource, 'const BID_SPEC =');
  assert.match(spec, /rows:/, 'BID_SPEC carries no rows, so a shared link would drop every space');
  for (const key of ['type', 'name', 'squareFeet', 'productionRate', 'cleaningsPerWeek']) {
    assert.match(spec, new RegExp(`key: '${key}'`), `the area row does not carry ${key}`);
  }
  // The row's space type is a select, so it must travel validated against the
  // options the dropdown offers rather than as free text.
  assert.match(spec, /kind: 'choice'/, 'the space type is not carried as a validated choice');
  assert.match(scriptSource, /AREA_TYPE_OPTIONS/, 'the space-type options are not derived from the presets');
});
