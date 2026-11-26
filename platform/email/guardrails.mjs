// What an agent may send, decided in code. Pure: the service gathers the
// facts (thread, flags, counts, suppression, consent) and this says yes or
// no with a reason, and every answer is logged (service.mjs, `send`).
//
// The rules (owner, 2026-11-26 brief; prompts/goals.md pivot point 7):
//   1. A reply goes only to someone who wrote to us in that same thread.
//   2. Anything else is marketing to a contact with a recorded opt-in, never
//      suppressed, carrying sender, postal address and one-click unsubscribe
//      (email-ops policy.mjs `maySend` and `complianceParts`, reused).
//   3. Cold outreach is refused here: it belongs on its own domain through the
//      email-ops `cold` stream.
//   4. A thread with an open owner flag (legal, refund, security, a person
//      asked for a human, ...) gets no automatic answer at all.
//   5. Inboxes marked `auto_reply: false` only draft.
//   6. Never answer a machine (auto-replies, bounces, lists): mail loops.
//   7. Caps: per UTC day overall, and per recipient per day.
//   8. Never mail our own domain (a loop) and never more than one recipient.

import { maySend, normalizeAddress } from '../aws/stacks/email-ops/sender/policy.mjs';

export const KINDS = Object.freeze(['reply', 'marketing', 'cold']);

/**
 * @param {object} f
 *   kind, to, subject, text, cfg (inboxes.json), inbox (its entry),
 *   thread (row or null), inbound (inbound messages in the thread),
 *   openFlags (rows), sentToday, sentToRecipientToday,
 *   suppression ({all?, marketing?, unsubscribed?}), consent ({marketing?}),
 *   compliance ({sender, postalAddress, unsubscribeUrl} or null)
 * @returns {{ok: true, stream} | {ok: false, reason}}
 */
export function checkSend(f) {
  const no = (reason) => ({ ok: false, reason });
  const { cfg, inbox } = f;
  if (!KINDS.includes(f.kind)) return no('unknown-kind');
  if (!inbox) return no('unknown-inbox');
  if (cfg.sending.provider === 'none') return no('sending-off');
  const to = normalizeAddress(f.to);
  if (!to || /[,;\s]/.test(String(f.to).trim())) return no('bad-address');
  if (to.endsWith(`@${cfg.domain}`)) return no('own-domain');
  const text = String(f.text || '');
  if (!text.trim() || text.length > cfg.sending.max_body_chars) return no('body-size');
  if (!String(f.subject || '').trim() || String(f.subject).length > 300) return no('subject');
  if (f.sentToday >= cfg.sending.daily_cap) return no('daily-cap');
  if (f.sentToRecipientToday >= cfg.sending.per_recipient_daily_cap) return no('recipient-cap');

  if (f.kind === 'cold') return no('cold-not-here');

  if (f.kind === 'reply') {
    if (!f.thread) return no('no-thread');
    if (f.thread.inbox !== inbox.local) return no('wrong-inbox');
    if (!inbox.auto_reply) return no('inbox-drafts-only');
    if ((f.openFlags || []).length) return no('flagged-for-owner');
    const fromThem = (f.inbound || []).filter((m) => [m.mail_from, m.reply_to].map(normalizeAddress).includes(to));
    if (!fromThem.length) return no('not-a-thread-participant');
    if (fromThem.every((m) => m.automated)) return no('automated-sender');
    const p = maySend({ stream: 'transactional', to, state: { suppressed: f.suppression || {} } });
    return p.ok ? { ok: true, stream: 'transactional' } : no(p.reason);
  }

  // marketing
  if (!cfg.outreach.marketing) return no('marketing-off');
  const c = f.compliance;
  if (!c || !c.sender || !c.postalAddress || !c.unsubscribeUrl) return no('outreach-not-configured');
  const p = maySend({ stream: 'marketing', to, state: { suppressed: f.suppression || {}, consent: f.consent || {} } });
  return p.ok ? { ok: true, stream: 'marketing' } : no(p.reason);
}
