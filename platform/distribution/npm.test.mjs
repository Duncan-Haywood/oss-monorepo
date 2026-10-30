import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { importsOf, closure, descriptionOf, packageName, buildPackage, writePackage, discover, plan, run, isOurs, MAX_PER_RUN } from './npm.mjs';
import { parseAllowlist } from './versions.mjs';

/** An allow-list and a versions manifest naming `slugs` for npm at `version`. */
const listed = (slugs, version = '0.1.0') => ({
  allow: parseAllowlist({ tools: slugs.map((slug) => ({ slug, channels: ['npm'], why: 'test' })) }),
  versions: Object.fromEntries(slugs.map((slug) => [slug, { version, hash: 'sha256-x' }])),
});
const OURS = { repository: { url: 'git+https://github.com/duncan-haywood/oss-monorepo.git' } };

async function fixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'npmtest-'));
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  return root;
}
const MIT = 'MIT License\n\nCopyright (c) x';
const cli = (extra = '') => `#!/usr/bin/env node\nimport { f } from "./lib.mjs";\n${extra}\nif (import.meta.url === \`file://\${process.argv[1]}\`) console.log(f());\n`;
const venture = (name, over = {}) => ({
  [`ventures/${name}/cli.mjs`]: cli(),
  [`ventures/${name}/lib.mjs`]: 'export const f = () => "hello from " + "' + name + '";\n',
  [`ventures/${name}/LICENSE`]: MIT,
  [`ventures/${name}/VENTURE.yaml`]: 'name: x\ndescription: Checks a thing. Second sentence.\n',
  ...over,
});

test('importsOf reads static, bare and dynamic imports but not strings that say "from"', () => {
  const src = `import a from "./a.mjs";\nimport {\n b,\n} from 'node:fs';\nimport "./side.mjs";\nconst m = await import("./dyn.mjs");\nif (x === "--from") args.from = argv[++i]; else if (a === "y") 1;\n`;
  assert.deepEqual(importsOf(src).sort(), ['./a.mjs', './dyn.mjs', './side.mjs', 'node:fs']);
});

test('closure follows relative imports and skips packages and escapes', async () => {
  const root = await fixture(venture('a'));
  assert.deepEqual(await closure(path.join(root, 'ventures/a')), { files: ['cli.mjs', 'lib.mjs'] });
  const dep = await fixture(venture('b', { 'ventures/b/lib.mjs': 'import x from "left-pad";\nexport const f = () => x;\n' }));
  assert.match((await closure(path.join(dep, 'ventures/b'))).skip, /left-pad/);
  const up = await fixture(venture('c', { 'ventures/c/lib.mjs': 'import x from "../shared.mjs";\nexport const f = () => x;\n' }));
  assert.match((await closure(path.join(up, 'ventures/c'))).skip, /outside/);
});

test('descriptionOf keeps the first sentence', () => {
  assert.equal(descriptionOf('name: x\ndescription: Checks a thing. Second sentence.\n'), 'Checks a thing.');
  assert.equal(descriptionOf('name: x\n'), '');
});

test('packageName applies an optional scope', () => {
  assert.equal(packageName('a-b'), 'a-b');
  assert.equal(packageName('a-b', '@me'), '@me/a-b');
});

test('buildPackage accepts a 214-character name and refuses 215', async () => {
  const ok = await buildPackage({ slug: 'a'.repeat(214), dir: '/nonexistent' });
  assert.equal(ok.skip, 'no cli.mjs');
  const bad = await buildPackage({ slug: 'a'.repeat(215), dir: '/nonexistent' });
  assert.match(bad.skip, /^invalid package name/);
});

test('buildPackage accepts digits 0-9 in scope and package names', async () => {
  for (const [slug, scope] of [['a0123456789-z', '@x0123456789'], ['9tool', '@9org']]) {
    const r = await buildPackage({ slug, dir: '/nonexistent', scope });
    assert.equal(r.skip, 'no cli.mjs', `${scope}/${slug}`);
  }
});

test('--pack applies NPM_SCOPE from the environment', () => {
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'npm.mjs');
  const r = spawnSync('node', [script, '--pack', 'nope-slug-xyz', os.tmpdir()], { env: { ...process.env, NPM_SCOPE: 'BAD' }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /invalid package name BAD\/nope-slug-xyz/);
});

test('buildPackage refuses a CLI without shebang or MIT license', async () => {
  const noShebang = await fixture(venture('a', { 'ventures/a/cli.mjs': 'console.log(1)\n' }));
  assert.match((await buildPackage({ slug: 'a', dir: path.join(noShebang, 'ventures/a') })).skip, /shebang/);
  const noLicense = await fixture(venture('a', { 'ventures/a/LICENSE': 'All rights reserved' }));
  assert.match((await buildPackage({ slug: 'a', dir: path.join(noLicense, 'ventures/a') })).skip, /MIT/);
});

