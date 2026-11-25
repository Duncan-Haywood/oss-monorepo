// The edge API on AWS Lambda: the same `worker.mjs` fetch handler the
// Cloudflare Worker runs, wrapped for two kinds of event.
//
//   HTTP   a Lambda function URL request (payload 2.0), arriving through
//          CloudFront. It becomes a web-standard Request, `worker.fetch`
//          answers it with the DynamoDB store, and the Response goes back.
//   SES    an inbound-mail receipt (`platform/aws/stacks/email-ops/`): SES has already
//          written the message to S3; this reads it back (capped) and hands
//          it to the same `receiveEmail` the Worker's `email()` handler uses.
//
// What differs from the Worker, and why:
//
// - Origin check. The function URL is public (CloudFront's origin access
//   control for Lambda needs browsers to sign POST bodies, which a page-view
//   beacon cannot), so CloudFront adds a secret `x-origin-verify` header and
//   every request without it is refused. Traffic therefore always passes
//   CloudFront and its WAF. The secret lives in Secrets Manager.
// - Country comes from `cloudfront-viewer-country`, the sender address from
//   `cloudfront-viewer-address`. Client-sent copies of the headers the
//   Worker trusts (`cf-connecting-ip`, `x-edge-client-ip`) are dropped first.
// - The per-sender limit (3 a minute) is a DynamoDB counter keyed by an HMAC
//   of the address, which expires within two minutes: no address is stored.
// - INBOX_TOKEN comes from Secrets Manager, not a Worker secret.
//
// Caps are unchanged (FEEDBACK_DAILY_CAP, MAX_PER_SLUG_PER_DAY,
// INBOX_DAILY_CAP); spend is capped by the function's reserved concurrency
// and the WAF rate rule (`platform/aws/stacks/edge-api/README.md`).

import { createHmac } from 'node:crypto';
import worker from '../worker.mjs';
import { receiveEmail, sameSecret, MAX_RAW } from '../inbox.mjs';
import { dynamoStore } from './dynamo-store.mjs';
import { awsClient, jsonProtocol } from './sigv4.mjs';

export const FEEDBACK_LIMIT = { limit: 3, periodSec: 60 };
// Headers only CloudFront or this adapter may set.
const TRUSTED = ['cf-connecting-ip', 'x-edge-client-ip', 'x-origin-verify'];

/** The viewer's IP from CloudFront's `ip:port` (or `[v6]:port`) header. */
export function viewerIp(address = '') {
  const v6 = address.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1];
  const i = address.lastIndexOf(':');
  return i > 0 && address.indexOf(':') === i ? address.slice(0, i) : address;
}

/**
 * Pure: a function-URL event to a web Request (with `cf.country` set).
 * `prefix` is the path CloudFront routes to this origin (`/_edge` by default:
 * the site stack sends `/_edge/*` here), removed so the Worker's routes match.
 */
export function toRequest(event, { host = 'edge.invalid', prefix = '' } = {}) {
  const method = event.requestContext?.http?.method || 'GET';
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (!TRUSTED.includes(k.toLowerCase())) headers.set(k, v);
  }
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '));
  const ip = viewerIp(event.headers?.['cloudfront-viewer-address'] || '');
  if (ip) headers.set('x-edge-client-ip', ip);
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const body = method === 'GET' || method === 'HEAD' || event.body == null
    ? undefined
    : event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  let p = event.rawPath || '/';
  if (prefix && (p === prefix || p.startsWith(`${prefix}/`))) p = p.slice(prefix.length) || '/';
  const request = new Request(`https://${host}${p}${qs}`, { method, headers, body });
  const country = event.headers?.['cloudfront-viewer-country'];
  Object.defineProperty(request, 'cf', { value: country ? { country } : {} });
  return request;
}

/** A web Response to the function-URL result shape. */
export async function fromResponse(res) {
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { statusCode: res.status, headers, body: await res.text(), isBase64Encoded: false };
}

/** A Cloudflare-style email message from an SES receipt, read back from S3. */
export async function sesMessage(record, { getObject, bucket, prefix = '' }) {
  const { mail, receipt } = record.ses;
  const headers = new Headers();
  for (const { name, value } of mail.headers || []) {
    try { headers.append(name, value); } catch { /* a header the Fetch spec refuses is skipped */ }
  }
  const raw = await getObject(bucket, `${prefix}${mail.messageId}`, MAX_RAW);
  const msg = {
    from: mail.source,
    to: (receipt.recipients || mail.destination || [])[0] || '',
    headers,
    raw,
    rejected: null,
    setReject(why) { msg.rejected = why; },
  };
  return msg;
}

