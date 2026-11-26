import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyTarget, resolveMove, rewriteLegacyLinks } from './writing-moves.mjs';

const blogs = new Map([['a-guide', 'blog'], ['a-post', 'engineering']]);
const of = (slug) => blogs.get(slug);

test('the feed and the podcast stay at writing/; everything else has a new home', () => {
  assert.equal(legacyTarget('feed.xml'), null);
  assert.equal(legacyTarget('podcast'), null);
  assert.equal(legacyTarget('podcast/construction/feed.xml'), null);
  assert.equal(resolveMove('', of), 'blog/');
  assert.equal(resolveMove('index.html', of), 'blog/');
  assert.equal(resolveMove('topic/business/', of), 'blog/');
  assert.equal(resolveMove('topic/business/page/3/', of), 'blog/');
  assert.equal(resolveMove('topic/tools/framer/', of), 'engineering/topic/tools/framer/');
  assert.equal(resolveMove('agents/llms.txt', of), 'engineering/agents/llms.txt');
  assert.equal(resolveMove('page/12/', of), 'engineering/');
  assert.equal(resolveMove('posts.json', of), 'engineering/posts.json');
  assert.equal(resolveMove('search.json', of), 'engineering/search.json');
});

test('a post goes to the blog it is on; an unknown slug to the engineering blog', () => {
  assert.deepEqual(legacyTarget('a-guide/'), { slug: 'a-guide', rest: 'a-guide/' });
  assert.equal(resolveMove('a-guide/', of), 'blog/a-guide/');
  assert.equal(resolveMove('a-guide', of), 'blog/a-guide');
  assert.equal(resolveMove('a-post/', of), 'engineering/a-post/');
  assert.equal(resolveMove('no-such-post/', of), 'engineering/no-such-post/');
});

test('rewriteLegacyLinks rewrites only writing/ links under the given root, keeping query and hash', () => {
  const html = '<a href="../../writing/a-guide/#h">g</a> <a href="../../writing/a-post/?x=1">p</a> <a href="../../writing/feed.xml">f</a> <a href="../../writing/podcast/">pod</a> <a href="../../writings/">no</a> <a href="writing/a-post/">other root</a>';
  assert.equal(
    rewriteLegacyLinks(html, '../../', blogs),
    '<a href="../../blog/a-guide/#h">g</a> <a href="../../engineering/a-post/?x=1">p</a> <a href="../../writing/feed.xml">f</a> <a href="../../writing/podcast/">pod</a> <a href="../../writings/">no</a> <a href="writing/a-post/">other root</a>',
  );
  assert.equal(rewriteLegacyLinks('<p>none</p>', '../', blogs), '<p>none</p>');
});
