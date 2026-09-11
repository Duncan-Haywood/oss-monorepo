import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PAGES = ['index.html', 'how-ai-coding-plan-pricing-works.html'];

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
