import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { normalisePolicy } from './guard.mjs';

const DOCS = 'how-to-set-a-hard-spend-limit-on-openai-and-anthropic-api-calls.html';
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');

test('index and docs link to each other', async () => {
  assert.ok((await read('index.html')).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test('both pages carry no-warranty and FAQ data; index carries sponsor, privacy and opt-out', async () => {
  for (const f of ['index.html', DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read('index.html');
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never leave your device|never uploaded/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("replay_run"\)/);
});

test('the docs page names other products only with the non-affiliation line', async () => {
  const p = await read(DOCS);
  assert.match(p, /Not affiliated with, endorsed by, or sponsored by/);
});

test('the docs page policy is a valid policy (copy-paste must work)', async () => {
  const m = /<pre>(\{[\s\S]*?\})<\/pre>/.exec(await read(DOCS));
  assert.ok(m, 'expected a JSON policy in a <pre>');
  normalisePolicy(JSON.parse(m[1]));
});

test('the page imports only browser-safe modules', async () => {
  const idx = await read('index.html');
  const imports = [...idx.matchAll(/from "\.\/([\w-]+\.mjs)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['guard.mjs', 'simulate.mjs', 'usage.mjs']);
  for (const f of imports) assert.doesNotMatch(await read(f), /from ['"]node:/, `${f} must not import node built-ins`);
});

test('every .html file is in the sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html') && n !== 'index.html')) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});
