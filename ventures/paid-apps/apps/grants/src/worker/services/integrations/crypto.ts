// WebCrypto helpers for integrations (no dependencies):
//  - AES-256-GCM encryption at rest for webhook URLs and Slack response_urls. The key is derived with
//    HKDF-SHA-256 from INTEGRATIONS_KEY when set, else AUTH_SECRET. The ciphertext names its key
//    ("ik1" / "as1") so setting INTEGRATIONS_KEY later does not strand rows encrypted before. The
//    additional data binds each ciphertext to its org and row, so a value copied to another row or
//    org does not decrypt.
//  - Slack request signing (v0, HMAC-SHA256 over `v0:{timestamp}:{raw body}`, 5-minute window).

const enc = new TextEncoder();
const dec = new TextDecoder();

export type KeyId = "ik1" | "as1";

export interface IntegrationSecrets {
  INTEGRATIONS_KEY?: string;
  AUTH_SECRET?: string;
}

export class IntegrationCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationCryptoError";
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
        "deriveKey",
      ]);
      return crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: enc.encode("grant-autopilot/integrations"),
          info: enc.encode("aes-256-gcm/v1"),
        },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    keyCache.set(secret, key);
  }
  return key;
}

function secretFor(env: IntegrationSecrets, id: KeyId): string | undefined {
  const s = id === "ik1" ? env.INTEGRATIONS_KEY : env.AUTH_SECRET;
  return s && s.length >= 16 ? s : undefined;
}

function currentKeyId(env: IntegrationSecrets): KeyId {
  if (secretFor(env, "ik1")) return "ik1";
  if (secretFor(env, "as1")) return "as1";
  throw new IntegrationCryptoError("No INTEGRATIONS_KEY or AUTH_SECRET configured");
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypts `plaintext`; `aad` (e.g. `destination:{orgId}:{id}`) must be given again to decrypt. */
export async function encryptSecret(
  env: IntegrationSecrets,
  plaintext: string,
  aad: string,
): Promise<string> {
  const keyId = currentKeyId(env);
  const key = await deriveKey(secretFor(env, keyId) as string);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
      key,
      enc.encode(plaintext),
    ),
  );
  return `${keyId}.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(
  env: IntegrationSecrets,
  stored: string,
  aad: string,
): Promise<string> {
  const [keyId, ivPart, ctPart, ...rest] = stored.split(".");
  if ((keyId !== "ik1" && keyId !== "as1") || !ivPart || !ctPart || rest.length) {
    throw new IntegrationCryptoError("Malformed ciphertext");
  }
  const secret = secretFor(env, keyId);
  if (!secret) throw new IntegrationCryptoError(`Key ${keyId} is not configured`);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64url(ivPart), additionalData: enc.encode(aad) },
      await deriveKey(secret),
      fromB64url(ctPart),
    );
    return dec.decode(pt);
  } catch {
    throw new IntegrationCryptoError("Decryption failed");
  }
}

// --- Slack request signing --------------------------------------------------------------------

/** Slack's documented replay window: reject timestamps more than 5 minutes from now. */
export const SLACK_MAX_SKEW_SECONDS = 300;

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  let out = "";
  for (const b of sig) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Constant-time comparison (leaks only the length, which is fixed for v0 signatures). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type SlackSignatureResult = "ok" | "missing" | "stale" | "invalid";

/**
 * Verifies `X-Slack-Signature` (`v0=` + hex HMAC-SHA256 of `v0:{ts}:{rawBody}` keyed with the
 * signing secret) and that `X-Slack-Request-Timestamp` is within 5 minutes of `now`. `rawBody` must
 * be the exact bytes Slack sent, before any form parsing.
 */
export async function verifySlackSignature(p: {
  signingSecret: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  rawBody: string;
  now: Date;
}): Promise<SlackSignatureResult> {
  if (!p.timestamp || !p.signature) return "missing";
  if (!/^\d{1,12}$/.test(p.timestamp)) return "invalid";
  const ts = Number(p.timestamp);
  if (Math.abs(Math.floor(p.now.getTime() / 1000) - ts) > SLACK_MAX_SKEW_SECONDS) return "stale";
  const expected = `v0=${await hmacSha256Hex(p.signingSecret, `v0:${p.timestamp}:${p.rawBody}`)}`;
  return timingSafeEqual(expected, p.signature.trim()) ? "ok" : "invalid";
}

/** Test helper and documentation of the scheme: the headers Slack would send for `rawBody`. */
export async function signSlackRequest(signingSecret: string, rawBody: string, nowSeconds: number) {
  const timestamp = String(nowSeconds);
  const signature = `v0=${await hmacSha256Hex(signingSecret, `v0:${timestamp}:${rawBody}`)}`;
  return { "X-Slack-Request-Timestamp": timestamp, "X-Slack-Signature": signature };
}

// --- one-time link codes ----------------------------------------------------------------------

/** Crockford-style alphabet without I, L, O, U (easy to read aloud and retype). */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LINK_CODE_LENGTH = 10;

/** A random 10-character code (50 bits), displayed as "ABCDE-FGHJK". */
export function newLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH));
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % 32];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Uppercases and drops separators/whitespace; null when it cannot be a code. */
export function normalizeLinkCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== LINK_CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export async function hashLinkCode(normalized: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(`link-code:${normalized}`)),
  );
  let out = "";
  for (const b of digest) out += b.toString(16).padStart(2, "0");
  return out;
}
