import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeTrustPolicy } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const docHtml = readFileSync(join(HERE, 'sub-claim-and-wildcard-traps.html'), 'utf8');

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

test('the doc page carries valid HowTo JSON-LD', () => {
  const blocks = jsonLdBlocks(docHtml).map((b) => JSON.parse(b));
  const howTo = blocks.find((b) => b['@type'] === 'HowTo');
  assert.ok(howTo, 'missing HowTo JSON-LD on the doc page');
  assert.ok(howTo.step.length >= 3);
});

test('the no-warranty disclaimer is present on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /No warranty/);
    assert.match(source, /provided free and as-is, without warranty/);
  }
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser|Nothing is uploaded/);
});

test('the page says why not uploading matters for this particular input', () => {
  // A trust policy names a real AWS account; the promise is load-bearing here
  // in a way it is not for a tool that takes a public URL.
  assert.match(html, /AWS account id/);
});

test('the sponsor link points at the correct GitHub Sponsors profile', () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the MIT license is linked on both pages', () => {
  for (const source of [html, docHtml]) {
    assert.match(source, /href="LICENSE"/);
    assert.match(source, /MIT licen[cs]e/);
  }
});

test('a usage opt-out control exists', () => {
  assert.match(html, /id="usageOptOut"/);
});

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full security assessment|is not a determination|not a guarantee/);
});

test('analyze.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the doc page, and the doc page links back', () => {
  assert.match(html, /href="sub-claim-and-wildcard-traps\.html"/);
  assert.match(docHtml, /href="index\.html"/);
});

test('index links to at least one sibling GitHub Actions checker venture', () => {
  assert.match(html, /href="\.\.\/(actions-permissions-check|actions-self-hosted-exposure-check)\/"/);
});

test('a worked-example button exists so the tool is usable without a policy to hand', () => {
  assert.match(html, /id="load-example"/);
});

test('the page states that aud does not restrict which repository', () => {
  assert.match(html, /identifies which service the token is for, not which repository/);
});

test('the page explains the StringEquals literal-wildcard trap', () => {
  assert.match(html, /fails closed|literally an asterisk/);
});

test('the CLI is documented as needing no AWS credentials', () => {
  assert.match(html, /no AWS credentials/i);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example is a real policy that produces danger findings', () => {
  const example = extractConst('EXAMPLE');
  assert.ok(Array.isArray(example.Statement), 'the example must be a policy document');

  const report = analyzeTrustPolicy(example);
  assert.equal(report.ok, false, 'the worked example must demonstrate at least one danger finding');
  // It is specifically the multi-value trap: a pinned branch widened back out
  // by a sibling entry, which is the case a top-down read of the policy misses.
  assert.ok(report.findings.some((f) => f.id === 'sub-any-ref'));
  assert.ok(report.findings.some((f) => f.id === 'sub-multiple-values'));
  assert.ok(report.findings.some((f) => f.severity === 'danger'));
});

test('the worked example pins aud, so it cannot be dismissed as an obviously empty policy', () => {
  const example = extractConst('EXAMPLE');
  const report = analyzeTrustPolicy(example);
  assert.ok(!report.findings.some((f) => f.id === 'aud-missing'));
});

test('index links the Wiz incumbent-comparison page and the sitemap lists it too', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(html, /vs-wiz\.html/);
  assert.match(sitemap, /vs-wiz\.html/);
});

test('the Wiz comparison page links back, names the incumbent honestly, and states no unverifiable price', () => {
  const vsWiz = readFileSync(join(HERE, 'vs-wiz.html'), 'utf8');
  assert.match(vsWiz, /<a href="\.\/">/);
  assert.match(vsWiz, /not affiliated with, endorsed by, or sponsored by Wiz, Inc\./);
  // Wiz publishes no public price list, so no dollar figure for it may
  // appear on the page.
  assert.doesNotMatch(vsWiz, /\$\d/);
  assert.match(vsWiz, /No warranty/);
  assert.match(vsWiz, /Best-effort hosting, no SLA/);
  assert.match(vsWiz, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the Wiz comparison page FAQPage JSON-LD matches the visible copy verbatim', () => {
  const vsWiz = readFileSync(join(HERE, 'vs-wiz.html'), 'utf8');
  const match = vsWiz.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found on vs-wiz.html');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const { name, acceptedAnswer } of schema.mainEntity) {
    assert.ok(vsWiz.includes(`<h3>${name}</h3>`), `FAQ question "${name}" has no matching <h3>`);
    assert.ok(vsWiz.includes(acceptedAnswer.text), `answer not found verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('index links to the vs-reading-the-trust-policy-by-eye comparison page, and the sitemap lists it', () => {
  const sitemap = readFileSync(join(HERE, 'sitemap.xml'), 'utf8');
  assert.match(html, /href="vs-reading-the-trust-policy-by-eye\.html"/);
  assert.match(sitemap, /vs-reading-the-trust-policy-by-eye\.html/);
});

test('the reading-by-eye comparison page links back, carries the required clauses, and names no product', () => {
  const page = readFileSync(join(HERE, 'vs-reading-the-trust-policy-by-eye.html'), 'utf8');
  assert.match(page, /<a href="index\.html">/);
  assert.match(page, /No warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the reading-by-eye comparison page FAQPage JSON-LD is valid and matches the visible copy', () => {
  const page = readFileSync(join(HERE, 'vs-reading-the-trust-policy-by-eye.html'), 'utf8');
  const blocks = jsonLdBlocks(page).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(page.includes(`<h3>${name}</h3>`), `FAQ question "${name}" has no matching <h3>`);
    assert.ok(page.includes(acceptedAnswer.text), `answer not found verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});
