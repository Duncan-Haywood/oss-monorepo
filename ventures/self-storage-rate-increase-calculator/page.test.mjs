// Structural assertions about the two published pages.
//
// The class of bug these catch is the one this repository keeps paying for: a
// figure written into prose that the arithmetic no longer produces. Both pages
// quote the worked example in words, so every quoted number here is recomputed
// from `calc.mjs` and compared, rather than pinned to a literal. Change the
// defaults and these fail, naming the sentence that went stale.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALL_INPUT_IDS, calculateIncrease } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./how-much-can-i-raise-storage-rent.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
  ['how-much-can-i-raise-storage-rent', article],
];

/** The form's own default values, read out of the markup rather than restated. */
function defaultsFromPage() {
  const raw = {};
  for (const id of ALL_INPUT_IDS) {
    const match = index.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(match, `input #${id} is declared in calc.mjs but absent from the page`);
    raw[id] = match[1];
  }
  return raw;
}

const money = (value) => Math.round(Math.abs(value)).toLocaleString('en-US');

test('the page collects every input the calculator declares', () => {
  const result = calculateIncrease(defaultsFromPage());
  assert.equal(result.ok, true, `the page's own defaults must price: ${JSON.stringify(result.errors)}`);
});

test('the page declares no input the calculator does not read', () => {
  const ids = [...index.matchAll(/<input id="([^"]+)" type="number"/g)].map((m) => m[1]);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.ok(ALL_INPUT_IDS.includes(id), `#${id} is on the form but calc.mjs never reads it`);
  }
  assert.equal(new Set(ids).size, ids.length, 'no duplicate input ids');
});

test('every result field the script writes to exists in the markup', () => {
  const targets = [...index.matchAll(/el\('([A-Za-z]+)'\)/g)].map((m) => m[1]);
  const declared = new Set([...index.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const id of new Set(targets)) {
    assert.ok(declared.has(id), `the script writes to #${id}, which the markup does not declare`);
  }
});

test('both pages carry the no-warranty clause', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, accounting, or financial advice/, name);
    assert.match(html, /accept no liability/, name);
    // The specific determination this tool must never be read as making.
    assert.match(html, /self-storage act/, `${name} should disclaim the lease and notice question`);
  }
});

test('both pages promise, and keep, that nothing is uploaded', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /Nothing leaves your browser/, name);
    // The claim is only true if the page makes no request. Any of these would
    // break it, and a promise the code contradicts is worse than no promise.
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not make network requests`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, name);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} must not load a third-party script`);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, `${name} must not load a remote image`);
  }
});

test('the usage counter is opt-out-able and never records a figure', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\)/);
  // The only events recorded are named literals, never a value from the form.
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(events)].sort(), ['increase_priced']);
});

test('the sponsor link is present, honest, and optional', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, name);
    assert.match(html, /entirely optional and never changes what the tool does/, name);
  }
});

test('the pages link to each other and out to related tools', () => {
  assert.match(index, /href="\.\/how-much-can-i-raise-storage-rent\.html"/, 'the tool links to its guide');
  assert.match(article, /href="\.\/"/, 'the guide links back to the tool');
  // Sitemap enumeration is unavailable on the current origin, so an internal
  // link is the only way a crawler or a reader arrives at a sibling tool.
  for (const slug of ['subscription-price-impact', 'equipment-rental-break-even']) {
    assert.ok(index.includes(`../${slug}/`), `index should link to ${slug}`);
    assert.ok(article.includes(`../${slug}/`), `the guide should link to ${slug}`);
  }
});

test('the headline figures in the copy are the ones the calculator produces', () => {
  const result = calculateIncrease(defaultsFromPage());
  const claims = [
    [result.breakEvenPercent.toFixed(1), 'the break-even move-out rate'],
    [result.newRent.toFixed(2), 'the raised rent'],
    [result.rentIncrease.toFixed(2), 'the increase per unit'],
    [money(result.moveOutCost.total), 'the cost of one induced move-out'],
    [money(result.keepValue), 'the rent-only figure it is contrasted with'],
    [money(result.cohortGain), 'what the increase is worth'],
    [money(result.cohortGainIfNoneInduced), 'what it is worth with no induced churn'],
  ];
  for (const [figure, what] of claims) {
    assert.ok(article.includes(figure), `the guide no longer states ${what} (${figure})`);
  }
  // The tool page states the two that carry its argument.
  assert.ok(index.includes(result.breakEvenPercent.toFixed(1)), 'index states the break-even rate');
  assert.ok(index.includes(money(result.moveOutCost.total)), 'index states the real move-out cost');
  assert.ok(index.includes(money(result.keepValue)), 'index states the figure it contradicts');
});

test('the move-out cost table in the guide matches the itemised cost', () => {
  const result = calculateIncrease(defaultsFromPage());
  for (const item of result.moveOutCost.items) {
    if (Math.round(item.amount) === 0) continue;
    assert.ok(
      article.includes(money(item.amount)),
      `the guide's move-out table is missing ${item.key} ($${money(item.amount)})`,
    );
  }
});

