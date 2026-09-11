import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOCS_PAGE = 'why-store-uploads-get-rejected.html';
const VS_PAGE = 'vs-manual-checking.html';
const PAGES = ['index.html', DOCS_PAGE, VS_PAGE];

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
  const blocks = jsonLdBlocks(await read('index.html'));
  assert.ok(blocks.length >= 2, 'expected at least a SoftwareApplication and a FAQPage block');
  for (const block of blocks) {
    assert.doesNotThrow(() => JSON.parse(block), `invalid JSON in block: ${block.slice(0, 80)}...`);
  }
});

test('index JSON-LD includes a free-priced SoftwareApplication and a FAQPage', async () => {
  const parsed = jsonLdBlocks(await read('index.html')).map((b) => JSON.parse(b));
  const app = parsed.find((p) => p['@type'] === 'SoftwareApplication');
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(app, 'missing SoftwareApplication JSON-LD');
  assert.equal(app.offers.price, '0');
  assert.ok(faq, 'missing FAQPage JSON-LD');
  assert.ok(faq.mainEntity.length >= 3);
});

test('every FAQPage question on every page is also present as visible text', async () => {
  // Structured data that promises an answer the page does not visibly contain
  // is the exact defect `structured-data-drift-check` exists for, and shipping
  // it from this catalogue would be embarrassing.
  for (const file of PAGES) {
    const html = await read(file);
    const faqBlocks = jsonLdBlocks(html).map((b) => JSON.parse(b)).filter((b) => b['@type'] === 'FAQPage');
    for (const faq of faqBlocks) {
      for (const q of faq.mainEntity) {
        assert.ok(html.includes(q.name), `${file}: question "${q.name}" not found as visible text`);
      }
    }
  }
});

test('both content pages carry valid FAQPage JSON-LD', async () => {
  for (const file of [DOCS_PAGE, VS_PAGE]) {
    const blocks = jsonLdBlocks(await read(file)).map((b) => JSON.parse(b));
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq, `missing FAQPage JSON-LD on ${file}`);
    assert.ok(faq.mainEntity.length >= 3);
  }
});

test('the no-warranty disclaimer is present on all three pages', async () => {
  for (const file of PAGES) {
    const html = await read(file);
    assert.match(html, /No warranty/, `${file} is missing the no-warranty disclaimer`);
    assert.match(html, /accept no liability/, `${file} is missing the liability limitation`);
  }
});

test('every page disclaims affiliation with the trademark holders', async () => {
  // The tool names Apple's and Google's products throughout. Saying plainly
  // that it is not theirs is both the honest thing and the thing that keeps a
  // nominative-use claim clean.
  for (const file of PAGES) {
    const html = await read(file);
    assert.match(html, /[Nn]ot affiliated with Apple or Google/, `${file} is missing the affiliation disclaimer`);
  }
});

test('the index page states that nothing is uploaded', async () => {
  const html = await read('index.html');
  assert.match(html, /never uploaded|Nothing is uploaded/);
});

test('every page has a canonical link, a title and a meta description', async () => {
  for (const file of PAGES) {
    const html = await read(file);
    assert.match(html, /<link rel="canonical"/, `${file} has no canonical link`);
    assert.match(html, /<title>[^<]{20,}<\/title>/, `${file} has no usable title`);
    assert.match(html, /<meta name="description" content="[^"]{50,}"/, `${file} has no usable meta description`);
  }
});

test('the two content pages are reachable from the index page', async () => {
  // An orphan page is invisible to a crawler that arrives at the hub, which is
  // the only way anything reaches this catalogue.
  const html = await read('index.html');
  assert.ok(html.includes(DOCS_PAGE), 'index does not link the explainer page');
  assert.ok(html.includes(VS_PAGE), 'index does not link the comparison page');
});

test('the content pages link back to the tool', async () => {
  for (const file of [DOCS_PAGE, VS_PAGE]) {
    const html = await read(file);
    assert.ok(html.includes('./index.html'), `${file} does not link back to the tool`);
  }
});

test('the sitemap lists every page that exists', async () => {
  const sitemap = await read('sitemap.xml');
  for (const file of PAGES) {
    assert.ok(sitemap.includes(file), `sitemap.xml does not list ${file}`);
  }
});

test('the usage opt-out control has a label', async () => {
  // An unlabelled input is an axe `label` violation, which is how this
  // catalogue shipped 48 of them across three live products before anyone ran
  // the browser checks.
  const html = await read('index.html');
  assert.match(html, /<label><input id="usageOptOut"/);
});

test('the file input and the store select are both labelled', async () => {
  const html = await read('index.html');
  assert.match(html, /<label for="store"/, 'the store select has no label');
  assert.match(html, /<label for="files"/, 'the file input has no label');
});

test('the page names the date its size tables were reviewed', async () => {
  // A table transcribed from someone else's documentation is only honest if it
  // says how old it is.
  const html = await read('index.html');
  assert.match(html, /last reviewed on \d{4}-\d{2}-\d{2}/);
});

test('the sponsors link is present and described as optional', async () => {
  const html = await read('index.html');
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /entirely optional and never changes what the tool does/);
});
