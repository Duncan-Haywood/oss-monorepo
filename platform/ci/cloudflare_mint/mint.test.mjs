// node --test platform/ci/cloudflare_mint/mint.test.mjs
// Every Cloudflare call is a mock: nothing here reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  API, NAME_PREFIX, buildPolicies, cf, expiresOn, loadProfiles, mint, normalizeName,
  resolvePermissions, revoke, sweep, tokenName,
} from './mint.mjs';
import { run } from './main.mjs';
import { post } from './post.mjs';

const ACCT = 'a'.repeat(32);
const ZONE = 'b'.repeat(32);
const MINTER = 'minter-secret-value-123';
const MINTED = 'minted-secret-value-456';

const GROUPS = [
  ['g-ws', 'Workers Scripts Write', ['com.cloudflare.api.account']],
  ['g-as', 'Account Settings Read', ['com.cloudflare.api.account']],
  ['g-d1', 'D1 Write', ['com.cloudflare.api.account']],
  ['g-zr', 'Zone Read', ['com.cloudflare.api.account.zone']],
  ['g-an', 'Analytics Read', ['com.cloudflare.api.account.zone']],
  ['g-aa', 'Account Analytics Read', ['com.cloudflare.api.account']],
].map(([id, name, scopes]) => ({ id, name, scopes }));

