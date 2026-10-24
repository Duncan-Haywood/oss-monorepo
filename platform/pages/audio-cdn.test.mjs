import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
  assert.match(readFileSync(path.join(out, 'shelf/feed.xml'), 'utf8'), new RegExp(`url="${one.replace(/[.?]/g, '\\$&')}"`));
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
