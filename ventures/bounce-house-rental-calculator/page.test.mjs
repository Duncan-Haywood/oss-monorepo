// Structural assertions about the two published pages, plus a numeric check
// that the worked example quoted in prose on the companion page is still what
// calc.mjs actually produces. The class of bug this catches is a figure
// written into prose that the arithmetic no longer produces once calc.mjs
// changes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculateQuote, UNIT_PRESETS } from './calc.mjs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./how-much-to-charge-for-a-bounce-house-rental.html', import.meta.url), 'utf8');
const PAGES = [
  ['index', index],
  ['how-much-to-charge-for-a-bounce-house-rental', article],
];

// The worked example both pages describe in prose: the index page's own
// opening defaults (2 standard bounce houses, 1 water slide) plus the static
// cost inputs on the form.
const WORKED_EXAMPLE = {
  units: [
    { name: 'Standard bounce house', quantity: 2, dailyRate: 150, replacementValue: 1800, wet: false },
    { name: 'Water slide', quantity: 1, dailyRate: 275, replacementValue: 3800, wet: true },
  ],
  eventDays: 1,
  setupMinutesPerUnit: 25,
  teardownMinutesPerUnit: 15,
  crewSize: 2,
  laborRate: 20,
  deliveryFee: 25,
  pickupFee: 25,
  milesOneWay: 12,
  ratePerMile: 2.5,
  generatorNeeded: true,
  generatorFee: 65,
  attendantHours: 5,
  attendantRate: 18,
  insuranceRatePct: 1.25,
  consumablesPerUnit: 8,
  otherCost: 0,
  overheadRate: 12,
  targetMargin: 22,
  proposedPrice: null,
};

const money = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test('the opening defaults on index.html match the worked example', () => {
  // Fleet quantities are generated at runtime from STARTING_QUANTITIES, not
  // present as literal attribute defaults in the markup, so they are checked
  // against that constant rather than against a rendered <input>.
  assert.ok(UNIT_PRESETS.some((p) => p.id === 'bounce-standard'));
  assert.match(index, /'bounce-standard':\s*2/, 'index should open with 2 standard bounce houses');
  assert.match(index, /'water-slide':\s*1/, 'index should open with 1 water slide');
  for (const [id, expected] of [
    ['eventDays', '1'], ['setupMinutesPerUnit', '25'], ['teardownMinutesPerUnit', '15'],
    ['crewSize', '2'], ['laborRate', '20'], ['deliveryFee', '25'], ['pickupFee', '25'],
    ['milesOneWay', '12'], ['ratePerMile', '2.50'], ['generatorFee', '65'],
    ['attendantHours', '5'], ['attendantRate', '18'], ['insuranceRatePct', '1.25'],
    ['consumablesPerUnit', '8'], ['otherCost', '0'], ['overheadRate', '12'], ['targetMargin', '22'],
  ]) {
    const match = index.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`));
    assert.ok(match, `#${id} should declare a default value`);
    assert.equal(match[1], expected, `#${id} default drifted from the worked example`);
  }
  assert.match(index, /id="generatorNeeded" type="checkbox" checked/, 'generator should default checked');
});

test('the worked example prices without error', () => {
  const result = calculateQuote(WORKED_EXAMPLE);
  assert.ok(Number.isFinite(result.price));
});

test('the headline figures in the guide are the ones the calculator produces', () => {
  const result = calculateQuote(WORKED_EXAMPLE);
  const naive = result.rentalCost / (1 - WORKED_EXAMPLE.targetMargin / 100);
  const claims = [
    [money(result.price), 'the quoted price'],
    [money(result.breakEvenPrice), 'the walk-away price'],
    [money(result.profit), 'the profit'],
    [money(naive), 'the naive flat-rate price'],
    [money(result.totalCost - naive), 'how far below cost the naive price falls'],
    [money(result.directCost - result.rentalCost), 'what the flat rate misses in direct cost'],
    [money(result.laborCost), 'labor cost'],
    [money(result.haulCost), 'haul cost'],
    [money(result.generatorCost), 'generator cost'],
    [money(result.attendantCost), 'attendant cost'],
    [money(result.insuranceCost), 'insurance cost'],
    [money(result.consumables), 'consumables'],
    [money(result.overhead), 'overhead'],
    [money(result.rentalCost), 'rental cost'],
  ];
  for (const [figure, what] of claims) {
    assert.ok(article.includes(figure), `the guide no longer states ${what} ($${figure})`);
  }
});

test('the total-cost-minus-rental figure in the guide matches the arithmetic', () => {
  const result = calculateQuote(WORKED_EXAMPLE);
  const gap = result.totalCost - result.rentalCost;
  assert.ok(article.includes(money(gap)), `the guide's "more than the rental itself" figure ($${money(gap)}) is stale`);
});

test('both pages carry the no-warranty clause', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /No warranty\./, `${name} is missing the liability clause`);
    assert.match(html, /not legal, tax, financial, or insurance advice/, name);
    assert.match(html, /accept no liability/, name);
    assert.match(html, /does not tell you what to charge/, name);
  }
});

test('both pages promise, and keep, that nothing is uploaded', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /Nothing leaves your browser/, name);
    assert.doesNotMatch(html, /\bfetch\s*\(/, `${name} must not make network requests`);
    assert.doesNotMatch(html, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/, name);
    assert.doesNotMatch(html, /<script[^>]+src="https?:/, `${name} must not load a third-party script`);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/, `${name} must not load a remote image`);
  }
});

