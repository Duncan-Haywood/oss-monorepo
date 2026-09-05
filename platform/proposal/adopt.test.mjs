// The generator's own guarantees.
//
// `verify.mjs` proves each published page is sound, but it needs a browser and
// a built site. These are the properties that must hold before any of that: the
// preconditions that stop a page being mangled, the string escaping that killed
// a whole batch's proposals, and the idempotency that makes re-running safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { companyKey, declaredFields, declaredRowFields, detectFunctions, inspect, disclaimerFor, jsString, markup, priceExpressionFor, readerTakesNoArguments, resultKeysOf } from './adopt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENTURES = path.resolve(HERE, '../../ventures');
const trades = JSON.parse(fs.readFileSync(path.join(HERE, 'trades.json'), 'utf8'));

test('a straight apostrophe cannot close the generated JS string', () => {
  // The defect: "a licensed engineer's to specify" ends the single-quoted
  // literal, the whole inline module fails to parse, and the calculator still
  // renders — only the proposal is dead, silently.
  const literal = jsString("a licensed engineer's stamp");
  assert.doesNotMatch(literal.slice(1, -1), /'/, 'no straight quote may survive inside the literal');
  assert.equal(eval(literal), 'a licensed engineer’s stamp');
});

test('backslashes and newlines in trade copy cannot break the module', () => {
  for (const value of ['a\\b', 'line\nbreak', "both'\\\n", '’ already curly']) {
    assert.doesNotThrow(() => eval(jsString(value)), `failed on ${JSON.stringify(value)}`);
  }
});

test('the reader is matched on its parenthesis, not as a prefix', () => {
  // `grep -c 'function readInput'` matches `readInputs` as a substring, so a
  // proposal calling `readInput()` on a page that defines `readInputs()` threw
  // at click time while every text-level test stayed green.
  assert.equal(detectFunctions('function readInputs() {}\ncalculateBid(readInputs())').reader, 'readInputs');
  assert.equal(detectFunctions('function readInput() {}\ncalculateBid(readInput())').reader, 'readInput');
  assert.equal(detectFunctions('const x = 1').reader, undefined);
});

test('the calculator function is read off its actual call site', () => {
  assert.equal(detectFunctions('function readInput(){}\nconst r = calculateJob(readInput())').calcFn, 'calculateJob');
  assert.equal(detectFunctions('function readInput(){}\nconst r = calculateSeason(readInput())').calcFn, 'calculateSeason');
});

test('a reader called with the rows update already read is still a call site', () => {
  // The house pattern is `readInput(rows = readRows())`, so a calculator whose
  // only call site is the one inside `update` passes its rows positionally.
  // Requiring a literal `readInput()` blocked `painting` and
  // `pressure-washing`, neither of which has a second call site to write it.
  assert.equal(
    detectFunctions('function readInput(surfaces = readSurfaces()){}\nresult = calculateBid(readInput(surfaces))').calcFn,
    'calculateBid',
  );
});

test('a reader that cannot be called with no arguments is refused', () => {
  // The generated proposal calls `readInput()`. A parameter with no default is
  // then `undefined`, and the calculator either throws inside the print
  // handler or — worse — prices the job without its rows and puts that number
  // on a customer's quote.
  assert.equal(readerTakesNoArguments('function readInput(rows) {', 'readInput'), false);
  assert.equal(readerTakesNoArguments('function readInput() {', 'readInput'), true);
  assert.equal(readerTakesNoArguments('function readInput(rows = readRows()) {', 'readInput'), true);
  assert.equal(readerTakesNoArguments('function readInput(a = one(), b = two()) {', 'readInput'), true);
  assert.equal(readerTakesNoArguments('function readInput(a = one(), b) {', 'readInput'), false);
  // A default whose own call takes arguments carries a comma that a naive
  // split would read as a second, defaultless parameter.
  assert.equal(readerTakesNoArguments('function readInput(rows = readRows(a, b)) {', 'readInput'), true);
  assert.equal(readerTakesNoArguments('const x = 1', 'readInput'), false);
});

test('a calculator with no `proposed` field is not asked for one', () => {
  // `result.proposed` on a page that has no such field is `undefined`, and
  // `undefined.price` throws inside the print handler.
  assert.equal(priceExpressionFor(['price', 'proposed'], 'price'),
    'result.proposed === null || result.proposed === undefined ? result.price : result.proposed.price');
  assert.equal(priceExpressionFor(['seasonalPrice'], 'seasonalPrice'), 'result.seasonalPrice');
  assert.equal(priceExpressionFor([], 'price'), 'result.price');
});

test('every trade names a price field the calculator actually returns', () => {
  const wrong = [];
  for (const [slug, trade] of Object.entries(trades)) {
    const keys = resultKeysOf(slug);
    if (!keys.length) continue; // spread-only result; the browser check covers it
    const field = trade.priceField ?? 'price';
    if (!keys.includes(field)) wrong.push(`${slug}: no result.${field}`);
  }
  assert.deepEqual(wrong, []);
});

test('a one-line return is read from the entry function, not the next one', () => {
  // `appliance-repair-quote-calculator` returns its result on a single line and
  // declares `compareServiceCallVsReplace` — which returns over many lines —
  // below it. The multi-line matcher is greedy, so before the region was
  // bounded it ran past the entry and reported the *comparison's* keys: the
  // price field `target` looked absent, and `proposed` detection would have
  // been decided by the wrong function's shape.
  const keys = resultKeysOf('appliance-repair-quote-calculator');
  assert.ok(keys.includes('target'), `entry function's own keys, got ${JSON.stringify(keys)}`);
  assert.ok(keys.includes('walkAway'), 'a shorthand key after a `key: value` one is still a key');
  assert.ok(keys.includes('effectiveRate'), 'a value carrying its own comma must not split the key list');
  assert.ok(!keys.includes('replacementPrice'), 'read past the entry function into the next declaration');
});

test('storage keys are unique across ventures', () => {
  // Two calculators sharing a key would show one contractor's business block
  // under another trade — and, worse, overwrite it.
  const seen = new Map();
  for (const slug of Object.keys(trades)) {
    const key = companyKey(slug);
    assert.ok(!seen.has(key), `${slug} and ${seen.get(key)} both use ${key}`);
    seen.set(key, slug);
  }
});

test('every disclaimer keeps the shared spine and adds the trade sentence', () => {
  const built = disclaimerFor({ disclaimerTail: 'It is not a drainage design.' });
  assert.match(built, /solely responsible for its scope, figures, and performance/);
  assert.match(built, /It is not a drainage design\.$/);
  assert.doesNotMatch(built, /'/, 'a straight apostrophe here would close the literal');
  // A trade with nothing to add still gets the spine, not a trailing space.
  assert.equal(disclaimerFor({}), disclaimerFor({ disclaimerTail: '  ' }));
});

test('no trade disclaimer invents legal terms of its own', () => {
  // The document renders the contractor's words. A calculator that shipped
  // warranty or lien language would be drafting contract terms.
  for (const [slug, trade] of Object.entries(trades)) {
    const tail = trade.disclaimerTail ?? '';
    assert.doesNotMatch(tail, /\bwe warrant\b|\blien\b|\barbitrat|\bgoverning law\b|\bindemnif/i,
      `${slug} disclaimer drafts a legal term`);
  }
});

test('every trade entry has the copy a customer sheet needs', () => {
  const thin = [];
  for (const [slug, trade] of Object.entries(trades)) {
    if (!trade.jobTitle) thin.push(`${slug}: no jobTitle`);
    if (!Array.isArray(trade.scope) || trade.scope.length < 2) thin.push(`${slug}: scope too thin`);
    // At least one line has to describe the priced job rather than close it.
    const templated = trade.scope.filter((line) => /\{/.test(typeof line === 'string' ? line : line.line));
    if (templated.length < 1) thin.push(`${slug}: no scope line reads the result`);
    if (!trade.disclaimerTail) thin.push(`${slug}: no disclaimerTail`);
  }
  assert.deepEqual(thin, []);
});

test('every generated page carries exactly one proposal section', () => {
  const wrong = [];
  for (const slug of Object.keys(trades)) {
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    const sections = html.split('id="proposalSection"').length - 1;
    const docs = html.split('id="proposalDoc"').length - 1;
    if (sections !== 1 || docs !== 1) wrong.push(`${slug}: ${sections} section(s), ${docs} doc(s)`);
  }
  assert.deepEqual(wrong, []);
});

test('a closing js marker never swallows the line after it', () => {
  // `// proposal:end` is a line comment. Without a newline after it, whatever
  // followed the insertion point is pulled onto the comment and commented out.
  // `painting` and `janitorial` each import a third module after `usage.mjs`,
  // and both shipped proposals that died at click time on `COST_IDS is not
  // defined` / `restoreBid is not defined` — while `check.mjs` reported the
  // page publishable, because a commented-out import still parses.
  const swallowed = [];
  for (const slug of Object.keys(trades)) {
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    for (const line of html.split('\n')) {
      const at = line.indexOf('// proposal:end');
      if (at < 0) continue;
      const after = line.slice(at + '// proposal:end'.length);
      if (after.trim() !== '') swallowed.push(`${slug}: ${after.trim()}`);
    }
  }
  assert.deepEqual(swallowed, []);
});

test('every generated page is marked, so a re-run replaces rather than layers', () => {
  const unmarked = Object.keys(trades).filter((slug) => {
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    return !html.includes('proposal:begin') || !html.includes('proposal:end');
  });
  assert.deepEqual(unmarked, []);
});

test('every select a trade reads is a select the page actually has', () => {
  // A mistyped id yields `undefined` from the option lookup, which drops the
  // line — silently, and only for the trade that got it wrong.
  const missing = [];
  for (const [slug, trade] of Object.entries(trades)) {
    const html = fs.readFileSync(path.join(VENTURES, slug, 'index.html'), 'utf8');
    for (const [name, spec] of Object.entries(trade.fields ?? {})) {
      if (!spec.select) continue;
      if (!html.includes(`<select id="${spec.select}"`)) missing.push(`${slug}.${name} -> #${spec.select}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('a row field is rewritten from its own map, and falls through when unmapped', () => {
  const [generated] = declaredRowFields({
    components: { name: { map: { 'Canopy hood (listed sq ft)': 'sq ft of canopy hood' } } },
  });
  assert.match(generated, /Array\.isArray\(result\['components'\]\)/);
  assert.match(generated, /"sq ft of canopy hood"/);
  // The fallback is the safety property. `scopeLines` drops a line whose
  // placeholder is missing, so without `?? row['name']` a component preset
  // nobody added to the map would delete itself from the scope the customer
  // signs, rather than merely reading badly.
  assert.match(generated, /\?\? row\['name'\]/);
});

test('a row field reads its source off the untouched row', () => {
  // Two mapped fields keying off the same original value must not depend on the
  // order they were written in, so both read `row[...]` rather than each other.
  const [generated] = declaredRowFields({
    components: { unit: { from: 'name', map: { 'Hood filters (each)': 'filters' } } },
  });
  assert.match(generated, /"unit": \(\{[^}]*\}\)\[row\['name'\]\] \?\? row\['name'\]/);
});

test('every component a hood-cleaning bid can list has customer wording', async () => {
  // The map turns the estimator's form labels ("Canopy hood (listed sq ft)",
  // where the parenthetical tells the estimator what to type) into the words a
  // customer reads. A preset added later without a mapping still prints, but it
  // prints the form label — so this fails instead, at the point of adding it.
  const { COMPONENT_PRESETS } = await import('../../ventures/hood-cleaning-bid-calculator/calc.mjs');
  const map = trades['hood-cleaning-bid-calculator'].rowFields.components.name.map;
  for (const preset of COMPONENT_PRESETS) {
    assert.ok(map[preset.label], `no customer wording for component preset "${preset.label}"`);
  }
});

// ---------------------------------------------------------------------------
// Reaching past the trades
//
// The proposal is the artifact that wins the job, and until now it could only
// be generated for a `*-bid-calculator`: a US contractor, quoting in dollars,
// for a customer at a job address. Everything below is what a freelancer
// quoting a translation needed, and each one is a defect the trades never hit
// because their own answer happened to be the hard-coded one.
// ---------------------------------------------------------------------------

test('a numeric field left at zero keeps its line off the customer sheet', () => {
  // An `<input>`'s value is a string, and `"0"` is truthy. Read with `input`,
  // a `when` guarding an optional charge the user left at zero passed anyway
  // and printed "Rush or weekend delivery" on a quote with nothing for it in
  // the price — the sheet promising work the price does not cover.
  const generated = declaredFields({ rushFee: { number: 'rush_fee' } });
  assert.match(generated, /"rushFee": Number\(el\('rush_fee'\)\?\.value\)/);

  // `input` still yields the trimmed string, which is what a language name or
  // a reference number needs.
  const asText = declaredFields({ sourceLang: { input: 'source_lang' } });
  assert.match(asText, /"sourceLang": el\('source_lang'\)\?\.value\?\.trim\(\)/);
});

test('a trade may rename the form fields without a fork of the generator', () => {
  const renamed = markup({
    labels: {
      heading: 'Send the client a quote',
      clientName: 'Client name',
      clientAddress: 'Client company and address',
      printButton: 'Print quote / Save as PDF',
    },
  });
  assert.match(renamed, /<h2>Send the client a quote<\/h2>/);
  assert.match(renamed, /<label>Client name /);
  assert.match(renamed, /<label>Client company and address /);
  assert.match(renamed, /id="printProposal">Print quote \/ Save as PDF</);
  // The words it replaced are gone, not merely joined.
  assert.doesNotMatch(renamed, /Hand the customer a proposal/);
  assert.doesNotMatch(renamed, /<label>Job address /);
});

test('a trade that renames nothing gets exactly the wording it has today', () => {
  // The 102 adopters pass no `labels`, and their pages are committed. A
  // default that drifted would rewrite all of them on the next sweep.
  const plain = markup({});
  assert.match(plain, /<h2>Hand the customer a proposal<\/h2>/);
  assert.match(plain, /<label>Customer name /);
  assert.match(plain, /<label>Job address /);
  assert.match(plain, /<label>Licence number \(optional\) /);
  assert.match(plain, /id="printProposal">Print proposal \/ Save as PDF</);
  assert.deepEqual(markup({}), markup({ labels: {} }), 'an empty labels block is not a change');
});

test('a label supplied by a trade cannot inject markup', () => {
  const hostile = markup({ labels: { clientName: '<script>alert(1)</script>' } });
  assert.doesNotMatch(hostile, /<script>alert/);
  assert.match(hostile, /&lt;script&gt;/);
});

test('a blank label falls back rather than printing an empty one', () => {
  assert.match(markup({ labels: { clientName: '   ' } }), /<label>Customer name /);
});

test('a trade may name the pricing function when the page does not call it inline', () => {
  // Every bid calculator prices the job inline -- `calculateBid(readInput())`
  // -- because its render loop has nothing to catch. A page whose calculator
  // throws does not: `notary-trip-quote` renders through `quoteResult()`, a
  // non-throwing wrapper, so no call of the inferred shape exists anywhere on
  // it. The throwing one is still the right function for the proposal, where
  // the throw is what retires a sheet the figures no longer support.
  const page = "function readInput(){}\nconst r = quoteResult(readInput())";
  assert.equal(detectFunctions(page).calcFn, undefined, 'a wrapper call is not a call site');
  assert.equal(detectFunctions(page, 'calculateQuote').calcFn, 'calculateQuote');
  // An explicit name never silently disagrees with a real call site.
  assert.equal(
    detectFunctions('function readInput(){}\nconst r = calculateBid(readInput())').calcFn,
    'calculateBid',
    'inference still applies when no name is given',
  );
});

test('a named calculator the page cannot resolve is refused before it reaches a customer', () => {
  // The failure this guards against is silent at every text level: the page
  // looks adopted, the tests pass, and the ReferenceError arrives the first
  // time someone presses print -- in front of the client the sheet exists for.
  const named = Object.entries(trades).filter(([, trade]) => trade.calcFn);
  assert.ok(named.length > 0, 'no trade names a calculator, so this test proves nothing');
  for (const [slug, trade] of named) {
    assert.deepEqual(
      inspect(slug, trade).problems,
      [],
      `${slug} names calcFn "${trade.calcFn}" but does not resolve cleanly`,
    );
    const problems = inspect(slug, { ...trade, calcFn: 'noSuchCalculator' }).problems;
    assert.ok(
      problems.some((p) => p.includes('noSuchCalculator')),
      `${slug} accepted a calculator name its page never defines or imports`,
    );
  }
});

test('the usage.mjs anchor reads a compact import as readily as a spaced one', () => {
  // Spacing around the braces, and whether a statement follows on the same
  // line, are formatting rather than anything adoption depends on. Refusing
  // the compact spelling reported it as "no usage.mjs import" on a page whose
  // import was right there -- the same misreading the quote-style fix above
  // was written for.
  const compact = fs.readFileSync(path.join(VENTURES, 'notary-trip-quote/index.html'), 'utf8');
  assert.match(compact, /import\{recordUsage\}from '\.\/usage\.mjs';/, 'the compact spelling is what this asserts against');
  assert.match(compact, /from '\.\/proposal\.mjs'/, 'the proposal import was never anchored');
});
