import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the billable-weight panel is announced to screen readers on every update', () => {
  // #billable, #billedOn, the lever lines and the flag all rewrite on every
  // keystroke with no page reload; without aria-live="polite" on their shared
  // container a screen-reader user hears nothing when the answer changes.
  const html = page('index.html');
  assert.match(html, /<section class="result" aria-live="polite"><h2>Billable weight<\/h2>/);
});

test('every input carries a visible label, not a placeholder standing in for one', () => {
  // The defect the catalogue-wide axe sweep found on three live products: a
  // bare number input is announced as "edit, number" and nothing else.
  const html = page('index.html');
  const inputs = html.match(/<input [^>]*id="[^"]+"/g) ?? [];
  assert.ok(inputs.length >= 7, 'expected the six numeric fields and the rounding checkbox');
  for (const id of ['length', 'width', 'height', 'weight', 'divisor', 'packages', 'roundDimensions']) {
    assert.match(
      html,
      new RegExp(`<label[^>]*>[^<]*<input id="${id}"|<label[^>]*><input id="${id}"`),
      `#${id} must sit inside its own <label>`,
    );
  }
});

test('the page imports the engine rather than reimplementing the arithmetic', () => {
  // A second copy of the formula in a <script> block is how a page and its
  // tests start disagreeing about what the tool does.
  const html = page('index.html');
  assert.match(html, /import \{ calculateBillableWeight \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ leverText \} from '\.\/levers\.mjs'/);
  assert.ok(!/\/\s*139\b/.test(html.split('<script type="module">')[1] ?? ''), 'the divisor must not be hard-coded in page script');
});

test('both pages carry the no-warranty clause and the sponsor link', () => {
  for (const name of ['index.html', 'how-dimensional-weight-is-billed.html']) {
    const html = page(name);
    assert.match(html, /No warranty/, `${name} must carry the disclaimer`);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, `${name} must carry the sponsor link`);
    assert.match(html, /href="LICENSE"/, `${name} must link the licence`);
  }
});

test('the disclaimer names the divisor and surcharge thresholds as contract terms', () => {
  // The one claim this tool could mislead on: presenting a default divisor or a
  // surcharge threshold as a fact rather than as something to verify.
  const html = page('index.html');
  assert.match(html, /contract terms that differ by carrier, service and account/);
});

test('index and the explainer link each other, so neither is a crawlable orphan', () => {
  assert.match(page('index.html'), /href="\.\/how-dimensional-weight-is-billed\.html"/);
  assert.match(page('how-dimensional-weight-is-billed.html'), /href="\.\/"/);
});

// Closest sibling: the same desk and the same question one tier up. A parcel
// prices on a divisor, a pallet on a density band, and a seller crossing that
// line needs to know the rule changed. Without a crawlable link here, a crawler
// entering on this page never reaches the LTL estimator in one hop.
test('both pages link one hop to the ltl-freight-class-estimator sibling', () => {
  for (const name of ['index.html', 'how-dimensional-weight-is-billed.html']) {
    assert.match(
      page(name),
      /href="\.\.\/ltl-freight-class-estimator\/"/,
      `${name} must link ../ltl-freight-class-estimator/ so crawlers reach the LTL estimator in one hop`,
    );
  }
});

test('the shipped default values are the worked example the copy describes', () => {
  // The FAQ and the explainer both quote "a four pound item in a sixteen by
  // twelve by ten inch carton bills at fourteen pounds". If the form ships
  // different defaults, the first thing a visitor sees contradicts the prose.
  const html = page('index.html');
  for (const [id, value] of [['length', 16], ['width', 12], ['height', 10], ['weight', 4], ['divisor', 139], ['packages', 1]]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*value="${value}"`), `#${id} must ship value="${value}"`);
  }
});
