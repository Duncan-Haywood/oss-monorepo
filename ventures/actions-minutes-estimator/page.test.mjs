import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PAGES = ['index.html', 'how-github-actions-minutes-are-billed.html', 'vs-github-billing-page.html'];

const read = (file) => readFile(new URL(`./${file}`, import.meta.url), 'utf8');

test('every page carries the no-warranty clause', async () => {
  for (const file of PAGES) {
    assert.match(await read(file), /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('every page says the figures are an estimate, not a bill', async () => {
  // The one way this tool could actually harm someone is by being read as a
  // quote. Both surfaces have to say otherwise in their own words.
  for (const file of PAGES) {
    const page = await read(file);
    assert.match(page, /estimate|not a billing statement|Verify anything here/i, file);
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
  assert.match(await read('index.html'), /href="how-github-actions-minutes-are-billed\.html"/);
  assert.match(await read('how-github-actions-minutes-are-billed.html'), /href="\.\/"/);
});

test('index carries the sponsor link', async () => {
  assert.match(await read('index.html'), /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index exposes a usage opt-out control', async () => {
  const page = await read('index.html');
  assert.match(page, /setUsageOptOut/);
  assert.match(page, /id="optout"/);
});

test('index links one hop to the actions-runner-starvation-check sibling', async () => {
  // The referral this venture was picked for: someone who has already run out
  // of minutes lands on starvation-check, and its complement is this tool.
  assert.match(
    await read('index.html'),
    /href="\.\.\/actions-runner-starvation-check\/"/,
    'index must link ../actions-runner-starvation-check/ so crawlers reach it in one hop',
  );
});

test('the docs page disclaims affiliation where it names a trademark', async () => {
  const page = await read('how-github-actions-minutes-are-billed.html');
  assert.match(page, /Not affiliated with GitHub/i);
});

test('the index page links to the GitHub-billing-page comparison', async () => {
  assert.match(await read('index.html'), /href="vs-github-billing-page\.html"/);
});

test('the comparison page links back to the tool and carries valid FAQPage JSON-LD matching visible text', async () => {
  const page = await read('vs-github-billing-page.html');
  assert.match(page, /href="index\.html"/);
  const match = page.match(/<script type="application\/ld\+json">\s*([\s\S]+?)<\/script>/);
  assert.ok(match, 'missing FAQPage JSON-LD on the comparison page');
  const faq = JSON.parse(match[1]);
  assert.equal(faq['@type'], 'FAQPage');
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(page.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(page.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test('the comparison page carries the no-warranty clause, the GitHub disclaimer, and is listed in the sitemap', async () => {
  const page = await read('vs-github-billing-page.html');
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by GitHub/i);
  const sitemap = await read('sitemap.xml');
  assert.match(sitemap, /vs-github-billing-page\.html/);
});

test('the page imports the same estimator the CLI runs', async () => {
  // Two implementations of this arithmetic would drift, and the browser copy is
  // the one nobody would notice drifting.
  const page = await read('index.html');
  assert.match(page, /from "\.\/estimate\.mjs"/);
  assert.match(page, /from "\.\/usage\.mjs"/);
});

test('every usage event the footer names is one the page actually records', async () => {
  const page = await read('index.html');
  const declared = [...page.matchAll(/<code>(estimate_run|example_loaded|parse_error)<\/code>/g)].map(
    (m) => m[1],
  );
  const recorded = new Set([...page.matchAll(/record\("([a-z_]+)"\)/g)].map((m) => m[1]));
  assert.ok(declared.length > 0, 'the footer must name the events it counts');
  for (const event of declared) {
    assert.ok(recorded.has(event), `footer names \`${event}\` but nothing records it`);
  }
  for (const event of recorded) {
    assert.ok(declared.includes(event), `\`${event}\` is recorded but not disclosed in the footer`);
  }
});
