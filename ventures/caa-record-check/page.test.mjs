import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const guideHtml = readFileSync(join(HERE, 'how-caa-blocks-certificate-issuance.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-a-plain-dns-lookup.html'), 'utf8');

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

test('the no-warranty disclaimer is present on the index, guide, and vs pages', () => {
  for (const source of [html, guideHtml, vsHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded and nothing is sent to the checked hostname', () => {
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /nothing is ever sent to the hostname you check/i);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on the index, guide, and vs pages', () => {
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
  assert.match(vsHtml, /href="LICENSE"/);
  assert.match(vsHtml, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a determination|not a guarantee/i);
});

test('lookup.mjs, analyze.mjs, and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/lookup\.mjs'/);
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the guide page, and the guide page links back', () => {
  assert.match(html, /href="how-caa-blocks-certificate-issuance\.html"/);
  assert.match(guideHtml, /href="index\.html"/);
});

test('index links to the vs page, and the vs page links back', () => {
  assert.match(html, /href="vs-a-plain-dns-lookup\.html"/);
  assert.match(vsHtml, /href="index\.html"/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(email-auth-check|security-headers-check|subdomain-takeover-check)\/"/);
});

test('a worked-example button exists as an alternative to entering a real hostname first', () => {
  assert.match(html, /id="load-example"/);
});

test('the CLI is documented as an alternative for CI use', () => {
  assert.match(html, /node check\.mjs/);
});

test('the page states this tool never contacts the hostname being checked', () => {
  assert.match(html, /never contacts? the hostname/i);
});

test('index.html never writes, submits, or deletes -- only a read-only DNS lookup is documented', () => {
  assert.doesNotMatch(html, /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/);
});

test('the guide page states that fixing one cause does not fix the others', () => {
  assert.match(guideHtml, /fixing one does not fix the others/i);
});

test('the report distinguishes the RFC 8659 tree-walk from a plain exact-name lookup in the page copy', () => {
  assert.match(html, /RFC 8659/);
  assert.match(html, /tree-walk|walk(?:s|ed|ing)? up/i);
});

test('the critical-tag finding is explained in the page copy', () => {
  assert.match(html, /critical/i);
  assert.match(html, /unrecognized tag|unrecognised tag/i);
});
