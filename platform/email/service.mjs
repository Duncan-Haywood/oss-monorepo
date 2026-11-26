// The agent-managed inboxes, independent of where they run. The Cloudflare
// Worker (worker.mjs) and, later, the AWS Lambda (aws/ses-inbound.mjs) both
// build one of these from three ports and hand it mail and HTTP requests:
//
//   store    store.mjs (rows + raw MIME)
//   sender   senders.mjs: send({from, fromName, to, subject, text, messageId, inReplyTo, references, headers}) -> {id}
//   alerter  the same shape, used only for mail to the owner (flags, digest)
//
// Nothing here knows about D1, R2, S3, SES or Cloudflare.
//
// HTTP API (all JSON, Authorization: Bearer <token>; an unknown or missing
// token gets a 404, so the API does not even admit it exists):
//
//   scope read  (READ_TOKEN, AGENT_TOKEN, OWNER_TOKEN)
//     GET  /api/inboxes                    configured inboxes
//     GET  /api/threads?inbox&unread=1&flagged=1&status&category&after&limit
//     GET  /api/threads/:id                thread, messages (parsed), open flags, drafts
//     GET  /api/messages/:id/raw           raw MIME (message/rfc822)
//     GET  /api/flags                      open flags
//     GET  /api/sends?day=YYYY-MM-DD       the send log
//     GET  /api/digest                     the daily digest, as text
//   scope agent (AGENT_TOKEN, OWNER_TOKEN)
//     POST /api/threads/:id/read           {read: true|false}
//     POST /api/threads/:id/labels         {add: [], remove: []}
//     POST /api/threads/:id/status         {status: open|answered|closed}
//     POST /api/threads/:id/flag           {reason, note}: hand a thread to the owner
//     POST /api/messages/:id/classify      {category}
//     POST /api/drafts                     {thread_id, text, subject?} (reply) or {kind: 'marketing', inbox, to, subject, text}
//     POST /api/drafts/:id/send            runs the guardrails, sends, logs
//     POST /api/drafts/:id/discard
//     POST /api/suppress                   {address, scope?}: stop mailing someone (only ever tightens)
//   scope owner (OWNER_TOKEN)
//     POST /api/flags/:id/resolve          {note}: the owner has dealt with it
//     POST /api/contacts                   {address, source, wording}: record an opt-in
//   public
//     GET/POST /u?t=<token>                one-click unsubscribe (RFC 8058)
//     GET  /healthz

import { parseMessage, baseSubject, buildMime } from './mime.mjs';
import { classify } from './classify.mjs';
import { checkSend } from './guardrails.mjs';
import { normalizeAddress, complianceParts } from '../aws/stacks/email-ops/sender/policy.mjs';

export const MAX_RAW = 25 * 1024 * 1024;   // Email Routing's own limit
export const PARSE_BYTES = 512 * 1024;      // parse at most this much (free-plan CPU)
export const INBOUND_DAILY_CAP = 1000;
export const ALERT_DAILY_CAP = 20;
export const SEND_LOG_DAYS = 400;
export const THREAD_SUBJECT_DAYS = 30;
export const CATEGORIES = Object.freeze(['support', 'billing', 'lead', 'vendor_notice', 'spam', 'other']);
const STATUSES = new Set(['open', 'answered', 'closed']);
const SCOPES = { read: 1, agent: 2, owner: 3 };

export const AI_FOOTER = '\n\n--\nThis reply was written by an AI assistant and checked by automated rules. Reply "talk to a human" to reach a person.';

const day = (d) => d.toISOString().slice(0, 10);
const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const notFound = () => new Response('not found\n', { status: 404 });

/** Constant-time compare, so a token can't be guessed byte by byte. */
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Which scope a request's bearer token grants ('owner' | 'agent' | 'read' | null). */
export function scopeOf(request, tokens) {
  const auth = request.headers.get('authorization') || '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!t) return null;
  for (const scope of ['owner', 'agent', 'read']) {
    const want = tokens[scope];
    if (want && want.length >= 24 && sameSecret(t, want)) return scope;
  }
  return null;
}

