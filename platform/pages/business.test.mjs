import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTACT_EMAIL, INDUSTRIES, PRODUCT_LINES, STATUS, earlyAccessHref, hardwareLines, linesForIndustry, softwareLines,
} from './business.mjs';

const VENTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

test('every line has the documented shape', () => {
  const ids = new Set();
  for (const l of PRODUCT_LINES) {
    assert.match(l.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, l.id);
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    for (const k of ['name', 'customer', 'product']) assert.ok(typeof l[k] === 'string' && l[k].length > 3, `${l.id}.${k}`);
    assert.ok(l.problems.length >= 2 && l.problems.length <= 4, `${l.id}: 2 to 4 problems`);
    assert.ok(Object.hasOwn(STATUS, l.status), `${l.id}: status ${l.status}`);
    assert.ok(['software', 'hardware'].includes(l.kind), l.id);
    assert.ok(l.industry === null || INDUSTRIES.some((i) => i.slug === l.industry), `${l.id}: industry ${l.industry}`);
    assert.ok(Array.isArray(l.tools));
  }
});

test('only Grant Autopilot is marked live, and only a live line links to a product', () => {
  // Honesty is a hard limit (prompts/goals.md). Mark another line live only
  // once a visitor can open and use it, and change this test in the same PR.
  assert.deepEqual(PRODUCT_LINES.filter((l) => l.status === 'live').map((l) => l.id), ['grant-autopilot']);
  for (const l of PRODUCT_LINES) assert.equal(Boolean(l.href), l.status === 'live', l.id);
  assert.equal(PRODUCT_LINES.find((l) => l.id === 'grant-autopilot').href, 'grants/');
});

test('hardware is long-term and says nothing has been built', () => {
  assert.ok(hardwareLines().length > 0);
  for (const l of hardwareLines()) {
    assert.equal(l.status, 'long-term', l.id);
    assert.match(l.product, /long-term/, l.id);
  }
  assert.match(STATUS['long-term'].note, /Nothing has been physically built/);
});

test('no line makes up a statistic, a customer count or a testimonial', () => {
  for (const l of PRODUCT_LINES) {
    const text = [l.name, l.customer, l.product, ...l.problems].join(' ');
    assert.doesNotMatch(text, /\d+\s*%|percent|customers? (love|trust)|trusted by|\$\d|€\d|“[^”]*” —/i, l.id);
  }
});

test('every free tool a line names is a venture in this repository', () => {
  for (const l of PRODUCT_LINES) {
    for (const slug of l.tools) assert.ok(existsSync(path.join(VENTURES, slug, 'index.html')), `${l.id}: ${slug}`);
  }
});

test('every industry has at least one line, and its slug is a path segment', () => {
  for (const i of INDUSTRIES) {
    assert.match(i.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(linesForIndustry(i.slug).length > 0, i.slug);
  }
  assert.deepEqual(INDUSTRIES.map((i) => i.slug), ['construction', 'manufacturing', 'online-sellers', 'eu-e-invoicing', 'nonprofits']);
});

test('software lines put live first and otherwise keep the bets order', () => {
  const ids = softwareLines().map((l) => l.id);
  assert.equal(ids[0], 'grant-autopilot');
  assert.ok(ids.indexOf('contractor-billing') < ids.indexOf('jobshop-quoting'));
  assert.ok(!ids.some((id) => hardwareLines().some((h) => h.id === id)));
});

test('early access goes to the agent-managed inbox with the product in the subject', () => {
  assert.equal(earlyAccessHref('Job shop quoting'), `mailto:${CONTACT_EMAIL}?subject=Early%20access%3A%20Job%20shop%20quoting`);
});
