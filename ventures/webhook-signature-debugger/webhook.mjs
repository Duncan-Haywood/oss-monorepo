// Webhook signature verification and mismatch diagnosis. No network, no storage.
// Works in browsers and Node 18+ (Web Crypto).
const subtle = (globalThis.crypto ?? (await import('node:crypto')).webcrypto).subtle;
const enc = new TextEncoder();

export const PROVIDERS = ['stripe', 'github', 'shopify', 'slack', 'standard'];
export const LABELS = {
  stripe: 'Stripe', github: 'GitHub', shopify: 'Shopify', slack: 'Slack',
  standard: 'Standard Webhooks (Svix, Clerk, Resend, Polar...)',
};
export const TOLERANCE_SECONDS = 300;

const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const toB64 = (u8) => btoa(String.fromCharCode(...u8));
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(hash, keyBytes, msg) {
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', key, enc.encode(msg)));
}
// Length-independent compare so the page does not itself teach a timing leak.
function same(a, b) {
  const x = String(a); const y = String(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

// "Name: value" lines (curl -i, browser devtools, or a framework log) -> lowercase map.
export function parseHeaders(text) {
  const h = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) h[m[1].toLowerCase()] = m[2];
  }
  return h;
}

export function detectProvider(h) {
  if (h['stripe-signature']) return 'stripe';
  if (h['x-hub-signature-256'] || h['x-hub-signature']) return 'github';
  if (h['x-shopify-hmac-sha256']) return 'shopify';
  if (h['x-slack-signature']) return 'slack';
  if (h['webhook-signature'] || h['svix-signature']) return 'standard';
  return null;
}

// What each provider signs and how it encodes the result.
function describe(provider, h) {
  const get = (...names) => names.map((n) => h[n]).find(Boolean) || '';
  if (provider === 'stripe') {
    const raw = get('stripe-signature');
    const parts = raw.split(',').map((p) => p.trim().split('='));
    const t = (parts.find((p) => p[0] === 't') || [])[1] || '';
    const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p.slice(1).join('='));
    return { hash: 'SHA-256', enc: 'hex', ts: t, sigs, signed: (b) => `${t}.${b}`, needsTs: true };
  }
  if (provider === 'github') {
    const sha256 = get('x-hub-signature-256');
    const raw = sha256 || get('x-hub-signature');
    const [algo, ...rest] = raw.split('=');
    return { hash: algo === 'sha1' ? 'SHA-1' : 'SHA-256', enc: 'hex', sigs: [rest.join('=')], signed: (b) => b, legacy: !sha256 };
  }
  if (provider === 'shopify') return { hash: 'SHA-256', enc: 'base64', sigs: [get('x-shopify-hmac-sha256')], signed: (b) => b };
  if (provider === 'slack') {
    const ts = get('x-slack-request-timestamp');
    return { hash: 'SHA-256', enc: 'hex', ts, sigs: [get('x-slack-signature').replace(/^v0=/, '')], signed: (b) => `v0:${ts}:${b}`, needsTs: true };
  }
  const id = get('webhook-id', 'svix-id'); const ts = get('webhook-timestamp', 'svix-timestamp');
  const sigs = get('webhook-signature', 'svix-signature').split(/\s+/).filter(Boolean).map((s) => s.replace(/^v1,/, ''));
  return { hash: 'SHA-256', enc: 'base64', ts, id, sigs, signed: (b) => `${id}.${ts}.${b}`, needsTs: true, svixSecret: true };
}

function bodyVariants(body) {
  const v = [{ label: 'the body exactly as pasted', body }];
  const add = (label, b) => { if (b !== body && !v.some((x) => x.body === b)) v.push({ label, body: b }); };
  add('the body with trailing whitespace/newline removed', body.replace(/\s+$/, ''));
  add('the body with a trailing newline added', body.replace(/\s+$/, '') + '\n');
  add('the body with CRLF line endings turned into LF', body.replace(/\r\n/g, '\n'));
  add('the body with LF line endings turned into CRLF', body.replace(/\r?\n/g, '\r\n'));
  try {
    const parsed = JSON.parse(body);
    add('the JSON re-serialised compactly (what JSON.stringify(req.body) produces)', JSON.stringify(parsed));
    add('the JSON re-serialised with 2-space indent', JSON.stringify(parsed, null, 2));
  } catch { /* not JSON */ }
  return v;
}

