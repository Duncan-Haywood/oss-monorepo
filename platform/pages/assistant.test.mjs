import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseUtterance, tokenize, checkValue, validateFills, extractJson, fieldSchema, describeFills } from './assistant/fill.mjs';
import { ASSISTANT_LAUNCHER_JS, ASSISTANT_FILES, renderAskPage, renderAssistantFiles, scoreEvals } from './assistant.mjs';
import { SITE_NAV } from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- The measured score ----------------------------------------------------
//
// Every case passes: each blind round's misses were fixed after its score was
// recorded. The recorded rounds are checked for consistency with the cases,
// and the round-1/round-2 scores can be reproduced at their commits.

test('every eval sentence fills exactly the fields it names', () => {
  const { all, failures } = scoreEvals();
  assert.equal(all.passed, all.cases, JSON.stringify(failures.slice(0, 3), null, 1));
});

test('each recorded blind round matches the cases it names', () => {
  const evals = JSON.parse(readFileSync(path.join(HERE, 'assistant', 'evals.json'), 'utf8'));
  assert.ok(evals.blind_rounds.length >= 2);
  for (const r of evals.blind_rounds) {
    assert.equal(evals.cases.filter((c) => c.round === r.round).length, r.cases, `round ${r.round}`);
    assert.ok(r.passed <= r.cases && r.wrong_writes >= 0 && /^[0-9a-f]{7,40}$/.test(r.commit), `round ${r.round}`);
  }
});

test('every eval form names a page that exists, and its field ids are on that page', () => {
  const evals = JSON.parse(readFileSync(path.join(HERE, 'assistant', 'evals.json'), 'utf8'));
  for (const [name, form] of Object.entries(evals.forms)) {
    const file = path.join(HERE, '..', '..', form.source.split(' ')[0]);
    const html = readFileSync(file, 'utf8');
    for (const field of form.fields) {
      // Repeater rows are built by the page's script from a template id.
      const id = field.key.replace(/^s[12]-/, '');
      assert.ok(html.includes(`id="${id}"`) || html.includes(`-${id}"`) || html.includes(`name="${id}"`), `${name}: ${field.key} not on ${form.source}`);
    }
  }
});

// ---- The reader's parts ----------------------------------------------------

const nums = (text) => tokenize(text).filter((t) => t.kind === 'num').map((t) => t.value);

test('spoken and written numbers read the same', () => {
  assert.deepEqual(nums('twenty four hundred'), [2400]);
  assert.deepEqual(nums('two thousand four hundred and fifty'), [2450]);
  assert.deepEqual(nums('2,400'), [2400]);
  assert.deepEqual(nums('$1,250.50'), [1250.5]);
  assert.deepEqual(nums('1.5k'), [1500]);
  assert.deepEqual(nums('two point five'), [2.5]);
  assert.deepEqual(nums('two and a half'), [2.5]);
  assert.deepEqual(nums('a hundred'), [100]);
  assert.deepEqual(nums('fifteen hundred'), [1500]);
  const [ratio] = tokenize('8/12').filter((t) => t.kind === 'num');
  assert.deepEqual(ratio.ratio, [8, 12]);
  const [pct] = tokenize('13.6%').filter((t) => t.kind === 'num');
  assert.equal(pct.percent, true);
});

