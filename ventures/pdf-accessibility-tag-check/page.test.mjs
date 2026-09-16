import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzePdf } from './engine.mjs';
import { inflate } from './cli/inflate-node.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('every JSON-LD block is valid JSON', () => {
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('JSON-LD includes a free-priced SoftwareApplication and a FAQPage with 3+ questions', () => {
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('canonical and og:url use the placeholder origin the Pages build rewrites', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/pdf-accessibility-tag-check\/">/);
  assert.match(html, /property="og:url" content="https:\/\/example\.invalid\/pdf-accessibility-tag-check\/"/);
});

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
  assert.match(html, /no file names, no file contents|no file contents, no account/i);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /Evidence, not a determination/);
  assert.match(html, /not a full PDF\/UA or Section 508 conformance audit/);
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

test('engine.mjs, inflate-browser.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/engine\.mjs'/);
  assert.match(html, /from '\.\/inflate-browser\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('a file input and drop zone exist for choosing a PDF', () => {
  assert.match(html, /id="file-input"/);
  assert.match(html, /accept="application\/pdf"/);
  assert.match(html, /id="dropzone"/);
});

test('the CLI batch-scan command is documented', () => {
  assert.match(html, /node cli\/check\.mjs \.\/document-library\/ --json/);
});

test('links to the sibling ADA Title II, Shopify a11y, and VPAT ventures', () => {
  assert.match(html, /ada-title-ii-evidence\//);
  assert.match(html, /shopify-a11y-evidence\//);
  assert.match(html, /vpat-acr-generator\//);
});

test('a worked-example button exists as an alternative to choosing a file', () => {
  assert.match(html, /id="load-example"/);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} =\\s*\\n?\\s*'([^']+)'`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} string literal in index.html`);
  return match[1];
}

test('the bundled worked example decodes to a real PDF that this engine flags as not ok', async () => {
  const base64 = extractConst('EXAMPLE_PDF_BASE64');
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  const report = await analyzePdf(bytes, { inflate });
  assert.equal(report.parsed, true);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  const ids = report.findings.map((f) => f.id);
  assert.ok(ids.includes('not-tagged'));
  assert.ok(ids.includes('missing-title'));
  assert.ok(ids.includes('missing-lang'));
});
