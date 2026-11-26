// Small crypto helpers for link tokens: random tokens (stored only as a hash) and HMAC-signed tokens
// (verified by recomputing, nothing stored). Web Crypto only, so they run in workerd and Node.

/** base64url without padding. */
export function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes, base64url (43 chars). */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export const RANDOM_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** SHA-256 of a string, base64url (43 chars). */
export async function sha256B64Url(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return base64Url(new Uint8Array(digest));
}

/** HMAC-SHA256(secret, message), base64url (43 chars). */
export async function hmacB64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64Url(new Uint8Array(sig));
}

/** Constant-time string comparison (length is not secret). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
