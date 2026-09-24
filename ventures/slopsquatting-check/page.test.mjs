import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('index links to the guide page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="what-is-slopsquatting\.html"/,
    'index must link the guide page so crawlers can reach it',
  );
});

test('guide page links back to the tool', async () => {
  const page = await readFile(new URL('./what-is-slopsquatting.html', import.meta.url), 'utf8');
  assert.match(page, /href="\.\/"/);
});

test('all four pages carry the no-warranty clause', async () => {
  for (const file of ['index.html', 'what-is-slopsquatting.html', 'vs-socket.html', 'vs-checking-package-names-by-eye.html']) {
    const page = await readFile(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test('index carries the sponsor link', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('index states nothing is uploaded and has no fetch call at all', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /never uploaded|never sends it anywhere|no network call/i);
  assert.doesNotMatch(page, /\bfetch\s*\(/, 'index.html must make no network calls of its own');
});

test('index links one hop to the dependency-confusion-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/dependency-confusion-check\/"/,
    'index must link ../dependency-confusion-check/ so crawlers reach this tool in one hop',
  );
});

test('index links one hop to the npm-lifecycle-script-check sibling', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    page,
    /href="\.\.\/npm-lifecycle-script-check\/"/,
    'index must link ../npm-lifecycle-script-check/ so crawlers reach that tool in one hop',
  );
});

test('index links to the vs-socket comparison page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="vs-socket\.html"/);
});

test('index links to the vs-checking-package-names-by-eye comparison page', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(page, /href="vs-checking-package-names-by-eye\.html"/);
});

test('sitemap lists all four pages', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /what-is-slopsquatting\.html/);
  assert.match(sitemap, /vs-socket\.html/);
  assert.match(sitemap, /vs-checking-package-names-by-eye\.html/);
});

test('the FAQPage schema on index is valid JSON and matches the visible FAQ headings', async () => {
  const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});
