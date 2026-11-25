// The SES adapter behind the repository's email-sender port.
//
// There is no single EmailSender interface in this repository: each venture
// takes a `send(message)` function, `message = { to, subject, text, html?,
// headers? }`, that resolves when the provider accepts the mail and throws
// otherwise (`resendSender` in ventures/drip-keeper/server.mjs, the providers
// in ventures/dunning-engine/mail.mjs). `sesSender` returns that same
// function, so a venture switches by changing one constructor call (or by
// `MAIL_PROVIDER=ses`, see `senderFromEnv`). The private repository's
// Grant Autopilot adds SES the same way, behind an environment switch.
//
// Before SES is called the adapter:
//   1. asks the consent store about the recipient and applies `maySend`
//      (policy.mjs); a refusal throws an Error with code EMAIL_SUPPRESSED
//      and nothing is sent;
//   2. for marketing and cold mail, appends the sender, postal address and
//      unsubscribe link, and sets List-Unsubscribe / List-Unsubscribe-Post;
//   3. sends through SES v2 with the stream's configuration set, tagging the
//      message with its stream so bounce and complaint events find their way
//      back to the suppression table (events.mjs).

import { awsClient } from '../../../edge/aws/sigv4.mjs';
import { maySend, complianceParts, normalizeAddress } from './policy.mjs';
import { unsubscribeToken } from './unsubscribe-token.mjs';

export class SuppressedError extends Error {
  constructor(reason) {
    super(`not sent: ${reason}`);
    this.code = 'EMAIL_SUPPRESSED';
    this.reason = reason;
  }
}

/** Pure: the SES v2 SendEmail body for one message. */
export function sendEmailInput({ from, to, subject, text, html, headers = {}, configurationSet, stream, compliance }) {
  const extra = Object.entries(headers || {}).filter(([k]) => !/^list-unsubscribe/i.test(k)).map(([Name, Value]) => ({ Name, Value: String(Value) }));
  const body = { Text: { Data: `${text || ''}${compliance.text}`, Charset: 'UTF-8' } };
  if (html) body.Html = { Data: `${html}${compliance.html}`, Charset: 'UTF-8' };
  return {
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: body, Headers: [...extra, ...compliance.headers] } },
    ConfigurationSetName: configurationSet,
    EmailTags: [{ Name: 'stream', Value: stream }],
  };
}

/**
 * `consent` is a consent store (consent-store.mjs). `unsubscribeBase` is the
 * public one-click endpoint (the email stack's `unsubscribe_url` output);
 * `unsubscribeSecret` signs its tokens. `request` overrides the SES client in tests.
 */
export function sesSender({
  region = 'us-east-1', from, stream, configurationSet, consent, sender, postalAddress,
  unsubscribeBase, unsubscribeSecret, mailto, request, recipientOf = () => ({}),
}) {
  if (!from || !stream || !configurationSet || !consent) throw new Error('sesSender needs from, stream, configurationSet and consent');
  const ses = request || awsClient({ region, service: 'ses', endpoint: `https://email.${region}.amazonaws.com` });
  return async function send(m) {
    const to = normalizeAddress(m.to);
    const verdict = maySend({ stream, to, state: to ? await consent.state(to) : {}, recipient: m.recipient || recipientOf(to) || {} });
    if (!verdict.ok) throw new SuppressedError(verdict.reason);
    const compliance = complianceParts({
      stream, sender, postalAddress, mailto,
      unsubscribeUrl: stream === 'transactional' ? '' : `${unsubscribeBase}?t=${unsubscribeToken(unsubscribeSecret, to, stream)}`,
    });
    const input = sendEmailInput({ from, to, subject: m.subject, text: m.text, html: m.html, headers: m.headers, configurationSet, stream, compliance });
    const res = await ses({ method: 'POST', path: '/v2/email/outbound-emails', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`ses ${res.status}`);
    const out = await res.json().catch(() => ({}));
    return { messageId: out.MessageId || '' };
  };
}

/**
 * The sender a venture's server builds from its environment, so moving from
 * Resend to SES is a configuration change:
 *
 *   MAIL_PROVIDER=ses  SES_STREAM=transactional|marketing|cold  MAIL_FROM=...
 *   SES_CONFIGURATION_SET=...  (the email stack's outputs name these)
 *   SENDER_NAME, POSTAL_ADDRESS, UNSUBSCRIBE_URL, UNSUBSCRIBE_SECRET (marketing and cold)
 *
 * Returns null when MAIL_PROVIDER is not `ses`, so the caller keeps its
 * existing provider.
 */
export function senderFromEnv(env, { consent, request } = {}) {
  if (env.MAIL_PROVIDER !== 'ses') return null;
  return sesSender({
    region: env.AWS_REGION || 'us-east-1',
    from: env.MAIL_FROM,
    stream: env.SES_STREAM || 'transactional',
    configurationSet: env.SES_CONFIGURATION_SET,
    consent,
    sender: env.SENDER_NAME || env.PRODUCT_NAME || '',
    postalAddress: env.POSTAL_ADDRESS || '',
    unsubscribeBase: env.UNSUBSCRIBE_URL || '',
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET || '',
    mailto: env.UNSUBSCRIBE_MAILTO || '',
    request,
  });
}
