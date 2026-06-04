/** Edge-safe session token derivation (matches Node login route). */
export async function sessionTokenForPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`shootflow-docs:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isValidSessionToken(
  password: string | undefined,
  token: string | undefined,
): Promise<boolean> {
  if (!password || !token) {
    return false;
  }
  const expected = await sessionTokenForPassword(password);
  return timingSafeEqualString(expected, token);
}

export function docsPasswordConfigured(): boolean {
  return Boolean(process.env.DOCS_SITE_PASSWORD?.trim());
}

export function getDocsPassword(): string | undefined {
  return process.env.DOCS_SITE_PASSWORD?.trim() || undefined;
}

export const DOCS_SESSION_COOKIE = "shootflow_docs_session";
