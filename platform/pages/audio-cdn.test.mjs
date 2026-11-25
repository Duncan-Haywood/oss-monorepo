import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { cdnUrl, committedAudio, gitBlobId, moveAudioToCdn } from './audio-cdn.mjs';

const BASE = 'https://example.test/site/';
const REPO = 'owner/repo';

function put(root, rel, contents) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), contents);
}

/** A git repo with two committed MP3s, and a built site that copied them. */
function fixture() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-repo-'));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 't@example.test');
  git('config', 'user.name', 't');
  put(repo, 'ventures/shelf/audio/one.mp3', 'ID3-one');
  put(repo, 'docs/podcast/audio/ep 1.mp3', 'ID3-ep');
  git('add', '.');
  git('commit', '-qm', 'audio');
  const first = git('rev-parse', 'HEAD');
  put(repo, 'README.md', 'later');
  git('add', '.');
  git('commit', '-qm', 'unrelated');

  const out = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-out-'));
  put(out, 'shelf/audio/one.mp3', 'ID3-one');
  put(out, 'writing/podcast/audio/ep 1.mp3', 'ID3-ep');
  put(out, 'shelf/audio/draft.mp3', 'ID3-not-committed');
  put(out, 'shelf/audio/orphan.mp3', 'ID3-one'); // same bytes, nothing links it
  put(out, 'shelf/story.html', '<audio src="audio/one.mp3"></audio><a href="audio/draft.mp3">x</a>');
  put(out, 'shelf/feed.xml', `<enclosure url="${BASE}shelf/audio/one.mp3" length="7" type="audio/mpeg"/>`);
  put(out, 'writing/post/index.html', '<audio src="../podcast/audio/ep%201.mp3"></audio>');
  return { repo, out, first };
}

test('gitBlobId matches git hash-object', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-hash-'));
  writeFileSync(path.join(dir, 'f'), 'ID3-one');
  assert.equal(gitBlobId(Buffer.from('ID3-one')), execFileSync('git', ['hash-object', path.join(dir, 'f')], { encoding: 'utf8' }).trim());
});

test('committed MP3s are pinned to the last commit that touched them, not HEAD', () => {
  const { repo, first } = fixture();
  const map = committedAudio(repo);
  assert.deepEqual(map.get(gitBlobId(Buffer.from('ID3-one'))), { path: 'ventures/shelf/audio/one.mp3', commit: first });
});

