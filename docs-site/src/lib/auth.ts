export const SESSION_COOKIE = "docs_session";
export const TOKEN_SESSION_COOKIE = "shootflow-docs-session";
const TOKEN_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const PASSWORD_SESSION_MAX_AGE_SEC = 60 * 60 * 12;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.DOCS_SITE_PASSWORD?.trim());
}

export function tokenConfigured(): boolean {
  const token = process.env.DOCS_SITE_TOKEN?.trim();
  return Boolean(token && token.length >= 16);
}

export function isAuthConfigured(): boolean {
  return passwordConfigured() || tokenConfigured();
}

export function validateBasicAuth(authorization: string | null): boolean {
  const password = process.env.DOCS_SITE_PASSWORD?.trim();
  if (!password) return false;

  if (!authorization?.startsWith("Basic ")) return false;

  const encoded = authorization.slice("Basic ".length);
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const pass = colon >= 0 ? decoded.slice(colon + 1) : "";

  const expectedUser =
    process.env.DOCS_SITE_USERNAME?.trim() || "shootflow";
  return safeEqual(user, expectedUser) && safeEqual(pass, password);
}

export async function hasPasswordSession(
  session: string | undefined,
): Promise<boolean> {
  const secret = process.env.DOCS_SITE_SESSION_SECRET?.trim();
  if (!secret || !session) return false;
  const parts = session.split(".");
  if (parts.length !== 3 || parts[0] !== "pw1") return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > PASSWORD_SESSION_MAX_AGE_SEC) return false;
  const expectedSig = await hmacSign(`pw1.${issuedAt}`, secret);
  return safeEqual(parts[2], expectedSig);
}

export async function signPasswordSessionValue(): Promise<string | null> {
  const secret = process.env.DOCS_SITE_SESSION_SECRET?.trim();
  if (!secret) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `pw1.${issuedAt}`;
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifyAccessToken(candidate: string): boolean {
  const expected = process.env.DOCS_SITE_TOKEN?.trim();
  if (!expected) return false;
  return safeEqual(candidate, expected);
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
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function signTokenSessionValue(): Promise<string | null> {
  const token = process.env.DOCS_SITE_TOKEN?.trim();
  if (!token) return null;
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `v1.${issuedAt}`;
  const sig = await hmacSign(payload, token);
  return `${payload}.${sig}`;
}

export async function verifyTokenSessionValue(
  value: string | undefined,
): Promise<boolean> {
  if (!value) return false;
  const token = process.env.DOCS_SITE_TOKEN?.trim();
  if (!token) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) return false;
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  if (age < 0 || age > TOKEN_SESSION_MAX_AGE_SEC) return false;
  const expectedSig = await hmacSign(`v1.${issuedAt}`, token);
  return safeEqual(parts[2], expectedSig);
}

export function tokenSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_SESSION_MAX_AGE_SEC,
  };
}

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}

export function unauthorizedResponse(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ShootFlow Private Docs"',
    },
  });
}
