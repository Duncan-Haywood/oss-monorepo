// Password hashing for Better Auth. Its default scrypt can exceed the Workers CPU budget, so we use
// WebCrypto PBKDF2-SHA256 (100k iterations — the workerd maximum — random 16-byte salt).
// Stored format: `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`.

const ALGO = "pbkdf2-sha256";
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Constant-time comparison (no early exit on the first differing byte). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${ALGO}$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== ALGO) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
    return false;
  }
  try {
    const salt = fromB64(parts[2] ?? "");
    const expected = fromB64(parts[3] ?? "");
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
