import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tagFor, hookIds, composeNotes, plan, run, buildAsset, MAX_PER_RUN } from './tool-releases.mjs';
import { main as versions, ALLOWLIST } from './versions.mjs';

async function fixture(slugs, { hooks = slugs } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'toolrel-'));
  const files = {
    [ALLOWLIST]: JSON.stringify({ tools: slugs.map((slug) => ({ slug, channels: ['release'], why: 'test' })) }),
    '.pre-commit-hooks.yaml': hooks.map((h) => `- id: ${h}\n  name: ${h}\n`).join(''),
  };
  for (const slug of slugs) {
    files[`ventures/${slug}/check.py`] = 'def main():\n    return 0\n';
    files[`ventures/${slug}/VENTURE.yaml`] = `name: ${slug}\ndescription: Finds ${slug} problems. More.\n`;
    files[`platform/distribution/actions/${slug}/action.yml`] = `name: ${slug}\n`;
  }
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), text);
  }
  await versions(['--write'], { root, log() {} });
  return root;
}

const LIVE = { DISTRIBUTE_TOOL_RELEASES: 'true', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc123', GITHUB_REF: 'refs/heads/main' };

/** A fake GitHub API: `existing` tags answer 200; every call is recorded. */
function github(existing = []) {
  const calls = [];
  let id = 0;
  const fetchImpl = async (url, opts) => {
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    calls.push({ url, method: opts.method, body });
    if (opts.method === 'GET') {
      const tag = decodeURIComponent(url.split('/releases/tags/')[1]);
      return { ok: existing.includes(tag), status: existing.includes(tag) ? 200 : 404 };
    }
    if (opts.method === 'POST' && url.endsWith('/releases')) return { ok: true, status: 201, json: async () => ({ id: ++id }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test('tagFor and hookIds', () => {
  assert.equal(tagFor('a-check', '1.2.3'), 'a-check-v1.2.3');
  assert.deepEqual([...hookIds('- id: a\n  name: A\n- id: b-check\n')], ['a', 'b-check']);
});

test('notes offer only the install routes that exist', () => {
  const base = { slug: 'a-check', version: '0.2.0', hash: 'sha256-h', description: 'Finds things.', channels: ['release', 'npm'] };
  const plain = composeNotes({ ...base, hasAction: false, hasHook: false });
  assert.equal(plain.tag, 'a-check-v0.2.0');
  assert.doesNotMatch(plain.body, /uses:|pre-commit|npx|pipx|Download/);
  assert.match(plain.body, /tree\/a-check-v0\.2\.0\/ventures\/a-check/);
  assert.match(plain.body, /sha256-h/);
  const full = composeNotes({ ...base, hasAction: true, hasHook: true, live: { npm: true }, asset: { name: 'a.tar.gz', sha256: 'ff' } });
  assert.match(full.body, /uses: duncan-haywood\/oss-monorepo\/platform\/distribution\/actions\/a-check@a-check-v0\.2\.0/);
  assert.match(full.body, /rev: a-check-v0\.2\.0/);
  assert.match(full.body, /npx a-check@0\.2\.0/);
  assert.match(full.body, /a\.tar\.gz.*SHA-256 `ff`/);
  assert.match(full.body, /not a security guarantee/);
});

test('plan lists allow-listed release tools in order with what each ships', async () => {
  const root = await fixture(['b-check', 'a-check'], { hooks: ['b-check'] });
  const p = await plan({ root });
  assert.deepEqual(p.map((r) => [r.tag, r.hasAction, r.hasHook]), [['b-check-v0.1.0', true, true], ['a-check-v0.1.0', true, false]]);
  assert.equal(p[0].description, 'Finds b-check problems.');
});

test('dry run calls no API; a live run needs main', async () => {
  const root = await fixture(['a-check']);
  const { fetchImpl, calls } = github();
  const lines = [];
  assert.deepEqual(await run({ env: {}, root, fetchImpl, log: (l) => lines.push(l) }), { released: 0, planned: 1 });
  assert.match(lines.join('\n'), /DRY RUN[\s\S]*a-check-v0\.1\.0  action  pre-commit/);
  await run({ env: { ...LIVE, GITHUB_REF: 'refs/heads/feature' }, root, fetchImpl, log() {} });
  assert.equal(calls.length, 0);
});

test('live run skips existing tags, tags the checked-out commit, and caps the run', async () => {
  const slugs = Array.from({ length: MAX_PER_RUN + 2 }, (_, i) => `t${i}-check`);
  const root = await fixture(slugs);
  const { fetchImpl, calls } = github(['t0-check-v0.1.0']);
  const r = await run({ env: LIVE, root, fetchImpl, log() {} });
  assert.deepEqual(r, { released: MAX_PER_RUN, planned: MAX_PER_RUN });
  const created = calls.filter((c) => c.method === 'POST');
  assert.deepEqual(created.map((c) => c.body.tag_name), slugs.slice(1, MAX_PER_RUN + 1).map((s) => `${s}-v0.1.0`));
  assert.ok(created.every((c) => c.body.target_commitish === 'abc123' && c.body.draft === false));
});

test('a stale versions.json stops the run before anything is tagged', async () => {
  const root = await fixture(['a-check']);
  await fs.writeFile(path.join(root, 'ventures/a-check/check.py'), 'def main():\n    return 1\n');
  const { fetchImpl, calls } = github();
  await assert.rejects(run({ env: LIVE, root, fetchImpl, log() {} }), /stale, refusing to tag[\s\S]*a-check: shipped files changed/);
  assert.equal(calls.length, 0);
});

test('a bundled tool is created as a draft, gets its archive, then is published', async () => {
  const root = await fixture(['a-check', 'b-check']);
  const { fetchImpl, calls } = github();
  const asset = async (_root, slug, version) => ({ name: `${slug}-${version}.tar.gz`, bytes: Buffer.from('x'), sha256: 'abcd' });
  const r = await run({ env: LIVE, root, fetchImpl, log() {}, asset, bundlers: { 'a-check': true } });
  assert.equal(r.released, 2);
  const steps = calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url.replace(/^https:\/\/[^/]+/, '')}`);
  assert.deepEqual(steps, [
    'POST /repos/o/r/releases',
    'POST /repos/o/r/releases/1/assets?name=a-check-0.1.0.tar.gz',
    'PATCH /repos/o/r/releases/1',
    'POST /repos/o/r/releases',
  ]);
  const [a, b] = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/releases'));
  assert.equal(a.body.draft, true);
  assert.match(a.body.body, /a-check-0\.1\.0\.tar\.gz.*SHA-256 `abcd`/);
  assert.equal(b.body.draft, false);
});

test('the devsec-toolkit archive is reproducible, stamped with the release version, and runs', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const a = await buildAsset(root, 'devsec-toolkit', '9.8.7');
  const b = await buildAsset(root, 'devsec-toolkit', '9.8.7');
  assert.equal(a.name, 'devsec-toolkit-9.8.7.tar.gz');
  assert.equal(a.sha256, b.sha256);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devsec-asset-'));
  await fs.writeFile(path.join(dir, a.name), a.bytes);
  const { execFileSync } = await import('node:child_process');
  execFileSync('tar', ['-xzf', a.name], { cwd: dir });
  const runner = await fs.readFile(path.join(dir, 'devsec-toolkit-9.8.7', 'devsec.py'), 'utf8');
  assert.match(runner, /^VERSION = "9\.8\.7"$/m);
  const out = execFileSync('python3', ['-I', path.join(dir, 'devsec-toolkit-9.8.7', 'devsec.py'), '--version'], { encoding: 'utf8' });
  assert.match(out, /devsec-toolkit 9\.8\.7/);
});