/** A fetch that answers from a route table and records every call. */
function mockFetch(routes) {
  const calls = [];
  const f = async (url, init = {}) => {
    const route = url.slice(API.length);
    const call = { method: init.method || 'GET', route, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const key = `${call.method} ${route.split('?')[0]}`;
    const h = routes[key];
    if (!h) return { ok: false, status: 404, json: async () => ({ success: false, errors: [{ code: 7003, message: 'not found' }] }) };
    const [status, body] = typeof h === 'function' ? h(call) : h;
    return { ok: status < 300, status, json: async () => body };
  };
  f.calls = calls;
  return f;
}

const ok = (result, extra = {}) => [200, { success: true, errors: [], result, ...extra }];

const PROFILES = {
  edge: { account: ['Workers Scripts Write', 'D1 Write', 'Account Settings Read'], ttl_minutes: 30 },
  analytics: { account: ['Account Analytics Read'], zone: ['Zone Read', 'Analytics Read'], ttl_minutes: 15 },
  typo: { account: ['Workers Scrpts Write'], ttl_minutes: 15 },
  wrongscope: { account: ['Zone Read'], ttl_minutes: 15 },
};

test('normalizeName: dashboard and API spellings match', () => {
  assert.equal(normalizeName('Workers Scripts:Edit'), 'workers scripts write');
  assert.equal(normalizeName('Workers Scripts Write'), 'workers scripts write');
  assert.equal(normalizeName('Zone : Read'), 'zone read');
  assert.equal(normalizeName('Access: Apps and Policies Write'), 'access apps and policies write');
});

test('expiresOn: whole seconds, Z, bounded', () => {
  const now = new Date('2026-11-24T12:00:00.789Z');
  assert.equal(expiresOn(now, 60), '2026-11-24T13:00:00Z');
  assert.throws(() => expiresOn(now, 4), /5 to 360/);
  assert.throws(() => expiresOn(now, 361), /5 to 360/);
  assert.throws(() => expiresOn(now, 1.5), /whole number/);
});

test('buildPolicies: account resources are one account; zone ones one zone or that account only', () => {
  const p = buildPolicies({ profile: PROFILES.analytics, groups: GROUPS, accountId: ACCT, zoneId: ZONE });
  assert.deepEqual(p, [
    { effect: 'allow', permission_groups: [{ id: 'g-aa' }], resources: { [`com.cloudflare.api.account.${ACCT}`]: '*' } },
    { effect: 'allow', permission_groups: [{ id: 'g-zr' }, { id: 'g-an' }], resources: { [`com.cloudflare.api.account.zone.${ZONE}`]: '*' } },
  ]);
  const all = buildPolicies({ profile: PROFILES.analytics, groups: GROUPS, accountId: ACCT });
  assert.deepEqual(all[1].resources, { [`com.cloudflare.api.account.${ACCT}`]: { 'com.cloudflare.api.account.zone.*': '*' } });
  assert.throws(() => buildPolicies({ profile: {}, groups: GROUPS, accountId: ACCT }), /grants nothing/);
  assert.throws(() => buildPolicies({ profile: PROFILES.edge, groups: GROUPS, accountId: 'nope' }), /account_id/);
  assert.throws(() => buildPolicies({ profile: PROFILES.analytics, groups: GROUPS, accountId: ACCT, zoneId: 'x' }), /zone_id/);
});

test('resolvePermissions: unknown names fail with near matches; wrong scope and unselectable fail', () => {
  assert.throws(() => resolvePermissions(GROUPS, ['Workers Scrpts Write'], 'com.cloudflare.api.account'), /unknown.*Workers Scrpts Write.*close: Workers Scripts Write/);
  assert.throws(() => resolvePermissions(GROUPS, ['Zone Read'], 'com.cloudflare.api.account'), /applies to com.cloudflare.api.account.zone/);
  const g = [{ id: 'x', name: 'Billing Write', scopes: ['com.cloudflare.api.account'], is_selectable: false }];
  assert.throws(() => resolvePermissions(g, ['Billing Write'], 'com.cloudflare.api.account'), /may not grant/);
});

test('mint (user-owned): resolves names, posts the narrow policy with expiry, bearer minter', async () => {
  const f = mockFetch({
    'GET /user/tokens/permission_groups': ok(GROUPS),
    'POST /user/tokens': (c) => ok({ id: 't1'.padEnd(32, '0'), value: MINTED, name: c.body.name }),
  });
  const now = new Date('2026-11-24T12:00:00Z');
  const t = await mint({ fetch: f, minter: MINTER, accountId: ACCT, profiles: PROFILES, profileName: 'edge', name: 'ci-mint:x', now });
  assert.equal(t.value, MINTED);
  assert.equal(t.expires_on, '2026-11-24T12:30:00Z');
  const create = f.calls[1];
  assert.equal(create.headers.authorization, `Bearer ${MINTER}`);
  assert.deepEqual(create.body, {
    name: 'ci-mint:x',
    expires_on: '2026-11-24T12:30:00Z',
    policies: [{ effect: 'allow', permission_groups: [{ id: 'g-ws' }, { id: 'g-d1' }, { id: 'g-as' }], resources: { [`com.cloudflare.api.account.${ACCT}`]: '*' } }],
  });
});

test('mint (account-owned) uses the account paths; ttl override and IP condition pass through', async () => {
  const f = mockFetch({
    [`GET /accounts/${ACCT}/tokens/permission_groups`]: ok(GROUPS),
    [`POST /accounts/${ACCT}/tokens`]: ok({ id: 'c'.repeat(32), value: MINTED }),
  });
  await mint({ fetch: f, minter: MINTER, owner: 'account', accountId: ACCT, profiles: PROFILES, profileName: 'edge', ttlMinutes: 10, now: new Date('2026-11-24T00:00:00Z'), allowCidrs: ['192.0.2.1/32'] });
  assert.equal(f.calls[1].body.expires_on, '2026-11-24T00:10:00Z');
  assert.deepEqual(f.calls[1].body.condition, { request_ip: { in: ['192.0.2.1/32'] } });
});

test('mint: a bad profile creates no token', async () => {
  const f = mockFetch({ 'GET /user/tokens/permission_groups': ok(GROUPS), 'POST /user/tokens': ok({ id: 'x', value: 'y' }) });
  await assert.rejects(mint({ fetch: f, minter: MINTER, accountId: ACCT, profiles: PROFILES, profileName: 'typo' }), /unknown/);
  await assert.rejects(mint({ fetch: f, minter: MINTER, accountId: ACCT, profiles: PROFILES, profileName: 'wrongscope' }), /applies to/);
  await assert.rejects(mint({ fetch: f, minter: MINTER, accountId: ACCT, profiles: PROFILES, profileName: 'nope' }), /no profile/);
  await assert.rejects(mint({ fetch: f, minter: '', accountId: ACCT, profiles: PROFILES, profileName: 'edge' }), /no minter/);
  assert.ok(!f.calls.some((c) => c.method === 'POST'));
});

test('cf: API errors name the codes and never the credential', async () => {
  const f = mockFetch({ 'GET /user/tokens/permission_groups': [403, { success: false, errors: [{ code: 9109, message: 'Unauthorized to access requested resource' }] }] });
  await assert.rejects(cf(f, MINTER, 'GET', '/user/tokens/permission_groups'), (e) => {
    assert.match(e.message, /HTTP 403 \(9109: Unauthorized/);
    assert.ok(!e.message.includes(MINTER));
    return true;
  });
});

test('revoke: 404 is done, other errors throw', async () => {
  const id = 'd'.repeat(32);
  assert.equal(await revoke({ fetch: mockFetch({ [`DELETE /user/tokens/${id}`]: ok({ id }) }), minter: MINTER, id }), 'deleted');
  assert.equal(await revoke({ fetch: mockFetch({}), minter: MINTER, id }), 'already gone');
  await assert.rejects(revoke({ fetch: mockFetch({ [`DELETE /user/tokens/${id}`]: [500, { success: false, errors: [] }] }), minter: MINTER, id }), /HTTP 500/);
  await assert.rejects(revoke({ fetch: mockFetch({}), minter: MINTER, id: '../x' }), /bad token id/);
});

test('sweep: deletes only expired tokens with the ci-mint prefix, across pages', async () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const pages = {
    1: [
      { id: '1'.repeat(32), name: `${NAME_PREFIX}a`, expires_on: '2026-11-24T11:00:00Z' },
      { id: '2'.repeat(32), name: `${NAME_PREFIX}b`, expires_on: '2026-11-24T13:00:00Z' },
      { id: '3'.repeat(32), name: 'owner made this', expires_on: '2026-01-01T00:00:00Z' },
    ],
    2: [{ id: '4'.repeat(32), name: `${NAME_PREFIX}c`, status: 'expired' }],
  };
  const f = mockFetch({
    'GET /user/tokens': (c) => {
      const page = Number(new URL(`http://x${c.route}`).searchParams.get('page'));
      return ok(pages[page] || [], { result_info: { page, total_pages: 2 } });
    },
    [`DELETE /user/tokens/${'1'.repeat(32)}`]: ok({}),
    [`DELETE /user/tokens/${'4'.repeat(32)}`]: ok({}),
  });
  assert.deepEqual(await sweep({ fetch: f, minter: MINTER, now }), ['1'.repeat(32), '4'.repeat(32)]);
  assert.equal(f.calls.filter((c) => c.method === 'DELETE').length, 2);
});

test('tokenName: prefixed, sanitised, bounded', () => {
  const n = tokenName({ repo: 'o/r', profile: 'edge deploy', run: '1.2.job' });
  assert.equal(n, `${NAME_PREFIX}o/r:edge-deploy:1.2.job`);
  assert.ok(tokenName({ repo: 'x'.repeat(300), profile: 'p', run: '1' }).length <= 120);
});

function runnerFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfmint-'));
  const files = {};
  for (const k of ['GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_STATE']) {
    files[k] = path.join(dir, k);
    fs.writeFileSync(files[k], '');
  }
  return files;
}

