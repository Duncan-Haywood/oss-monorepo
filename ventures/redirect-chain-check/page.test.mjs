import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOCS_PAGE = 'why-redirect-chains-matter.html';
const VS_PAGE = 'vs-httpstatus-io.html';
const VS_HAND_PAGE = 'vs-checking-a-chain-by-hand.html';

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
  for (const file of ['index.html', DOCS_PAGE, VS_PAGE, VS_HAND_PAGE]) {
    const html = await read(file);
    const faqBlocks = jsonLdBlocks(html).map((b) => JSON.parse(b)).filter((b) => b['@type'] === 'FAQPage');
    for (const faq of faqBlocks) {
      for (const q of faq.mainEntity) {
        assert.ok(html.includes(q.name), `${file}: question "${q.name}" not found as visible text`);
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

test('the no-warranty disclaimer is present on all four pages', async () => {
  for (const file of ['index.html', DOCS_PAGE, VS_PAGE, VS_HAND_PAGE]) {
    const html = await read(file);
    assert.match(html, /No warranty/, `${file} is missing the no-warranty clause`);
    assert.match(html, /provided free and as-is, without warranty/, `${file} is missing the full clause text`);
  }
});

test('the privacy line states nothing is uploaded', async () => {
  const html = await read('index.html');
  assert.match(html, /never uploaded|never leaves your device/);
});

test('the sponsor link points at the correct GitHub Sponsors profile on all four pages', async () => {
  for (const file of ['index.html', DOCS_PAGE, VS_PAGE, VS_HAND_PAGE]) {
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

test('the "not a full audit" disclaimer is present', async () => {
  const html = await read('index.html');
  assert.match(html, /not a ranking guarantee|not a full technical-SEO audit/);
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

test('index links to the comparison page', async () => {
  const index = await read('index.html');
  assert.match(index, new RegExp(`href="${VS_PAGE.replace(/\./g, '\\.')}"`));
});

test('vs-httpstatus-io page links back to the tool and carries required clauses', async () => {
  const html = await read(VS_PAGE);
  assert.match(html, /href="\.\/"/, 'must link back to the tool');
  assert.match(html, /no warranty/i, 'missing the no-warranty clause');
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, 'missing the sponsor link');
  assert.match(html, /not affiliated with, endorsed by, or sponsored by httpstatus\.io/i, 'missing the non-affiliation disclaimer');
});

test('index links to at least one sibling checker venture', async () => {
  const html = await read('index.html');
  assert.match(html, /href="\.\.\/(canonical-tag-check|security-headers-check|sitemap-lastmod-freshness-check)\/"/);
});

test('a worked-example button exists as an alternative to pasting from scratch', async () => {
  const html = await read('index.html');
  assert.match(html, /id="load-example"/);
});

test('the page explains why the browser cannot follow the chain itself', async () => {
  const html = await read('index.html');
  assert.match(html, /[Cc]ross-origin|opaque/);
});

test('the page documents the paste format', async () => {
  const html = await read('index.html');
  assert.match(html, /&lt;status&gt; &lt;url&gt;/);
});

test('the worked example demonstrates a loop and a protocol issue', async () => {
  const html = await read('index.html');
  assert.match(html, /http:\/\/example\.com\/old-landing-page/);
});

test('the CLI file exists and the page documents it', async () => {
  const html = await read('index.html');
  assert.match(html, /node check\.mjs/);
});

test('index links to the by-hand comparison page', async () => {
  const index = await read('index.html');
  assert.match(index, new RegExp(`href="${VS_HAND_PAGE.replace(/\./g, '\\.')}"`));
});

test('the by-hand comparison page links back to the tool and carries required clauses', async () => {
  const html = await read(VS_HAND_PAGE);
  assert.match(html, /href="\.\/"/, 'must link back to the tool');
  assert.match(html, /no warranty/i, 'missing the no-warranty clause');
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/, 'missing the sponsor link');
  assert.match(html, /names no specific product/i, 'missing the names-no-specific-product disclaimer');
});

test('the by-hand comparison page is listed in the venture sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, new RegExp(VS_HAND_PAGE.replace(/\./g, '\\.')));
});

test('the by-hand comparison page does not repeat a question the index or vs-httpstatus-io page already answers', async () => {
  const faqOf = async (name) => {
    const html = await read(name);
    const block = jsonLdBlocks(html).map((b) => JSON.parse(b)).find((b) => b['@type'] === 'FAQPage');
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const handQuestions = await faqOf(VS_HAND_PAGE);
  const indexQuestions = await faqOf('index.html');
  const vsQuestions = await faqOf(VS_PAGE);
  const overlap = [...handQuestions].filter((q) => indexQuestions.has(q) || vsQuestions.has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(', ')}`);
});
