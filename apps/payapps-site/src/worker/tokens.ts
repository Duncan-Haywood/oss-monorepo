// Random link tokens (32 bytes, base64url) stored only as SHA-256 hashes, plus prefixed ids.

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export const isTokenShape = (token: string) => TOKEN_RE.test(token);

/** Hash with a purpose prefix so a confirm token can never be used as a remove token. */
export async function hashToken(purpose: "confirm" | "remove", token: string): Promise<string> {
  const data = new TextEncoder().encode(`payapps-early-access-${purpose}:${token}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "eas_" + 20 lowercase base-36 characters. */
export function newId(prefix: string): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `${prefix}_${Array.from(bytes, (b) => alphabet[b % 36]).join("")}`;
}