test('action main: masks the value first, saves state, exports env', async () => {
  const files = runnerFiles();
  const lines = [];
  const id = 'e'.repeat(32);
  const f = mockFetch({ 'GET /user/tokens/permission_groups': ok(GROUPS), 'POST /user/tokens': ok({ id, value: MINTED }) });
  const env = {
    ...files, GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '9', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'deploy',
    INPUT_MINTER_TOKEN: MINTER, INPUT_ACCOUNT_ID: ACCT, INPUT_PROFILE: 'edge', INPUT_OWNER: 'user', INPUT_EXPORT_ENV: 'true',
  };
  await run({ env, fetchImpl: f, out: (s) => lines.push(s), profiles: PROFILES, now: new Date('2026-11-24T12:00:00Z') });
  const firstWithValue = lines.findIndex((l) => l.includes(MINTED));
  assert.equal(lines[firstWithValue], `::add-mask::${MINTED}\n`);
  assert.ok(!lines.slice(firstWithValue + 1).some((l) => l.includes(MINTED)));
  assert.ok(!lines.some((l) => l.includes(MINTER)));
  assert.equal(fs.readFileSync(files.GITHUB_STATE, 'utf8'), `token_id=${id}\n`);
  assert.equal(fs.readFileSync(files.GITHUB_ENV, 'utf8'), `CLOUDFLARE_API_TOKEN=${MINTED}\nCLOUDFLARE_ACCOUNT_ID=${ACCT}\n`);
  assert.match(fs.readFileSync(files.GITHUB_OUTPUT, 'utf8'), /expires_on=2026-11-24T12:30:00Z/);
  assert.equal(f.calls[1].body.name, `${NAME_PREFIX}o/r:edge:9.1.deploy`);
});

