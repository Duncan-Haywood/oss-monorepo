// Signed one-click unsubscribe tokens: `<payload>.<sig>`, where the payload is
// base64url JSON `{a: address, s: stream}` and the signature an HMAC-SHA256
// over it (truncated to 128 bits). A token only ever unsubscribes; it cannot
// subscribe anyone or read anything, so a leaked one does no more than the
// owner of the address could.

import { createHmac, timingSafeEqual } from 'node:crypto';

const sig = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url').slice(0, 22);

export function unsubscribeToken(secret, address, stream) {
  if (!secret) throw new Error('unsubscribe secret is not set');
  const payload = Buffer.from(JSON.stringify({ a: address, s: stream })).toString('base64url');
  return `${payload}.${sig(secret, payload)}`;
}

/** `{ address, stream }` for a valid token, else null. */
export function readUnsubscribeToken(secret, token) {
  const [payload, given] = String(token || '').split('.');
  if (!secret || !payload || !given) return null;
  const want = Buffer.from(sig(secret, payload));
  const got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { a, s } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof a === 'string' && typeof s === 'string' ? { address: a, stream: s } : null;
  } catch {
    return null;
  }
}
