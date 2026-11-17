import test from 'node:test';
import assert from 'node:assert/strict';
import { heroLedeWords, heroLedes, HERO_LEDE_MAX_WORDS } from './hero-lede.mjs';

test('heroLedeWords counts the first paragraph under the h1, skipping wrappers and tags inside it', () => {
  assert.equal(heroLedeWords('<header><h1>Tool</h1>\n<div class="x">\n<p class="lede">One <strong>two</strong> three&nbsp;four.</p><p>five six</p></div>'), 4);
  assert.equal(heroLedeWords('<h1>Tool</h1><span></span><pre></pre><p>a b</p>'), 2);
  assert.equal(heroLedeWords('<p>no heading</p>'), null);
});

test(`every tool page's lede under its h1 stays within ${HERO_LEDE_MAX_WORDS} words`, () => {
  const over = heroLedes().filter((r) => r.words > HERO_LEDE_MAX_WORDS);
  assert.deepEqual(over, [], `move cross-links and detail lists out of the first paragraph into a list or <details> below it: ${over.map((r) => `${r.slug} (${r.words})`).join(', ')}`);
});
