// Upload tokens for partner letter links (/letters/:token).
//
// token = base64url(HMAC-SHA256(AUTH_SECRET, "support_letter:v1:{requestId}:{nonce}")) — 256 bits,
// unguessable without the server secret. Only sha256(token) is stored (support_letter_requests.
// request_token_hash) and used for lookup, so a database leak does not reveal working links.
// Re-deriving from (id, nonce) lets reminders resend the same link; rotating the nonce revokes it.
import type { Env } from "../../env";
import { isFake } from "../../env";
import { AppError } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";

export const LETTER_TOKEN_TTL_MS = 30 * 86_400_000;
/** 32 bytes as unpadded base64url. */
export const LETTER_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const DEV_SECRET = "dev-only-support-letter-secret";

function secretFor(env: Env): string {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  if (isFake(env)) return DEV_SECRET;
  throw new AppError(503, "not_configured", "Letter links are not configured (AUTH_SECRET)");
}

function base64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return base64url(b.buffer);
}

export async function deriveLetterToken(
  env: Env,
  requestId: string,
  nonce: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretFor(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`support_letter:v1:${requestId}:${nonce}`),
  );
  return base64url(sig);
}

/** Domain-separated hash used as the lookup key. */
export const hashLetterToken = (token: string) => sha256Hex(`support_letter_token:v1:${token}`);

export const letterUploadUrl = (appUrl: string, token: string) =>
  `${(appUrl ?? "").replace(/\/+$/, "")}/letters/${token}`;
