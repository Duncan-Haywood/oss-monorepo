import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guideHtml = readFileSync(join(HERE, 'why-cnames-end-up-dangling.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-checking-dig-by-hand.html'), 'utf8');

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

test('the guide page carries valid HowTo JSON-LD', () => {
  const blocks = jsonLdBlocks(guideHtml).map((b) => JSON.parse(b));
  const howTo = blocks.find((b) => b['@type'] === 'HowTo');
  assert.ok(howTo, 'missing HowTo JSON-LD on the guide page');
  assert.ok(howTo.step.length >= 3);
});

test('the vs page carries valid FAQPage JSON-LD', () => {
  const blocks = jsonLdBlocks(vsHtml).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the vs page');
});

test('the no-warranty disclaimer is present on the index and vs pages', () => {
  for (const source of [html, vsHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never sent to us|Nothing leaves your browser/);
});

test('the "only run this against a hostname you own or are authorised" caution is present', () => {
  for (const source of [html, guideHtml, vsHtml]) {
    assert.match(source, /own or are authoris(?:ed|ation)|authoris(?:ed|ation) to test/i);
  }
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on the index and vs pages', () => {
  for (const source of [html, vsHtml]) {
    assert.match(source, /href="LICENSE"/);
    assert.match(source, /MIT licen[cs]e/);
  }
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full (audit|security review)|is not a determination|not a guarantee/);
});

test('lookup.mjs, probe.mjs, analyze.mjs, fingerprints.mjs, and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/lookup\.mjs'/);
  assert.match(html, /from '\.\/probe\.mjs'/);
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/fingerprints\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the guide page, and the guide page links back', () => {
  assert.match(html, /href="why-cnames-end-up-dangling\.html"/);
  assert.match(guideHtml, /href="index\.html"/);
});

test('index links to the vs page, and the vs page links back', () => {
  assert.match(html, /href="vs-checking-dig-by-hand\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('index links to at least one sibling security-checker venture', () => {
  assert.match(html, /href="\.\.\/(dotenv-exposure-check|git-exposure-check|security-headers-check)\/"/);
});

test('a worked-example button exists as an alternative to entering a real hostname first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI is documented as an alternative for CI use', () => {
  assert.match(html, /node check\.mjs/);
});

test('the page explains the CORS limitation on a live browser fetch', () => {
  assert.match(html, /CORS/);
});

test('the page states this tool never attempts to claim or configure anything at a provider', () => {
  assert.match(html, /never attempts? to claim|detection and reporting only/i);
});

test('index.html never writes, submits, or deletes -- only GET-shaped requests are documented', () => {
  assert.doesNotMatch(html, /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
});

test('the guide page states that fixing one cause does not fix the others', () => {
  assert.match(guideHtml, /fixing one does not fix the others/i);
});

test('the report distinguishes confirmed from unconfirmed findings in the page copy', () => {
  assert.match(html, /confirmed/i);
  assert.match(html, /unconfirmed/i);
});

// caa-record-check shipped after this venture and links here from its own
// footer, but siblings.mjs only counts a link from a tool's *entry page*, so
// the reciprocal has to be explicit -- otherwise a crawler landing on this
// page first never reaches the other DNS-hygiene checker in one hop.
test('index links one hop to the caa-record-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/caa-record-check\/"/,
    'index must link ../caa-record-check/ so crawlers reach the CAA checker in one hop',
  );
});
