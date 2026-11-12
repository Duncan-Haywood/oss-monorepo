// The hub's hero lede has a word budget, so the search box stays above the fold on a phone.
//
// Polish 2026-11-12 (docs/reports/polish-2026-11-12-hub-lede.md): the lede had
// grown to five sentences (76 words), 13 lines at 320 px, and on a 360 x 660
// Android viewport the search input's bottom edge sat at 782 px, below the
// fold. Cut to two sentences (37 words), it sits at 629 px. The sentences cut
// repeat steps 2 and 3 of the how-it-works band further down the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderHub } from './build.mjs';
import { HOME_MOTION_CSS } from './showcase.mjs';

const BASE = 'https://example.test/';
const LEDE_WORD_BUDGET = 45;

const words = (html) =>
  html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);

test('the hub lede stays within its word budget and sits before the search', () => {
  const surfaces = [{ slug: 'roofing-bid-calculator', title: 'Roofing bid', description: 'Price a roof.', pageCount: 1 }];
  const html = renderHub(surfaces, BASE);
  const hero = html.slice(html.indexOf('<header class="hero">'));
  const m = hero.match(/<p class="lede">([\s\S]*?)<\/p>/);
  assert.ok(m, 'the hub hero has a lede');
  const n = words(m[1]).length;
  assert.ok(n <= LEDE_WORD_BUDGET,
    `hub lede is ${n} words (budget ${LEDE_WORD_BUDGET}); a longer lede pushes the search below the fold on a phone`);
  assert.ok(hero.indexOf('class="lede"') < hero.indexOf('role="search"'), 'the lede comes before the search');
});

// Polish 2026-11-12, second pass (docs/reports/polish-2026-11-12-hub-short-phones.md):
// with the lede cut, the 2.3rem headline floor still ended the search at
// 629 px on a 375 px phone whose Safari shows about 553 px, and at 730 px on
// 320 x 640. The phone block in HOME_MOTION_CSS brings that to 538 and 631 px.
// This pins the block's existence and its headline size; the pixel numbers come
// from a browser run (report).

test('on phones the hub hero keeps its headline small enough for the search to stay on the first screen', () => {
  const at = HOME_MOTION_CSS.indexOf('@media (max-width: 480px)');
  assert.ok(at >= 0, 'HOME_MOTION_CSS has a phone block');
  const block = HOME_MOTION_CSS.slice(at, HOME_MOTION_CSS.indexOf('\n    }\n', at));
  const size = block.match(/\.hero h1 \{[^}]*font-size:\s*([\d.]+)rem/);
  assert.ok(size, 'the phone block sets the headline size in rem');
  assert.ok(Number(size[1]) <= 1.85, `phone headline is ${size[1]}rem; above 1.85rem it runs to four lines at 375 px`);
  assert.match(block, /\.search \{[^}]*margin-top/);
});
