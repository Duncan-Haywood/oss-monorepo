// The mail Worker: Cloudflare Email Routing delivers every address in
// inboxes.yaml here (email-routing.json, `deliver_to_worker`). It stores the
// raw message in R2 and the parsed copy in D1, flags what a person must see,
// forwards a copy to the owner where the config says so, serves the agent
// API, and once a day purges by retention and mails the owner a digest.
//
// Bindings and secrets (wrangler.toml; README.md, "Owner steps"):
//   DB (D1), RAW (R2; optional, raw MIME falls back to D1 without it), SEND (send_email: replies), ALERT (send_email: owner)
//   AGENT_TOKEN, READ_TOKEN, OWNER_TOKEN   API bearer tokens (secrets)
//   OWNER_FORWARD_TO                        the owner's address (secret, verified in Email Routing)
//   UNSUBSCRIBE_SECRET                      signs one-click unsubscribe links (secret)
//   SENDER_NAME, POSTAL_ADDRESS             marketing compliance footer (vars; marketing is refused until both are set)
//   PUBLIC_URL                              this Worker's public URL, for unsubscribe links

import { EmailMessage } from 'cloudflare:email';
import cfg from './inboxes.json';
import { createService } from './service.mjs';
import { d1r2Store, d1Bucket } from './store.mjs';
import { cloudflareSender, noSender } from './senders.mjs';

async function readAll(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return all;
}

function serviceFor(env) {
  const publicUrl = String(env.PUBLIC_URL || '').replace(/\/$/, '');
  const compliance = env.SENDER_NAME && env.POSTAL_ADDRESS && publicUrl
    ? { sender: env.SENDER_NAME, postalAddress: env.POSTAL_ADDRESS, unsubscribeUrl: `${publicUrl}/u` } : null;
  return createService({
    store: d1r2Store(env.DB, env.RAW || d1Bucket(env.DB)),
    sender: cfg.sending.provider === 'cloudflare' ? cloudflareSender(env.SEND, EmailMessage) : noSender,
    alerter: cloudflareSender(env.ALERT, EmailMessage, { name: 'cloudflare-alert' }),
    cfg,
    ownerAddress: env.OWNER_FORWARD_TO || '',
    tokens: { owner: env.OWNER_TOKEN, agent: env.AGENT_TOKEN, read: env.READ_TOKEN },
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET || '',
    publicUrl,
    fromName: env.MAIL_FROM_NAME || '',
    compliance: env.UNSUBSCRIBE_SECRET ? compliance : null,
    log: (s) => console.log(s),
  });
}

export default {
  async email(message, env) {
    const svc = serviceFor(env);
    const raw = await readAll(message.raw, 25 * 1024 * 1024);
    if (!raw) { message.setReject('Message too large.'); return; }
    const r = await svc.ingest({ raw, envFrom: message.from, envTo: message.to });
    if (r.reject) { message.setReject(r.reject); return; }
    if (r.forward && env.OWNER_FORWARD_TO) {
      try {
        await message.forward(env.OWNER_FORWARD_TO);
      } catch (e) {
        // Stored already; a failed copy is logged, never a lost message.
        console.log(`forward failed for message ${r.id}: ${e?.message || e}`);
      }
    }
  },
  async fetch(request, env) {
    try {
      return await serviceFor(env).api(request);
    } catch (e) {
      console.log(`api error: ${e?.message || e}`);
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(serviceFor(env).scheduled().then((r) => console.log(`scheduled: ${JSON.stringify(r)}`)));
  },
};
