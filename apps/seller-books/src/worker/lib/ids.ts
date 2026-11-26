// Prefixed, URL-safe random ids: e.g. newId("sal") -> "sal_3k9x...". 20 chars of base32 = 100 bits.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export type IdPrefix =
  | "org"
  | "mem"
  | "inv"
  | "imp"
  | "sal"
  | "fee"
  | "chg"
  | "lot"
  | "itm"
  | "mil"
  | "exp"
  | "bev";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}

/** Hex SHA-256 of a string (import file fingerprints, invitation tokens). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 random bytes, base64url: invitation link tokens. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
