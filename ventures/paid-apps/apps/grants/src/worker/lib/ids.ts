// Prefixed, URL-safe random ids: e.g. newId("doc") -> "doc_3k9x...". 20 chars of base32 = 100 bits.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export type IdPrefix =
  | "doc"
  | "chk"
  | "fct"
  | "prj"
  | "int"
  | "trn"
  | "fnd"
  | "opp"
  | "dsc"
  | "mat"
  | "app"
  | "ver"
  | "flg"
  | "rev"
  | "fbk"
  | "sub"
  | "fup"
  | "cns"
  | "aud"
  | "exp"
  | "llm"
  | "use"
  | "bev"
  | "org"
  | "job"
  | "mem"
  | "inv"
  | "usr"
  | "prs"
  | "ntf"
  | "prr"
  | "pco"
  | "cal"
  | "att"
  | "slr"
  | "nls";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}
