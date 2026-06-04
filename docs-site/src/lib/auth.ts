const COOKIE_NAME = "shootflow_docs_session";

export function isAuthConfigured(): boolean {
  return Boolean(process.env.DOCS_ACCESS_PASSWORD?.trim());
}

export function getExpectedPassword(): string | null {
  const password = process.env.DOCS_ACCESS_PASSWORD?.trim();
  return password || null;
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function sessionTokenForPassword(password: string): string | null {
  const secret = process.env.DOCS_SESSION_SECRET?.trim();
  if (!secret) return null;
  const payload = `${password}:${secret}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expectedPassword = getExpectedPassword();
  const secret = process.env.DOCS_SESSION_SECRET?.trim();
  if (!expectedPassword || !secret) return false;
  const expected = sessionTokenForPassword(expectedPassword);
  return Boolean(expected && token === expected);
}

export function basicAuthPassword(authorizationHeader: string | null): string | null {
  if (!authorizationHeader?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorizationHeader.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

export function isAuthorizedRequest(
  cookieToken: string | undefined,
  authorizationHeader: string | null,
): boolean {
  if (!isAuthConfigured()) {
    return process.env.NODE_ENV !== "production";
  }

  if (isValidSessionToken(cookieToken)) {
    return true;
  }

  const expectedPassword = getExpectedPassword();
  const basicPassword = basicAuthPassword(authorizationHeader);
  if (expectedPassword && basicPassword === expectedPassword) {
    return true;
  }

  return false;
}
