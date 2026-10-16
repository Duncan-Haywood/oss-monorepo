import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { collect, extensionSource, manifest, vsixWrapper, buildVsix, COMMAND } from './vscode.mjs';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vsix-'));
  await fs.mkdir(path.join(root, 'platform/pages'), { recursive: true });
  await fs.writeFile(path.join(root, 'platform/pages/launched.json'), JSON.stringify({ launched: { b: '2026-01-01', a: '2026-01-02', nometa: '2026-01-03' } }));
  for (const [slug, html] of [
    ['a', '<title>Alpha Tool — free</title><meta name="description" content="Does &amp; counts.">'],
    ['b', '<title>Beta</title><meta name="description" content="Second.">'],
    ['nometa', '<p>no title</p>'],
  ]) { await fs.mkdir(path.join(root, 'ventures', slug), { recursive: true }); await fs.writeFile(path.join(root, 'ventures', slug, 'index.html'), html); }
  return root;
}

test('collect lists launched tools sorted, skipping pages without metadata', async () => {
  const tools = await collect({ root: await fixture() });
  assert.deepEqual(tools.map((t) => t.slug), ['a', 'b']);
  assert.equal(tools[0].title, 'Alpha Tool');
  assert.equal(tools[0].description, 'Does & counts.');
  assert.match(tools[0].url, /^https:\/\/.+\/a\/$/);
});

test('extension source is valid, registers the command and opens only the picked URL', async () => {
  const tools = [{ slug: 'a', title: 'A', description: 'd', url: 'https://x.test/a/' }];
  const registered = {};
  const opened = [];
  const vscode = {
    commands: { registerCommand: (id, fn) => { registered[id] = fn; return { dispose() {} }; } },
    window: { showQuickPick: async (items) => items[0] },
    env: { openExternal: async (u) => opened.push(u) },
    Uri: { parse: (s) => s },
  };
  const mod = { exports: {} };
  vm.runInNewContext(extensionSource(tools), { require: () => vscode, module: mod });
  mod.exports.activate({ subscriptions: [] });
  await registered[COMMAND]();
  assert.deepEqual(opened, ['https://x.test/a/']);
});

test('extension has no network code and the manifest asks for nothing', () => {
  const src = extensionSource([]);
  assert.doesNotMatch(src, /fetch|http\.|https\.|child_process|XMLHttp/);
  const m = manifest(2);
  assert.deepEqual(m.activationEvents, []);
  assert.equal(m.license, 'MIT');
  assert.equal(m.dependencies, undefined);
  assert.match(m.description, /^Search 2 /);
});

test('vsix wrapper escapes XML and names the assets', () => {
  const w = vsixWrapper({ ...manifest(1), displayName: 'A & <B>' });
  assert.match(w['extension.vsixmanifest'], /A &amp; &lt;B&gt;/);
  assert.match(w['extension.vsixmanifest'], /extension\/package\.json/);
});

test('buildVsix produces all required members; skips an empty catalogue', async () => {
  const r = await buildVsix({ root: await fixture() });
  for (const f of ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/extension.js', 'extension/readme.md', 'extension/LICENSE.txt']) assert.ok(f in r.files, f);
  assert.equal(r.count, 2);
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'vsix-e-'));
  await fs.mkdir(path.join(empty, 'platform/pages'), { recursive: true });
  await fs.writeFile(path.join(empty, 'platform/pages/launched.json'), '{"launched":{}}');
  assert.ok((await buildVsix({ root: empty })).skip);
});