test('the generated package runs through a bin symlink, which the bare CLI does not', async () => {
  const root = await fixture(venture('hello-check'));
  const pkg = await buildPackage({ slug: 'hello-check', dir: path.join(root, 'ventures/hello-check') });
  const manifest = JSON.parse(pkg.files['package.json']);
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.bin, { 'hello-check': 'bin.mjs' });
  assert.match(pkg.files['README.md'], /not legal, tax or professional advice/i);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'npmpkg-'));
  await writePackage(pkg, out);
  const link = path.join(out, 'linked');
  await fs.symlink(path.join(out, 'bin.mjs'), link);
  assert.match(execFileSync('node', [link], { encoding: 'utf8' }), /hello from hello-check/);
  const bare = path.join(out, 'bare-link.mjs');
  await fs.symlink(path.join(out, 'cli.mjs'), bare);
  assert.equal(execFileSync('node', [bare], { encoding: 'utf8' }), '', 'without the wrapper the direct-invocation guard fails silently');
});

test('every venture CLI on main either qualifies or says why not', async () => {
  const { ok, skipped } = await plan({});
  assert.ok(ok.length > 100);
  for (const s of skipped) assert.ok(s.reason);
  for (const p of ok) {
    const m = JSON.parse(p.files['package.json']);
    assert.ok(p.files['bin.mjs'] && p.files.LICENSE && m.files.every((f) => f in p.files), p.name);
  }
  assert.ok((await discover()).length >= ok.length);
});

test('run is a dry run unless enabled, and skips versions the registry already has', async () => {
  const root = await fixture({ ...venture('a-check'), ...venture('b-check') });
  const lines = [];
  const fetchImpl = async (url) => (url.endsWith('/a-check')
    ? { status: 200, json: async () => ({ ...OURS, versions: { '0.1.0': {} } }) }
    : { status: 404 });
  const r = await run({ env: {}, fetchImpl, log: (l) => lines.push(l), root, ...listed(['a-check', 'b-check']), publish: async () => assert.fail('must not publish') });
  assert.deepEqual(r, { published: 0, planned: 1 });
  assert.match(lines.join('\n'), /DRY RUN/);
  assert.match(lines.join('\n'), /b-check@0\.1\.0/);
  assert.doesNotMatch(lines.join('\n'), /a-check@/);
});

test('only allow-listed tools are considered, at their manifest version', async () => {
  const root = await fixture({ ...venture('a-check'), ...venture('b-check') });
  const asked = [];
  const lines = [];
  const r = await run({ env: {}, fetchImpl: async (url) => { asked.push(url); return { status: 404 }; }, log: (l) => lines.push(l), root, ...listed(['b-check'], '1.4.2') });
  assert.equal(r.planned, 1);
  assert.deepEqual(asked, ['https://registry.npmjs.org/b-check']);
  assert.match(lines.join('\n'), /b-check@1\.4\.2/);
});

test('a changed version of our own package is published; a name someone else owns is skipped', async () => {
  const root = await fixture({ ...venture('ours-check'), ...venture('taken-check') });
  const fetchImpl = async (url) => ({
    status: 200,
    json: async () => (url.endsWith('/ours-check') ? { ...OURS, versions: { '0.1.0': {} } } : { repository: { url: 'git+https://github.com/someone/else.git' }, versions: {} }),
  });
  const seen = [];
  const lines = [];
  const r = await run({ env: { DISTRIBUTE_NPM: 'true', NODE_AUTH_TOKEN: 't' }, fetchImpl, log: (l) => lines.push(l), root, ...listed(['ours-check', 'taken-check'], '0.1.1'),
    publish: async (dir) => { seen.push(JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'))); } });
  assert.equal(r.published, 1);
  assert.deepEqual(seen.map((m) => `${m.name}@${m.version}`), ['ours-check@0.1.1']);
  assert.match(lines.join('\n'), /skip taken-check: the name belongs to another project/);
  assert.equal(isOurs({}), false);
});

test('live run publishes at most MAX_PER_RUN new packages and needs a token', async () => {
  const files = {};
  const slugs = [];
  for (let i = 0; i < MAX_PER_RUN + 3; i += 1) { slugs.push(`tool-${String.fromCharCode(97 + i)}`); Object.assign(files, venture(slugs.at(-1))); }
  const root = await fixture(files);
  const fetchImpl = async () => ({ status: 404 });
  const noToken = await run({ env: { DISTRIBUTE_NPM: 'true' }, fetchImpl, log: () => {}, root, ...listed(slugs), publish: async () => assert.fail('no token') });
  assert.equal(noToken.published, 0);
  const seen = [];
  const r = await run({ env: { DISTRIBUTE_NPM: 'true', NODE_AUTH_TOKEN: 't' }, fetchImpl, log: () => {}, root, ...listed(slugs), publish: async (dir) => { seen.push(JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')).name); } });
  assert.equal(r.published, MAX_PER_RUN);
  assert.equal(new Set(seen).size, MAX_PER_RUN);
});

test('a registry error aborts rather than guessing', async () => {
  const root = await fixture(venture('a-check'));
  await assert.rejects(run({ env: {}, fetchImpl: async () => ({ status: 503 }), log: () => {}, root, ...listed(['a-check']) }), /HTTP 503/);
});

test('package.json keywords keep slug words of 3+ characters, drop shorter ones, and cap at four', async () => {
  const slug = 'ab-abc-abcd-w-x1-y22-z33-q44';
  const root = await fixture(venture(slug));
  const r = await buildPackage({ slug, dir: path.join(root, 'ventures', slug) });
  assert.deepEqual(JSON.parse(r.files['package.json']).keywords, ['cli', 'free', 'open-source', 'abc', 'abcd', 'y22', 'z33']);
});
