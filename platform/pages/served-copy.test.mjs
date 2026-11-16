import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { servedCopy, staleUrls } from './served-copy.mjs';

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'served-copy-'));
  const src = path.join(root, 'src', 'demo-tool');
  await fs.mkdir(src, { recursive: true });
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(src, name), body);
  return { root, surface: { slug: 'demo-tool', sourceDir: src, entryFile: path.join(src, 'index.html') } };
}

const page = (canonical) =>
  `<!doctype html><html><head><title>Demo</title><meta name="description" content="A demo tool.">` +
  `<link rel="canonical" href="${canonical}"></head><body>x</body></html>`;

test('the placeholder origin a source names is rewritten, so nothing stale is reported', async () => {
  const { root, surface } = await fixture({
    'index.html': page('https://example.invalid/demo-tool/'),
    'llms.txt': '# Demo\n> https://example.invalid/demo-tool/\nSource: https://github.com/x/y\n',
  });
  const dir = await servedCopy(surface, path.join(root, 'out'), 'https://site.test/');
  assert.match(await fs.readFile(path.join(dir, 'llms.txt'), 'utf8'), /https:\/\/site\.test\/demo-tool\//);
  assert.match(await fs.readFile(path.join(dir, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/site\.test\/demo-tool\/<\/loc>/);
  assert.deepEqual(await staleUrls(dir, 'https://site.test/'), []);
});

test('a product without llms.txt gets the derived one the build writes', async () => {
  const { root, surface } = await fixture({ 'index.html': page('https://site.test/demo-tool/') });
  const dir = await servedCopy(surface, path.join(root, 'out'), 'https://site.test/');
  assert.match(await fs.readFile(path.join(dir, 'llms.txt'), 'utf8'), /site\.test\/demo-tool/);
});

test('a retired origin the rewrite does not cover is reported', async () => {
  const { root, surface } = await fixture({
    'index.html': page('https://duncan-haywood.github.io/other-path/demo-tool/'),
  });
  const dir = await servedCopy(surface, path.join(root, 'out'), 'https://site.test/');
  const found = await staleUrls(dir, 'https://site.test/');
  assert.deepEqual(found, [{ file: 'index.html', url: 'https://duncan-haywood.github.io/other-path/demo-tool/' }]);
});
