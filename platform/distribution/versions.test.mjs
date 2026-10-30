import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  parseAllowlist, allowed, bumpPatch, payload, hashFiles, nextVersions, staleness, hashAll, render, main,
  loadAllowlist, loadVersions, unstamp, stamp, CHANNELS, ALLOWLIST, VERSIONS,
} from './versions.mjs';

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'versionstest-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}
const MIT = 'MIT License\n\nCopyright (c) x';
const nodeTool = (slug) => ({
  [`ventures/${slug}/cli.mjs`]: '#!/usr/bin/env node\nimport { f } from "./lib.mjs";\nconsole.log(f());\n',
  [`ventures/${slug}/lib.mjs`]: 'export const f = () => 1;\n',
  [`ventures/${slug}/LICENSE`]: MIT,
  [`ventures/${slug}/VENTURE.yaml`]: 'name: x\ndescription: Checks a thing.\n',
  [`ventures/${slug}/README.md`]: `# ${slug}\n`,
  [`ventures/${slug}/cli.test.mjs`]: 'test\n',
  [`ventures/${slug}/index.html`]: '<p>page</p>\n',
});
const allowFile = (tools) => ({ [ALLOWLIST]: JSON.stringify({ tools }) });

test('parseAllowlist rejects duplicates, unknown channels and entries with no reason', () => {
  const t = (over) => ({ slug: 'a-check', channels: ['npm'], why: 'because', ...over });
  assert.equal(parseAllowlist({ tools: [t()] }).bySlug.get('a-check').why, 'because');
  assert.throws(() => parseAllowlist({ tools: [t(), t()] }), /listed twice/);
  assert.throws(() => parseAllowlist({ tools: [t({ channels: ['ftp'] })] }), /unknown channel ftp/);
  assert.throws(() => parseAllowlist({ tools: [t({ channels: [] })] }), /names no channel/);
  assert.throws(() => parseAllowlist({ tools: [t({ why: '' })] }), /why it is published/);
  assert.throws(() => parseAllowlist({ tools: [t({ slug: '../x' })] }), /invalid slug/);
  const a = parseAllowlist({ tools: [t(), t({ slug: 'b-check', channels: ['release', 'pypi'] })] });
  assert.deepEqual([...allowed(a, 'npm')], ['a-check']);
  assert.deepEqual([...allowed(a, 'release')], ['b-check']);
});

test('bumpPatch and nextVersions: new tools start at 0.1.0, unchanged keep theirs, changed bump the patch', () => {
  assert.equal(bumpPatch('1.2.9'), '1.2.10');
  assert.throws(() => bumpPatch('v1'), /not a version/);
  const prev = { same: { version: '0.3.0', hash: 'h1' }, moved: { version: '0.1.4', hash: 'h2' }, gone: { version: '1.0.0', hash: 'h3' } };
  const next = nextVersions(prev, { same: 'h1', moved: 'h9', fresh: 'h4' });
  assert.deepEqual(next, {
    fresh: { version: '0.1.0', hash: 'h4' },
    moved: { version: '0.1.5', hash: 'h9' },
    same: { version: '0.3.0', hash: 'h1' },
  });
  assert.deepEqual(staleness(prev, next).sort(), ['fresh: not in versions.json', 'gone: no longer allow-listed', 'moved: shipped files changed (0.1.4 -> 0.1.5)']);
  assert.deepEqual(staleness(next, next), []);
});

test('the hash follows the shipped files only: tests and pages do not move it, the CLI does', async () => {
  const root = await fixture({ ...nodeTool('a-check'), ...allowFile([{ slug: 'a-check', channels: ['npm'], why: 'x' }]) });
  const tool = (await loadAllowlist(root)).tools[0];
  const before = hashFiles((await payload(root, tool)).files);
  await fs.writeFile(path.join(root, 'ventures/a-check/cli.test.mjs'), 'changed test\n');
  await fs.writeFile(path.join(root, 'ventures/a-check/index.html'), '<p>changed</p>\n');
  assert.equal(hashFiles((await payload(root, tool)).files), before);
  await fs.writeFile(path.join(root, 'ventures/a-check/lib.mjs'), 'export const f = () => 2;\n');
  assert.notEqual(hashFiles((await payload(root, tool)).files), before);
});

