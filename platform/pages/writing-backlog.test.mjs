import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { researchTracks, writingBacklog } from './writing-backlog.mjs';

function repo({ projects = [], posts = {} }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'writing-backlog-'));
  for (const slug of projects) {
    mkdirSync(path.join(root, 'research', slug), { recursive: true });
    writeFileSync(path.join(root, 'research', slug, 'README.md'), `# ${slug}\n`);
  }
  mkdirSync(path.join(root, 'research', '_shared'), { recursive: true });
  mkdirSync(path.join(root, 'research', 'no-readme'), { recursive: true });
  mkdirSync(path.join(root, 'docs/posts'), { recursive: true });
  for (const [name, body] of Object.entries(posts)) {
    const date = name.slice(0, 10);
    writeFileSync(path.join(root, 'docs/posts', name), `---\ntitle: "T"\ndate: ${date}\ndescription: "D."\n---\n\n${body}\n`);
  }
  return root;
}

test('tracks group projects by slug prefix and skip _shared and README-less directories', () => {
  const root = repo({ projects: ['house-a', 'house-b', 'chip-x'] });
  assert.deepEqual(researchTracks(root), [
    { prefix: 'chip', projects: ['chip-x'] },
    { prefix: 'house', projects: ['house-a', 'house-b'] },
  ]);
});

test('a post linking a project covers its track; uncovered tracks sort first, largest first', () => {
  const root = repo({
    projects: ['house-a', 'house-b', 'house-c', 'chip-x', 'chip-y', 'eda-z'],
    posts: {
      '2026-10-01-old.md': 'Nothing here.',
      '2026-10-10-house.md': 'See `research/house-b/` for the tap fee.',
    },
  });
  const r = writingBacklog(root, '2026-10-20');
  assert.equal(r.posts, 2);
  assert.equal(r.lastPost, '2026-10-10');
  assert.equal(r.daysSinceLastPost, 10);
  assert.deepEqual(r.tracks.map((t) => [t.prefix, t.projects, t.posts]), [
    ['chip', 2, []],
    ['eda', 1, []],
    ['house', 3, ['house']],
  ]);
});

test('no posts yet', () => {
  const r = writingBacklog(repo({ projects: ['house-a'] }), '2026-10-20');
  assert.equal(r.lastPost, null);
  assert.equal(r.daysSinceLastPost, null);
});

test('CLI summary agrees with the JSON report: open count, and single-project prefixes hidden', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = new URL('./writing-backlog.mjs', import.meta.url).pathname;
  const json = JSON.parse(execFileSync('node', [script, '--json'], { encoding: 'utf8' }));
  const text = execFileSync('node', [script], { encoding: 'utf8' });
  const open = json.tracks.filter((t) => t.posts.length === 0).length;
  assert.ok(text.includes(`${open} of ${json.tracks.length} research tracks have no post`));
  const multi = json.tracks.filter((t) => t.projects > 1);
  const listedLines = text.split('\n').filter((l) => /^ {2}\S+\s+\d+ projects/.test(l));
  assert.equal(listedLines.length, multi.length);
});

test('a digit-leading research directory is a track; a dot-leading one is not', () => {
  const root = repo({ projects: ['9lives-a', '.hidden-a'] });
  assert.deepEqual(researchTracks(root).map((t) => t.prefix), ['9lives']);
});
