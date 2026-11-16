// Section index pages share the site bar's column
// (docs/reports/polish-2026-11-16-index-column.md).
//
// On 2026-11-16 the hub, Stories, Updates, the queue and Research put their
// h1 at four different left edges at 1,280 px (96, 176, 176, 176 and 74 px)
// under a site bar whose brand sits at 96: Stories, Updates and the queue
// centred a 960 px column inside the bar's 1,120 px one, and the research
// index used its own 1,180 px column with a 24 px gutter. A visitor moving
// between sections saw the page jump sideways under a nav that stayed put.
//
// The rule: a section index's main column is the bar's column, 1,120 px wide
// with a 16 px gutter, so its content starts where the brand does. Reading
// pages (blog posts and the writing index, 720 px) are a different layout on
// purpose and are not held to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

const px = (s) => Number(s.replace(/px$/, ''));

function barColumn() {
  const css = read('site-nav.mjs');
  const m = css.match(/\.pfs-bar\{[^}]*max-width:(\d+px)[^}]*padding:10px (\d+px)\}/);
  assert.ok(m, 'site-nav.mjs: .pfs-bar max-width and side padding not found');
  return { width: px(m[1]), gutter: px(m[2]) };
}

// The first `.wrap` rule in each file is its main column.
function wrapColumn(rel) {
  const css = read(rel);
  const m = css.match(/\.wrap\s*\{([^}]*)\}/);
  assert.ok(m, `${rel}: no .wrap rule`);
  const width = m[1].match(/max-width:\s*(\d+px)/);
  const pad = m[1].match(/padding:\s*(\d+(?:px)?)(?:\s+(\d+(?:px)?))?/);
  assert.ok(width && pad, `${rel}: .wrap has no max-width or padding`);
  return { width: px(width[1]), gutter: px(pad[2] ?? pad[1]) };
}

for (const rel of ['stories.mjs', 'updates.mjs', 'queue.mjs', '../../research/_homepage/template.html']) {
  test(`${rel}: main column matches the site bar, so the h1 lines up with the brand`, () => {
    assert.deepEqual(wrapColumn(rel), barColumn());
  });
}

test('the check reads a mismatched column as one', () => {
  // Guard the regexes: a 960 px column must not parse as the bar's.
  const m = '.wrap { max-width:960px; margin:0 auto; padding:24px 16px 72px; }'.match(/\.wrap\s*\{([^}]*)\}/);
  assert.equal(px(m[1].match(/max-width:\s*(\d+px)/)[1]), 960);
  assert.notEqual(960, barColumn().width);
});
