// A table set to `display:block` (so it scrolls sideways on a phone) must set
// its <caption> to `display:block` in the same scope.
//
// WHY: when a <table> is `display:block`, the browser wraps its rows in an
// anonymous table box and puts the caption in that box, so the caption is as
// wide as the grid, not as the box a reader sees. On 2026-11-18 at 390 px, 15
// captions on 8 pages were wrong: 13 ran 51 to 436 px past the right edge of
// their scroller and were cut off until the reader scrolled, and 2 were
// squeezed narrower than the box (patent-maintenance-fee-planner: 9 words over
// 5 lines in a 101 px column). Six more pages only fitted because their grids
// were narrow that day. `caption{display:block;position:sticky;left:0}`
// makes the caption a block in the scroller: as wide as the visible box, and
// still in view when the table is scrolled. Chromium keeps the caption as the
// table's accessible name (checked with the CDP accessibility tree).
//
// The fix must sit in the same @media scope as the table rule: in a table that
// is still `display:table`, a block caption becomes an anonymous cell in the
// first column. Report: docs/reports/polish-2026-11-18-block-table-captions.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Rules in a stylesheet as `{ media, selector, body }`, one level of @media
 * (or @supports/@container) deep, which is all the venture pages use.
 */
export function cssRules(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (src, media) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const prelude = src.slice(i, open).trim();
      // find the matching close brace
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      const inner = src.slice(open + 1, j - 1);
      if (/^@(media|supports|container)\b/i.test(prelude)) walk(inner, prelude.replace(/\s+/g, ' ').toLowerCase());
      else if (!prelude.startsWith('@')) out.push({ media, selector: prelude, body: inner });
      i = j;
    }
  };
  walk(text, '');
  return out;
}

const isBlock = (body) => /(^|;)\s*display\s*:\s*block\b/i.test(body);
const lastCompound = (sel) => sel.trim().split(/[\s>+~]+/).pop();
const selects = (selector, tag) =>
  selector.split(',').some((s) => new RegExp(`^${tag}(?![\\w-])`, 'i').test(lastCompound(s)));

/**
 * The @media scopes (`''` for none) where a table is made a block but no
 * caption is, for a page's HTML. Empty when the page has no <caption>.
 */
export function uncoveredBlockTables(html) {
  if (!/<caption\b/i.test(html)) return [];
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const rules = cssRules(css);
  const tableScopes = new Set(rules.filter((r) => selects(r.selector, 'table') && isBlock(r.body)).map((r) => r.media));
  const captionScopes = new Set(rules.filter((r) => selects(r.selector, 'caption') && isBlock(r.body)).map((r) => r.media));
  // An unconditional caption rule covers every scope that also makes the table a block.
  return [...tableScopes].filter((m) => !captionScopes.has(m) && !captionScopes.has(''));
}

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('cssRules reads @media scopes', () => {
  const r = cssRules('a{x:1}@media (max-width:700px){table{display:block}caption{display:block}}');
  assert.deepEqual(r.map((x) => [x.media, x.selector]), [
    ['', 'a'],
    ['@media (max-width:700px)', 'table'],
    ['@media (max-width:700px)', 'caption'],
  ]);
});

test('uncoveredBlockTables: the defect, the fix, and the cases that need nothing', () => {
  const cap = '<table><caption>x</caption></table>';
  assert.deepEqual(uncoveredBlockTables(`<style>table{display:block;overflow-x:auto}</style>${cap}`), ['']);
  assert.deepEqual(uncoveredBlockTables(`<style>.result table { display: block }</style>${cap}`), ['']);
  assert.deepEqual(uncoveredBlockTables(`<style>table{display:block}caption{display:block;position:sticky;left:0}</style>${cap}`), []);
  // a scoped table rule needs a caption rule in that scope or an unconditional one
  const m = '@media (max-width:700px)';
  assert.deepEqual(uncoveredBlockTables(`<style>${m}{table{display:block}}</style>${cap}`), [m]);
  assert.deepEqual(uncoveredBlockTables(`<style>${m}{table{display:block}caption{display:block}}</style>${cap}`), []);
  // no caption, or tables that stay tables: nothing to do
  assert.deepEqual(uncoveredBlockTables('<style>table{display:block}</style><table></table>'), []);
  assert.deepEqual(uncoveredBlockTables(`<style>table{display:table} td{display:block}</style>${cap}`), []);
  assert.deepEqual(uncoveredBlockTables(`<style>.table-wrap{display:block}</style>${cap}`), []);
});

test('every venture or research page with a block table keeps its caption in the box', () => {
  const bad = [];
  for (const dir of ['ventures', 'research']) {
    for (const f of htmlFiles(join(ROOT, dir))) {
      const html = readFileSync(f, 'utf8');
      for (const scope of uncoveredBlockTables(html)) {
        bad.push(`${relative(ROOT, f)}: table{display:block}${scope ? ` in ${scope}` : ''} with no caption{display:block} beside it (add caption{display:block;position:sticky;left:0})`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