function secretVariants(provider, secret) {
  const v = [{ label: 'the secret as typed', key: enc.encode(secret) }];
  const t = secret.trim();
  if (t !== secret) v.push({ label: 'the secret with surrounding whitespace removed', key: enc.encode(t) });
  const m = /^whsec_(.+)$/.exec(t);
  if (provider === 'standard') {
    // The spec: strip the whsec_ prefix, base64-decode the rest, use the bytes.
    try { v.unshift({ label: 'the secret base64-decoded after removing whsec_ (the Standard Webhooks rule)', key: fromB64(m ? m[1] : t) }); } catch { /* not base64 */ }
  } else if (m) {
    v.push({ label: 'the secret without its whsec_ prefix', key: enc.encode(m[1]) });
  }
  return v;
}

// opts: { provider, headers (object or text), body, secret, now (ms) }
export async function verify(opts) {
  const headers = typeof opts.headers === 'string' ? parseHeaders(opts.headers) : (opts.headers || {});
  const provider = opts.provider || detectProvider(headers);
  const out = { provider, ok: false, matched: null, findings: [], expected: null, received: null };
  const add = (severity, message) => out.findings.push({ severity, message });
  if (!provider || !PROVIDERS.includes(provider)) { add('error', 'Could not tell which provider sent this. Include its signature header (for example Stripe-Signature or X-Hub-Signature-256) or choose a provider.'); return out; }
  const d = describe(provider, headers);
  const body = String(opts.body ?? '');
  const secret = String(opts.secret ?? '');
  if (!d.sigs.length || !d.sigs.some(Boolean)) add('error', 'The signature header is missing or empty. Paste the header lines exactly as received.');
  if (!secret) add('error', 'No signing secret supplied.');
  if (!body) add('error', 'No request body supplied. Signatures cover the raw body, so it must be pasted byte-for-byte.');
  if (d.needsTs && !d.ts) add('error', provider === 'stripe' ? 'The Stripe-Signature header has no t= timestamp.' : 'The timestamp header is missing; it is part of what is signed.');
  if (provider === 'standard' && !d.id) add('error', 'The webhook-id (or svix-id) header is missing; it is part of what is signed.');
  if (out.findings.some((f) => f.severity === 'error')) return out;

  out.received = d.sigs[0];
  const tryAll = [];
  for (const sv of secretVariants(provider, secret)) {
    for (const bv of bodyVariants(body)) tryAll.push({ sv, bv });
  }
  for (const { sv, bv } of tryAll) {
    const mac = await hmac(d.hash, sv.key, d.signed(bv.body));
    const got = d.enc === 'hex' ? toHex(mac) : toB64(mac);
    if (!out.expected) out.expected = got; // the as-typed / as-pasted candidate
    if (d.sigs.some((s) => same(got, s))) {
      out.matched = { secret: sv.label, body: bv.label };
      out.ok = sv === tryAll[0].sv && bv === tryAll[0].bv;
      break;
    }
  }
  const defaultSecret = secretVariants(provider, secret)[0].label;
  if (out.ok) add('ok', 'Signature verified: the HMAC of this body with this secret equals the header.');
  else if (out.matched) {
    add('error', `Signature does not verify as given, but it does with ${out.matched.body === 'the body exactly as pasted' ? 'the body as pasted' : out.matched.body}${out.matched.secret === defaultSecret ? '' : ` and ${out.matched.secret}`}.`);
    if (out.matched.body !== 'the body exactly as pasted') add('info', 'Your server is hashing a different byte sequence than the provider sent. Verify against the raw request bytes, before any JSON parser or body middleware touches them (in Express use express.raw({ type: "application/json" }) on this route; in Next.js read request.text()).');
    if (out.matched.secret !== defaultSecret) add('info', 'The secret is being used in a different form than the one you supplied; see the provider notes below.');
  } else {
    add('error', 'No signature matched, including after trying common body and secret variations. The most likely cause is the wrong secret.');
    add('info', provider === 'stripe' ? 'Stripe has a different whsec_ secret per endpoint, and a different one for `stripe listen` than for a dashboard endpoint, and for test versus live mode. Use the one for the endpoint that sent this event.' : 'Check that you copied the secret for this exact endpoint/app and environment (test vs live, staging vs production) and that nothing has rotated it.');
    add('info', 'If the body was copied from a log or a browser, it may have been re-formatted; capture it from the raw request instead.');
  }
  if (d.ts && /^\d+$/.test(d.ts)) {
    const now = (opts.now ?? Date.now()) / 1000;
    const age = Math.abs(now - Number(d.ts));
    if (age > TOLERANCE_SECONDS) add('info', `The timestamp is ${Math.round(age)} seconds from now, outside the ${TOLERANCE_SECONDS}s tolerance Stripe, Slack and Standard Webhooks libraries enforce, so a real server would reject a replay of this request even though the signature is valid. This is expected when debugging with an old request.`);
  } else if (d.needsTs && d.ts) add('warn', `The timestamp "${d.ts}" is not a Unix-seconds integer.`);
  if (d.legacy) add('warn', 'Only the legacy SHA-1 X-Hub-Signature header was supplied. Use X-Hub-Signature-256.');
  if (d.sigs.length > 1) add('info', `${d.sigs.length} signatures present (secret rotation); verification succeeds if any one matches.`);
  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  out.findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}

