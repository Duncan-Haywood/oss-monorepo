import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPageIdentity, h1Count, titleOf } from './page-identity.mjs';

const page = (title, body) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

test('a unique title and one h1 is clean', () => {
  const pages = new Map([['a/index.html', page('A', '<h1>A</h1>')], ['b/index.html', page('B', '<h1 class="x">B</h1>')]]);
  assert.deepEqual(checkPageIdentity(pages), []);
});

test('an h1 inside a script or template string is not a second heading', () => {
  const html = page('A', '<h1>A</h1><script>x.innerHTML = `<h1>Widget</h1>`</script><template><h1>t</h1></template>');
  assert.equal(h1Count(html), 1);
});

test('two h1s and none are both reported', () => {
  const pages = new Map([['a.html', page('A', '<h1>1</h1><h1>2</h1>')], ['b.html', page('B', '<p>x</p>')]]);
  const p = checkPageIdentity(pages);
  assert.equal(p.length, 2);
  assert.match(p[0], /a\.html: has 2/);
  assert.match(p[1], /b\.html: has 0/);
});

test('duplicate titles are reported once, naming the pages', () => {
  const pages = new Map([['a.html', page('Same', '<h1>a</h1>')], ['b.html', page('Same', '<h1>b</h1>')]]);
  const p = checkPageIdentity(pages);
  assert.equal(p.length, 1);
  assert.match(p[0], /duplicate <title> "Same" on 2 pages/);
});

test('a missing title is reported; 404 and offline shells are skipped', () => {
  const pages = new Map([['a.html', '<h1>a</h1>'], ['404.html', '<p>none</p>'], ['offline.html', '<p>x</p>']]);
  assert.deepEqual(checkPageIdentity(pages), ['a.html: has no <title>']);
  assert.equal(titleOf('<title>\n  Hi  there </title>'), 'Hi there');
});
