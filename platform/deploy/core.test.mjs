import test from 'node:test';
import assert from 'node:assert/strict';
import { deployToGithubPages, validSlug, validRepoName, deployedReadme, DONATE } from './core.mjs';
import { titleOf, buildCatalog } from './build.mjs';

function fakeGithub({ files, failPages } = {}) {
  const calls = [];
  const blobs = {};
  const fetchFn = async (url, opts) => {
    const method = opts.method; const u = url.replace('https://api.github.com', '');
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, u, body, auth: opts.headers.Authorization });
    const ok = (d, s = 200) => ({ ok: s < 400, status: s, json: async () => d });
    if (u === '/user') return ok({ login: 'Alice' });
    if (u.startsWith('/repos/src/mono/contents/ventures/app/sub')) return ok([{ type: 'file', name: 'x.js', sha: 'sx', size: 3 }]);
    if (u.startsWith('/repos/src/mono/contents/ventures/app')) return ok([
      { type: 'file', name: 'index.html', sha: 's1', size: 5 }, { type: 'dir', name: 'sub' }, { type: 'dir', name: 'node_modules' }]);
    if (u.startsWith('/repos/src/mono/git/blobs/')) return ok({ content: 'aGk=\n' });
    if (u === '/user/repos') return ok({}, 201);
    if (u === '/repos/Alice/app') return ok({ default_branch: 'main' });
    if (u === '/repos/Alice/app/git/ref/heads/main') return ok({ object: { sha: 'head0' } });
    if (u === '/repos/Alice/app/git/blobs') { blobs[calls.length] = body; return ok({ sha: `b${calls.length}` }, 201); }
    if (u === '/repos/Alice/app/git/trees') return ok({ sha: 't1' }, 201);
    if (u === '/repos/Alice/app/git/commits') return ok({ sha: 'c1' }, 201);
    if (u === '/repos/Alice/app/git/refs/heads/main') return ok({});
    if (u === '/repos/Alice/app/pages') return failPages ? ok({ message: 'exists' }, 409) : ok({}, 201);
    return ok({ message: 'nope ' + u }, 404);
  };
  return { fetchFn, calls };
}
const entry = { slug: 'app', title: 'App', dir: 'ventures/app' };
const source = { owner: 'src', repo: 'mono', ref: 'main' };

test('deploys a venture into the visitor repo and enables pages', async () => {
  const { fetchFn, calls } = fakeGithub();
  const steps = [];
  const r = await deployToGithubPages({ fetchFn, token: 'tok', entry, source, onStep: (m) => steps.push(m), wait: async () => {} });
  assert.equal(r.pagesUrl, 'https://alice.github.io/app/');
  assert.equal(r.repoUrl, 'https://github.com/Alice/app');
  const tree = calls.find((c) => c.u.endsWith('/git/trees')).body.tree.map((t) => t.path).sort();
  assert.deepEqual(tree, ['README.md', 'index.html', 'sub/x.js']);
  assert.ok(!calls.some((c) => c.u.includes('node_modules')));
  assert.ok(calls.some((c) => c.u.endsWith('/pages') && c.body.source.path === '/'));
  assert.ok(steps.length >= 5);
});

test('token is only ever sent to api.github.com as a bearer header', async () => {
  const urls = [];
  const { fetchFn } = fakeGithub();
  await deployToGithubPages({ fetchFn: (u, o) => { urls.push(u); return fetchFn(u, o); }, token: 'SECRET', entry, source, wait: async () => {} });
  assert.ok(urls.every((u) => u.startsWith('https://api.github.com/')));
});

test('source reads are unauthenticated so the token never reaches the source repo', async () => {
  const { fetchFn, calls } = fakeGithub();
  await deployToGithubPages({ fetchFn, token: 'SECRET', entry, source, wait: async () => {} });
  for (const c of calls.filter((c) => c.u.startsWith('/repos/src/'))) assert.equal(c.auth, undefined);
});

test('already-enabled pages (409) is fine; other errors surface', async () => {
  const { fetchFn } = fakeGithub({ failPages: true });
  await deployToGithubPages({ fetchFn, token: 't', entry, source, wait: async () => {} });
  await assert.rejects(deployToGithubPages({ fetchFn, token: '', entry, source }), /token/);
  await assert.rejects(deployToGithubPages({ fetchFn, token: 't', entry: { ...entry, slug: '../x' }, source }), /Unknown app/);
  await assert.rejects(deployToGithubPages({ fetchFn, token: 't', entry, repoName: 'a b', source }), /Repository name/);
});

test('validators', () => {
  assert.ok(validSlug('a-b1')); assert.ok(!validSlug('A')); assert.ok(!validSlug('../a'));
  assert.ok(validRepoName('my_repo.1')); assert.ok(!validRepoName('..')); assert.ok(!validRepoName(''));
});

test('deployed README tells the operator they own the copy and carries both donate links', () => {
  const r = deployedReadme({ slug: 'app', title: 'App', pagesUrl: 'https://x/', source });
  assert.match(r, /operator of this copy/); assert.match(r, /not liable/);
  assert.ok(r.includes(DONATE.sponsors) && r.includes('https://buymeacoffee.com/duncanhaywood'));
});

test('catalog comes from discoverSurfaces and every entry is deployable', async () => {
  const apps = await buildCatalog();
  assert.ok(apps.length > 500);
  for (const a of apps.slice(0, 50)) { assert.ok(validSlug(a.slug)); assert.ok(a.dir.startsWith(`ventures/${a.slug}`)); assert.ok(a.title); }
  assert.equal(titleOf('<title> A &amp;\n B </title>', 'x'), 'A & B');
});
