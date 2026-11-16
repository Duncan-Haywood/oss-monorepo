// The Deploy button's GitHub calls against an in-memory GitHub (no network).
// node --test platform/deploy/publish.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGh, pushFiles, storeSecrets, newProgress, failureMessage, toB64 } from './publish.mjs';
import { composeRepo } from './compose.mjs';
import { loadTemplates } from './build.mjs';

/** A tiny GitHub: one repository, Git objects in maps, every call logged. */
function fakeGitHub({ refMissingFor = 0, status = {} } = {}) {
  const calls = [];
  const blobs = new Map();
  const trees = new Map([['t0', { 'README.md': 'b0' }]]);
  blobs.set('b0', toB64('# auto-init\n'));
  const commits = new Map([['c0', { tree: 't0', parents: [] }]]);
  const refs = { 'heads/main': 'c0' };
  let n = 0;
  let refMisses = refMissingFor;
  const json = (code, body) => ({ ok: code < 300, status: code, json: async () => body, text: async () => JSON.stringify(body ?? {}) });
  const fetch = async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const forced = status[`${method} ${path}`];
    if (forced) return json(forced, { message: 'forced' });
    let m;
    if (method === 'GET' && (m = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/(.+)$/))) {
      if (refMisses-- > 0) return json(409, { message: 'Git Repository is empty.' });
      return refs[m[1]] ? json(200, { object: { sha: refs[m[1]] } }) : json(404, {});
    }
    if (method === 'GET' && (m = path.match(/\/git\/commits\/(\w+)$/))) return json(200, { sha: m[1], tree: { sha: commits.get(m[1]).tree } });
    if (method === 'POST' && path.endsWith('/git/blobs')) {
      assert.equal(body.encoding, 'base64');
      const sha = `b${++n}`;
      blobs.set(sha, body.content);
      return json(201, { sha });
    }
    if (method === 'POST' && path.endsWith('/git/trees')) {
      const t = { ...trees.get(body.base_tree) };
      for (const e of body.tree) {
        if (e.content !== undefined) {
          const sha = `b${++n}`;
          blobs.set(sha, Buffer.from(e.content, 'utf8').toString('base64'));
          t[e.path] = sha;
        } else t[e.path] = e.sha;
      }
      const sha = `t${++n}`;
      trees.set(sha, t);
      return json(201, { sha });
    }
    if (method === 'POST' && path.endsWith('/git/commits')) {
      const sha = `c${++n}`;
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha });
    }
    if (method === 'PATCH' && (m = path.match(/\/git\/refs\/(.+)$/))) {
      refs[m[1]] = body.sha;
      return json(200, { object: { sha: body.sha } });
    }
    if (method === 'GET' && path.endsWith('/actions/secrets/public-key')) return json(200, { key: 'PK', key_id: 'kid' });
    if (method === 'PUT' && path.includes('/actions/secrets/')) return json(201, {});
    if (method === 'POST' && path.endsWith('/actions/variables')) return json(201, {});
    if (method === 'GET' && path === '/repos/me/missing') return json(404, { message: 'Not Found' });
    return json(404, { message: `no fake for ${method} ${path}` });
  };
  /** The files at the head of main, decoded. */
  const head = () => {
    const tree = trees.get(commits.get(refs['heads/main']).tree);
    return Object.fromEntries(Object.entries(tree).map(([p, b]) => [p, Buffer.from(blobs.get(b), 'base64')]));
  };
  return { fetch, calls, head, commits, refs };
}

const noSleep = async () => {};

test('pushFiles publishes every file as ONE commit on top of the auto-init commit', async () => {
  const gh0 = fakeGitHub();
  const gh = makeGh('tok', { fetch: gh0.fetch });
  const bin = new Uint8Array([0, 255, 1, 128, 10]);
  const sha = await pushFiles(gh, 'me/app', 'main', { 'app/index.html': '<p>é</p>', 'app/x.png': bin, 'README.md': '# mine\n', 'LICENSE': '' }, { sleep: noSleep });
  assert.equal(gh0.refs['heads/main'], sha);
  const c = gh0.commits.get(sha);
  assert.deepEqual(c.parents, ['c0'], 'one commit whose parent is the auto-init commit');
  const files = gh0.head();
  assert.equal(files['app/index.html'].toString('utf8'), '<p>é</p>');
  assert.deepEqual([...files['app/x.png']], [...bin], 'binary bytes survive base64');
  assert.equal(files['README.md'].toString(), '# mine\n', 'our README replaces the auto-init one');
  assert.ok(!('LICENSE' in files), "'' entries are left out");
  assert.equal(gh0.calls.filter((x) => x.path.endsWith('/git/blobs')).length, 1, 'only the binary file needs its own blob call');
  const writes = gh0.calls.filter((x) => x.method !== 'GET' && !x.path.endsWith('/git/blobs'));
  assert.deepEqual(writes.map((x) => `${x.method} ${x.path.split('/git/')[1]}`), ['POST trees', 'POST commits', 'PATCH refs/heads/main'],
    'exactly one tree, one commit and one ref update: one push event, not one per file');
  assert.ok(!gh0.calls.some((x) => x.path.includes('/contents/')), 'no per-file contents-API commits');
});

