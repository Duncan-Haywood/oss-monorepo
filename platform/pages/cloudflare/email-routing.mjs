#!/usr/bin/env node
// Cloudflare Email Routing for the site's domain, as code (owner, 2026-10-31:
// "i generally want everyting as code ... like config email support etc.").
//
// email-routing.json is the desired state: which addresses on the zone
// receive mail. Every one is delivered to a Worker, the agent-managed inbox
// in platform/edge/inbox.mjs, and to no person's mailbox (owner, 2026-11-03:
// "agent managed inbox not mine", "no forwarding"). This script makes
// Cloudflare match that state and is safe to re-run:
//
//   * turns Email Routing on for the zone (Cloudflare adds the MX and SPF
//     records itself),
//   * creates or updates one literal-match rule per address that hands the
//     message to the Worker, and disables rules this script made for
//     addresses no longer listed.
//
// A Worker action needs no verified destination address, so there is no
// verification email to click. Dry run by default; APPLY=1 writes. Needs
// CLOUDFLARE_API_TOKEN with Zone → Email Routing Rules: Edit and Zone →
// Zone Settings: Edit (to enable), and CLOUDFLARE_ACCOUNT_ID.
//
//   node platform/pages/cloudflare/email-routing.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.cloudflare.com/client/v4';
/** Rules this script owns carry this name prefix, so it never touches a rule
 *  someone made by hand. */
export const RULE_PREFIX = 'as-code: ';

export async function loadConfig(file = path.join(HERE, 'email-routing.json')) {
  const cfg = JSON.parse(await fs.readFile(file, 'utf8'));
  const locals = cfg.addresses.map((a) => a.local);
  if (new Set(locals).size !== locals.length) throw new Error('email-routing.json lists an address twice');
  if (!cfg.deliver_to_worker) throw new Error('email-routing.json names no deliver_to_worker');
  for (const l of locals) if (!/^[a-z0-9][a-z0-9._-]*$/.test(l)) throw new Error(`bad local part: ${l}`);
  return cfg;
}

/** The rules the config asks for, in the shape Cloudflare's API takes. */
export function desiredRules(cfg) {
  return cfg.addresses.map(({ local }) => {
    const to = `${local}@${cfg.zone}`;
    return {
      name: `${RULE_PREFIX}${to}`,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: to }],
      actions: [{ type: 'worker', value: [cfg.deliver_to_worker] }],
    };
  });
}

/** A matcher or action list as a string that ignores key order. Cloudflare
 *  answers `{ field, type, value }` where desiredRules builds `{ type, field,
 *  value }`, so a plain JSON.stringify called every already-correct rule
 *  drifted and a re-run rewrote all of them (quality audit 2026-11-10). */
export function canonical(list) {
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v;
  return JSON.stringify(sortKeys(list ?? []));
}

function sameRule(a, b) {
  return a.enabled === b.enabled &&
    canonical(a.matchers) === canonical(b.matchers) &&
    canonical(a.actions) === canonical(b.actions);
}

/** What to change: creates, updates (by rule id) and disables. Pure. */
export function plan(existing, desired) {
  const mine = existing.filter((r) => r.name?.startsWith(RULE_PREFIX));
  const byName = new Map(mine.map((r) => [r.name, r]));
  const ops = [];
  for (const d of desired) {
    const cur = byName.get(d.name);
    if (!cur) ops.push({ op: 'create', rule: d });
    else if (!sameRule(cur, d)) ops.push({ op: 'update', id: cur.id, rule: d });
  }
  const wanted = new Set(desired.map((d) => d.name));
  for (const r of mine) {
    if (!wanted.has(r.name) && r.enabled) ops.push({ op: 'disable', id: r.id, rule: { ...r, enabled: false } });
  }
  return ops;
}

export function client(token, fetchImpl = fetch) {
  return async function cf(method, route, body) {
    const res = await fetchImpl(`${API}${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const msg = (json.errors || []).map((e) => e.message).join('; ') || res.status;
      throw new Error(`${method} ${route}: ${msg}`);
    }
    return json.result;
  };
}

export async function apply({ cfg, cf, write, log = console.log }) {
  const zones = await cf('GET', `/zones?name=${encodeURIComponent(cfg.zone)}`);
  if (!zones?.length) throw new Error(`zone ${cfg.zone} is not in this Cloudflare account`);
  const zoneId = zones[0].id;

  const routing = await cf('GET', `/zones/${zoneId}/email/routing`);
  if (!routing?.enabled) {
    log(`email routing is off for ${cfg.zone}: ${write ? 'enabling' : 'would enable'}`);
    if (write) await cf('POST', `/zones/${zoneId}/email/routing/enable`, {});
  }

  // Cloudflare pages this list (20 by default); 50 is its largest page. A
  // rule past the first page would look missing and be created twice.
  const existing = await cf('GET', `/zones/${zoneId}/email/routing/rules?per_page=50`);
  if ((existing || []).length >= 50) throw new Error('50 or more routing rules: add paging before applying');
  const ops = plan(existing || [], desiredRules(cfg));
  if (!ops.length) log('rules already match email-routing.json');
  for (const o of ops) {
    log(`${write ? '' : 'would '}${o.op} ${o.rule.name.slice(RULE_PREFIX.length)}`);
    if (!write) continue;
    if (o.op === 'create') await cf('POST', `/zones/${zoneId}/email/routing/rules`, o.rule);
    else await cf('PUT', `/zones/${zoneId}/email/routing/rules/${o.id}`, o.rule);
  }
  return ops;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = await loadConfig();
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    console.error('missing: CLOUDFLARE_API_TOKEN');
    process.exit(2);
  }
  await apply({ cfg, cf: client(token), write: process.env.APPLY === '1' });
}