test('a value the field would refuse is reported, never clamped', () => {
  const field = { key: 'q', label: 'Units', type: 'number', min: 1, max: 1000, step: '1' };
  assert.equal(checkValue(field, 0).ok, false);
  assert.equal(checkValue(field, 1001).ok, false);
  assert.equal(checkValue(field, 2.5).ok, false);
  assert.deepEqual(checkValue(field, '12'), { ok: true, value: '12' });
  const { fills, skipped } = parseUtterance('units 5000', [field]);
  assert.equal(fills.length, 0);
  assert.match(skipped[0].reason, /above this field's maximum/);
});

test('two fields that match equally are a question, not a guess', () => {
  const fields = [
    { key: 'a', label: 'Shipping cost', type: 'number' },
    { key: 'b', label: 'Shipping charged', type: 'number' },
  ];
  const { fills, skipped } = parseUtterance('shipping 6', fields);
  assert.equal(fills.length, 0);
  assert.match(skipped[0].reason, /equally/);
});

test("a model's proposal is checked field by field", () => {
  const fields = [
    { key: 'price', label: 'Price', type: 'number', min: 0 },
    { key: 'cat', label: 'Category', type: 'select', options: [{ value: 'home', text: 'Home' }, { value: 'toys', text: 'Toys' }] },
  ];
  const { fills, skipped } = validateFills({ price: -3, cat: 'Toys', invented: 4 }, fields);
  assert.deepEqual(fills.map((f) => [f.key, f.value]), [['cat', 'toys']]);
  assert.equal(skipped.length, 2);
  assert.deepEqual(extractJson('Sure! ```json\n{"price": 40, "note": "a } in a string"}\n``` done'), { price: 40, note: 'a } in a string' });
  assert.equal(extractJson('no json here'), null);
  const schema = fieldSchema(fields);
  assert.equal(schema.properties.price.minimum, 0);
  assert.deepEqual(schema.properties.cat.enum, ['home', 'toys']);
  assert.equal(describeFills([{ key: 'cat', label: 'Category', value: 'toys' }], fields), 'Category to Toys');
});

// ---- What ships --------------------------------------------------------------

test('the header carries an Ask link on every page', () => {
  assert.ok(SITE_NAV.some((item) => item.id === 'ask' && item.href === 'ask/'));
});

test('the launcher is small, and runs without a DOM it can use', () => {
  // It rides in pf-site.js, which every page loads; the panel itself does not.
  assert.ok(ASSISTANT_LAUNCHER_JS.length < 3600, `launcher is ${ASSISTANT_LAUNCHER_JS.length} bytes`);
  const docListeners = [];
  const winListeners = [];
  const fakeDocument = {
    currentScript: { src: 'https://example.test/site/pf-site.js' },
    readyState: 'complete',
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: (type) => docListeners.push(type),
    head: { appendChild() {} },
    body: { appendChild() {}, querySelectorAll: () => [] },
  };
  new Function('document', 'addEventListener', 'removeEventListener', 'navigator', 'window', 'location', ASSISTANT_LAUNCHER_JS)(
    fakeDocument, (type, _fn, capture) => winListeners.push([type, capture]), () => {}, {}, { top: null }, {},
  );
  // Never a document-level click handler: pages and pf-site.js's own counter use that slot.
  assert.deepEqual(docListeners, []);
  assert.deepEqual(winListeners, [['click', true], ['pointerover', true]]);
});

test('heavy libraries are pinned to exact versions and load only inside the worker', () => {
  const worker = readFileSync(path.join(HERE, 'assistant', 'worker.js'), 'utf8');
  const urls = worker.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/[^'"]+/g);
  assert.equal(urls.length, 2);
  for (const u of urls) assert.match(u, /@\d+\.\d+\.\d+\/\+esm$/, u);
  const client = readFileSync(path.join(HERE, 'assistant', 'client.js'), 'utf8');
  assert.doesNotMatch(client, /https:\/\/cdn\./, 'the panel must not fetch a CDN itself');
  // Cloud speech recognition would send audio to a third party: only the on-device mode is used.
  assert.match(client, /processLocally: true/);
  assert.doesNotMatch(client.replace(/\/\/.*$/gm, ''), /new SR\(\)[\s\S]{0,80}\.start\(\)/, 'recognition must set processLocally before start');
});

test('the shipped files parse as modules, and pf-search.js is the hub ranking', async () => {
  const files = renderAssistantFiles({
    searchVariants: function searchVariants(w) { return [w]; },
    searchScore: function searchScore() { return 1; },
  });
  assert.deepEqual(Object.keys(files).sort(), [...Object.keys(ASSISTANT_FILES), 'pf-search.js'].sort());
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pf-assist-'));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name.replace(/\.js$/, '.mjs'));
    writeFileSync(file, body);
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${name}: ${r.stderr}`);
  }
  const mod = await import(`data:text/javascript,${encodeURIComponent(files['pf-search.js'])}`);
  assert.equal(typeof mod.searchVariants, 'function');
  assert.equal(typeof mod.searchScore, 'function');
});

test('the Ask page prints the score the build measured, and says where words go', () => {
  const html = renderAskPage({
    baseUrl: 'https://example.test/',
    siteName: 'Site',
    toolCount: 10,
    chrome: { style: '', styleLink: '', header: '<nav></nav>', disclaimer: '<p>No warranty.</p>', footerNav: '', script: '' },
  });
  const { rounds } = scoreEvals();
  const r = rounds[rounds.length - 1];
  assert.ok(html.includes(`<td>${r.cases}</td><td>${r.passed}</td><td>${r.wrong_writes}</td>`));
  assert.match(html, /No warranty/);
  assert.match(html, /Cloud speech recognition is never used/);
  assert.match(html, /290 MB/);
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(body);
});
