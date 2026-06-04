export type DocsAuthConfig = {
  username: string;
  password: string;
  /** When true, unauthenticated requests receive 401 (no public pages). */
  enforce: boolean;
};

export function loadDocsAuthConfig(): DocsAuthConfig | null {
  const username = process.env.DOCS_AUTH_USER?.trim();
  const password = process.env.DOCS_AUTH_PASSWORD?.trim();
  if (!username || !password) return null;
  return {
    username,
    password,
    enforce: process.env.DOCS_AUTH_ENFORCE !== "false",
  };
}

export function parseBasicAuth(
  header: string | null,
): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return {
      username: decoded.slice(0, sep),
      password: decoded.slice(sep + 1),
    };
  } catch {
    return null;
  }
}

export function credentialsMatch(
  provided: { username: string; password: string } | null,
  expected: DocsAuthConfig,
): boolean {
  if (!provided) return false;
  return (
    provided.username === expected.username &&
    provided.password === expected.password
  );
}
