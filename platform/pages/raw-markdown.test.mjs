import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawMarkdownLeaks } from './raw-markdown.mjs';
import { inline, renderMarkdown } from '../devlog/markdown.mjs';
import { descriptionHtml, plainDescription } from './writing.mjs';

test('finds backticks, asterisks and link syntax in visible text', () => {
  assert.deepEqual(rawMarkdownLeaks('<p>flagged `curl | bash` here</p>'), ['`curl | bash`']);
  assert.deepEqual(rawMarkdownLeaks('<p>skips (1/*e*) of them</p>'), ['/*e*']);
  assert.equal(rawMarkdownLeaks('<li>[`x`](paper/draft.md) and</li>').length, 1);
});

test('leaves code, scripts, comments and ordinary asterisks alone', () => {
  for (const html of [
    '<p>run <code>`x`</code></p>',
    '<pre>*a* `b` [c](d.md)</pre>',
    '<script>const a = `${b}`;</script>',
    '<!-- `main` is -->',
    '<p>a*b and c*d, 5 * 3, path/*.md, η*=0.25</p>',
    '<p>prices $5 and [1]</p>',
  ]) assert.deepEqual(rawMarkdownLeaks(html), [], html);
});

test('the post renderer reads emphasis after a slash but not a glob', () => {
  assert.equal(inline('skips 37% (1/*e*) of'), 'skips 37% (1/<em>e</em>) of');
  assert.equal(inline('Deira/*de ira* and'), 'Deira/<em>de ira</em> and');
  assert.equal(inline('path/*.md and other/*.js'), 'path/*.md and other/*.js');
});

test('double-backtick code spans keep their inner backticks', () => {
  assert.equal(inline('`` `qual-*` ``; `eda-*`'), '<code>`qual-*`</code>; <code>eda-*</code>');
});

test('a table cell keeps an escaped pipe', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| `\\|\\|` to `&&` | x |\n');
  assert.match(html, /<td><code>\|\|<\/code> to <code>&amp;&amp;<\/code><\/td><td>x<\/td>/);
});

test('post descriptions: code spans for the dek, plain text for meta tags', () => {
  const d = 'flagged `curl | bash` but not `| /bin/bash` & more';
  assert.equal(descriptionHtml(d), 'flagged <code>curl | bash</code> but not <code>| /bin/bash</code> &amp; more');
  assert.equal(plainDescription(d), 'flagged curl | bash but not | /bin/bash & more');
});
