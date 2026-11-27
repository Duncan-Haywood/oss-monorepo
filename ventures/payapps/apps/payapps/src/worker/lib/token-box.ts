// Encrypts integration tokens at rest (QuickBooks OAuth tokens in qbo_connections.tokens_enc).
// AES-256-GCM, key derived from a Worker secret with HKDF-SHA-256, random 96-bit IV per write, and
// the owning org id as additional data, so a row copied to another org fails to decrypt.
// Format: "v1.<base64url iv>.<base64url ciphertext+tag>".

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class TokenBoxError extends Error {
  override name = "TokenBoxError";
}

async function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new TokenBoxError("token key must be at least 32 characters");
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("payapps/token-box"),
      info: enc.encode(purpose),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealJson(
  secret: string,
  purpose: string,
  boundTo: string,
  value: unknown,
): Promise<string> {
  const key = await deriveKey(secret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(boundTo) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function openJson<T>(
  secret: string,
  purpose: string,
  boundTo: string,
  sealed: string,
): Promise<T> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new TokenBoxError("unrecognised token format");
  const key = await deriveKey(secret, purpose);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64url(iv), additionalData: enc.encode(boundTo) },
      key,
      fromB64url(ct),
    );
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new TokenBoxError("stored tokens could not be decrypted (wrong key or wrong owner)");
  }
}

/** Hex SHA-256, for storing single-use values (OAuth state) without the value itself. */
export async function sha256Hex(value: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
