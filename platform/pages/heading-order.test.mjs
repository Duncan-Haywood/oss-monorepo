import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headingSkips, headings } from './heading-order.mjs';
import { loadPosts, renderPost } from './writing.mjs';
import { categoryFor, comparisonSubjectKey, groupComparisons, renderCategoryPage, renderCompareProductPage } from './build.mjs';

const BASE = 'https://example.test/';

test('headingSkips finds a jump of two and ignores what is not rendered', () => {
  assert.deepEqual(headingSkips('<h1>T</h1><h3 class="x">Deep <em>one</em></h3>'), [{ from: 1, to: 3, text: 'Deep one' }]);
  assert.deepEqual(headingSkips('<h1>T</h1><h2>A</h2><h3>B</h3><h2>C</h2><h4>D</h4>'), [{ from: 2, to: 4, text: 'D' }]);
  // Going back up any number of levels is fine; so is starting below h1.
  assert.deepEqual(headingSkips('<h2>A</h2><h3>B</h3><h4>C</h4><h1>D</h1>'), []);
  assert.deepEqual(headingSkips('<h1>T</h1><script>"<h4>x</h4>"</script><!-- <h5>y</h5> --><h2>A</h2>'), []);
  assert.equal(headings('<h2 hidden>x</h2><h2>y</h2>').length, 1);
});

test('no blog post skips a heading level (every real post in docs/posts)', () => {
  const posts = loadPosts();
  assert.ok(posts.length > 100, 'expected the real posts');
  const bad = [];
  for (const p of posts) {
    const skips = headingSkips(renderPost(p, posts, { baseUrl: BASE }));
    if (skips.length) bad.push(`${p.source}: h${skips[0].from} -> h${skips[0].to} "${skips[0].text}"`);
  }
  assert.deepEqual(bad, [], 'fix the post: use ## for its sections, ### under them');
});

test('compare product pages and flat category pages put h2 under the h1', () => {
  const entry = (subject, slug, title) => ({ subject, subjectKey: comparisonSubjectKey(subject), slug, file: `vs-${subject.toLowerCase()}.html`, title, description: 'Does the arithmetic.' });
  const groups = groupComparisons([entry('Jobber', 'a-calculator', 'A Calculator'), entry('Jobber', 'b-calculator', 'B Calculator')]);
  const compare = renderCompareProductPage({ group: groups[0], groups, surfaces: [{ slug: 'a-calculator', title: 'A Calculator' }, { slug: 'b-calculator', title: 'B Calculator' }], categoryGroups: [], baseUrl: BASE });
  assert.deepEqual(headingSkips(compare), []);

  const items = [{ slug: 'a-calculator', title: 'A Calculator', description: 'd', pageCount: 1, hasSitemap: false }];
  const category = categoryFor('a-calculator');
  const flat = renderCategoryPage({ category, items, groups: [{ category, items }], baseUrl: BASE });
  assert.deepEqual(headingSkips(flat), []);
  assert.match(flat, /<li class="card">\s*<a [^>]*>\s*<h2>A Calculator<\/h2>/);
});