test('a release-only tool ships its composite action and check.py', async () => {
  const root = await fixture({
    'ventures/b-check/check.py': 'def main():\n    return 0\n',
    'platform/distribution/actions/b-check/action.yml': 'name: b\n',
    ...allowFile([{ slug: 'b-check', channels: ['release'], why: 'x' }, { slug: 'c-check', channels: ['release'], why: 'x' }]),
  });
  const [b, c] = (await loadAllowlist(root)).tools;
  assert.deepEqual(Object.keys((await payload(root, b)).files).sort(), ['action:action.yml', 'action:check.py']);
  assert.match((await payload(root, c)).skip, /ships nothing/);
  await assert.rejects(hashAll(root), /c-check: ships nothing/);
});

test('hashing ignores the version stamp in a bundled runner, and stamp sets it', () => {
  const a = unstamp('devsec.py', 'x = 1\nVERSION = "0.1.0"\n');
  assert.equal(a, unstamp('devsec.py', 'x = 1\nVERSION = "0.4.2"\n'));
  assert.equal(unstamp('README.md', 'VERSION = "1"\n'), 'VERSION = "1"\n');
  assert.equal(stamp('VERSION = "0.0.0"\n', '1.2.3'), 'VERSION = "1.2.3"\n');
});

test('--write creates the manifest, --check passes until a shipped file changes', async () => {
  const root = await fixture({ ...nodeTool('a-check'), ...allowFile([{ slug: 'a-check', channels: ['npm'], why: 'x' }]) });
  const log = () => {};
  assert.equal(await main(['--check'], { root, log }), 1);
  assert.equal(await main(['--write'], { root, log }), 0);
  assert.equal((await loadVersions(root))['a-check'].version, '0.1.0');
  assert.equal(await main(['--check'], { root, log }), 0);
  await fs.writeFile(path.join(root, 'ventures/a-check/lib.mjs'), 'export const f = () => 3;\n');
  const lines = [];
  assert.equal(await main(['--check'], { root, log: (l) => lines.push(l) }), 1);
  assert.match(lines.join('\n'), /a-check: shipped files changed \(0\.1\.0 -> 0\.1\.1\)/);
  assert.match(lines.join('\n'), /versions\.mjs --write/);
  await main(['--write'], { root, log });
  assert.equal((await loadVersions(root))['a-check'].version, '0.1.1');
});

test('a hand-raised version survives --write while the files are unchanged', async () => {
  const root = await fixture({ ...nodeTool('a-check'), ...allowFile([{ slug: 'a-check', channels: ['npm'], why: 'x' }]) });
  await main(['--write'], { root, log() {} });
  const v = await loadVersions(root);
  await fs.writeFile(path.join(root, VERSIONS), render({ 'a-check': { ...v['a-check'], version: '1.0.0' } }));
  await main(['--write'], { root, log() {} });
  assert.equal((await loadVersions(root))['a-check'].version, '1.0.0');
  assert.equal(await main(['--check'], { root, log() {} }), 0);
});

test('the committed allow-list is valid, every tool on it builds, and versions.json is current', async () => {
  const allow = await loadAllowlist();
  assert.ok(allow.tools.length > 0);
  for (const t of allow.tools) for (const c of t.channels) assert.ok(CHANNELS.includes(c));
  const lines = [];
  const code = await main(['--check'], { log: (l) => lines.push(l) });
  assert.equal(code, 0, lines.join('\n'));
});

test('the versions CI workflow runs for every directory an allow-listed tool ships from', async () => {
  const yml = await fs.readFile(new URL('../../.github/workflows/distribution-versions-ci.yml', import.meta.url), 'utf8');
  const globs = [...yml.matchAll(/^\s+- "(ventures\/[^"]+)"$/gm)].map((m) => m[1]);
  const covers = (dir) => globs.some((g) => new RegExp(`^${g.replace(/\*\*$/, '').replace(/\./g, '\\.').replace(/\*/g, '[^/]*')}`).test(`${dir}/x`));
  const { execFileSync } = await import('node:child_process');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const bundled = execFileSync('python3', [path.join(root, 'ventures/devsec-toolkit/devsec.py'), 'list', '--paths'], { encoding: 'utf8' })
    .split(/\s+/).filter(Boolean).map((p) => p.split('/').slice(0, 2).join('/'));
  const dirs = new Set([...(await loadAllowlist()).tools.map((t) => `ventures/${t.slug}`), ...bundled]);
  const missing = [...dirs].filter((d) => !covers(d));
  assert.deepEqual(missing, [], 'add these to the paths in distribution-versions-ci.yml');
});