test('linked, committed audio moves to the CDN; drafts and unlinked files stay', async () => {
  const { repo, out, first } = fixture();
  const result = await moveAudioToCdn({ outDir: out, base: BASE, repoRoot: repo, repo: REPO });
  assert.deepEqual(result, { moved: 2, kept: 2, bytes: 13 });

  const one = cdnUrl(REPO, first, 'ventures/shelf/audio/one.mp3');
  assert.equal(one, `https://cdn.jsdelivr.net/gh/owner/repo@${first}/ventures/shelf/audio/one.mp3`);
  assert.equal(readFileSync(path.join(out, 'shelf/story.html'), 'utf8'), `<audio src="${one}"></audio><a href="audio/draft.mp3">x</a>`);
  const feed = readFileSync(path.join(out, 'shelf/feed.xml'), 'utf8');
  assert.ok(feed.includes(`url="${one}"`), feed);
  assert.match(readFileSync(path.join(out, 'writing/post/index.html'), 'utf8'), /docs\/podcast\/audio\/ep%201\.mp3"/);

  assert.equal(existsSync(path.join(out, 'shelf/audio/one.mp3')), false);
  assert.equal(existsSync(path.join(out, 'writing/podcast/audio/ep 1.mp3')), false);
  assert.equal(existsSync(path.join(out, 'shelf/audio/draft.mp3')), true, 'not committed: stays on Pages');
  assert.equal(existsSync(path.join(out, 'shelf/audio/orphan.mp3')), true, 'nothing links it: stays on Pages');
});

test('without git every file stays where it was', async () => {
  const { out } = fixture();
  const bare = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-nogit-'));
  const result = await moveAudioToCdn({ outDir: out, base: BASE, repoRoot: bare, repo: REPO });
  assert.deepEqual(result, { moved: 0, kept: 4, bytes: 0 });
  assert.equal(existsSync(path.join(out, 'shelf/audio/one.mp3')), true);
});

// Red team 2026-11-17: the escapes below each passed the suite as a mutant.

test('a link to another file whose name starts with an MP3 name is left alone', async () => {
  const { repo, out, first } = fixture();
  put(out, 'shelf/notes.html', '<a href="audio/one.mp3.vtt">captions</a> <a href="audio/one.mp3-notes.html">notes</a> <a href="audio/one.mp3?t=5">5s</a>');
  await moveAudioToCdn({ outDir: out, base: BASE, repoRoot: repo, repo: REPO });
  const one = cdnUrl(REPO, first, 'ventures/shelf/audio/one.mp3');
  assert.equal(readFileSync(path.join(out, 'shelf/notes.html'), 'utf8'),
    `<a href="audio/one.mp3.vtt">captions</a> <a href="audio/one.mp3-notes.html">notes</a> <a href="${one}?t=5">5s</a>`);
});

test('jsDelivr serves GitHub files up to 20 MB: a file of exactly the limit moves, one byte more stays', async () => {
  const LIMIT = 20 * 1024 * 1024; // literal on purpose: the export is what this pins
  const repo = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-big-'));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 't@example.test');
  git('config', 'user.name', 't');
  const atLimit = Buffer.alloc(LIMIT, 1);
  const over = Buffer.alloc(LIMIT + 1, 1);
  put(repo, 'a/at.mp3', atLimit);
  put(repo, 'a/over.mp3', over);
  git('add', '.');
  git('commit', '-qm', 'big');
  const out = mkdtempSync(path.join(os.tmpdir(), 'audio-cdn-big-out-'));
  put(out, 'a/at.mp3', atLimit);
  put(out, 'a/over.mp3', over);
  put(out, 'a/index.html', '<audio src="at.mp3"></audio><audio src="over.mp3"></audio>');
  try {
    const result = await moveAudioToCdn({ outDir: out, base: BASE, repoRoot: repo, repo: REPO });
    assert.deepEqual(result, { moved: 1, kept: 1, bytes: LIMIT });
    assert.equal(existsSync(path.join(out, 'a/at.mp3')), false);
    assert.equal(existsSync(path.join(out, 'a/over.mp3')), true);
  } finally {
    // About 60 MB of 20 MB files and their git objects, left behind every run until 2026-11-18.
    rmSync(repo, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('the repo comes from GITHUB_REPOSITORY, and the portfolio repo without it', async () => {
  const saved = process.env.GITHUB_REPOSITORY;
  try {
    for (const [env, want] of [['someone/fork', 'someone/fork'], [undefined, 'Duncan-Haywood/oss-monorepo']]) {
      if (env === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = env;
      const { repo, out, first } = fixture();
      await moveAudioToCdn({ outDir: out, base: BASE, repoRoot: repo });
      assert.equal(readFileSync(path.join(out, 'shelf/story.html'), 'utf8').match(/src="([^"]+)"/)[1],
        cdnUrl(want, first, 'ventures/shelf/audio/one.mp3'));
    }
  } finally {
    if (saved === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = saved;
  }
});

test('an MP3 whose name git log quotes is never pinned to an undefined commit', () => {
  const { repo } = fixture();
  // core.quotePath=false still quotes '"' and '\\' in `git log` output, so
  // this path is missing from the last-touched map.
  put(repo, 'shelf/audio/odd"name.mp3', 'ID3-odd');
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'odd']);
  const map = committedAudio(repo);
  for (const { path: p, commit } of map.values()) assert.match(commit, /^[0-9a-f]{40}$/, p);
});
