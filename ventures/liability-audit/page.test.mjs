import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { RULES } from './audit.mjs';

const DOCS = 'what-a-small-app-can-be-liable-for-and-how-to-check.html';
const read = (f) => readFile(new URL(`./${f}`, import.meta.url), 'utf8');

test('index and docs link to each other', async () => {
  assert.ok((await read('index.html')).includes(`href="${DOCS}"`));
  assert.match(await read(DOCS), /href="\.\/"/);
});

test('both pages carry no-warranty and FAQ data; index carries sponsor, privacy and opt-out', async () => {
  for (const f of ['index.html', DOCS]) {
    const p = await read(f);
    assert.match(p, /no warranty/i, f);
    assert.match(p, /not legal/i, f);
    assert.match(p, /FAQPage/, f);
  }
  const idx = await read('index.html');
  assert.match(idx, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(idx, /never leave your device|never uploaded/i);
  assert.match(idx, /id="optout"/);
  assert.match(idx, /record\("scan_run"\)/);
});

test('the docs table and the README list every rule', async () => {
  const docs = await read(DOCS);
  const readme = await read('README.md');
  for (const r of RULES) {
    assert.ok(docs.includes(`<code>${r.id}</code>`), `${r.id} missing from ${DOCS}`);
    assert.ok(readme.includes(`\`${r.id}\``), `${r.id} missing from README`);
  }
});

test('the page imports only browser-safe modules', async () => {
  const idx = await read('index.html');
  const imports = [...idx.matchAll(/from "\.\/([\w-]+\.mjs)"/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['audit.mjs', 'example.mjs', 'usage.mjs']);
  for (const f of imports) assert.doesNotMatch(await read(f), /from ['"]node:/, `${f} must not import node built-ins`);
});

test('no source file in this venture reads as a live secret to its own rule', async () => {
  const { auditFiles } = await import('./audit.mjs');
  const files = await Promise.all(readdirSync(new URL('./', import.meta.url)).filter((n) => /\.(?:mjs|html|md)$/.test(n)).map(async (n) => ({ path: n, text: await read(n) })));
  const r = auditFiles(files, { only: ['secret-in-tree'] });
  assert.deepEqual(r.findings, []);
});

test('every .html file is in the sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  for (const name of readdirSync(new URL('./', import.meta.url)).filter((n) => n.endsWith('.html') && n !== 'index.html')) {
    assert.ok(sitemap.includes(name), `${name} missing from sitemap.xml`);
  }
});