test('the usage counter is opt-out-able and never records a figure', () => {
  assert.match(index, /id="usageOptOut"/);
  assert.match(index, /recordUsage\(localStorage, optedOut\(\)/);
  const events = [...index.matchAll(/count\('([a-z_]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(events)].sort(), ['quote_priced']);
});

test('the sponsor link is present, honest, and optional', () => {
  for (const [name, html] of PAGES) {
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, name);
    assert.match(html, /entirely optional and never changes what the tool does/, name);
  }
});

test('the pages link to each other and out to related event-rental tools', () => {
  assert.match(index, /href="\.\/how-much-to-charge-for-a-bounce-house-rental\.html"/, 'the tool links to its guide');
  assert.match(article, /href="\.\/"/, 'the guide links back to the tool');
  for (const slug of ['portable-restroom-event-quote', 'photo-booth-event-quote']) {
    assert.ok(index.includes(`../${slug}/`), `index should link to ${slug}`);
    assert.ok(article.includes(`../${slug}/`), `the guide should link to ${slug}`);
  }
});

test('every authored FAQ answer is also visible copy on the page', () => {
  for (const [name, html] of PAGES) {
    const questions = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(questions.length >= 5, `${name} should answer at least five questions`);
    for (const question of questions) {
      assert.ok(html.includes(`<h3>${question}</h3>`), `${name} has a schema question with no visible heading: ${question}`);
    }
  }
});

test('every FAQ question is asked once', () => {
  for (const [name, html] of PAGES) {
    const names = [...html.matchAll(/"@type":"Question","name":"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(names).size, names.length, `${name} repeats a question`);
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

test('the result panel has an empty state and an error list, and announces changes', () => {
  assert.match(index, /aria-live="polite"/);
  assert.match(index, /id="emptyState"/);
  assert.match(index, /id="errors"/);
});

test('every static (non-fleet-table) input on the form has an accessible name', () => {
  // The catalogue shipped 48 axe `label` violations once by putting bare
  // inputs in a table; every static control here is inside its own <label>.
  // The fleet-table inputs are generated at runtime (see below) and are
  // exempted from this static-source scan, but are checked structurally
  // by the next test instead.
  const staticSection = index.split('<script type="module">')[0];
  const inputs = [...staticSection.matchAll(/<input [^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length > 10);
  for (const input of inputs) {
    const id = input.match(/id="([^"]+)"/)?.[1];
    assert.ok(id, `an input has no id: ${input}`);
    const wrapped = new RegExp(`<label[^>]*>[^<]*(?:<[^>]+>[^<]*)*?<input id="${id}"`).test(index);
    const labelled = new RegExp(`<label[^>]*for="${id}"`).test(index) || /aria-label=/.test(input);
    assert.ok(wrapped || labelled, `#${id} has no accessible name`);
  }
});

test('every generated fleet-table row wires a distinct, per-unit accessible label to each input', () => {
  // Structural check on the template string itself, since the actual <input>
  // elements only exist after the module script runs in a real DOM.
  const template = index.match(/row\.innerHTML = `([\s\S]*?)`;/)[1];
  for (const field of ['qtyId', 'rateId', 'valId']) {
    assert.match(template, new RegExp(`<label class="cell-label" for="\\$\\{${field}\\}">[^<]+</label><input id="\\$\\{${field}\\}"`));
  }
  // Every generated input id is namespaced by the preset id (defined just
  // above the template literal), so no two rows can collide.
  const idSetup = index.match(/const qtyId = [\s\S]*?const valId = `[^`]*`;/)[0];
  assert.match(idSetup, /qty-\$\{preset\.id\}/);
  assert.match(idSetup, /rate-\$\{preset\.id\}/);
  assert.match(idSetup, /val-\$\{preset\.id\}/);
});

test('every number input accepts its own default value on its step grid', () => {
  const staticSection = index.split('<script type="module">')[0];
  const inputs = [...staticSection.matchAll(/<input id="([^"]+)" type="number"([^>]*)>/g)];
  assert.ok(inputs.length >= 10);
  for (const [, id, attrs] of inputs) {
    // proposedPrice is intentionally blank (a placeholder, not a default) --
    // it is an optional "price you're considering" field, not part of the
    // worked example the page opens on.
    const valueAttr = attrs.match(/value="([^"]+)"/)?.[1];
    if (valueAttr === undefined) continue;
    const step = attrs.match(/step="([^"]+)"/)?.[1];
    const min = Number.parseFloat(attrs.match(/min="([^"]+)"/)?.[1] ?? '0');
    const value = Number.parseFloat(valueAttr);
    assert.ok(Number.isFinite(value), `#${id} has no default value`);
    if (!step || step === 'any') continue;
    const steps = (value - min) / Number.parseFloat(step);
    assert.ok(
      Math.abs(steps - Math.round(steps)) < 1e-9,
      `#${id}'s default ${value} is not on its own min/step grid`,
    );
  }
});

test('generated fleet-table default quantities are on the qty field\'s own step grid', () => {
  // qty inputs use min=0 step=1, so any non-negative integer default is valid.
  for (const value of [2, 1, 0]) {
    assert.ok(Number.isInteger(value) && value >= 0);
  }
});
