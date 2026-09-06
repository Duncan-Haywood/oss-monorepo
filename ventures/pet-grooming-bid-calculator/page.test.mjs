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

test('the form exposes every default the calculator reads, including every add-on and enum', () => {
  const required = Object.keys(defaults);
  for (const id of required) {
    assert.ok(declaredIds.has(id), `missing #${id} for a default the calculator reads`);
  }
  for (const id of ['totalMinutes', 'laborCost', 'effectiveHourly', 'reset', 'copyLink', 'usageOptOut', 'claimHint', 'mattingHint']) {
    assert.ok(declaredIds.has(id), `missing result or action #${id}`);
  }
});

test('persist reads Object.keys(defaults), so a new field cannot drop off the saved draft', () => {
  assert.match(scriptSource, /const ids = Object\.keys\(defaults\)/, 'the page keeps its own field list instead of defaults');
});

test('the share link wires encode, terms, and restore, not just the button', () => {
  assert.match(scriptSource, /import \{ encodeInputs, decodeInputs \} from '\.\/share\.mjs'/);
  assert.match(scriptSource, /withTerms\(/, 'copyLink does not fold the proposal terms into the link');
  assert.match(scriptSource, /splitTerms\(/, 'restoreShare does not separate the terms from the venture payload');
  assert.match(scriptSource, /applyTerms\(/, 'a restored link does not write the terms back onto the panel');
  assert.match(scriptSource, /readTerms\(/, 'copyLink does not read the terms currently on the panel');
  assert.match(scriptSource, /overlongTermsNote\(/, 'a term dropped for length is not named back to the sender');
  assert.match(scriptSource, /restoreShare\(\)/, 'restoreShare is defined but never called on load');
  assert.match(html, /id="copyLink"/, 'the share-link button is missing');
  assert.match(scriptSource, /localStorage\.setItem\('pet-grooming-inputs'/,
    'the draft is still kept on the visitor\'s own device between visits');
});

test('the default $75 example stays in the black when wage is skipped', () => {
  const result = calculateBid(defaults);
  assert.ok(result.contribution > 0, 'skipping wage should not hide a loss on the worked example');
});

test('the page handles an unreachable target instead of printing a negative price', () => {
  const unreachable = calculateBid({ ...defaults, paymentRate: 3, targetMargin: 98 });
  assert.equal(unreachable.targetQuote, Infinity);
  assert.match(
    scriptSource,
    /Number\.isFinite\(r\.targetQuote\)/,
    'index.html formats targetQuote without checking it is finite; an unreachable target would print as $Infinity or as a negative quote',
  );
  assert.match(scriptSource, /unreachable/, 'no unreachable-target message found in the page script');
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(markup, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const catchBlock = scriptSource.match(/catch\(error\) \{([\s\S]*?)\n {4}\} \}/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('contribution'\)\.hidden\s*=\s*true/, 'the hero is not hidden on a rejected input');
  for (const id of ['caption', 'totalMinutes', 'loadedLaborRate', 'laborCost', 'travelCost', 'mattingSurcharge', 'addOnPrice', 'directCosts', 'paymentFee', 'breakEven', 'effectiveHourly', 'claimHint', 'targetQuote']) {
    assert.match(
      body,
      new RegExp(`el\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /el\('errors'\)\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('severe matting cannot be priced without the acknowledgment, and the page surfaces that as an error rather than a stale quote', () => {
  assert.throws(() => calculateBid({ ...defaults, matting: 'severe' }), /welfare and safety call/);
  assert.match(html, /id="severeMattingAck"/, 'the page does not declare the safety acknowledgment checkbox');
  assert.ok(declaredIds.has('severeMattingAck'), 'severeMattingAck is not a real, declared element');
});

test('a welfare/safety note is shown live as the matting select changes, independent of whether the calculation succeeds', () => {
  assert.match(scriptSource, /mattingNote/, 'the page does not render the live matting welfare note');
  assert.match(scriptSource, /renderMattingHint/, 'renderMattingHint is not wired');
  assert.match(html, /id="mattingHint"/);
  assert.match(html, /aria-live="polite"/);
});

test('the form names the fee-plus-margin claim as the user types', () => {
  assert.match(scriptSource, /claimNote/, 'the page does not render the live claim hint');
  assert.match(scriptSource, /claim_conflict_shown/, 'the first conflict should be counted once');
  assert.match(markup, /id="claimHint"/);
});

test('the disclaimer PRODUCT_PLAYBOOK 5b requires is on the page, adapted for animal-health/welfare', () => {
  assert.match(markup, /No warranty/i);
  assert.match(markup, /not .*veterinary, animal-health, or animal-welfare advice/i);
  assert.match(markup, /does not assess whether an animal is fit, healthy, or safe to be groomed/i);
});

test('the wage field asks for the pre-burden rate the calculator expects', () => {
  const label = /<label>([^<]*)<input id="wage"/.exec(html);
  assert.ok(label, 'the wage input no longer has a plain preceding label');
  assert.doesNotMatch(
    label[1],
    /loaded/i,
    `the wage label calls itself "loaded" while calc.mjs still loads it: ${label[1]}`,
  );
  assert.match(label[1], /before burden/i);
  assert.match(html, /id="loadedLaborRate"/);
  const result = calculateBid({ ...defaults, wage: 28, burdenPercent: 25 });
  assert.equal(result.loadedLaborRate, 35);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for dog grooming/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

test('the result panel is announced to screen readers when it updates', () => {
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

test('checkboxes and selects are read and written by the same field list as number inputs', () => {
  assert.match(scriptSource, /isCheckbox/, 'the page has no checkbox-aware read/write helper');
  assert.match(scriptSource, /applyValues/, 'the page has no shared apply-values helper for restore/reset/share');
});
