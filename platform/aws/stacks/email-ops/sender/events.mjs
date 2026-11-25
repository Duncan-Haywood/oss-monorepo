// The email-ops function (`platform/aws/stacks/email-ops/`), for two jobs:
//
//   SES events     bounces and complaints from every configuration set reach
//                  it through stacks/email's SNS -> SQS queue (an EventBridge
//                  event is accepted too). A permanent bounce or a complaint
//                  suppresses the address for every stream; transient bounces
//                  are ignored (SES retries them).
//   /unsubscribe   the public one-click endpoint every marketing and cold
//                  message links to (function URL). GET shows a page with one
//                  button, so link scanners that prefetch URLs unsubscribe no
//                  one; POST (the button, or a mail client's RFC 8058
//                  List-Unsubscribe-Post) records the unsubscribe at once.
//
// Neither job logs an address.

import { consentStore } from './consent-store.mjs';
import { readUnsubscribeToken } from './unsubscribe-token.mjs';
import { jsonProtocol } from '../../../../edge/aws/sigv4.mjs';

/** Pure: the suppression events in one SES event (EventBridge `detail`). */
export function sesEvents(detail = {}) {
  const stream = detail.mail?.tags?.stream?.[0] || '';
  if (detail.eventType === 'Bounce' && detail.bounce?.bounceType === 'Permanent') {
    return (detail.bounce.bouncedRecipients || []).map((r) => ({ address: r.emailAddress, event: { type: 'hard-bounce', source: `ses:${stream}` } }));
  }
  if (detail.eventType === 'Complaint') {
    return (detail.complaint?.complainedRecipients || []).map((r) => ({ address: r.emailAddress, event: { type: 'complaint', source: `ses:${stream}` } }));
  }
  return [];
}

const page = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" },
  body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body>`,
  isBase64Encoded: false,
});

export function createHandler({ store, unsubscribeSecret, log = () => {} }) {
  async function unsubscribe(event) {
    const method = event.requestContext?.http?.method || 'GET';
    const token = new URLSearchParams(event.rawQueryString || '').get('t') || '';
    const who = readUnsubscribeToken(unsubscribeSecret, token);
    if (!who) return page(400, '<h1>This link is not valid</h1><p>Reply to the email with “unsubscribe” and you will be removed by hand.</p>');
    if (method === 'GET') {
      const t = token.replace(/[^A-Za-z0-9._-]/g, '');
      return page(200, `<h1>Unsubscribe</h1><p>Stop these emails to this address?</p><form method="post" action="?t=${t}"><button type="submit" style="font-size:1.1rem;padding:.6rem 1.2rem">Unsubscribe</button></form>`);
    }
    if (method !== 'POST') return page(405, '<h1>Method not allowed</h1>');
    // A one-click unsubscribe removes the address from marketing and cold alike.
    await store.suppress(who.address, { type: 'unsubscribe', stream: 'all', source: `one-click:${who.stream}` });
    log({ unsubscribe: who.stream });
    return page(200, '<h1>You are unsubscribed</h1><p>You will not get marketing or outreach email from us again. Receipts and account notices for anything you bought still arrive.</p>');
  }

  return async function handler(event) {
    // stacks/email's SES -> SNS -> SQS feed (raw message delivery: the body
    // is the SES event). A record that fails is reported back, so SQS retries
    // only it and, past maxReceiveCount, keeps it in the dead-letter queue.
    if (Array.isArray(event?.Records) && event.Records[0]?.eventSource === 'aws:sqs') {
      const batchItemFailures = [];
      let n = 0;
      for (const r of event.Records) {
        try {
          let detail = JSON.parse(r.body);
          if (detail?.Type === 'Notification' && typeof detail.Message === 'string') detail = JSON.parse(detail.Message);
          for (const { address, event: e } of sesEvents(detail)) { await store.suppress(address, e); n += 1; }
        } catch (err) {
          log({ suppress_error: err.message });
          batchItemFailures.push({ itemIdentifier: r.messageId });
        }
      }
      log({ ses_events: event.Records.length, suppressed: n, failed: batchItemFailures.length });
      return { batchItemFailures };
    }
    if (event?.source === 'aws.ses' && event.detail) {
      let n = 0;
      for (const { address, event: e } of sesEvents(event.detail)) {
        try { await store.suppress(address, e); n += 1; } catch (err) { log({ suppress_error: err.message }); }
      }
      log({ ses_event: event.detail.eventType, suppressed: n });
      return { suppressed: n };
    }
    if (event?.requestContext?.http) {
      if ((event.rawPath || '/') !== '/unsubscribe') return { statusCode: 404, body: 'not found\n' };
      return unsubscribe(event);
    }
    return { ignored: true };
  }
}

let live;
export async function handler(event) {
  if (!live) {
    const env = process.env;
    const region = env.AWS_REGION || 'us-east-1';
    const sm = jsonProtocol({ target: 'secretsmanager', version: '1.1', region, service: 'secretsmanager' });
    const secret = async (id) => (await sm('GetSecretValue', { SecretId: id })).SecretString;
    const [pepper, unsubscribeSecret] = await Promise.all([secret(env.PEPPER_SECRET_ID), secret(env.UNSUBSCRIBE_SECRET_ID)]);
    const call = jsonProtocol({ target: 'DynamoDB_20120810', region, service: 'dynamodb' });
    live = createHandler({ store: consentStore({ call, table: env.CONSENT_TABLE, pepper }), unsubscribeSecret, log: (o) => console.log(JSON.stringify(o)) });
  }
  return live(event);
}
