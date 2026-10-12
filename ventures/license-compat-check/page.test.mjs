import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');
const PAGES = ['index.html', 'can-i-use-a-gpl-dependency-in-a-closed-source-app.html'];

test('index links the docs page and the docs page links back', async () => {
  assert.match(await read('index.html'), /can-i-use-a-gpl-dependency-in-a-closed-source-app\.html/);
  assert.match(await read(PAGES[1]), /href="\.\/"/);
});

test('every page carries the no-warranty clause', async () => {
  for (const f of PAGES) assert.match(await read(f), /no warranty/i, f);
});

test('index carries sponsor link and privacy line, no payment code', async () => {
  const p = await read('index.html');
  assert.match(p, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(p, /never leaves your device|never uploaded/i);
  assert.doesNotMatch(p, /stripe|checkout/i);
});

test('index links one hop to the license-drift-check sibling', async () => {
  assert.match(await read('index.html'), /href="\.\.\/license-drift-check\/"/);
});

test('the example in the page produces conflict, review and ok verdicts', async () => {
  const { checkCompatibility } = await import('./engine.mjs');
  const m = /const EXAMPLE = JSON\.stringify\((\[[\s\S]*?\]), null, 2\)/.exec(await read('index.html'));
  assert.ok(m, 'example not found');
  const deps = Function(`return ${m[1]}`)();
  const r = checkCompatibility(deps, 'proprietary-distributed');
  assert.ok(r.counts.conflict >= 2 && r.counts.review >= 1 && r.counts.ok >= 2, JSON.stringify(r.counts));
});

test('every context in the select exists and sitemap lists both pages', async () => {
  const { CONTEXTS, normalizeContext } = await import('./engine.mjs');
  for (const k of Object.keys(CONTEXTS)) assert.equal(normalizeContext(k), k);
  const s = await read('sitemap.xml');
  for (const f of PAGES) assert.match(s, new RegExp(f.replace('.', '\\.')));
});
