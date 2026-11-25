// A dependency-free AWS Signature Version 4 client, so the edge Lambda, the
// SES sender and the analytics pull stay zero-dependency like the rest of the
// repository (no SDK in the zip, nothing for a supply-chain scanner to chase).
//
// Credentials come only from the environment the AWS runtime sets for the
// function's execution role (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// AWS_SESSION_TOKEN): short-lived, rotated by AWS, never a long-lived key.
// In CI they come from GitHub OIDC (aws-actions/configure-aws-credentials),
// which sets the same variables.

import { createHash, createHmac } from 'node:crypto';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

// RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone).
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Credentials from the standard environment variables, or null when unset. */
export function envCredentials(env = process.env) {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return null;
  return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN || '' };
}

/** `20150830T123600Z` from a Date. */
export const amzDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Pure: the headers that sign one request. `url` is absolute; `headers` are
 * the ones that will be sent (lower-cased here). Returns the full header set,
 * `authorization` included.
 */
export function signRequest({ method, url, headers = {}, body = '', region, service, credentials, now = new Date(), unsignedPayload = false }) {
  const u = new URL(url);
  const date = amzDate(now);
  const day = date.slice(0, 8);
  const payloadHash = unsignedPayload ? 'UNSIGNED-PAYLOAD' : sha256(body);
  const h = { host: u.host, 'x-amz-date': date };
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  if (credentials.sessionToken) h['x-amz-security-token'] = credentials.sessionToken;
  if (service === 's3') h['x-amz-content-sha256'] = payloadHash;
  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((k) => `${k}:${h[k]}\n`).join('');
  const signedHeaders = names.join(';');
  const pathSegments = u.pathname.split('/').map((seg) => {
    const raw = decodeURIComponent(seg);
    // S3 encodes the key once; every other service encodes the path twice.
    return service === 's3' ? enc(raw) : enc(enc(raw));
  });
  const canonicalQuery = [...u.searchParams].map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [method, pathSegments.join('/') || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  delete h.host; // fetch sets it
  return { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** A signed fetch for one service in one region. */
export function awsClient({ region, service, credentials = envCredentials(), fetchImpl = fetch, endpoint }) {
  const base = endpoint || `https://${service === 'email' ? 'email' : service}.${region}.amazonaws.com`;
  return async function request({ method = 'POST', path = '/', query = '', headers = {}, body = '' }) {
    if (!credentials) throw new Error('no AWS credentials in the environment');
    const url = `${base}${path}${query ? `?${query}` : ''}`;
    const signed = signRequest({ method, url, headers, body, region, service, credentials });
    return fetchImpl(url, { method, headers: signed, body: method === 'GET' || method === 'HEAD' ? undefined : body });
  };
}

/** An AWS JSON-protocol call (DynamoDB, Secrets Manager, CloudWatch): `call('GetItem', input)`. */
export function jsonProtocol({ target, version = '1.0', ...opts }) {
  const request = awsClient(opts);
  return async function call(op, input) {
    const res = await request({
      headers: { 'content-type': `application/x-amz-json-${version}`, 'x-amz-target': `${target}.${op}` },
      body: JSON.stringify(input),
    });
    const text = await res.text();
    const out = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const type = String(out.__type || res.status).split('#').pop();
      const err = new Error(`${opts.service} ${op}: ${type}${out.message || out.Message ? `: ${out.message || out.Message}` : ''}`);
      err.code = type;
      throw err;
    }
    return out;
  };
}
