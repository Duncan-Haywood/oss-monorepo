// Prefixed, URL-safe random ids: e.g. newId("rfq") -> "rfq_3k9x...". 20 chars of base32 = 100 bits.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export type IdPrefix =
  | "org"
  | "bev"
  | "usr"
  | "mem"
  | "inv"
  | "mch"
  | "mat"
  | "mpc"
  | "cut"
  | "mrr"
  | "dfd"
  | "fin"
  | "rfq"
  | "rfl"
  | "rfc"
  | "prt"
  | "quo"
  | "qln"
  | "qem"
  | "qlk"
  | "qrs"
  | "qfu"
  | "rtg"
  | "llm"
  | "aal";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}

/** 32 random bytes, base64url: a bearer token (store only its SHA-256). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
