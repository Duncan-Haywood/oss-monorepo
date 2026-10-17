import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildReport } from './analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'index.html'), 'utf8');
const vsHtml = readFileSync(join(HERE, 'vs-checking-the-url-by-hand.html'), 'utf8');

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

test('the no-warranty disclaimer is present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
});

test('the privacy line states nothing is uploaded', () => {
  assert.match(html, /never uploaded|Nothing leaves your browser/);
});

test('the "only test systems you are authorised to" caution is present', () => {
  assert.match(html, /authoris(?:ed|ation)/i);
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

test('the evidence-not-a-determination disclaimer is present', () => {
  assert.match(html, /not a full security assessment|is not a determination|not a guarantee/);
});

test('analyze.mjs and usage.mjs are imported as ES modules, not duplicated inline', () => {
  assert.match(html, /from '\.\/analyze\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to at least one sibling checker venture', () => {
  assert.match(html, /href="\.\.\/(docker-build-secrets-check|security-headers-check|cors-misconfig-check|env-example-drift-check)\/"/);
});

// docker-build-secrets-check links here, so this link is the return half of
// that pair -- platform/pages/siblings.mjs runs a budget of 0, and dropping
// this makes the new venture a crawlable orphan.
test('index links back to docker-build-secrets-check, closing the sibling pair', () => {
  assert.match(html, /href="\.\.\/docker-build-secrets-check\/"/);
});

// backup-file-exposure-check links out to this venture but nothing linked
// back, which made it a crawlable orphan (platform/pages/siblings.mjs runs
// a budget of 0) -- this link is the return half of that pair.
test('index links to backup-file-exposure-check, closing the sibling pair', () => {
  assert.match(html, /href="\.\.\/backup-file-exposure-check\/"/);
});

test('a worked-example button exists as an alternative to running the CLI first', () => {
  assert.match(html, /id="load-example"/);
});

test('the page explains why the body is checked, not just the status code', () => {
  assert.match(html, /soft-404|soft 404/i);
});

function extractConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n  \\});`);
  const match = html.match(re);
  assert.ok(match, `expected an inline const ${name} object literal in index.html`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${match[1]});`)();
}

test('the bundled worked example is valid input for buildReport and produces a danger finding', () => {
  const example = extractConst('EXAMPLE');
  assert.equal(typeof example.target, 'string');
  assert.equal(typeof example.head, 'object');
  assert.equal(typeof example.config, 'object');

  const report = buildReport(example.target, example);
  assert.equal(report.ok, false, 'the worked example must demonstrate the danger finding');
  assert.ok(report.findings.some((f) => f.id === 'git-directory-exposed'));
});

test('the vs page carries valid FAQPage JSON-LD', () => {
  const blocks = jsonLdBlocks(vsHtml);
  assert.ok(blocks.length >= 1);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the vs page');
  assert.ok(faq.mainEntity.length >= 3);
});

test('the no-warranty and authorisation disclaimers are present on the vs page too', () => {
  assert.match(vsHtml, /No warranty/);
  assert.match(vsHtml, /provided free and as-is, without warranty/);
  assert.match(vsHtml, /authoris(?:ed|ation)/i);
});

test('the vs page links back to the index page, and index links to the vs page', () => {
  assert.match(vsHtml, /href="index\.html"/);
  assert.match(html, /href="vs-checking-the-url-by-hand\.html"/);
});

test('the vs page names no competing product or company', () => {
  const bodyOnly = vsHtml.replace(/<a\b[^>]*href="[^"]*"[^>]*>/gi, '');
  assert.doesNotMatch(bodyOnly, /git-dumper|GitTools/i);
});

// The false-positive and false-negative worked examples on the vs page are a
// factual claim about analyze.mjs's own classification -- pinned against the
// real function rather than typed by hand, so a change to looksLikeGitHead or
// buildReport that breaks either claim fails here instead of shipping a page
// that describes behaviour the code no longer has.
test('the vs page worked examples match analyze.mjs: a soft-404 is clean and a detached HEAD is a finding', () => {
  const softNotFoundBody = '<html><body>404 - Page Not Found</body></html>';
  const softReport = buildReport('https://example.com/', {
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: softNotFoundBody },
    config: { ok: true, status: 200, url: 'https://example.com/.git/config', bodySample: softNotFoundBody },
  });
  assert.equal(softReport.ok, true, 'a soft-404 page must not be reported as exposed');
  assert.equal(softReport.findings.length, 0);

  const detachedSha = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const detachedReport = buildReport('https://example.com/', {
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: detachedSha },
    config: { ok: true, status: 404, url: 'https://example.com/.git/config', bodySample: '' },
  });
  assert.equal(detachedReport.ok, false, 'a detached-HEAD exposure must still be reported');
  assert.ok(detachedReport.findings.some((f) => f.id === 'git-head-exposed'));

  assert.match(vsHtml, new RegExp(detachedSha));
});
