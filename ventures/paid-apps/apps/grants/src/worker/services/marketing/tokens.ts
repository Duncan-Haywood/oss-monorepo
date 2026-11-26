// Newsletter link tokens.
//
// - Confirmation (double opt-in): 32 random bytes; only the SHA-256 (hex) is stored, with an expiry.
// - Unsubscribe: `u1.{subscriberId}.{hmac}`, HMAC-SHA256 over the id with the token secret. Every
//   marketing email needs a working unsubscribe link, so the token is derived, not stored: nothing in
//   the database can be replayed, and a forged id fails the signature check.
import { NEWSLETTER_UNSUBSCRIBE_PREFIX } from "@shared/newsletter";
import { sha256Hex } from "../../lib/hash";
import { hmacB64Url, RANDOM_TOKEN_RE, randomToken, timingSafeEqual } from "../../lib/signed-token";

export const generateConfirmToken = randomToken;
export const isConfirmTokenShape = (t: string) => RANDOM_TOKEN_RE.test(t);
export const hashConfirmToken = (token: string) => sha256Hex(`newsletter-confirm:${token}`);

const SUBSCRIBER_ID_RE = /^nls_[0-9a-z]{20}$/;
const unsubscribeMessage = (subscriberId: string) => `newsletter-unsubscribe:v1:${subscriberId}`;

export async function newsletterUnsubscribeToken(
  secret: string,
  subscriberId: string,
): Promise<string> {
  const sig = await hmacB64Url(secret, unsubscribeMessage(subscriberId));
  return `${NEWSLETTER_UNSUBSCRIBE_PREFIX}${subscriberId}.${sig}`;
}

/** The subscriber id a valid token names, or null (wrong shape or bad signature). */
export async function verifyNewsletterUnsubscribeToken(
  secret: string,
  token: string,
): Promise<string | null> {
  if (!token.startsWith(NEWSLETTER_UNSUBSCRIBE_PREFIX)) return null;
  const [id, sig, ...rest] = token.slice(NEWSLETTER_UNSUBSCRIBE_PREFIX.length).split(".");
  if (!id || !sig || rest.length > 0 || !SUBSCRIBER_ID_RE.test(id)) return null;
  const expected = await hmacB64Url(secret, unsubscribeMessage(id));
  return timingSafeEqual(sig, expected) ? id : null;
}
