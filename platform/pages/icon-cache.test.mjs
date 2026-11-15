// The app icons copied from the share-card cache are the bytes `renderIcon`
// draws, a miss fills the cache, and a renderer key change cannot collide
// with a card (docs/history/pages-build-perf-2026-11-15-share-memo-swap.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cachedIcon } from './build.mjs';
import { ICONS, renderIcon } from './offline.mjs';

test('cachedIcon returns renderIcon\'s bytes, drawn on a miss and read on a hit', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'icon-cache-'));
  try {
    for (const icon of ICONS) {
      const options = { size: icon.size, maskable: Boolean(icon.maskable), opaque: Boolean(icon.opaque) };
      const drawn = renderIcon(options);
      assert.deepEqual(await cachedIcon(options, { cacheDir: dir }), drawn, `${icon.file} on a miss`);
      assert.deepEqual(await cachedIcon(options, { cacheDir: dir }), drawn, `${icon.file} on a hit`);
    }
    const files = readdirSync(dir);
    assert.equal(files.length, ICONS.length, 'one entry per icon, no part files left');
    assert.ok(files.every((f) => /^icon-[0-9a-f]{64}\.png$/.test(f)), files.join(', '));
    // The entry is what is served: a hit reads the file, it does not redraw.
    const options = { size: 192, maskable: false, opaque: false };
    const [entry] = readdirSync(dir).filter((f) => f.endsWith('.png'));
    writeFileSync(path.join(dir, entry), 'x');
    const all = await Promise.all(ICONS.map((i) => cachedIcon({ size: i.size, maskable: Boolean(i.maskable), opaque: Boolean(i.opaque) }, { cacheDir: dir })));
    assert.ok(all.some((png) => png.toString() === 'x'));
    assert.deepEqual(await cachedIcon(options, { cacheDir: '' }), renderIcon(options), 'no cache dir draws');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
