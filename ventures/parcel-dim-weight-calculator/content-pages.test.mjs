// The prose on both pages quotes a worked example. This asserts the engine
// still produces it.
//
// A marketing page is the surface a stranger meets first, and it is the one
// nothing re-checks: the copy is written once and the engine keeps moving. A
// page that confidently states an answer the tool no longer gives is worse than
// a page that says nothing, because the reader has no way to tell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { calculateBillableWeight } from './calc.mjs';
import { leverText } from './levers.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// The example both pages are written around, and the form's shipped defaults.
const EXAMPLE = { length: 16, width: 12, height: 10, weight: 4, divisor: 139 };

test('the worked example still yields the cube, dimensional weight and billable weight the copy quotes', () => {
  const result = calculateBillableWeight(EXAMPLE);
  assert.equal(result.cube, 1920);
  assert.equal(result.dimWeight.toFixed(2), '13.81');
  assert.equal(result.billableWeight, 14);
  assert.equal(result.billedOn, 'dimensional');

  const explainer = page('how-dimensional-weight-is-billed.html');
  assert.match(explainer, /1,920 cubic inches/);
  assert.match(explainer, /13\.81 pounds/);
  assert.match(explainer, /bills at 14 pounds/);
});

test('the "ten pounds of air" both pages claim is what the engine reports', () => {
  const result = calculateBillableWeight(EXAMPLE);
  assert.equal(result.lever.airWeight, 10);
  assert.match(leverText(result).plain.join(' '), /10 lb of air/);
  for (const name of ['index.html', 'how-dimensional-weight-is-billed.html']) {
    assert.match(page(name), /[Tt]en (?:of those pounds|pounds)/, `${name} must still say ten pounds are air`);
  }
});

test('the 556 cubic inch break-even the explainer quotes is the engine’s own', () => {
  const result = calculateBillableWeight(EXAMPLE);
  assert.equal(result.lever.targetCube, 556);
  assert.match(page('how-dimensional-weight-is-billed.html'), /556 cubic inches/);
});

test('the 2.9 inch packed height the explainer quotes is the engine’s own', () => {
  const result = calculateBillableWeight(EXAMPLE);
  assert.equal(result.lever.targetHeight.toFixed(1), '2.9');
  assert.match(page('how-dimensional-weight-is-billed.html'), /2\.9 inches/);
});

test('the explainer ships structured data and every answer in it is visible on the page', () => {
  // The portfolio-wide guard checks this too; asserting it here means the
  // venture's own CI catches a hand-edit to one copy and not the other.
  const html = page('how-dimensional-weight-is-billed.html');
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'the explainer must ship JSON-LD');
  const data = JSON.parse(block[1]);
  assert.equal(data['@type'], 'FAQPage');
  assert.ok(data.mainEntity.length >= 5);
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  for (const entry of data.mainEntity) {
    assert.ok(visible.includes(entry.name), `question not visible on the page: ${entry.name}`);
    assert.ok(visible.includes(entry.acceptedAnswer.text), `answer not visible on the page: ${entry.name}`);
  }
});

test('the explainer does not carry form controls, which would make it an app view rather than an article', () => {
  // `secondary-schema.test.mjs` distinguishes prose pages from tool views by
  // this exact signal, and FAQPage markup only describes the former.
  assert.equal(/<(input|select|textarea|button|form)\b/i.test(page('how-dimensional-weight-is-billed.html')), false);
});
