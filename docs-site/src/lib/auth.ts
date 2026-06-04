export function isAuthConfigured(): boolean {
  return Boolean(process.env.DOCS_SITE_PASSWORD?.trim());
}

export function validateBasicAuth(
  authorization: string | null,
): boolean {
  const password = process.env.DOCS_SITE_PASSWORD?.trim();
  if (!password) return true;

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
  if (!safeEqual(user, expectedUser) || !safeEqual(pass, password)) {
    return false;
  }
  return true;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function unauthorizedResponse(): Response {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ShootFlow Private Docs"',
    },
  });
}
