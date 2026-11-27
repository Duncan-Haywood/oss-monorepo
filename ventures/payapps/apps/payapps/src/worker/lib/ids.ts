// Prefixed, URL-safe random ids: e.g. newId("prj") -> "prj_3k9x...". 20 chars of base32 = 100 bits.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export type IdPrefix =
  | "org"
  | "mem"
  | "inv"
  | "usr"
  | "prj"
  | "ltw"
  | "sov"
  | "cor"
  | "coi"
  | "pay"
  | "pal"
  | "bev"
  | "lwv"
  | "pmt"
  | "att"
  | "pae"
  | "jev"
  | "aal"
  | "ins"
  | "cdoc"
  | "ich"
  | "ireq"
  | "jcb"
  | "jct"
  | "jce"
  | "jcc"
  | "rfi"
  | "pch"
  | "sca"
  | "hol"
  | "clo"
  | "smt"
  | "est"
  | "esl"
  | "esa"
  | "pli"
  | "dly"
  | "tmt"
  | "tmr";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return `${prefix}_${out}`;
}
