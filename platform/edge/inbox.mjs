// The agent-managed inbox for support@ and hello@marisstella.app (owner,
// 2026-11-03: "agent managed inbox not mine", "no forwarding").
//
// Cloudflare Email Routing hands each message to this Worker's `email`
// handler instead of forwarding it anywhere (`platform/pages/cloudflare/
// email-routing.json`). The message is stored in D1 and nowhere else: mail
// from the public carries names, addresses and whatever people choose to
// write, and this repository is public, so none of it is ever committed.
// Agents read it with `GET /inbox`, which answers only to a bearer token
// (`INBOX_TOKEN`, a Worker secret) and is closed when that secret is unset.
//
// Limits keep the free plan's D1 quota safe from a flood: a message over
// MAX_RAW bytes is refused at the SMTP stage, and past the daily cap the
// rest of the day's mail is refused too (the sender's server reports it).
//
// Retention (GDPR art. 5(1)(e), storage limitation): a message is kept
// RETENTION_DAYS (90 by default, `INBOX_RETENTION_DAYS` overrides) and then
// deleted. The purge runs on every delivery and every read, so no schedule is
// needed and nothing older than the limit is ever handed to an agent.
// `DELETE /inbox?id=<n>` erases one message sooner, for a sender who asks
// (art. 17). The privacy copy states the same 90 days
// (`platform/pages/build.mjs`, `disclaimerHtml`).

import { storeOf } from './store.mjs';

export const MAX_RAW = 256 * 1024;
export const DEFAULT_DAILY_CAP = 200;
export const RETENTION_DAYS = 90;
const SUBJECT_MAX = 300;

/** The oldest `received` timestamp still kept at `now`. */
export function retentionCutoff(env, now = new Date()) {
  const days = Number.parseInt(env?.INBOX_RETENTION_DAYS || '', 10) || RETENTION_DAYS;
  return new Date(now.getTime() - days * 86400000).toISOString();
}

/** Delete every message older than the retention limit. */
export async function purgeExpired(env, now = new Date()) {
  await storeOf(env).purgeInbox(retentionCutoff(env, now));
}

/** Read a stream into a string, giving up (null) once it passes `limit` bytes. */
export async function readCapped(stream, limit = MAX_RAW) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** The row stored for one message. Pure, so the shape is tested directly. */
export function inboxRecord({ from, to, headers, raw, received }) {
  const h = (name) => String(headers?.get?.(name) ?? '').replace(/[\r\n]+/g, ' ').trim();
  return {
    received,
    mail_from: String(from || '').slice(0, 320),
    rcpt_to: String(to || '').slice(0, 320),
    subject: h('subject').slice(0, SUBJECT_MAX),
    message_id: h('message-id').slice(0, 500),
    raw,
  };
}

async function underCap(env, day) {
  const cap = Number.parseInt(env.INBOX_DAILY_CAP || '', 10) || DEFAULT_DAILY_CAP;
  return storeOf(env).takeDaily('inbox', day, cap);
}

/** The Worker's `email` handler. */
export async function receiveEmail(message, env, now = new Date()) {
  const raw = await readCapped(message.raw);
  if (raw === null) {
    message.setReject(`Message too large; the limit is ${MAX_RAW / 1024} KB.`);
    return;
  }
  if (!(await underCap(env, now.toISOString().slice(0, 10)))) {
    message.setReject('This inbox has reached its daily limit; please try again tomorrow.');
    return;
  }
  const r = inboxRecord({ from: message.from, to: message.to, headers: message.headers, raw, received: now.toISOString() });
  await storeOf(env).insertInbox(r);
  await purgeExpired(env, now);
}

/** Constant-time string compare, so the token can't be guessed byte by byte. */
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True when the request carries the INBOX_TOKEN bearer token (and it is set). */
function authorized(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(env.INBOX_TOKEN && token && sameSecret(token, env.INBOX_TOKEN));
}

// Closed unless the secret is set; a 404 says nothing about whether it exists.
const notFound = () => new Response('not found\n', { status: 404 });

/** `DELETE /inbox?id=<n>`: erase one message now, for a holder of INBOX_TOKEN. */
export async function deleteInboxMessage(request, env) {
  if (!authorized(request, env)) return notFound();
  const id = Number.parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!(id > 0)) return new Response('id required\n', { status: 400 });
  const deleted = await storeOf(env).deleteInbox(id);
  return new Response(JSON.stringify({ deleted }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** `GET /inbox?after=<id>`: messages after an id, for a holder of INBOX_TOKEN. */
export async function readInbox(request, env, now = new Date()) {
  if (!authorized(request, env)) return notFound();
  await purgeExpired(env, now);
  const url = new URL(request.url);
  const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
  const results = await storeOf(env).readInbox(after);
  return new Response(JSON.stringify({ messages: results }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
