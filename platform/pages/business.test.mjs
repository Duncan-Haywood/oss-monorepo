import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTACT_EMAIL, INDUSTRIES, PRODUCT_LINES, STATUS, buildFirstHref, earlyAccessHref, hardwareLines, industriesWithProducts, lineHref, listNames,
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

test('only lines a visitor can open today are live, and only a live line links to a product', () => {
  // Honesty is a hard limit (prompts/goals.md). Mark another line live only
  // once a visitor can open and use it, and change this test in the same PR.
  // 2026-11-27: PayApps and Seller Books opened sign-ups on their Free plans
  // (payapps-deploy run 45949861746, seller-books-deploy run 45973427499).
  assert.deepEqual(PRODUCT_LINES.filter((l) => l.status === 'live').map((l) => l.id), ['contractor-billing', 'seller-books', 'grant-autopilot']);
  for (const l of PRODUCT_LINES) assert.equal(Boolean(l.href), l.status === 'live', l.id);
  assert.equal(PRODUCT_LINES.find((l) => l.id === 'grant-autopilot').href, 'grants/');
  assert.equal(PRODUCT_LINES.find((l) => l.id === 'contractor-billing').href, 'https://payapps.marisstella.app/?signup&from=products');
  assert.equal(PRODUCT_LINES.find((l) => l.id === 'seller-books').href, 'https://seller-books.marisstella.app/signup?from=products');
  // An app on its own origin is https and says what its Free plan does, with paid plans not on sale.
  for (const l of PRODUCT_LINES.filter((x) => /^https?:/.test(x.href ?? ''))) {
    assert.match(l.href, /^https:\/\/[a-z-]+\.marisstella\.app\//, l.id);
    assert.match(l.plan, /Free|free/, l.id);
    assert.match(l.plan, /not on sale yet/, l.id);
    assert.doesNotMatch(l.plan, /\$\d/, `${l.id}: no price while checkout is dark`);
  }
});

test('lineHref keeps an app origin and roots a site path; listNames reads as prose', () => {
  assert.equal(lineHref({ href: 'grants/' }, '../'), '../grants/');
  assert.equal(lineHref({ href: 'https://a.marisstella.app/x' }, '../'), 'https://a.marisstella.app/x');
  assert.equal(lineHref({ href: null }), null);
  assert.equal(listNames([]), 'None');
  assert.equal(listNames(['A']), 'A');
  assert.equal(listNames(['A', 'B', 'C']), 'A, B and C');
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
  // Live lines first (in bets order: PayApps, Seller Books, then Grant Autopilot), then early access.
  assert.deepEqual(ids.slice(0, 3), ['contractor-billing', 'seller-books', 'grant-autopilot']);
  assert.ok(ids.indexOf('contractor-billing') < ids.indexOf('jobshop-quoting'));
  assert.ok(!ids.some((id) => hardwareLines().some((h) => h.id === id)));
});

test('early access goes to the agent-managed inbox with the product in the subject', () => {
  assert.equal(earlyAccessHref('Job shop quoting'), `mailto:${CONTACT_EMAIL}?subject=Early%20access%3A%20Job%20shop%20quoting`);
});
