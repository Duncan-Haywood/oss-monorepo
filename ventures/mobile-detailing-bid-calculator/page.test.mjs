import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, defaults } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

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
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed');
  assert.match(scriptSource, /calculateBid/, 'the app script did not parse as a script element');
  assert.match(scriptSource, /from '\.\/calc\.mjs'/, 'the calculation module is not imported');
  assert.match(scriptSource, /from '\.\/usage\.mjs'/, 'the usage module is not imported');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/\bel\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('the structural guards actually fail on a swallowed document', () => {
  const broken = html.replace('</style>', '');
  assert.notEqual(broken, html, 'index.html no longer contains </style>; this case needs updating');
  const d = derive(broken);
  assert.equal(d.unclosed, 'style', 'an unclosed <style> was not detected');
  assert.doesNotMatch(d.markup, /<script type="module">/, 'the app script is still visible as markup after being swallowed');
  assert.doesNotMatch(d.scriptSource, /calculateBid/, 'swallowed script text was still collected as executable script');
  assert.ok(
    d.declaredIds.size < declaredIds.size,
    `ids are being read from the raw file, not the parse: ${d.declaredIds.size} of ${declaredIds.size} still visible after the document was swallowed`,
  );
});

test('an unclosed module script is caught the same way', () => {
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

test('the form exposes every default the calculator reads, including whole-stop hours', () => {
  const required = [
    'targetPrice', 'laborHours', 'travelHours', 'setupHours', 'cleanupHours',
    'travelMiles', 'vehicleRate', 'wage', 'burdenPercent', 'supplies',
    'overhead', 'paymentRate', 'targetMargin',
  ];
  assert.deepEqual(Object.keys(defaults), required);
  for (const id of required) {
    assert.ok(declaredIds.has(id), `missing #${id} for a default the calculator reads`);
  }
  for (const id of ['totalHours', 'laborCost', 'effectiveRate', 'reset', 'copyLink', 'usageOptOut', 'claimHint']) {
    assert.ok(declaredIds.has(id), `missing result or action #${id}`);
  }
});

test('persist reads Object.keys(defaults), so a new field cannot drop off the saved draft', () => {
  assert.match(scriptSource, /const ids = Object\.keys\(defaults\)/, 'the page keeps its own field list instead of defaults');
});

// This page used to copy its own link *and* receive the one platform/pages'
// build injects, two buttons writing two hash formats side by side. Whichever
// the detailer clicked decided what the customer's copy carried: the injected
// control read every field off the form, while the inline one serialized
// `readInput()` and, having no share module, left the proposal panel's five
// terms behind entirely. That inline button was removed rather than fixed,
// because `platform/pages/link.mjs`'s own gate (`pageHasOwnShareLink`) exists
// precisely so a venture that ships a real `share.mjs` gets the generic
// injected control skipped rather than duplicated -- see `platform/pages/
// link.mjs` and `platform/proposal/term-ids.test.mjs`. This venture now has
// that real module, with the deposit and terms folded in through `pfterms`
// the same way its sibling bid calculators do, so the inline button is back
// and correctly signals the build to stand down.
test('the share link wires encode, terms, and restore, not just the button', () => {
  // A button with no wiring behind it is worse than no button: it tells a
  // crew the feature exists. This is the source-level half of what
  // `platform/proposal/term-ids.test.mjs` checks across every venture.
  assert.match(scriptSource, /import \{ encodeInputs, decodeInputs \} from '\.\/share\.mjs'/);
  assert.match(scriptSource, /withTerms\(/, 'copyLink does not fold the proposal terms into the link');
  assert.match(scriptSource, /splitTerms\(/, 'restoreShare does not separate the terms from the venture payload');
  assert.match(scriptSource, /applyTerms\(/, 'a restored link does not write the terms back onto the panel');
  assert.match(scriptSource, /readTerms\(/, 'copyLink does not read the terms currently on the panel');
  assert.match(scriptSource, /overlongTermsNote\(/, 'a term dropped for length is not named back to the sender');
  assert.match(scriptSource, /restoreShare\(\)/, 'restoreShare is defined but never called on load');
  assert.match(html, /id="copyLink"/, 'the share-link button is missing');
  assert.match(scriptSource, /localStorage\.setItem\('mobile-detailing-inputs'/,
    'the draft is still kept on the visitor\'s own device between visits');
});

test('the default $180 example stays in the black when wage is skipped', () => {
  const result = calculateBid(defaults);
  assert.equal(result.totalHours, 4.25);
  assert.equal(result.laborCost, 0);
  assert.ok(result.contribution > 0, 'skipping wage should not hide a loss on the worked example');
});

test('the page handles an unreachable target instead of printing a negative price', () => {
  // The payment fee and the target margin are both slices of the final price,
  // so together they can claim the whole ticket. calc.mjs answers Infinity for
  // that — the house signal for "no price reaches this" — and money() would
  // render Infinity as "$Infinity", so the page has to branch before it
  // formats. Before the guard it printed "Quote at least $-4608.00".
  const unreachable = calculateBid({ targetPrice: 180, laborHours: 3, paymentRate: 3, targetMargin: 98 });
  assert.equal(unreachable.targetQuote, Infinity);
  assert.match(
    scriptSource,
    /Number\.isFinite\(r\.targetQuote\)/,
    'index.html formats targetQuote without checking it is finite; an unreachable target would print as $Infinity or as a negative quote',
  );
  assert.match(scriptSource, /unreachable/, 'no unreachable-target message found in the page script');
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only the dollar hero (#contribution) with the error sentence
  // and left every other figure -- caption, travel cost, direct costs,
  // payment fee, break-even, effective hourly, whole-stop hours, loaded
  // labor, effective rate, claim hint, and the target-quote line -- showing
  // the last valid calculation. A visitor could easily miss the message and
  // read those stale figures as the answer for what is now on screen.
  assert.match(markup, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = scriptSource.match(/catch\(error\) \{([\s\S]*?)\n {4}\} \}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('contribution'\)\.hidden\s*=\s*true/, 'the hero is not hidden on a rejected input');
  for (const id of ['caption', 'travelCost', 'directCosts', 'paymentFee', 'breakEven', 'effectiveHourly', 'totalHours', 'loadedLaborRate', 'laborCost', 'effectiveRate', 'claimHint', 'targetQuote']) {
    assert.match(
      body,
      new RegExp(`el\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /el\('errors'\)\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the form names the fee-plus-margin claim as the user types', () => {
  assert.match(scriptSource, /claimNote/, 'the page does not render the live claim hint');
  assert.match(scriptSource, /claim_conflict_shown/, 'the first conflict should be counted once');
  assert.match(markup, /id="claimHint"/);
  assert.match(markup, /aria-live="polite"/);
});

test('the disclaimer PRODUCT_PLAYBOOK 5b requires is on the page', () => {
  assert.match(markup, /No warranty/i);
  assert.match(markup, /not .*(business|tax|financial|professional) .*advice/i);
});

// The wage input is the *base* hourly wage: `calc.mjs` multiplies it by
// (1 + burden%) to reach `loadedLaborRate`. The label used to read "Loaded
// wage", which invites a detailer to type a rate that already includes burden
// and then has burden applied to it a second time — a 25% overstatement of
// labour cost on every quote, in the direction that loses jobs. Pin the two
// halves that have to stay consistent: what the field asks for, and the fact
// that the page shows the loaded rate it derives.
test('the wage field asks for the pre-burden rate the calculator expects', () => {
  const label = /<label>([^<]*)<input id="wage"/.exec(html);
  assert.ok(label, 'the wage input no longer has a plain preceding label');
  assert.doesNotMatch(
    label[1],
    /loaded/i,
    `the wage label calls itself "loaded" while calc.mjs still loads it: ${label[1]}`,
  );
  assert.match(label[1], /before burden/i);

  // And the derived rate is on screen, so applying burden twice is visible.
  assert.match(html, /id="loadedLaborRate"/);
  const result = calculateBid({ wage: 28, burdenPercent: 25 });
  assert.equal(result.loadedLaborRate, 35);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for mobile detailing/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

test('the result panel is announced to screen readers when it updates', () => {
  // The result section re-renders the contribution figure, the dl
  // breakdown, and the target-price readout in place on every keystroke,
  // with no page reload. Before this fix the only aria-live element on the
  // page was #status (a reset/copy message render() never writes the
  // result figures into), so a screen-reader user changing an input got no
  // announcement that the readout had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

// Closest sibling: also a per-vehicle job a detailer's own customer asks
// about. Without an explicit one-hop, platform/pages/siblings.mjs reports
// this tool as a crawlable orphan -- reachable only through the category
// index, never from another tool.
test('index links one hop to the vehicle-wrap-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/vehicle-wrap-bid-calculator\/"/,
    'index must link ../vehicle-wrap-bid-calculator/ so crawlers reach the wrap calculator in one hop',
  );
  assert.match(html, /vehicle wrap bid calculator/i);
});

test('index links to the flat-price-card comparison, and the page links back', () => {
  assert.match(html, /href="\.\/vs-a-flat-per-vehicle-price\.html"/);
  const vsPage = readFileSync(new URL('./vs-a-flat-per-vehicle-price.html', import.meta.url), 'utf8');
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /<link rel="canonical"/);
  assert.match(vsPage, /application\/ld\+json/);
  assert.match(vsPage, /href="\.\/"/, 'the comparison page must link back to the calculator');
  assert.match(vsPage, /href="\.\/how-much-to-charge\.html"/, 'the comparison page must link the pricing walkthrough');
  // This one compares against a generic method (a price card), not a
  // product, so it carries no trademark disclaimer and must name no
  // competitor -- the claim COMPARISON_DISCLAIMER_EXEMPT in clauses.mjs
  // records for it.
  assert.doesNotMatch(vsPage, /Mobile Tech RX|MobileTech|Detailer Land|Zenbooker/i);
});

test('the flat-price-card comparison is listed in robots-reachable pages', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /vs-a-flat-per-vehicle-price\.html/);
});

test('wide tables on the flat-price-card page scroll in their own box, not the page', () => {
  const vsPage = readFileSync(new URL('./vs-a-flat-per-vehicle-price.html', import.meta.url), 'utf8');
  const tables = [...vsPage.matchAll(/<table[\s\S]*?<\/table>/g)];
  assert.ok(tables.length > 0);
  const wrapped = [...vsPage.matchAll(/<div class="scroll">[\s\S]*?<\/div>/g)];
  assert.equal(wrapped.length, tables.length, 'every table needs its own .scroll wrapper');
  assert.match(vsPage, /\.scroll \{ overflow-x: auto; \}/);
});

test('every figure quoted on the flat-price-card page is what the calculator actually returns', () => {
  // The page argues from two worked jobs at the calculator's own defaults
  // (one near, one far), so it is only as credible as the arithmetic behind
  // it. This pins every dollar figure to a live calculateBid() call so
  // nothing else in the suite lets the calculator's math drift while the
  // prose stands still.
  const vsPage = readFileSync(new URL('./vs-a-flat-per-vehicle-price.html', import.meta.url), 'utf8');
  const money = (n) => `$${n.toFixed(2)}`;

  const near = calculateBid(defaults);
  const far = calculateBid({ ...defaults, travelMiles: 60, travelHours: 1.5 });

  for (const r of [near, far]) {
    for (const figure of [
      money(r.travelCost),
      money(r.directCosts),
      money(r.breakEven),
      money(r.contribution),
      money(r.effectiveHourly),
      money(r.effectiveRate),
      money(r.targetQuote),
    ]) {
      assert.ok(vsPage.includes(figure), `the page no longer quotes ${figure} from the calculator`);
    }
    assert.ok(vsPage.includes(`${r.margin.toFixed(1)}%`), `the page no longer quotes the ${r.margin.toFixed(1)}% margin`);
  }

  assert.equal(near.totalHours, 4.25);
  assert.equal(far.totalHours, 5);
  assert.match(vsPage, /4\.25 hours/);
  assert.match(vsPage, /\b5 hours\b/);
});

// Inbound link for `car-wash-membership-calculator`: the same vehicle-appearance owner,
// selling monthly wash plans rather than one-off details.
test('index links one hop to the car-wash-membership-calculator sibling', () => {
  assert.match(html, /href="\.\.\/car-wash-membership-calculator\/"/);
  assert.match(html, /car wash membership calculator/i);
});
