// Sender adapters: each returns `{ name, addsCompliance, send(m) }`, where
// `m` is {from, fromName, to, subject, text, messageId, inReplyTo,
// references, headers, stream} and send resolves to {id} or throws.
// The service never knows which one it holds (README.md, "Portability").

import { buildMime } from './mime.mjs';

/**
 * Cloudflare: the Worker's `send_email` binding. With Email Routing alone it
 * reaches only verified destination addresses (the owner's, for alerts);
 * with Cloudflare Email Service enabled for the domain it reaches anyone and
 * signs with the domain's DKIM key. `EmailMessage` is the class from the
 * `cloudflare:email` module, passed in so this file loads under Node.
 */
export function cloudflareSender(binding, EmailMessage, { name = 'cloudflare' } = {}) {
  return {
    name,
    addsCompliance: false,
    async send(m) {
      if (!binding) throw new Error('send_email binding missing');
      const raw = buildMime({ from: m.from, fromName: m.fromName, to: m.to, subject: m.subject, text: m.text,
        messageId: m.messageId, inReplyTo: m.inReplyTo, references: m.references || [], extraHeaders: m.headers || {} });
      await binding.send(new EmailMessage(m.from, m.to, raw));
      return { id: m.messageId };
    },
  };
}

/**
 * Any `send({to, subject, text, headers})` function, such as the email-ops
 * stack's `sesSender(...)` (platform/aws/stacks/email-ops/sender/), which
 * applies the consent policy and the compliance footer itself.
 */
export function portSender(send, { name = 'ses', addsCompliance = true } = {}) {
  return {
    name,
    addsCompliance,
    async send(m) {
      const headers = { ...(m.headers || {}), 'Message-ID': m.messageId };
      if (m.inReplyTo) headers['In-Reply-To'] = m.inReplyTo;
      if (m.references?.length) headers.References = m.references.join(' ');
      const r = await send({ to: m.to, subject: m.subject, text: m.text, headers });
      return { id: r?.messageId || m.messageId };
    },
  };
}

/** Sending switched off: every send is refused and logged as failed. */
export const noSender = {
  name: 'none',
  addsCompliance: false,
  async send() { throw new Error('sending is off (inboxes.yaml sending.provider: none)'); },
};
