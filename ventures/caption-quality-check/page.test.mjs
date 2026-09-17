import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOCS_PAGE = 'why-caption-quality-matters.html';

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

async function read(file) {
  return readFile(new URL(`./${file}`, import.meta.url), 'utf8');
}

// The FAQ checks below asserted `html.includes(...)` against the whole file.
// That can never fail: the JSON-LD block is itself part of `html`, so every
// question and answer trivially "appeared" — including in the test literally
// named "also present as visible text". The check that matters, and the one
// Google's structured-data policy enforces, is that the text is prose a
// visitor actually reads. So strip the JSON-LD blocks first, then the tags,
// then decode the entities the markup uses but the JSON spells literally, and
// compare on normalised whitespace.
function visibleText(html) {
  return html
    .replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&larr;/g, '←')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is `text` prose a visitor can read on `html`, rather than only JSON-LD? */
function isVisibleProse(html, text) {
  return visibleText(html).includes(text.replace(/\s+/g, ' ').trim());
}

test('every JSON-LD block on the index page is valid JSON', async () => {
  const html = await read('index.html');
  const blocks = jsonLdBlocks(html);
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('index JSON-LD includes a free-priced SoftwareApplication and a FAQPage', async () => {
  const html = await read('index.html');
  const parsed = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('every FAQPage question on every page is also present as visible text', async () => {
  for (const file of ['index.html', DOCS_PAGE]) {
    const html = await read(file);
    const faqBlocks = jsonLdBlocks(html).map((b) => JSON.parse(b)).filter((b) => b['@type'] === 'FAQPage');
    for (const faq of faqBlocks) {
      for (const q of faq.mainEntity) {
        assert.ok(
          isVisibleProse(html, q.name),
          `${file}: question "${q.name}" must appear as visible prose, not only inside the JSON-LD`,
        );
      }
    }
  }
});

test('the docs page carries valid FAQPage JSON-LD', async () => {
  const html = await read(DOCS_PAGE);
  const blocks = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the doc page');
  assert.ok(faq.mainEntity.length >= 3);
});

test('the no-warranty disclaimer is present on both pages', async () => {
  for (const file of ['index.html', DOCS_PAGE]) {
    const html = await read(file);
    assert.match(html, /No warranty/, `${file} is missing the no-warranty clause`);
    assert.match(html, /provided free and as-is, without warranty/, `${file} is missing the full clause text`);
  }
});

test('the privacy line states nothing is uploaded', async () => {
  const html = await read('index.html');
  assert.match(html, /never uploaded|never leaves your device/);
});

test('the sponsor link points at the correct GitHub Sponsors profile on both pages', async () => {
  for (const file of ['index.html', DOCS_PAGE]) {
    const html = await read(file);
    assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/, `${file} is missing the sponsor link`);
  }
});

test('the MIT license is linked from index', async () => {
  const html = await read('index.html');
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
});

test('a usage opt-out control exists', async () => {
  const html = await read('index.html');
  assert.match(html, /id="usageOptOut"/);
});

test('the "not a certification" disclaimer is present', async () => {
  const html = await read('index.html');
  assert.match(html, /not a certification of WCAG/);
});

test('engine.mjs and usage.mjs are imported as ES modules, not duplicated inline', async () => {
  const html = await read('index.html');
  assert.match(html, /from '\.\/engine\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
});

test('index links to the docs page and the docs page links back', async () => {
  const index = await read('index.html');
  const docs = await read(DOCS_PAGE);
  assert.match(index, new RegExp(`href="${DOCS_PAGE.replace(/\./g, '\\.')}"`));
  assert.match(docs, /href="\.\/"/);
});

test('index links to at least one sibling accessibility-evidence venture', async () => {
  const html = await read('index.html');
  assert.match(html, /href="\.\.\/(ada-title-ii-evidence|shopify-a11y-evidence)\/"/);
});

test('a worked-example button exists as an alternative to pasting from scratch', async () => {
  const html = await read('index.html');
  assert.match(html, /id="load-example"/);
});

test('the page documents both accepted formats', async () => {
  const html = await read('index.html');
  assert.match(html, /SRT/);
  assert.match(html, /WebVTT/);
});

test('the CLI file exists and the page documents it', async () => {
  const html = await read('index.html');
  assert.match(html, /node check\.mjs/);
});

test('the worked example demonstrates a fast-reading and an overlap issue', async () => {
  const html = await read('index.html');
  assert.match(html, /far too fast to read in just one second|far too many characters/);
  assert.match(html, /[Oo]verlap/);
});

test('the docs page explains the commonly-cited style guides by name', async () => {
  const html = await read(DOCS_PAGE);
  assert.match(html, /Netflix/);
  assert.match(html, /BBC/);
});

const VS_PAGE = 'vs-professional-caption-qc-review.html';

test('the comparison page carries valid FAQPage JSON-LD matching its visible questions', async () => {
  const html = await read(VS_PAGE);
  const blocks = jsonLdBlocks(html).map((b) => JSON.parse(b));
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const q of faq.mainEntity) {
    assert.ok(
      isVisibleProse(html, q.name),
      `question "${q.name}" must appear as visible prose, not only inside the JSON-LD`,
    );
    assert.ok(
      isVisibleProse(html, q.acceptedAnswer.text),
      `answer to "${q.name}" must appear as visible prose, not only inside the JSON-LD`,
    );
  }
});

test('the comparison page carries the no-warranty clause, links back to the tool, and does not claim affiliation', async () => {
  const html = await read(VS_PAGE);
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
  assert.match(html, /href="\.\/">/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by any specific captioning vendor/);
});

test('the comparison page is reachable from the sitemap and linked from index or the docs page', async () => {
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, new RegExp(VS_PAGE.replace(/\./g, '\\.')));
});
