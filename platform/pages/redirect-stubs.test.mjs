import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { targetUrl, writeStubs } from './redirect-stubs.mjs';

const FROM = 'https://old.example.io/site/';
const TO = 'https://new.example.dev/';

test('targetUrl maps index files to their directory and keeps other paths', () => {
  assert.equal(targetUrl('index.html', TO), TO);
  assert.equal(targetUrl('roof-bid/index.html', TO), `${TO}roof-bid/`);
  assert.equal(targetUrl('dev/daily/2026-10-29.html', 'https://new.example.dev'), `${TO}dev/daily/2026-10-29.html`);
});

test('writeStubs replaces HTML with redirects and copies everything else', async () => {
  const src = await fs.mkdtemp(path.join(os.tmpdir(), 'stubs-src-'));
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'stubs-out-'));
  await fs.mkdir(path.join(src, 'roof-bid'));
  await fs.writeFile(path.join(src, 'index.html'), '<h1>hub</h1>');
  await fs.writeFile(path.join(src, 'roof-bid', 'index.html'), '<h1>tool</h1>');
  await fs.writeFile(path.join(src, '404.html'), '<h1>missing</h1>');
  await fs.writeFile(path.join(src, 'feed.xml'), '<feed><entry/></feed>');

  assert.deepEqual(await writeStubs(src, out, { from: FROM, to: TO }), { pages: 2, copied: 1 });

  const tool = await fs.readFile(path.join(out, 'roof-bid', 'index.html'), 'utf8');
  assert.match(tool, /<link rel="canonical" href="https:\/\/new\.example\.dev\/roof-bid\/">/);
  assert.match(tool, /http-equiv="refresh" content="0; url=https:\/\/new\.example\.dev\/roof-bid\/"/);
  assert.match(tool, /location\.replace\("https:\/\/new\.example\.dev\/roof-bid\/" \+ location\.search \+ location\.hash\)/);
  assert.doesNotMatch(tool, /<h1>tool/);

  const missing = await fs.readFile(path.join(out, '404.html'), 'utf8');
  assert.match(missing, /var from = "\/site\/"/);
  assert.match(missing, /location\.replace\("https:\/\/new\.example\.dev\/" \+ rest/);

  assert.equal(await fs.readFile(path.join(out, 'feed.xml'), 'utf8'), '<feed><entry/></feed>');
});
