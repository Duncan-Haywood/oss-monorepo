import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PAGES = ['index.html', 'how-ai-coding-plan-pricing-works.html', 'vs-doing-the-math-yourself.html'];

const read = (file) => readFile(new URL(`./${file}`, import.meta.url), 'utf8');

test('every page carries the no-warranty clause', async () => {
  for (const file of PAGES) {
    assert.match(await read(file), /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('every page says the figures are an estimate, not a quote', async () => {
  for (const file of PAGES) {
    const page = await read(file);
    assert.match(page, /estimate|not a quote|Verify anything here/i, file);
  }
});

test('index has title, meta description, and both JSON-LD blocks', async () => {
  const page = await read('index.html');
  assert.match(page, /<title>.+<\/title>/);
  assert.match(page, /<meta name="description" content="[^"]+"/);
  assert.match(page, /"@type":"SoftwareApplication"/);
  assert.match(page, /"@type":"FAQPage"/);
});

test('index links the docs page and the docs page links back', async () => {
  assert.match(await read('index.html'), /href="how-ai-coding-plan-pricing-works\.html"/);
  assert.match(await read('how-ai-coding-plan-pricing-works.html'), /href="\.\/"/);
});

test('index carries the sponsor link', async () => {
  assert.match(await read('index.html'), /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index exposes a usage opt-out control', async () => {
  const page = await read('index.html');
  assert.match(page, /setUsageOptOut/);
  assert.match(page, /id="optout"/);
});

test('index links one hop to the mcp-supply-chain-watch sibling', async () => {
  assert.match(
    await read('index.html'),
    /href="\.\.\/mcp-supply-chain-watch\/"/,
    'index must link ../mcp-supply-chain-watch/ so crawlers reach it in one hop',
  );
});

test('every named trademark is disclaimed as not affiliated', async () => {
  for (const file of PAGES) {
    const page = await read(file);
    assert.match(page, /Not affiliated with, endorsed by, or sponsored by/i, `${file} names vendors without the disclaimer`);
  }
});

test('the page imports the same calculator module the tests exercise', async () => {
  const page = await read('index.html');
  assert.match(page, /from '\.\/calc\.mjs'/);
  assert.match(page, /from '\.\/usage\.mjs'/);
});

test('every usage event the footer names is one the page actually records', async () => {
  const page = await read('index.html');
  const declared = [...page.matchAll(/<code>(compare_run|tier_selected|model_selected)<\/code>/g)].map((m) => m[1]);
  const recorded = new Set([...page.matchAll(/record\('([a-z_]+)'\)/g)].map((m) => m[1]));
  assert.ok(declared.length > 0, 'the footer must name the events it counts');
  for (const event of declared) {
    assert.ok(recorded.has(event), `footer names \`${event}\` but nothing records it`);
  }
  for (const event of recorded) {
    assert.ok(declared.includes(event), `\`${event}\` is recorded but not disclosed in the footer`);
  }
});

test('every preset select the page fills in has a matching option-filling call', async () => {
  const page = await read('index.html');
  for (const id of ['plan', 'usage-tier', 'model']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id} element`);
  }
});

test('index links to the comparison page', async () => {
  assert.match(await read('index.html'), /href="vs-checking-pricing-pages-yourself\.html"/);
});

test('the comparison page links back to the tool and carries valid FAQPage JSON-LD matching visible text', async () => {
  const vsPage = await read('vs-checking-pricing-pages-yourself.html');
  assert.match(vsPage, /href="index\.html"/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const faq = blocks.map((b) => JSON.parse(b)).find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page carries the no-warranty clause and the estimate language', async () => {
  const vsPage = await read('vs-checking-pricing-pages-yourself.html');
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /provided free and as-is, without warranty/);
  assert.match(vsPage, /estimate/i);
});

test('the comparison page is listed in the venture sitemap', async () => {
  assert.match(await read('sitemap.xml'), /vs-checking-pricing-pages-yourself\.html/);
});

function jsonLdBlocks(source) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const blocks = [];
  let m;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

test('index links to the "doing the math yourself" comparison page', async () => {
  assert.match(await read('index.html'), /href="vs-doing-the-math-yourself\.html"/);
});

test('the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text', async () => {
  const page = await read('vs-doing-the-math-yourself.html');
  assert.match(page, /href="\.\/"/);
  const blocks = jsonLdBlocks(page);
  assert.ok(blocks.length >= 1, 'expected at least one JSON-LD block');
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(page.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(page.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page is listed in the venture sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /vs-doing-the-math-yourself\.html/);
});
