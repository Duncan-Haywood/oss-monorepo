export const SESSION_COOKIE = "shootflow-docs-session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function getToken(): string | undefined {
  const token = process.env.DOCS_SITE_TOKEN?.trim();
  return token && token.length >= 16 ? token : undefined;
}

export function isAuthConfigured(): boolean {
  return Boolean(getToken());
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyAccessToken(candidate: string): boolean {
  const expected = getToken();
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }
  return timingSafeEqualString(candidate, expected);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signSessionValue(): Promise<string | null> {
  const token = getToken();
  if (!token) {
    return null;
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `v1.${issuedAt}`;
  const sig = await hmacSign(payload, token);
  return `${payload}.${sig}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value) {
    return false;
  }
  const token = getToken();
  if (!token) {
    return process.env.NODE_ENV !== "production";
  }
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    return false;
  }
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > SESSION_MAX_AGE_SEC) {
    return false;
  }
  const payload = `v1.${issuedAt}`;
  const expectedSig = await hmacSign(payload, token);
  return timingSafeEqualString(parts[2], expectedSig);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}
