import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PACKS, PACK_DIR, packOf, packPath, readPack, serveCard } from './cardpack.mjs';
import { encodePack, packCards } from './cardpack-build.mjs';
import { split } from './split.mjs';
import shard from './shard/worker.mjs';
import { SECURITY_HEADERS } from './security-headers.mjs';

const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

/** A fake ASSETS binding over a directory, as Cloudflare serves it. */
const assetsOver = (dir) => ({
  async fetch(req) {
    const p = decodeURI(new URL(req.url).pathname);
    try {
      return new Response(await fs.readFile(path.join(dir, p)));
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
});

test('packOf is stable and spreads paths over every pack', () => {
  assert.equal(packOf('/writing/a/share-card.png'), packOf('/writing/a/share-card.png'));
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(packOf(`/writing/post-${i}/share-card.png`));
  assert.equal(seen.size, PACKS);
  assert.equal(packPath(7), `/${PACK_DIR}/007.bin`);
});

test('a pack round-trips its cards byte for byte', () => {
  const a = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
  const b = Buffer.from([137, 80, 78, 71, 9]);
  const pack = encodePack([['/a/share-card.png', a], ['/b/share-card.png', b]]);
  assert.deepEqual(Buffer.from(readPack(ab(pack), '/a/share-card.png')), a);
  assert.deepEqual(Buffer.from(readPack(ab(pack), '/b/share-card.png')), b);
  assert.equal(readPack(ab(pack), '/c/share-card.png'), null);
  assert.equal(readPack(new ArrayBuffer(2), '/a/share-card.png'), null);
});

test('packCards replaces every card with packs and leaves other files alone', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardpack-'));
  const cards = {};
  for (let i = 0; i < 300; i++) {
    const rel = `writing/post-${i}/share-card.png`;
    cards[`/${rel}`] = Buffer.from(`png-${i}`);
    await fs.mkdir(path.join(dir, path.dirname(rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), cards[`/${rel}`]);
    await fs.writeFile(path.join(dir, `writing/post-${i}/index.html`), 'page');
  }
  const r = await packCards(dir);
  assert.equal(r.cards, 300);
  assert.ok(r.packs > 1 && r.packs <= PACKS);
  assert.equal((await fs.readdir(path.join(dir, PACK_DIR))).length, r.packs);
  assert.equal(await fs.stat(path.join(dir, 'writing/post-0/share-card.png')).catch(() => null), null);
  assert.equal(await fs.readFile(path.join(dir, 'writing/post-0/index.html'), 'utf8'), 'page');

  const env = { ASSETS: assetsOver(dir) };
  for (const [p, bytes] of Object.entries(cards)) {
    const res = await shard.fetch(new Request(`https://x.dev${p}`), env);
    assert.equal(res.status, 200, p);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes, p);
  }
  // Packing twice (a re-run on the same directory) keeps every card.
  assert.deepEqual(await packCards(dir), { cards: 0, packs: 0 });
  const again = await shard.fetch(new Request('https://x.dev/writing/post-5/share-card.png'), env);
  assert.deepEqual(Buffer.from(await again.arrayBuffer()), cards['/writing/post-5/share-card.png']);
});

test('the shard Worker sends security headers on cards and falls through for everything else', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardpack-shard-'));
  await fs.mkdir(path.join(dir, 'research/x'), { recursive: true });
  await fs.writeFile(path.join(dir, 'research/x/share-card.png'), 'card');
  await fs.writeFile(path.join(dir, 'research/x/index.html'), 'page');
  await packCards(dir);
  const env = { ASSETS: assetsOver(dir) };
  const card = await shard.fetch(new Request('https://x.dev/research/x/share-card.png'), env);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(card.headers.get(k), v);
  const head = await shard.fetch(new Request('https://x.dev/research/x/share-card.png', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '4');
  assert.equal(await (await shard.fetch(new Request('https://x.dev/research/x/index.html'), env)).text(), 'page');
  const missing = await shard.fetch(new Request('https://x.dev/research/none/share-card.png'), env);
  assert.equal(missing.status, 404);
  assert.equal(await serveCard(new Request('https://x.dev/research/x/'), env.ASSETS), null);
});

test('split packs the shard cards but not the site Worker\'s', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cardpack-split-'));
  const site = path.join(root, 'site');
  for (const rel of ['writing/a/share-card.png', 'writing/a/index.html', 'roof-bid/share-card.png', 'roof-bid/index.html']) {
    await fs.mkdir(path.join(site, path.dirname(rel)), { recursive: true });
    await fs.writeFile(path.join(site, rel), rel);
  }
  await fs.writeFile(path.join(site, '404.html'), '');
  const r = await split(site, path.join(root, 'shard'));
  assert.deepEqual(r.packed, { cards: 1, packs: 1 });
  assert.ok(await fs.stat(path.join(site, 'roof-bid/share-card.png')));
  assert.equal(await fs.stat(path.join(root, 'shard', 'writing/a/share-card.png')).catch(() => null), null);
});
