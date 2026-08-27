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

import { companyKey, detectFunctions, disclaimerFor, jsString, priceExpressionFor, resultKeysOf } from './adopt.mjs';

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
