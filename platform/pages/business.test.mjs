import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTACT_EMAIL, INDUSTRIES, PRODUCT_LINES, STATUS, usableSentence, buildFirstHref, earlyAccessHref, hardwareLines, industriesWithProducts,
  industriesWithoutProducts, linesForIndustry, softwareLines,
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

test('open-free lines are the deployed apps, with a sign-up URL and no claim of a sale', () => {
  const open = PRODUCT_LINES.filter((l) => l.status === 'open-free');
  assert.deepEqual(open.map((l) => l.id), ['contractor-billing', 'jobshop-quoting', 'cmmc-workspace', 'seller-books']);
  for (const l of PRODUCT_LINES) assert.equal(Boolean(l.appUrl), l.status === 'open-free', `${l.id}: appUrl only on an open-free line`);
  assert.equal(open[0].appUrl.startsWith('https://payapps.marisstella.app/'), true);
  assert.equal(open[1].appUrl.startsWith('https://jobshop-quote.marisstella.app/'), true);
  assert.equal(open[2].appUrl.startsWith('https://cmmc.marisstella.app/'), true);
  assert.equal(open[3].appUrl.startsWith('https://seller-books.marisstella.app/'), true);
  assert.match(STATUS['open-free'].note, /Nothing is sold yet/);
  assert.equal(usableSentence(), 'Grant Autopilot is live, and PayApps, Job Shop Quote, CMMC Workspace and Seller Books are open on a free plan.');
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

test('every industry has a path-segment slug, and either a product line or jobs and free tools', () => {
  const slugs = new Set();
  for (const i of INDUSTRIES) {
    assert.match(i.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(!slugs.has(i.slug), `duplicate industry ${i.slug}`);
    slugs.add(i.slug);
    for (const k of ['name', 'who']) assert.ok(typeof i[k] === 'string' && i[k].length > 3, `${i.slug}.${k}`);
    if (linesForIndustry(i.slug).length) continue;
    // Owner, 2026-11-25: cover most kinds of small business. An industry with
    // no product yet earns its page with the jobs and the free tools for them.
    assert.ok(i.problems.length >= 2 && i.problems.length <= 4, `${i.slug}: 2 to 4 jobs`);
    assert.ok(i.tools.length >= 3, `${i.slug}: at least 3 free tools`);
  }
  // The five with a product keep bets.md's order at the top.
  assert.deepEqual(industriesWithProducts().map((i) => i.slug), ['construction', 'manufacturing', 'online-sellers', 'eu-e-invoicing', 'nonprofits']);
  assert.deepEqual(INDUSTRIES.slice(0, 5).map((i) => i.slug), industriesWithProducts().map((i) => i.slug));
  assert.ok(industriesWithoutProducts().length >= 12, 'most kinds of small business are covered');
});

test('every free tool an industry names is a venture in this repository', () => {
  for (const i of INDUSTRIES) {
    for (const slug of i.tools) assert.ok(existsSync(path.join(VENTURES, slug, 'index.html')), `${i.slug}: ${slug}`);
  }
});

test('no industry makes up a statistic, a customer quote or a product', () => {
  for (const i of INDUSTRIES) {
    const text = [i.name, i.who, ...i.problems].join(' ');
    assert.doesNotMatch(text, /\d+\s*%|percent|customers? (tell|say|love|trust)|trusted by|\$\d|€\d|“[^”]*” —/i, i.slug);
  }
});

test('asking what to build first goes to the agent-managed inbox with the industry in the subject', () => {
  assert.equal(buildFirstHref({ name: 'Fitness studios' }), `mailto:${CONTACT_EMAIL}?subject=Build%20first%20for%20Fitness%20studios`);
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
