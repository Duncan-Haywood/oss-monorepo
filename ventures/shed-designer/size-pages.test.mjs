import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from './make-size-pages.mjs';
import { GENERATED_PAGES } from '../../platform/pages/generated-pages.mjs';

const { all, files } = generate();

// The pages are not committed: the site build runs make-size-pages.mjs
// (platform/pages/generated-pages.mjs), so they always print the engine's
// current numbers and a price change can't leave a stale copy for the next PR.
test('the site build generates the size pages, and git does not track them', () => {
  assert.equal(GENERATED_PAGES['shed-designer'], 'make-size-pages.mjs');
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^ventures\/shed-designer\/how-much-lumber-for-a-\*-shed\.html$/m);
  assert.match(ignore, /^ventures\/shed-designer\/shed-lumber-list-by-size\.html$/m);
});

test('every page quotes its own figures and links every other size', () => {
  for (const f of all) {
    const html = files[`how-much-lumber-for-a-${f.w}x${f.l}-shed.html`];
    assert.ok(html, `${f.w}x${f.l}`);
    assert.match(html, new RegExp(`${f.pieces} framing pieces cut from ${f.boards} boards`));
    for (const g of all) if (g !== f) assert.ok(html.includes(`href="how-much-lumber-for-a-${g.w}x${g.l}-shed.html"`), `${f.w}x${f.l} -> ${g.w}x${g.l}`);
    const boards = f.rows.reduce((a, r) => a + r.boards, 0);
    assert.equal(boards, f.boards, `${f.w}x${f.l}: the table's boards add up to the headline`);
  }
});

test('no size page hides a warning, and bigger sheds take more boards', () => {
  for (const f of all) assert.equal(f.problems, 0, `${f.w}x${f.l}`);
  const same = (w) => all.filter((f) => f.w === w).sort((a, b) => a.l - b.l);
  for (const w of [8, 10, 12]) {
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