// Reference implementation snippets (Node). The `raw` body requirement is the point.
export function snippet(provider) {
  const common = `import crypto from 'node:crypto';\n// raw = the unparsed request body (Buffer or string), NOT JSON.stringify(req.body)\nconst safe = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));\n`;
  const s = {
    stripe: `${common}export function verifyStripe(raw, header, secret, now = Date.now() / 1000) {\n  const p = Object.fromEntries(header.split(',').map((x) => x.split('=')));\n  if (Math.abs(now - Number(p.t)) > 300) return false;\n  const mac = crypto.createHmac('sha256', secret).update(\`\${p.t}.\${raw}\`).digest('hex');\n  return header.split(',').some((x) => x.startsWith('v1=') && safe(mac, x.slice(3)));\n}`,
    github: `${common}export const verifyGitHub = (raw, header, secret) =>\n  safe('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'), header);`,
    shopify: `${common}export const verifyShopify = (raw, header, secret) =>\n  safe(crypto.createHmac('sha256', secret).update(raw).digest('base64'), header);`,
    slack: `${common}export function verifySlack(raw, ts, header, secret, now = Date.now() / 1000) {\n  if (Math.abs(now - Number(ts)) > 300) return false;\n  return safe('v0=' + crypto.createHmac('sha256', secret).update(\`v0:\${ts}:\${raw}\`).digest('hex'), header);\n}`,
    standard: `${common}export function verifyStandard(raw, id, ts, header, whsec) {\n  const key = Buffer.from(whsec.replace(/^whsec_/, ''), 'base64');\n  const mac = crypto.createHmac('sha256', key).update(\`\${id}.\${ts}.\${raw}\`).digest('base64');\n  return header.split(' ').some((x) => safe(mac, x.replace(/^v1,/, '')));\n}`,
  };
  return s[provider] || '';
}

// Sign a payload (for generating test fixtures / replaying locally).
export async function sign(provider, { body, secret, ts = String(Math.floor(Date.now() / 1000)), id = 'msg_test' }) {
  if (provider === 'stripe') return { 'Stripe-Signature': `t=${ts},v1=${toHex(await hmac('SHA-256', enc.encode(secret), `${ts}.${body}`))}` };
  if (provider === 'github') return { 'X-Hub-Signature-256': `sha256=${toHex(await hmac('SHA-256', enc.encode(secret), body))}` };
  if (provider === 'shopify') return { 'X-Shopify-Hmac-Sha256': toB64(await hmac('SHA-256', enc.encode(secret), body)) };
  if (provider === 'slack') return { 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': `v0=${toHex(await hmac('SHA-256', enc.encode(secret), `v0:${ts}:${body}`))}` };
  const key = fromB64(secret.replace(/^whsec_/, ''));
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${toB64(await hmac('SHA-256', key, `${id}.${ts}.${body}`))}` };
}
