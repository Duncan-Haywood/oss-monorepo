import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('every JSON-LD block on the index page is valid JSON', () => {
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('JSON-LD includes SoftwareApplication with a free price and FAQPage', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('every FAQPage question also appears as a visible heading on the page', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  for (const q of faq.mainEntity) {
    assert.ok(html.includes(q.name), `FAQ question not visible on page: "${q.name}"`);
  }
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
  assert.match(html, /not email deliverability, security, or DNS configuration/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /Nothing is uploaded|never uploaded/);
});

test('the evidence-not-a-determination framing is present, not a bare pass/fail claim', () => {
  assert.match(html, /Evidence, not a determination/);
  assert.match(html, /not a determination that your email is secure/i);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked', () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('lookup.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/lookup\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('a domain input and check button exist', () => {
  assert.match(html, /id="domain"/);
  assert.match(html, /id="check"/);
});

test('a worked-example button exists', () => {
  assert.match(html, /id="load-example"/);
});

test('index links to at least one sibling DNS/discoverability checker venture', () => {
  assert.match(html, /href="\.\.\/(dns-configuration-evidence|ai-crawler-access-check)\/"/);
});

test('the SPF 10-lookup limit is explained in plain language', () => {
  assert.match(html, /10 DNS lookups/);
  assert.match(html, /RFC 7208/);
});

test('DMARC p=none is explained as the common spoofable-but-configured-looking gap', () => {
  assert.match(html, /p=none/);
  assert.match(html, /monitor-only/);
});

// --- the SPF PermError guide page -------------------------------------------
//
// The guide is this venture's organic-search surface: the query a reader types
// ("spf too many dns lookups", "spf permerror") before they know a checker
// exists. `guide-coverage.mjs` only asks whether a secondary page is present,
// so these assertions pin the parts that make it useful rather than merely
// present -- the inbound link, the FAQ/JSON-LD agreement Google's policy
// requires, and the clauses every published page here carries.

const guideUrl = new URL('./how-to-fix-spf-too-many-dns-lookups.html', import.meta.url);
const guide = readFileSync(fileURLToPath(guideUrl), 'utf8');

test('the tool page links to the SPF lookup-limit guide', () => {
  assert.match(html, /href="how-to-fix-spf-too-many-dns-lookups\.html"/);
});

test('the guide links back to the tool it belongs to', () => {
  assert.match(guide, /href="\.\/"/);
});

test('the guide declares a canonical URL matching its own filename', () => {
  assert.match(guide, /<link rel="canonical" href="\.\/how-to-fix-spf-too-many-dns-lookups\.html">/);
});

test('every guide FAQPage question is also a visible heading on the guide', () => {
  const faq = jsonLdBlocks(guide).map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'guide is missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 4);
  for (const q of faq.mainEntity) {
    assert.ok(guide.includes(q.name), `guide FAQ question not visible on page: "${q.name}"`);
  }
});

test('the guide carries the no-warranty and not-affiliated clauses', () => {
  assert.match(guide, /No warranty/);
  assert.match(guide, /provided free and as-is, without warranty/);
  assert.match(guide, /not email deliverability, security, or DNS configuration/);
  assert.match(guide, /Not affiliated with, endorsed by, or sponsored by/);
});

test('the guide names the limit and its RFC section rather than asserting it bare', () => {
  assert.match(guide, /10 DNS lookups/);
  assert.match(guide, /RFC 7208/);
  assert.match(guide, /4\.6\.4/);
});

test('the guide states the flattening tradeoff rather than recommending it unqualified', () => {
  assert.match(guide, /freezes your (?:sending )?provider/i);
});

test('the guide keeps the sponsor link optional and correctly targeted', () => {
  assert.match(guide, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});