/** SES's own verdicts: spam, virus and failed DMARC (p=reject) mail is not stored. */
export function sesVerdictDrop(receipt = {}) {
  if (receipt.spamVerdict?.status === 'FAIL') return 'spam';
  if (receipt.virusVerdict?.status === 'FAIL') return 'virus';
  if (receipt.dmarcVerdict?.status === 'FAIL' && receipt.dmarcPolicy === 'REJECT') return 'dmarc';
  return '';
}

/**
 * Build the handler. `deps` is injected in tests; `fromEnvironment` builds
 * the real one. `secrets()` resolves `{ originVerify, inboxToken }` once.
 */
export function createHandler({ store, secrets, getObject, config = {}, now = () => Date.now(), log = () => {} }) {
  let cached;
  const loadSecrets = async () => (cached ||= await secrets());

  async function http(event) {
    const s = await loadSecrets();
    const presented = event.headers?.['x-origin-verify'] || '';
    if (!s.originVerify || !sameSecret(presented, s.originVerify)) {
      return { statusCode: 403, headers: { 'content-type': 'text/plain' }, body: 'forbidden\n', isBase64Encoded: false };
    }
    const env = {
      STORE: store,
      ALLOWED_ORIGIN: config.ALLOWED_ORIGIN || '',
      FEEDBACK_DAILY_CAP: config.FEEDBACK_DAILY_CAP,
      MAX_PER_SLUG_PER_DAY: config.MAX_PER_SLUG_PER_DAY,
      INBOX_DAILY_CAP: config.INBOX_DAILY_CAP,
      INBOX_RETENTION_DAYS: config.INBOX_RETENTION_DAYS,
      INBOX_TOKEN: s.inboxToken || '',
      FEEDBACK_LIMITER: {
        async limit({ key }) {
          const hashed = createHmac('sha256', s.originVerify).update(String(key)).digest('base64url').slice(0, 22);
          return { success: await store.rateLimit(hashed, FEEDBACK_LIMIT.limit, FEEDBACK_LIMIT.periodSec, now()) };
        },
      },
    };
    return fromResponse(await worker.fetch(toRequest(event, { host: config.HOST, prefix: config.PATH_PREFIX }), env));
  }

  async function ses(record) {
    const drop = sesVerdictDrop(record.ses.receipt);
    if (drop) { log({ inbox: 'dropped', why: drop }); return; }
    const msg = await sesMessage(record, { getObject, bucket: config.INBOX_BUCKET, prefix: config.INBOX_PREFIX });
    const env = { STORE: store, INBOX_DAILY_CAP: config.INBOX_DAILY_CAP, INBOX_RETENTION_DAYS: config.INBOX_RETENTION_DAYS };
    await receiveEmail(msg, env, new Date(now()));
    // SES has already accepted the mail, so a refusal here cannot bounce it;
    // it is logged (without the message) and the S3 copy expires in a day.
    log(msg.rejected ? { inbox: 'refused', why: msg.rejected } : { inbox: 'stored' });
  }

  return async function handler(event) {
    if (Array.isArray(event?.Records) && event.Records[0]?.eventSource === 'aws:ses') {
      for (const r of event.Records) await ses(r);
      return { disposition: 'CONTINUE' };
    }
    return http(event);
  };
}

/** S3 GetObject of at most `limit` bytes, as a stream (null when it is missing). */
export function s3Reader({ region, request = null }) {
  return async (bucket, key, limit) => {
    const get = request || awsClient({ region, service: 's3', endpoint: `https://${bucket}.s3.${region}.amazonaws.com` });
    const res = await get({ method: 'GET', path: `/${key.split('/').map(encodeURIComponent).join('/')}`, headers: { range: `bytes=0-${limit}` } });
    if (!res.ok) throw new Error(`s3 GetObject ${res.status}`);
    return res.body;
  };
}

/** The real dependencies, from the function's environment variables. */
export function fromEnvironment(env = process.env) {
  const region = env.AWS_REGION || 'us-east-1';
  const ddb = jsonProtocol({ target: 'DynamoDB_20120810', region, service: 'dynamodb' });
  const sm = jsonProtocol({ target: 'secretsmanager', version: '1.1', region, service: 'secretsmanager' });
  const secret = async (id) => (id ? (await sm('GetSecretValue', { SecretId: id })).SecretString : '');
  return {
    store: dynamoStore({ call: ddb, table: env.TABLE_NAME, retentionDays: Number(env.INBOX_RETENTION_DAYS) || 90 }),
    secrets: async () => ({ originVerify: await secret(env.ORIGIN_VERIFY_SECRET_ID), inboxToken: await secret(env.INBOX_TOKEN_SECRET_ID) }),
    getObject: s3Reader({ region }),
    config: env,
    log: (o) => console.log(JSON.stringify(o)),
  };
}

let live;
/** The Lambda entry point (`edge/aws/lambda.handler`). */
export const handler = (event) => (live ||= createHandler(fromEnvironment()))(event);
