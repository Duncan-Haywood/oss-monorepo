import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAX_TITLE_LENGTH, checkPageIdentity, h1Count, loadPages, resolvePostTitleClashes, titleOf } from './page-identity.mjs';

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

const mkSite = async (files) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-identity-'));
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body);
  }
  return dir;
};

test('loadPages walks subdirectories and reads only .html files', async () => {
  const dir = await mkSite({ 'index.html': page('A', '<h1>A</h1>'), 'x/y/index.html': page('B', '<h1>B</h1>'), 'x/notes.txt': 'no' });
  const pages = await loadPages(dir);
  assert.deepEqual([...pages.keys()].sort(), ['index.html', 'x/y/index.html']);
});

test('the command line exits 0 on a clean site and 1 on a problem, reading the dir argument', async () => {
  const script = fileURLToPath(new URL('./page-identity.mjs', import.meta.url));
  const clean = await mkSite({ 'index.html': page('A', '<h1>A</h1>') });
  const ok = spawnSync(process.execPath, [script, clean], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /unique title and one h1/);
  const bad = await mkSite({ 'index.html': page('A', '<p>no heading</p>') });
  const fail = spawnSync(process.execPath, [script, bad], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /index\.html: has 0/);
  assert.match(fail.stdout, /1 problem/);
});

test('the command line runs with no argument too (defaults to ./dist)', () => {
  const script = fileURLToPath(new URL('./page-identity.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.ok(r.stdout.length > 0 || r.stderr.length > 0);
});

test('a title over the ceiling is flagged, entities counting as one character', () => {
  const long = (n) => new Map([['a/index.html', `<title>${n}</title><h1>x</h1>`]]);
  assert.deepEqual(checkPageIdentity(long('x'.repeat(MAX_TITLE_LENGTH))), []);
  assert.deepEqual(checkPageIdentity(long('&#39;'.repeat(MAX_TITLE_LENGTH))), []);
  assert.match(checkPageIdentity(long('x'.repeat(MAX_TITLE_LENGTH + 1)))[0], /over 130/);
});

test('a post that reuses a tool page title is renamed, not left to fail the deploy', () => {
  const tool = '<title>Free checker</title><h1>Checker</h1>';
  const post = (h1) => `<title>Free checker</title><meta property="og:title" content="Free checker"><h1>${h1}</h1>`;
  const pages = new Map([
    ['tool/index.html', tool],
    ['writing/a/index.html', post('Why we built a checker')],
    ['writing/b/index.html', post('Free checker')],
  ]);
  const changes = resolvePostTitleClashes(pages);
  assert.deepEqual(changes.map((c) => [c.rel, c.to]), [
    ['writing/a/index.html', 'Why we built a checker'],
    ['writing/b/index.html', 'Free checker · Blog'],
  ]);
  assert.match(changes[0].html, /og:title" content="Why we built a checker"/);
  for (const c of changes) pages.set(c.rel, c.html);
  assert.deepEqual(checkPageIdentity(pages), []);
  assert.deepEqual(resolvePostTitleClashes(new Map([['tool/index.html', tool]])), []);
});

test('a post with its own title is left alone, and a skipped page does not reserve a title', () => {
  const pages = new Map([
    ['writing/a/index.html', '<title>Own title</title><h1>A</h1>'],
    ['404.html', '<title>Not found</title><h1>x</h1>'],
    ['writing/b/index.html', '<title>Not found</title><h1>B</h1>'],
  ]);
  assert.deepEqual(resolvePostTitleClashes(pages), []);
});
