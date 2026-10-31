#!/usr/bin/env node
// Cloudflare Email Routing for the site's domain, as code (owner, 2026-10-31:
// "i generally want everyting as code ... like config email support etc.").
//
// email-routing.json is the desired state: which addresses on the zone
// receive mail. Every one forwards to one inbox whose address is a secret
// (its name is in the JSON, its value is not in the repository). This script
// makes Cloudflare match that state and is safe to re-run:
//
//   * turns Email Routing on for the zone (Cloudflare adds the MX and SPF
//     records itself),
//   * registers the forwarding inbox as a destination (Cloudflare emails it
//     a verification link once; forwarding starts after it is clicked),
//   * creates or updates one literal-match forward rule per address, and
//     disables rules this script made for addresses no longer listed.
//
// Dry run by default; APPLY=1 writes. Needs CLOUDFLARE_API_TOKEN with Zone →
// Email Routing Rules: Edit, Zone → Zone Settings: Edit (to enable) and
// Account → Email Routing Addresses: Edit, plus CLOUDFLARE_ACCOUNT_ID and the
// forwarding address in the variable the JSON names.
//
//   EMAIL_FORWARD_TO=... node platform/pages/cloudflare/email-routing.mjs

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
  for (const l of locals) if (!/^[a-z0-9][a-z0-9._-]*$/.test(l)) throw new Error(`bad local part: ${l}`);
  return cfg;
}

/** The rules the config asks for, in the shape Cloudflare's API takes. */
export function desiredRules(cfg, forwardTo) {
  return cfg.addresses.map(({ local }) => {
    const to = `${local}@${cfg.zone}`;
    return {
      name: `${RULE_PREFIX}${to}`,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: to }],
      actions: [{ type: 'forward', value: [forwardTo] }],
    };
  });
}

function sameRule(a, b) {
  return a.enabled === b.enabled &&
    JSON.stringify(a.matchers) === JSON.stringify(b.matchers) &&
    JSON.stringify(a.actions) === JSON.stringify(b.actions);
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

export async function apply({ cfg, forwardTo, accountId, cf, write, log = console.log }) {
  const zones = await cf('GET', `/zones?name=${encodeURIComponent(cfg.zone)}`);
  if (!zones?.length) throw new Error(`zone ${cfg.zone} is not in this Cloudflare account`);
  const zoneId = zones[0].id;

  const routing = await cf('GET', `/zones/${zoneId}/email/routing`);
  if (!routing?.enabled) {
    log(`email routing is off for ${cfg.zone}: ${write ? 'enabling' : 'would enable'}`);
    if (write) await cf('POST', `/zones/${zoneId}/email/routing/enable`, {});
  }

  const dests = await cf('GET', `/accounts/${accountId}/email/routing/addresses`);
  const dest = (dests || []).find((d) => d.email.toLowerCase() === forwardTo.toLowerCase());
  if (!dest) {
    log(`forwarding inbox not registered: ${write ? 'registering (check it for a verification email)' : 'would register'}`);
    if (write) await cf('POST', `/accounts/${accountId}/email/routing/addresses`, { email: forwardTo });
  } else if (!dest.verified) {
    log('forwarding inbox registered but not verified yet: click the link Cloudflare emailed it');
  }

  const existing = await cf('GET', `/zones/${zoneId}/email/routing/rules`);
  const ops = plan(existing || [], desiredRules(cfg, forwardTo));
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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const forwardTo = process.env[cfg.forward_to_secret];
  const missing = [['CLOUDFLARE_API_TOKEN', token], ['CLOUDFLARE_ACCOUNT_ID', accountId], [cfg.forward_to_secret, forwardTo]]
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`missing: ${missing.join(', ')}`);
    process.exit(2);
  }
  await apply({ cfg, forwardTo, accountId, cf: client(token), write: process.env.APPLY === '1' });
}