test('the ladder table in the guide matches the computed ladder', () => {
  const result = calculateIncrease(defaultsFromPage());
  for (const rung of result.ladder) {
    assert.ok(article.includes(`${rung.increasePercent}%`), `the guide omits the ${rung.increasePercent}% row`);
    assert.ok(article.includes(rung.newRent.toFixed(2)), `the ${rung.increasePercent}% row's rent is stale`);
    assert.ok(
      article.includes(rung.breakEvenPercent.toFixed(1)),
      `the ${rung.increasePercent}% row's break-even is stale`,
    );
    assert.ok(article.includes(money(rung.gain)), `the ${rung.increasePercent}% row's value is stale`);
  }
});

test('the FAQ answers on the tool page do not contradict the arithmetic', () => {
  const result = calculateIncrease(defaultsFromPage());
  const faq = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)[0];
  assert.ok(faq.includes(result.breakEvenPercent.toFixed(1)), 'the FAQ quotes a break-even the calculator no longer produces');
  assert.ok(faq.includes(money(result.moveOutCost.total)), 'the FAQ quotes a stale move-out cost');
  assert.ok(faq.includes(money(result.keepValue)), 'the FAQ quotes a stale rent-only figure');
  assert.ok(faq.includes(result.newRent.toFixed(2)), 'the FAQ quotes a stale raised rent');
});

test('every authored FAQ answer is also visible copy on the page', () => {
  // A `FAQPage` block whose answers appear nowhere on the rendered page is
  // structured data about content that does not exist. Match on the question
  // text, which is what a reader and a crawler both see.
  for (const [name, html] of PAGES) {
    const questions = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(questions.length >= 5, `${name} should answer at least five questions`);
    for (const question of questions) {
      const visible = question.replace(/'/g, '&rsquo;').replace(/—/g, '&mdash;');
      assert.ok(
        html.includes(`<h3>${question}</h3>`) || html.includes(`<h3>${visible}</h3>`),
        `${name} has a schema question with no visible heading: ${question}`,
      );
    }
  }
});

test('the pages are structured for a reader and a crawler', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /<html lang="en">/, name);
    assert.match(html, /<meta name="viewport"/, name);
    assert.match(html, /<link rel="canonical"/, name);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/, `${name} needs a real description`);
    assert.match(html, /<meta property="og:title"/, `${name} needs Open Graph tags`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${name} needs exactly one h1`);
    assert.match(html, /"@type":"FAQPage"/, `${name} should carry question-shaped structured data`);
  }
  assert.match(index, /"@type":"SoftwareApplication"/);
});

test('the structured data on both pages is valid JSON', () => {
  for (const [name, html] of PAGES) {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length > 0, `${name} has no structured data`);
    for (const [, body] of blocks) {
      assert.doesNotThrow(() => JSON.parse(body), `${name} has a malformed JSON-LD block`);
    }
  }
});

test('every FAQ question is asked once', () => {
  for (const [name, html] of PAGES) {
    const names = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(names).size, names.length, `${name} repeats a question`);
  }
});

test('the result panel has an empty state, an error list, and announces changes', () => {
  assert.match(index, /aria-live="polite"/);
  assert.match(index, /id="emptyState"/);
  assert.match(index, /id="errors"/);
  // An invalid field is marked for assistive technology, not only in colour.
  assert.match(index, /setAttribute\('aria-invalid', 'true'\)/);
  assert.match(index, /id="ladderEmpty"/, 'the table has its own empty state');
});

test('every input on the form has an accessible name', () => {
  // The catalogue shipped 48 axe `label` violations once by putting bare
  // inputs in a table; every control here is inside its own <label>.
  const inputs = [...index.matchAll(/<input [^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 10);
  for (const input of inputs) {
    const id = input.match(/id="([^"]+)"/)?.[1];
    assert.ok(id, `an input has no id: ${input}`);
    const wrapped = new RegExp(`<label[^>]*>[^<]*(?:<[^>]+>[^<]*)*?<input id="${id}"`).test(index);
    const labelled = new RegExp(`<label[^>]*for="${id}"`).test(index) || /aria-label=/.test(input);
    assert.ok(wrapped || labelled, `#${id} has no accessible name`);
  }
});

test('every number input accepts its own default value on its step grid', () => {
  // A browser rejects a value that is not `min + n x step`, so a default off
  // the grid makes the primary journey fail on the first submit.
  const inputs = [...index.matchAll(/<input id="([^"]+)" type="number"([^>]*)>/g)];
  assert.ok(inputs.length >= ALL_INPUT_IDS.length);
  for (const [, id, attrs] of inputs) {
    const step = attrs.match(/step="([^"]+)"/)?.[1];
    const min = Number.parseFloat(attrs.match(/min="([^"]+)"/)?.[1] ?? '0');
    const value = Number.parseFloat(attrs.match(/value="([^"]+)"/)?.[1] ?? 'NaN');
    assert.ok(Number.isFinite(value), `#${id} has no default value`);
    if (!step || step === 'any') continue;
    const steps = (value - min) / Number.parseFloat(step);
    assert.ok(
      Math.abs(steps - Math.round(steps)) < 1e-9,
      `#${id}'s default ${value} is not on its own min/step grid`,
    );
  }
});