test('pushFiles waits for a just-created repository, and gives up honestly', async () => {
  const slow = fakeGitHub({ refMissingFor: 2 });
  const waits = [];
  await pushFiles(makeGh('t', { fetch: slow.fetch }), 'me/app', 'main', { a: 'x' }, { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(waits, [500, 1000]);
  const never = fakeGitHub({ refMissingFor: 99 });
  await assert.rejects(pushFiles(makeGh('t', { fetch: never.fetch }), 'me/app', 'main', { a: 'x' }, { sleep: noSleep }), /did not appear/);
});

test('gh() returns null for a 404 only when the caller allows it', async () => {
  const f = fakeGitHub({ status: { 'GET /repos/me/private-thing': 403 } });
  const gh = makeGh('t', { fetch: f.fetch });
  assert.equal(await gh('GET', '/repos/me/missing', undefined, { allow404: true }), null);
  await assert.rejects(gh('GET', '/repos/me/missing'), (e) => e.status === 404, 'a 404 the caller did not expect is an error, not "missing"');
  await assert.rejects(gh('GET', '/repos/me/private-thing', undefined, { allow404: true }), (e) => e.status === 403,
    'a token without access must not read as "that repository does not exist"');
});

test('a failed ref update leaves the branch where it was (all-or-nothing upload)', async () => {
  const f = fakeGitHub({ status: { 'PATCH /repos/me/app/git/refs/heads/main': 422 } });
  await assert.rejects(pushFiles(makeGh('t', { fetch: f.fetch }), 'me/app', 'main', { 'app/index.html': 'x' }, { sleep: noSleep }), /422/);
  assert.equal(f.refs['heads/main'], 'c0');
  assert.deepEqual(Object.keys(f.head()), ['README.md']);
});

test('storeSecrets seals each secret, skips empty variables, and records progress', async () => {
  const f = fakeGitHub();
  const progress = newProgress();
  await storeSecrets(makeGh('t', { fetch: f.fetch }), 'me/app', { A: '1', B: '2' }, { REGION: 'eu', EMPTY: '' }, (v, k) => `sealed(${v},${k})`, progress);
  const puts = f.calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(puts.map((c) => [c.path.split('/').pop(), c.body.encrypted_value, c.body.key_id]), [['A', 'sealed(1,PK)', 'kid'], ['B', 'sealed(2,PK)', 'kid']]);
  assert.deepEqual(progress.secrets, ['A', 'B']);
  assert.deepEqual(progress.variables, ['REGION']);
});

test('failureMessage says what exists instead of "Nothing else was changed"', () => {
  assert.match(failureMessage(newProgress()), /^Nothing was created/);
  const p = { ...newProgress(), repo: 'me/app', secrets: ['AWS_ACCESS_KEY_ID'], variables: ['AWS_REGION'] };
  const m = failureMessage(p);
  assert.match(m, /me\/app/);
  assert.match(m, /AWS_ACCESS_KEY_ID/);
  assert.match(m, /no app files yet/);
  assert.match(m, /https:\/\/github\.com\/me\/app\/settings/);
  assert.doesNotMatch(m, /Nothing/);
  assert.match(failureMessage({ ...p, pushed: true }), /app files \(one commit\)/);
});

test('a composed GitHub Pages repository round-trips through pushFiles byte for byte', async () => {
  const templates = await loadTemplates();
  const appFiles = { 'index.html': { text: '<!doctype html><title>T</title><body></body>' }, 'logo.png': { b64: Buffer.from([137, 80, 78, 71, 0, 1]).toString('base64') } };
  const files = composeRepo({ slug: 'demo', title: 'Demo', provider: 'github-pages', appFiles, templates });
  const f = fakeGitHub();
  await pushFiles(makeGh('t', { fetch: f.fetch }), 'me/demo', 'main', files, { sleep: noSleep });
  const head = f.head();
  for (const [p, v] of Object.entries(files)) {
    if (v === '') continue;
    assert.deepEqual(head[p], Buffer.from(typeof v === 'string' ? Buffer.from(v, 'utf8') : v), p);
  }
  assert.ok(head['.github/workflows/deploy.yml'].length > 0);
});
