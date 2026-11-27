// The shared footer's Privacy section. Until 2026-11-25 it promised that
// nothing was collected ("no tracking cookie, no analytics vendor, and no
// server that could receive it") and carried the counter's details inline.
// The owner, 2026-11-25: "the privacy policies that are like no data gathered
// kill those let's set up real analytics and standard privacy policies and
// other legal docs." It is now a short summary pointing at the Privacy
// Policy, Terms of Use and Cookie Policy (legal-pages.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disclaimerHtml } from './build.mjs';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { legalDocuments, legalFooterHtml, LEGAL_OPERATOR } from './legal-pages.mjs';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('the footer links the three legal pages and no longer promises nothing is collected', () => {
  const html = disclaimerHtml('./', [], { counter: true });
  for (const href of ['./privacy/', './terms/', './cookies/']) assert.ok(html.includes(`href="${href}"`), href);
  assert.doesNotMatch(text(html), /no analytics vendor|no server that could receive it|nothing is collected/i);
  assert.match(text(html), /aggregate daily page counts/);
  assert.match(html, /<h2>No warranty<\/h2>/);
});

test('the footer names Cloudflare Web Analytics only when it is on', () => {
  assert.match(text(legalFooterHtml('../', { analytics: true, counter: true })), /cookieless Cloudflare Web Analytics and aggregate daily page counts/);
  assert.doesNotMatch(text(legalFooterHtml('../', { analytics: false, counter: true })), /Cloudflare Web Analytics/);
  assert.match(text(legalFooterHtml('../', {})), /what our host, Cloudflare, sees/);
});

test('the Privacy Policy follows the switches it is given', () => {
  const on = legalDocuments({ analytics: true, counter: true, feedback: true, exceptions: [{ title: 'DNS check', slug: 'dns', hosts: ['dns.google'] }] });
  const off = legalDocuments({});
  const p = text(on.privacy.body);
  for (const must of ['Maris Stella Labs LLC', 'hello@marisstella.app', 'Cloudflare Web Analytics', 'legitimate interest',
    'Data Privacy Framework', 'complain to your local data-protection authority', 'do not sell or share', 'dns.google',
    'feedback form', 'children under 16', '90 days', 'up to 7 years', 'Anthropic, PBC', 'An AI assistant reads']) {
    assert.ok(p.includes(must), `privacy policy lacks "${must}"`);
  }
  const q = text(off.privacy.body);
  assert.doesNotMatch(q, /Cloudflare Web Analytics\)|loads Cloudflare's analytics script/);
  assert.doesNotMatch(q, /our open-source counter|feedback form/);
  assert.match(text(on.cookies.body), /cookieless: it stores nothing on your device/);
  assert.doesNotMatch(text(off.cookies.body), /Cloudflare Web Analytics/);
  assert.match(text(on.terms.body), /governed by the laws of the State of Colorado/);
});

test('the privacy policy covers early-access sign-ups when the edge Worker is on, and only then', () => {
  const on = legalDocuments({ feedback: true }).privacy.body;
  const off = legalDocuments({}).privacy.body;
  assert.match(on, /Early-access sign-ups\.<\/strong>/);
  assert.match(on, /art\. 6\(1\)\(a\)/, 'consent is the basis');
  assert.match(on, /at most one year from the sign-up/);
  assert.match(on, /only the number of sign-ups per product is public/);
  assert.ok(!/Early-access/.test(off));
});

// Until 2026-11-27 the site's pages named "Mary Stella Labs, LLC" under New
// Mexico law while every paid product's terms named Maris Stella Labs LLC, a
// Colorado LLC (the owner's filing, prompts/goals.md "2026-11-26: agents
// approve launch"). A payment provider's domain review reads both, so they
// must agree: the site's operator and governing law are held to each
// product's committed terms.
test('the site legal pages name the same operator and state as every paid product\'s terms', () => {
  const root = new URL('../../ventures/', import.meta.url);
  const terms = [];
  for (const venture of readdirSync(root)) {
    const apps = new URL(`${venture}/apps/`, root);
    if (!existsSync(apps)) continue;
    for (const app of readdirSync(apps)) {
      const file = new URL(`${app}/docs/legal/terms.md`, apps);
      if (existsSync(file)) terms.push([`${venture}/${app}`, readFileSync(file, 'utf8')]);
    }
  }
  assert.ok(terms.length >= 1, 'no product terms found under ventures/*/apps/*/docs/legal/terms.md');
  for (const [where, body] of terms) {
    assert.ok(body.includes(LEGAL_OPERATOR.name), `${where} terms do not name ${LEGAL_OPERATOR.name}`);
    assert.match(body, new RegExp(`State of ${LEGAL_OPERATOR.jurisdiction}\\b`), `${where} terms are not governed by ${LEGAL_OPERATOR.jurisdiction} law`);
  }
  const site = text(Object.values(legalDocuments({ analytics: true, counter: true, feedback: true })).map((d) => d.body).join(' '));
  assert.doesNotMatch(site, /Mary Stella|New Mexico/);
});
