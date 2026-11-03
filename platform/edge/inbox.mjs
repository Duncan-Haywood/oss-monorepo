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

export const MAX_RAW = 256 * 1024;
export const DEFAULT_DAILY_CAP = 200;
const SUBJECT_MAX = 300;

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
  const { meta } = await env.DB.prepare(
    'INSERT INTO inbox_daily (day, n) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 WHERE n < ?2',
  ).bind(day, cap).run();
  return meta.changes > 0;
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
  await env.DB.prepare(
    'INSERT INTO inbox (received, mail_from, rcpt_to, subject, message_id, raw) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  ).bind(r.received, r.mail_from, r.rcpt_to, r.subject, r.message_id, r.raw).run();
}

/** Constant-time string compare, so the token can't be guessed byte by byte. */
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** `GET /inbox?after=<id>`: messages after an id, for a holder of INBOX_TOKEN. */
export async function readInbox(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Closed unless the secret is set; a 404 says nothing about whether it exists.
  if (!env.INBOX_TOKEN || !token || !sameSecret(token, env.INBOX_TOKEN)) {
    return new Response('not found\n', { status: 404 });
  }
  const url = new URL(request.url);
  const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
  const { results = [] } = await env.DB.prepare(
    'SELECT id, received, mail_from, rcpt_to, subject, message_id, raw FROM inbox WHERE id > ?1 ORDER BY id LIMIT 100',
  ).bind(after).all();
  return new Response(JSON.stringify({ messages: results }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