/** The inbox an envelope recipient belongs to (plus-tags ignored), or null. */
export function inboxFor(cfg, rcpt) {
  const a = normalizeAddress(rcpt);
  if (!a) return null;
  const [local, domain] = a.split('@');
  if (domain !== cfg.domain) return null;
  const base = local.split('+')[0];
  return cfg.inboxes.find((b) => b.local === base) || null;
}

/** Text an agent's rules should read: quoted lines and our own footer removed,
 *  so a customer quoting our reply is not flagged by our own words. */
export function ownText(text = '') {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    if (/^On .{5,200} wrote:\s*$/.test(l) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l)) break;
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(AI_FOOTER.trim(), '');
}

// ---- unsubscribe tokens: HMAC-SHA256(secret, address|stream), WebCrypto ----

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}
export async function unsubscribeToken(secret, address, stream = 'marketing') {
  const body = `${address}|${stream}`;
  return `${b64url(new TextEncoder().encode(body))}.${b64url((await hmac(secret, body)).slice(0, 16))}`;
}
export async function readUnsubscribeToken(secret, token) {
  const [b, sig] = String(token || '').split('.');
  if (!b || !sig || !secret) return null;
  let body;
  try { body = new TextDecoder().decode(unb64url(b)); } catch { return null; }
  const want = b64url((await hmac(secret, body)).slice(0, 16));
  if (!sameSecret(sig, want)) return null;
  const [address, stream] = body.split('|');
  return normalizeAddress(address) ? { address, stream } : null;
}

