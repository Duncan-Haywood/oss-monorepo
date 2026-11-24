#!/usr/bin/env node
// Short-lived, narrowly scoped Cloudflare API tokens for CI (owner, 2026-11-24:
// key management was "click ops" and "very poor").
//
// One long-lived secret, the *minter*, may do exactly one thing: create API
// tokens. Each job that talks to Cloudflare asks it for a token that carries
// only that job's permissions (profiles.json), on only its account or zone,
// expiring about an hour out, and deletes the token when the job ends
// (action.yml runs this from a `post:` step, so it also runs on failure). A
// leaked job token is narrow and dies within the hour; nobody rotates
// anything by hand.
//
// API shape (checked 2026-11-24 against Cloudflare's own SDK, npm `cloudflare`
// 7.3.0, generated from the API schema):
//   POST   /user/tokens                          create (user-owned)
//   POST   /accounts/{account_id}/tokens         create (account-owned)
//   DELETE /user/tokens/{id} | /accounts/{account_id}/tokens/{id}
//   GET    /user/tokens/permission_groups | /accounts/{account_id}/tokens/permission_groups
//   body:  { name, policies: [{ effect, permission_groups: [{id}], resources }],
//            expires_on, not_before, condition: { request_ip: { in, not_in } } }
//   The secret comes back once, as `result.value`.
//
// Permission groups are looked up by *name* at run time, never by hard-coded
// id, and an unknown name stops the job before any token exists.
//
// CLI (local use; the action in action.yml is the CI path):
//   node mint.mjs plan <profile>            print the policy, call nothing
//   CLOUDFLARE_MINTER_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node mint.mjs check <profile>
//                                           resolve every permission name, create nothing
//   CLOUDFLARE_MINTER_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node mint.mjs sweep
//                                           delete expired tokens this tool made

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API = 'https://api.cloudflare.com/client/v4';
/** Every token this tool creates starts with this, so sweep never touches another token. */
export const NAME_PREFIX = 'ci-mint:';
export const TTL_MIN = 5;
export const TTL_MAX = 360;
export const OWNERS = ['user', 'account'];

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadProfiles(file = path.join(HERE, 'profiles.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { _comment, ...profiles } = raw;
  return profiles;
}

/** "Workers Scripts:Edit", "workers scripts edit" and "Workers Scripts Write" are one group. */
export function normalizeName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s*:\s*/g, ' ')
    .replace(/\bedit$/, 'write')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expiresOn(now, ttlMinutes) {
  const ttl = Number(ttlMinutes);
  if (!Number.isInteger(ttl) || ttl < TTL_MIN || ttl > TTL_MAX) {
    throw new Error(`ttl_minutes must be a whole number from ${TTL_MIN} to ${TTL_MAX}, got ${ttlMinutes}`);
  }
  // Seconds precision, `Z` suffix: the format the API documents for expires_on.
  return new Date(now.getTime() + ttl * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function checkId(label, value) {
  if (!/^[0-9a-f]{32}$/.test(String(value || ''))) throw new Error(`${label} must be a 32-character hex id`);
}

/** Token name: readable in the dashboard's token list, unique per job attempt. */
export function tokenName({ repo = 'local', profile, run = String(Date.now()) }) {
  const clean = (s) => String(s).replace(/[^A-Za-z0-9._/-]/g, '-');
  return `${NAME_PREFIX}${clean(repo)}:${clean(profile)}:${clean(run)}`.slice(0, 120);
}

/** One call to the API. Errors carry Cloudflare's codes and messages, never a credential. */
export async function cf(fetchImpl, token, method, route, body) {
  const res = await fetchImpl(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok || !data || data.success === false) {
    const msgs = (data?.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    const err = new Error(`Cloudflare ${method} ${route.split('?')[0]} -> HTTP ${res.status}${msgs ? ` (${msgs})` : ''}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function base(owner, accountId) {
  if (!OWNERS.includes(owner)) throw new Error(`owner must be one of ${OWNERS.join(', ')}, got ${owner}`);
  if (owner === 'account') {
    checkId('account_id', accountId);
    return `/accounts/${accountId}/tokens`;
  }
  return '/user/tokens';
}

export async function listPermissionGroups({ fetch: f, minter, owner, accountId }) {
  const data = await cf(f, minter, 'GET', `${base(owner, accountId)}/permission_groups`);
  return data.result || [];
}

/** Maps each wanted name to its group; throws, naming close matches, if any is missing. */
export function resolvePermissions(groups, names, scope) {
  const byName = new Map();
  for (const g of groups) if (g?.name && g?.id) byName.set(normalizeName(g.name), g);
  const found = [];
  const missing = [];
  for (const n of names) {
    const g = byName.get(normalizeName(n));
    if (!g) {
      missing.push(n);
      continue;
    }
    if (Array.isArray(g.scopes) && g.scopes.length && !g.scopes.includes(scope)) {
      throw new Error(`permission "${n}" applies to ${g.scopes.join(', ')}, not ${scope}; move it in profiles.json`);
    }
    if (g.is_selectable === false) throw new Error(`permission "${n}" exists but this minter may not grant it`);
    found.push(g);
  }
  if (missing.length) {
    const hints = missing.map((n) => {
      const words = normalizeName(n).split(' ').filter((w) => w.length > 3 && w !== 'write' && w !== 'read');
      const near = [...byName.values()]
        .filter((g) => words.some((w) => normalizeName(g.name).includes(w)))
        .map((g) => g.name)
        .slice(0, 6);
      return `"${n}"${near.length ? ` (close: ${near.join(', ')})` : ''}`;
    });
    throw new Error(`unknown Cloudflare permission group(s): ${hints.join('; ')}`);
  }
  return found;
}

const ACCOUNT_SCOPE = 'com.cloudflare.api.account';
const ZONE_SCOPE = 'com.cloudflare.api.account.zone';

export function zoneResources({ accountId, zoneId }) {
  if (zoneId) {
    checkId('zone_id', zoneId);
    return { [`${ZONE_SCOPE}.${zoneId}`]: '*' };
  }
  // Every zone in this one account, and no other account's.
  return { [`${ACCOUNT_SCOPE}.${accountId}`]: { [`${ZONE_SCOPE}.*`]: '*' } };
}

/** The policy list for a profile. `groups` null gives a by-name plan (no ids). */
export function buildPolicies({ profile, groups, accountId, zoneId }) {
  checkId('account_id', accountId);
  const policies = [];
  const pick = (names, scope) =>
    groups ? resolvePermissions(groups, names, scope).map((g) => ({ id: g.id })) : names.map((n) => ({ name: n }));
  if (profile.account?.length) {
    policies.push({
      effect: 'allow',
      permission_groups: pick(profile.account, ACCOUNT_SCOPE),
      resources: { [`${ACCOUNT_SCOPE}.${accountId}`]: '*' },
    });
  }
  if (profile.zone?.length) {
    policies.push({
      effect: 'allow',
      permission_groups: pick(profile.zone, ZONE_SCOPE),
      resources: zoneResources({ accountId, zoneId }),
    });
  }
  if (!policies.length) throw new Error('profile grants nothing');
  return policies;
}

export function getProfile(profiles, name) {
  const p = profiles[name];
  if (!p) throw new Error(`no profile "${name}" in profiles.json (have: ${Object.keys(profiles).join(', ')})`);
  return p;
}

export async function mint({ fetch: f, minter, owner = 'user', accountId, zoneId, profiles, profileName, name, ttlMinutes, now = new Date(), allowCidrs = [] }) {
  if (!minter) throw new Error('no minter token');
  const profile = getProfile(profiles, profileName);
  const ttl = ttlMinutes ?? profile.ttl_minutes ?? 60;
  const expires = expiresOn(now, ttl);
  const groups = await listPermissionGroups({ fetch: f, minter, owner, accountId });
  const policies = buildPolicies({ profile, groups, accountId, zoneId });
  const body = { name: name || tokenName({ profile: profileName }), policies, expires_on: expires };
  if (allowCidrs.length) body.condition = { request_ip: { in: allowCidrs } };
  const data = await cf(f, minter, 'POST', base(owner, accountId), body);
  const { id, value } = data.result || {};
  if (!id || !value) throw new Error('Cloudflare created no token value (result.id / result.value missing)');
  return { id, value, name: body.name, expires_on: expires };
}

/** Deletes one token. Already gone (404) counts as done. */
export async function revoke({ fetch: f, minter, owner = 'user', accountId, id }) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(String(id || ''))) throw new Error('bad token id');
  try {
    await cf(f, minter, 'DELETE', `${base(owner, accountId)}/${id}`);
    return 'deleted';
  } catch (e) {
    if (e.status === 404) return 'already gone';
    throw e;
  }
}

/** Deletes tokens this tool made whose expiry has passed (a job killed before its post step). */
export async function sweep({ fetch: f, minter, owner = 'user', accountId, now = new Date() }) {
  const gone = [];
  for (let page = 1; page <= 20; page++) {
    const data = await cf(f, minter, 'GET', `${base(owner, accountId)}?per_page=50&page=${page}`);
    const list = data.result || [];
    for (const t of list) {
      if (!String(t.name || '').startsWith(NAME_PREFIX)) continue;
      const exp = t.expires_on ? Date.parse(t.expires_on) : NaN;
      if (t.status === 'expired' || (Number.isFinite(exp) && exp <= now.getTime())) {
        await revoke({ fetch: f, minter, owner, accountId, id: t.id });
        gone.push(t.id);
      }
    }
    const info = data.result_info;
    if (!list.length || !info || page >= (info.total_pages || 1)) break;
  }
  return gone;
}

async function cli(argv, env) {
  const [cmd, profileName] = argv;
  const profiles = loadProfiles();
  const owner = env.CLOUDFLARE_MINTER_OWNER || 'user';
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const minter = env.CLOUDFLARE_MINTER_TOKEN;
  if (cmd === 'plan') {
    const p = getProfile(profiles, profileName);
    const policies = buildPolicies({ profile: p, groups: null, accountId: accountId || '0'.repeat(32), zoneId: env.CLOUDFLARE_ZONE_ID });
    console.log(JSON.stringify({ profile: profileName, ttl_minutes: p.ttl_minutes, policies }, null, 2));
  } else if (cmd === 'check') {
    const groups = await listPermissionGroups({ fetch, minter, owner, accountId });
    for (const name of profileName ? [profileName] : Object.keys(profiles)) {
      buildPolicies({ profile: profiles[name], groups, accountId, zoneId: env.CLOUDFLARE_ZONE_ID });
      console.log(`${name}: every permission resolves`);
    }
  } else if (cmd === 'sweep') {
    const gone = await sweep({ fetch, minter, owner, accountId });
    console.log(`deleted ${gone.length} expired ci-mint token(s)`);
  } else {
    console.error('usage: node mint.mjs plan|check [profile] | sweep');
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2), process.env).catch((e) => {
    console.error(`mint: ${e.message}`);
    process.exitCode = 1;
  });
}
