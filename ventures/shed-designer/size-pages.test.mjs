import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { generate } from './make-size-pages.mjs';

const { all, files } = generate();

test('every size page on disk is what the engine prints now', () => {
  for (const [name, html] of Object.entries(files)) {
    assert.ok(existsSync(new URL(name, import.meta.url)), `${name} missing: run node make-size-pages.mjs`);
    assert.equal(readFileSync(new URL(name, import.meta.url), 'utf8'), html, `${name} is stale: run node make-size-pages.mjs`);
  }
});

test('no size page hides a warning, and bigger sheds take more boards', () => {
  for (const f of all) assert.equal(f.problems, 0, `${f.w}x${f.l}`);
  const same = (w) => all.filter((f) => f.w === w).sort((a, b) => a.l - b.l);
  for (const w of [8, 10, 12, 14, 16]) {
    const row = same(w);
    for (let i = 1; i < row.length; i++) assert.ok(row[i].boards >= row[i - 1].boards, `${w}x${row[i].l}`);
  }
});

test('size pages carry the disclaimer, the sponsor link and a link to the tool', () => {
  for (const html of Object.values(files)) {
    assert.match(html, /No warranty\./);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    assert.match(html, /href="\.\/"/);
  }
});

test('the cut sheet never costs less than its proven bound', () => {
  for (const f of all) assert.ok(f.cutCost >= f.bound - 0.005, `${f.w}x${f.l}`);
});

test('the sitemap lists every page', () => {
  const sm = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  for (const name of Object.keys(files)) assert.ok(sm.includes(name), name);
});
