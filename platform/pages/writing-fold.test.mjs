// Folding a thin post into the page that carries its content (`folded_into:`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRedirectPage } from './check.mjs';
import { buildWriting, foldTargetProblem, loadFoldedPosts, loadPosts, WRITING_PATH } from './writing.mjs';

const BASE = 'https://example.test/';

function repoWith(posts, ventureFiles = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'writing-fold-'));
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  for (const [name, text] of Object.entries(posts)) writeFileSync(path.join(root, 'docs/posts', name), text);
  for (const [rel, text] of Object.entries(ventureFiles)) {
    mkdirSync(path.dirname(path.join(root, 'ventures', rel)), { recursive: true });
    writeFileSync(path.join(root, 'ventures', rel), text);
  }
  return root;
}

const post = (title, date, extra = '') =>
  `---\ntitle: "${title}"\ndate: ${date}\ndescription: "About ${title}."\ntags: [notes]\n${extra}---\n\n# ${title}\n\nBody.\n`;

test('a folded post leaves loadPosts and is listed by loadFoldedPosts', () => {
  const root = repoWith({
    '2026-10-01-kept.md': post('Kept', '2026-10-01'),
    '2026-10-02-thin.md': post('Thin', '2026-10-02', 'folded_into: tool/cyprus-page\n'),
  });
  assert.deepEqual(loadPosts(root).map((p) => p.slug), ['kept']);
  const folded = loadFoldedPosts(root);
  assert.deepEqual(folded.map((p) => [p.slug, p.foldedInto]), [['thin', 'tool/cyprus-page']]);
});

test('a folded post still claims its slug', () => {
  const root = repoWith({
    '2026-10-01-same.md': post('A', '2026-10-01'),
    '2026-10-02-same.md': post('B', '2026-10-02', 'folded_into: tool/\n'),
  });
  assert.throws(() => loadPosts(root), /two posts share the slug "same"/);
});

test('folded_into must be a site path, never a URL or a climb', () => {
  for (const bad of ['https://evil.example/', '//evil.example/x', '../secret', 'tool/../../x', '/tool/page', 'Tool/Page', 'tool//page', 'javascript:alert(1)']) {
    const root = repoWith({ '2026-10-02-thin.md': post('Thin', '2026-10-02', `folded_into: "${bad}"\n`) });
    assert.throws(() => loadPosts(root), /folded_into .* must be a site path/, bad);
  }
});

test('foldTargetProblem resolves venture pages, venture roots and live posts', () => {
  const root = repoWith({}, { 'tool/index.html': '<p>', 'tool/cyprus-page.html': '<p>', 'tool/sub/index.html': '<p>' });
  assert.equal(foldTargetProblem('tool/cyprus-page', { root }), '');
  assert.equal(foldTargetProblem('tool/cyprus-page.html', { root }), '');
  assert.equal(foldTargetProblem('tool/sub/', { root }), '');
  assert.equal(foldTargetProblem('tool/', { root }), '');
  assert.match(foldTargetProblem('tool/missing', { root }), /does not exist/);
  assert.match(foldTargetProblem('tool/cyprus-page', { root, published: new Set(['other']) }), /does not publish "tool\/"/);
  assert.equal(foldTargetProblem('writing/kept/', { root, live: new Set(['kept']) }), '');
  assert.match(foldTargetProblem('writing/gone/', { root, live: new Set(['kept']) }), /no live post "gone"/);
});

test('buildWriting writes a redirect at the old URL and leaves it out of the page list', async () => {
  const root = repoWith(
    {
      '2026-10-01-kept.md': post('Kept', '2026-10-01'),
      '2026-10-02-thin.md': post('Thin', '2026-10-02', 'folded_into: tool/cyprus-page\n'),
      '2026-10-03-into-post.md': post('Into post', '2026-10-03', 'folded_into: writing/kept/\n'),
    },
    { 'tool/cyprus-page.html': '<p>' },
  );
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-fold-out-'));
  const pages = await buildWriting(out, BASE, { root, published: new Set(['tool']) });
  assert.ok(pages.includes('kept'));
  assert.ok(!pages.includes('thin') && !pages.includes('into-post'));
  const stub = readFileSync(path.join(out, WRITING_PATH, 'thin/index.html'), 'utf8');
  assert.match(stub, /<link rel="canonical" href="https:\/\/example\.test\/tool\/cyprus-page">/);
  assert.match(stub, /http-equiv="refresh" content="0; url=https:\/\/example\.test\/tool\/cyprus-page"/);
  assert.match(stub, /noindex/);
  assert.match(stub, /no warranty/i); // check.mjs refuses a writing page without it
  assert.match(stub, /<title>Thin \(moved\)<\/title>/); // titles must not repeat across pages
  assert.equal(stub.match(/<h1>/g).length, 1);
  assert.ok(isRedirectPage(stub, 'https://example.test/tool/cyprus-page'));
  assert.match(readFileSync(path.join(out, WRITING_PATH, 'into-post/index.html'), 'utf8'), /href="https:\/\/example\.test\/writing\/kept\/"/);
  // Gone from the index, the feed and the search index.
  for (const f of ['index.html', 'feed.xml']) {
    const p = path.join(out, WRITING_PATH, f);
    if (existsSync(p)) assert.doesNotMatch(readFileSync(p, 'utf8'), /Thin|Into post/, f);
  }
});

test('a target that does not resolve fails the build, or is skipped on main', async () => {
  const root = repoWith({ '2026-10-02-thin.md': post('Thin', '2026-10-02', 'folded_into: tool/missing\n') });
  const out = mkdtempSync(path.join(os.tmpdir(), 'writing-fold-out-'));
  await assert.rejects(buildWriting(out, BASE, { root }), /thin\.md: folded_into ventures\/tool\/missing/);
  process.env.PAGES_SKIP_BAD_POSTS = '1';
  try {
    await buildWriting(out, BASE, { root });
    assert.ok(!existsSync(path.join(out, WRITING_PATH, 'thin/index.html')));
  } finally {
    delete process.env.PAGES_SKIP_BAD_POSTS;
  }
});

test('isRedirectPage needs noindex and a zero-second refresh to the canonical itself', () => {
  const page = (robots, refresh) => `<head>${robots ? '<meta name="robots" content="noindex">' : ''}<link rel="canonical" href="https://a.test/x">${refresh ? `<meta http-equiv="refresh" content="0; url=${refresh}">` : ''}</head>`;
  assert.ok(isRedirectPage(page(true, 'https://a.test/x'), 'https://a.test/x'));
  assert.ok(!isRedirectPage(page(false, 'https://a.test/x'), 'https://a.test/x'));
  assert.ok(!isRedirectPage(page(true, ''), 'https://a.test/x'));
  assert.ok(!isRedirectPage(page(true, 'https://a.test/other'), 'https://a.test/x'));
});
