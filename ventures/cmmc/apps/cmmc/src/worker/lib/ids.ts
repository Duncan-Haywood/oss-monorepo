// Prefixed, URL-safe random ids: e.g. newId("evd") -> "evd_3k9x...". 20 chars of base32 = 100 bits.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export type IdPrefix =
  | "org"
  | "per"
  | "mem"
  | "usr"
  | "ctl"
  | "evd"
  | "poa"
  | "aud"
  | "bev"
  | "aff"
  | "qcl"
  | "qln"
  | "aal"
  | "ast"
  | "esp"
  | "sup"
  | "pol"
  | "pev"
  | "ppd"
  | "doc"
  | "dev"
  | "iau"
  | "afn"
  | "cap";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}