test('action main: export_env false keeps the token out of GITHUB_ENV', async () => {
  const files = runnerFiles();
  const f = mockFetch({ 'GET /user/tokens/permission_groups': ok(GROUPS), 'POST /user/tokens': ok({ id: 'f'.repeat(32), value: MINTED }) });
  await run({ env: { ...files, INPUT_MINTER_TOKEN: MINTER, INPUT_ACCOUNT_ID: ACCT, INPUT_PROFILE: 'edge', INPUT_EXPORT_ENV: 'false' }, fetchImpl: f, out: () => {}, profiles: PROFILES });
  assert.equal(fs.readFileSync(files.GITHUB_ENV, 'utf8'), '');
});

test('action post: deletes the job token, sweeps, never throws', async () => {
  const id = 'e'.repeat(32);
  const lines = [];
  const f = mockFetch({ [`DELETE /user/tokens/${id}`]: ok({ id }), 'GET /user/tokens': ok([]) });
  await post({ env: { STATE_token_id: id, INPUT_MINTER_TOKEN: MINTER, INPUT_ACCOUNT_ID: ACCT }, fetchImpl: f, out: (s) => lines.push(s) });
  assert.match(lines.join(''), /deleted/);
  const broken = async () => { throw new Error('network down'); };
  const l2 = [];
  await post({ env: { STATE_token_id: id, INPUT_MINTER_TOKEN: MINTER }, fetchImpl: broken, out: (s) => l2.push(s) });
  assert.match(l2.join(''), /::warning title=Cloudflare token not deleted::network down/);
  assert.ok(!l2.join('').includes(MINTER));
});

test('profiles.json: every profile is bounded, documented and plans cleanly', () => {
  const profiles = loadProfiles();
  assert.ok(Object.keys(profiles).length >= 10);
  for (const [name, p] of Object.entries(profiles)) {
    assert.ok(p.used_by?.length, `${name}: used_by`);
    assert.ok(p.ttl_minutes >= 5 && p.ttl_minutes <= 360, `${name}: ttl`);
    const plan = buildPolicies({ profile: p, groups: null, accountId: ACCT });
    assert.ok(plan.length >= 1);
    for (const n of [...(p.account || []), ...(p.zone || [])]) {
      assert.doesNotMatch(n, /api tokens/i, `${name}: a job token must never be able to mint`);
    }
  }
});