export function createService({ store, sender, alerter, cfg, ownerAddress = '', tokens = {}, unsubscribeSecret = '',
  publicUrl = '', fromName = '', compliance = null, now = () => new Date(), uuid = () => crypto.randomUUID(), log = () => {} }) {
  const byLocal = new Map(cfg.inboxes.map((b) => [b.local, b]));
  const flagReasons = cfg.flag_to_owner;

  async function alertOwner(kind, subject, text) {
    const at = now();
    const base = { at: at.toISOString(), day: day(at), kind, from_addr: `inbox-alerts@${cfg.domain}`, to_addr: 'owner', subject, provider: alerter?.name || '' };
    if (!ownerAddress || !alerter) {
      await store.logSend({ ...base, result: 'blocked', reason: 'owner-address-unset' });
      return false;
    }
    if (kind === 'owner_alert' && !(await store.takeDaily('owner_alert', day(at), ALERT_DAILY_CAP))) {
      await store.logSend({ ...base, result: 'blocked', reason: 'alert-cap (in the digest instead)' });
      return false;
    }
    try {
      const r = await alerter.send({ from: base.from_addr, fromName: 'Inbox alerts', to: ownerAddress, subject, text,
        messageId: `<${uuid()}@${cfg.domain}>`, headers: { 'Auto-Submitted': 'auto-generated' } });
      await store.logSend({ ...base, provider_id: r?.id || '', result: 'sent' });
      return true;
    } catch (e) {
      await store.logSend({ ...base, result: 'failed', reason: String(e?.message || e).slice(0, 300) });
      return false;
    }
  }

  async function raiseFlags(thread, messageId, reasons, source, note, preview, alert = true) {
    const at = now().toISOString();
    const open = new Set((await store.openFlags({ threadId: thread.id })).map((f) => f.reason));
    const ids = [];
    for (const reason of reasons) {
      if (open.has(reason)) continue;
      ids.push(await store.addFlag({ thread_id: thread.id, message_id: messageId, reason, source, note: note.slice(0, 500), at }));
    }
    if (!ids.length) return [];
    if (!alert) return ids; // listed in the digest, no immediate email
    const text = [
      `Thread #${thread.id} in ${thread.inbox}@${cfg.domain} was flagged for you: ${reasons.join(', ')}.`,
      'No agent will answer it until you resolve the flag.',
      '',
      preview,
      '',
      `Read:    node platform/email/cli.mjs thread ${thread.id}`,
      `Resolve: node platform/email/cli.mjs resolve <flag-id> --note "..."   (needs MAIL_OWNER_TOKEN)`,
      `Flag ids: ${ids.join(', ')}`,
    ].join('\n');
    if (await alertOwner('owner_alert', `[flag: ${reasons.join(', ')}] ${thread.subject || '(no subject)'}`.slice(0, 200), text)) {
      await store.markAlerted(ids, now().toISOString());
    }
    return ids;
  }

  /** Store one inbound message. Returns {reject} for the SMTP layer, or what was stored. */
  async function ingest({ raw, envFrom = '', envTo = '' }) {
    const inbox = inboxFor(cfg, envTo);
    if (!inbox) return { reject: 'No such mailbox.' };
    if (raw.byteLength > MAX_RAW) return { reject: 'Message too large.' };
    const at = now();
    if (!(await store.takeDaily('inbound', day(at), INBOUND_DAILY_CAP))) return { reject: 'This mailbox has reached its daily limit; please try again tomorrow.' };

    const text = new TextDecoder().decode(raw.subarray(0, PARSE_BYTES));
    const msg = parseMessage(text);
    const contact = normalizeAddress(msg.replyTo) || normalizeAddress(msg.from) || normalizeAddress(envFrom) || '';
    const verdict = classify({ ...msg, text: ownText(msg.text) }, inbox, flagReasons);

    // Thread: by In-Reply-To/References first, then same subject from the same person lately.
    const base = baseSubject(msg.subject);
    let threadId = await store.findThreadByMessageIds(inbox.local, [...msg.references, msg.inReplyTo]);
    if (!threadId && msg.inReplyTo) {
      threadId = await store.findThreadBySubject(inbox.local, base, contact, new Date(at.getTime() - THREAD_SUBJECT_DAYS * 864e5).toISOString());
    }
    if (!threadId && /^(re|aw|sv)\s*:/i.test(msg.subject)) {
      threadId = await store.findThreadBySubject(inbox.local, base, contact, new Date(at.getTime() - THREAD_SUBJECT_DAYS * 864e5).toISOString());
    }
    const iso = at.toISOString();
    if (!threadId) {
      threadId = await store.createThread({ inbox: inbox.local, subject: msg.subject, base_subject: base, contact, category: verdict.category, labels: [], status: 'open', first_at: iso, last_at: iso, unread: 0 });
    }
    const thread = await store.getThread(threadId);

    const rawKey = `${inbox.local}/${day(at)}/${uuid()}.eml`;
    await store.putRaw(rawKey, raw);
    const id = await store.insertMessage({
      thread_id: threadId, inbox: inbox.local, direction: 'in', at: iso, message_id: msg.messageId, in_reply_to: msg.inReplyTo,
      refs: msg.references, env_from: String(envFrom).slice(0, 320), mail_from: msg.from, from_name: msg.fromName, reply_to: msg.replyTo,
      rcpt_to: String(envTo).toLowerCase().slice(0, 320), cc: msg.cc, subject: msg.subject, text_body: msg.text, html_present: msg.htmlPresent,
      attachments: msg.attachments, size: raw.byteLength, raw_key: rawKey, automated: msg.automated, auth_results: msg.authResults,
      category: verdict.category, labels: [], why: verdict.why, read: false,
    });
    await store.updateThread(threadId, {
      last_at: iso, unread: Number(thread.unread || 0) + 1,
      status: thread.status === 'closed' || thread.status === 'answered' ? 'open' : thread.status,
      category: thread.category === 'spam' || thread.category === 'other' ? verdict.category : thread.category,
    });

    // "unsubscribe" as the whole subject or first line: honoured at once, no person needed.
    const firstLine = ownText(msg.text).trim().split('\n')[0] || '';
    if (contact && (/^\s*unsubscribe\s*$/i.test(msg.subject) || /^\s*(unsubscribe|stop|remove me)\s*[.!]?\s*$/i.test(firstLine))) {
      await store.suppress(contact, 'unsubscribed', 'replied unsubscribe', iso);
      await store.revokeConsent(contact, iso);
    }

    // Spam that trips a rule (phishing loves "legal action") is still flagged,
    // so nobody answers it, but it waits for the digest instead of paging the owner.
    if (verdict.flags.length) {
      const preview = `From: ${msg.fromName ? `${msg.fromName} ` : ''}<${msg.from}>\nSubject: ${msg.subject}\n\n${ownText(msg.text).slice(0, 2000)}`;
      await raiseFlags(thread, id, verdict.flags, 'rule', verdict.why.join('; '), preview, verdict.category !== 'spam');
    }
    log(`stored message ${id} in thread ${threadId} (${inbox.local}, ${verdict.category}${verdict.flags.length ? `, flags ${verdict.flags.join(',')}` : ''})`);
    return { id, threadId, inbox: inbox.local, category: verdict.category, flags: verdict.flags, forward: inbox.forward_to_owner };
  }

  async function threadView(id) {
    const thread = await store.getThread(id);
    if (!thread) return null;
    const messages = (await store.messagesInThread(id)).map(({ raw_key, auth_results, ...m }) => ({ ...m, has_raw: Boolean(raw_key), auth: auth_results }));
    return { thread, messages, flags: await store.openFlags({ threadId: id }) };
  }

  /** Gather the facts and ask the guardrails. Pure read. */
  async function judge(draft) {
    const at = now();
    const inbox = byLocal.get(draft.inbox);
    const to = normalizeAddress(draft.to_addr) || draft.to_addr;
    const thread = draft.thread_id ? await store.getThread(draft.thread_id) : null;
    const msgs = thread ? await store.messagesInThread(thread.id) : [];
    return checkSend({
      kind: draft.kind, to: draft.to_addr, subject: draft.subject, text: draft.text_body, cfg, inbox, thread,
      inbound: msgs.filter((m) => m.direction === 'in'),
      openFlags: thread ? await store.openFlags({ threadId: thread.id }) : [],
      sentToday: await store.countSends(day(at)),
      sentToRecipientToday: await store.countSends(day(at), { to }),
      suppression: await store.suppression(to),
      consent: await store.consent(to),
      compliance,
    });
  }

  async function createDraft(body) {
    const at = now().toISOString();
    const kind = body.kind || 'reply';
    let row;
    if (kind === 'reply') {
      const thread = await store.getThread(Number(body.thread_id));
      if (!thread) return { error: 'thread not found', status: 404 };
      const msgs = await store.messagesInThread(thread.id);
      const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
      const to = normalizeAddress(body.to) || normalizeAddress(lastIn?.reply_to) || normalizeAddress(lastIn?.mail_from) || '';
      const subject = String(body.subject || (/^re\s*:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject || ''}`)).slice(0, 300);
      row = { thread_id: thread.id, kind, inbox: thread.inbox, to_addr: to, subject, text_body: String(body.text || ''), author: String(body.author || 'agent').slice(0, 60) };
    } else {
      if (!byLocal.has(body.inbox)) return { error: 'unknown inbox', status: 400 };
      row = { thread_id: 0, kind, inbox: body.inbox, to_addr: String(body.to || ''), subject: String(body.subject || '').slice(0, 300), text_body: String(body.text || ''), author: String(body.author || 'agent').slice(0, 60) };
    }
    const id = await store.insertDraft({ ...row, status: 'draft', reason: '', created_at: at, updated_at: at });
    const verdict = await judge(row);
    return { draft: { id, ...row, status: 'draft' }, would_send: verdict };
  }

  /** Guardrails, then the sender, and a log row whatever happens. */
  async function sendDraft(id) {
    const draft = await store.getDraft(id);
    if (!draft) return { error: 'draft not found', status: 404 };
    if (draft.status !== 'draft') return { error: `draft is ${draft.status}`, status: 409 };
    const at = now();
    const inbox = byLocal.get(draft.inbox);
    const from = inbox ? inbox.address : '';
    const logBase = { at: at.toISOString(), day: day(at), kind: draft.kind, thread_id: draft.thread_id, draft_id: id, from_addr: from, to_addr: normalizeAddress(draft.to_addr) || String(draft.to_addr).slice(0, 320), subject: draft.subject, provider: sender?.name || 'none' };
    const verdict = await judge(draft);
    if (!verdict.ok) {
      await store.logSend({ ...logBase, result: 'blocked', reason: verdict.reason });
      await store.updateDraft(id, { status: 'blocked', reason: verdict.reason, updated_at: at.toISOString() });
      return { sent: false, reason: verdict.reason };
    }
    if (!sender) {
      await store.logSend({ ...logBase, result: 'blocked', reason: 'no-sender' });
      return { sent: false, reason: 'no-sender' };
    }
    const to = logBase.to_addr;
    const messageId = `<${uuid()}@${cfg.domain}>`;
    let text = draft.text_body;
    let headers = {};
    let inReplyTo = '';
    let references = [];
    if (draft.kind === 'reply') {
      const msgs = await store.messagesInThread(draft.thread_id);
      const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
      inReplyTo = lastIn?.message_id || '';
      references = [...(lastIn?.refs || []), inReplyTo].filter(Boolean).slice(-20);
      text += AI_FOOTER;
      headers = { 'Auto-Submitted': 'auto-replied' };
    } else if (!sender.addsCompliance) {
      const c = complianceParts({ stream: verdict.stream, sender: compliance.sender, postalAddress: compliance.postalAddress,
        unsubscribeUrl: `${compliance.unsubscribeUrl}?t=${await unsubscribeToken(unsubscribeSecret, to, verdict.stream)}`, mailto: `unsubscribe@${cfg.domain}` });
      text += c.text;
      headers = Object.fromEntries(c.headers.map((h) => [h.Name, h.Value]));
    }
    let result;
    try {
      result = await sender.send({ from, fromName, to, subject: draft.subject, text, messageId, inReplyTo, references, headers, stream: verdict.stream });
    } catch (e) {
      const reason = String(e?.message || e).slice(0, 300);
      await store.logSend({ ...logBase, result: 'failed', reason });
      await store.updateDraft(id, { status: 'failed', reason, updated_at: at.toISOString() });
      return { sent: false, reason: `failed: ${reason}` };
    }
    await store.logSend({ ...logBase, provider_id: result?.id || '', result: 'sent' });
    await store.updateDraft(id, { status: 'sent', updated_at: at.toISOString() });
    if (draft.thread_id) {
      const rawKey = `${draft.inbox}/${day(at)}/${uuid()}.out.eml`;
      const mime = buildMime({ from, fromName, to, subject: draft.subject, text, messageId, inReplyTo, references, extraHeaders: headers, date: at });
      await store.putRaw(rawKey, new TextEncoder().encode(mime));
      await store.insertMessage({ thread_id: draft.thread_id, inbox: draft.inbox, direction: 'out', at: at.toISOString(), message_id: messageId,
        in_reply_to: inReplyTo, refs: references, env_from: from, mail_from: from, from_name: fromName, reply_to: '', rcpt_to: to, cc: [],
        subject: draft.subject, text_body: text, html_present: false, attachments: [], size: mime.length, raw_key: rawKey, automated: false,
        auth_results: '', category: 'other', labels: [], why: [], read: true });
      await store.updateThread(draft.thread_id, { status: 'answered', last_at: at.toISOString() });
    }
    return { sent: true, message_id: messageId };
  }

  async function digestText(sinceHours = 24) {
    const at = now();
    const since = new Date(at.getTime() - sinceHours * 36e5).toISOString();
    const open = await store.openFlags();
    const fresh = await store.flagsSince(since);
    const threads = await store.listThreads({ unread: true, limit: 200 });
    const sends = await store.listSends({ day: day(at), limit: 500 });
    const lines = [`Inbox digest for ${cfg.domain}, ${day(at)}`, ''];
    lines.push(`Open flags waiting for you: ${open.length} (${fresh.length} new in the last ${sinceHours} h)`);
    for (const f of open.slice(0, 50)) {
      const t = await store.getThread(f.thread_id);
      lines.push(`  flag ${f.id}: thread ${f.thread_id} ${t?.inbox || '?'}@ [${f.reason}] ${(t?.subject || '').slice(0, 80)}${f.alerted_at ? '' : ' (no alert sent: cap or no address)'}`);
    }
    const byInbox = {};
    for (const t of threads) (byInbox[`${t.inbox}/${t.category}`] ||= []).push(t);
    lines.push('', `Threads with unread mail: ${threads.length}`);
    for (const [k, list] of Object.entries(byInbox).sort()) lines.push(`  ${k}: ${list.length}`);
    const tally = (r) => sends.filter((s) => s.result === r && !['owner_alert', 'digest'].includes(s.kind)).length;
    lines.push('', `Sends today: ${tally('sent')} sent, ${tally('blocked')} blocked, ${tally('failed')} failed (cap ${cfg.sending.daily_cap})`);
    for (const s of sends.filter((x) => x.result !== 'sent' && !['owner_alert', 'digest'].includes(x.kind)).slice(0, 20)) {
      lines.push(`  ${s.result}: ${s.kind} draft ${s.draft_id} thread ${s.thread_id}: ${s.reason}`);
    }
    lines.push('', 'Details: node platform/email/cli.mjs flags | threads --unread');
    return lines.join('\n');
  }

  async function scheduled() {
    const at = now();
    let purged = 0;
    for (const b of cfg.inboxes) {
      const cutoff = new Date(at.getTime() - b.retention_days * 864e5).toISOString();
      const r = await store.purgeInbox(b.local, cutoff);
      purged += r.messages;
      for (let i = 0; i < r.rawKeys.length; i += 900) await store.deleteRaw(r.rawKeys.slice(i, i + 900));
    }
    await store.purgeSends(new Date(at.getTime() - SEND_LOG_DAYS * 864e5).toISOString());
    const sent = await alertOwner('digest', `Inbox digest ${day(at)}`, await digestText());
    return { purged, digest: sent };
  }

  async function unsubscribe(request) {
    const url = new URL(request.url);
    const t = await readUnsubscribeToken(unsubscribeSecret, url.searchParams.get('t'));
    const page = (s, body) => new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body>`, { status: s, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (!t) return page(400, '<p>This unsubscribe link is not valid. Reply "unsubscribe" to any message from us instead.</p>');
    if (request.method === 'POST') {
      const iso = now().toISOString();
      await store.suppress(t.address, 'unsubscribed', 'one-click', iso);
      await store.revokeConsent(t.address, iso);
      return page(200, '<p>You are unsubscribed and will get no more marketing mail from us.</p>');
    }
    // GET shows a button, so link scanners unsubscribe no one.
    return page(200, `<form method="post"><p>Stop marketing email to this address?</p><button type="submit">Unsubscribe</button></form>`);
  }

  async function api(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/healthz') return new Response('ok\n');
    if (path === '/u') return unsubscribe(request);
    if (!path.startsWith('/api/')) return notFound();
    const scope = scopeOf(request, tokens);
    if (!scope) return notFound();
    const need = (s) => SCOPES[scope] >= SCOPES[s];
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const q = url.searchParams;
    let m;

    if (request.method === 'GET') {
      if (path === '/api/inboxes') return json(200, { domain: cfg.domain, inboxes: cfg.inboxes, sending: cfg.sending, flag_to_owner: cfg.flag_to_owner });
      if (path === '/api/threads') {
        return json(200, { threads: await store.listThreads({ inbox: q.get('inbox') || undefined, unread: q.get('unread') === '1', flagged: q.get('flagged') === '1',
          status: q.get('status') || undefined, category: q.get('category') || undefined, after: Number(q.get('after')) || 0, limit: Number(q.get('limit')) || 50 }) });
      }
      if ((m = /^\/api\/threads\/(\d+)$/.exec(path))) {
        const v = await threadView(Number(m[1]));
        return v ? json(200, v) : json(404, { error: 'thread not found' });
      }
      if ((m = /^\/api\/messages\/(\d+)\/raw$/.exec(path))) {
        const msg = await store.getMessage(Number(m[1]));
        const raw = msg?.raw_key ? await store.getRaw(msg.raw_key) : null;
        return raw ? new Response(raw, { headers: { 'content-type': 'message/rfc822', 'cache-control': 'no-store' } }) : json(404, { error: 'raw not found' });
      }
      if (path === '/api/flags') return json(200, { flags: await store.openFlags() });
      if (path === '/api/sends') return json(200, { sends: await store.listSends({ day: q.get('day') || undefined }) });
      if (path === '/api/digest') return json(200, { text: await digestText() });
      return notFound();
    }
    if (request.method !== 'POST') return notFound();
    if (!need('agent')) return json(403, { error: 'this token is read-only' });

    if ((m = /^\/api\/threads\/(\d+)\/(read|labels|status|flag)$/.exec(path))) {
      const id = Number(m[1]);
      const t = await store.getThread(id);
      if (!t) return json(404, { error: 'thread not found' });
      if (m[2] === 'read') {
        const read = body.read !== false;
        for (const msg of await store.messagesInThread(id)) await store.updateMessage(msg.id, { read });
        await store.updateThread(id, { unread: read ? 0 : 1 });
      } else if (m[2] === 'labels') {
        const clean = (l) => (Array.isArray(l) ? l : []).map((x) => String(x).toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 40)).filter(Boolean);
        const labels = new Set(t.labels || []);
        clean(body.add).forEach((l) => labels.add(l));
        clean(body.remove).forEach((l) => labels.delete(l));
        await store.updateThread(id, { labels: [...labels].slice(0, 30) });
      } else if (m[2] === 'status') {
        if (!STATUSES.has(body.status)) return json(400, { error: 'status must be open, answered or closed' });
        await store.updateThread(id, { status: body.status });
      } else {
        const reason = String(body.reason || 'agent').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30) || 'agent';
        const ids = await raiseFlags(t, 0, [reason], 'agent', String(body.note || ''), `Flagged by an agent: ${String(body.note || '').slice(0, 1000)}`);
        return json(200, { flags: ids });
      }
      return json(200, await threadView(id));
    }
    if ((m = /^\/api\/messages\/(\d+)\/classify$/.exec(path))) {
      if (!CATEGORIES.includes(body.category)) return json(400, { error: `category must be one of ${CATEGORIES.join(', ')}` });
      const msg = await store.getMessage(Number(m[1]));
      if (!msg) return json(404, { error: 'message not found' });
      await store.updateMessage(msg.id, { category: body.category, why: [...(msg.why || []), `agent: ${body.category}`] });
      await store.updateThread(msg.thread_id, { category: body.category });
      // Re-labelling never clears a flag: only the owner resolves those.
      return json(200, { ok: true, open_flags: (await store.openFlags({ threadId: msg.thread_id })).length });
    }
    if (path === '/api/drafts') {
      const r = await createDraft(body);
      return r.error ? json(r.status, { error: r.error }) : json(201, r);
    }
    if ((m = /^\/api\/drafts\/(\d+)\/(send|discard)$/.exec(path))) {
      const id = Number(m[1]);
      if (m[2] === 'discard') {
        await store.updateDraft(id, { status: 'discarded', updated_at: now().toISOString() });
        return json(200, { ok: true });
      }
      const r = await sendDraft(id);
      return r.error ? json(r.status, { error: r.error }) : json(r.sent ? 200 : 422, r);
    }
    if (path === '/api/suppress') {
      const a = normalizeAddress(body.address);
      if (!a) return json(400, { error: 'bad address' });
      const scope = ['all', 'marketing', 'unsubscribed'].includes(body.scope) ? body.scope : 'unsubscribed';
      await store.suppress(a, scope, String(body.reason || 'agent').slice(0, 100), now().toISOString());
      if (scope !== 'marketing') await store.revokeConsent(a, now().toISOString());
      return json(200, { ok: true });
    }
    if (!need('owner')) return json(403, { error: 'owner token required' });
    if ((m = /^\/api\/flags\/(\d+)\/resolve$/.exec(path))) {
      const ok = await store.resolveFlag(Number(m[1]), String(body.note || '').slice(0, 500), now().toISOString());
      return json(ok ? 200 : 404, { resolved: ok });
    }
    if (path === '/api/contacts') {
      const a = normalizeAddress(body.address);
      if (!a || !body.source || !body.wording) return json(400, { error: 'address, source and wording (the opt-in text shown) are required' });
      await store.putConsent({ address: a, source: String(body.source).slice(0, 200), wording: String(body.wording).slice(0, 1000), at: now().toISOString() });
      return json(201, { ok: true });
    }
    return notFound();
  }

  return { ingest, api, scheduled, digestText, createDraft, sendDraft, judge };
}
