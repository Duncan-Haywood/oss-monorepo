const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 8;

export interface DocsSession {
  expiresAt: number;
}

/** Skip gate in local dev unless VITE_DOCS_REQUIRE_AUTH=true. Always on in production builds. */
export function isDocsAuthRequired(): boolean {
  if (import.meta.env.VITE_DOCS_REQUIRE_AUTH === "false") return false;
  if (import.meta.env.DEV && import.meta.env.VITE_DOCS_REQUIRE_AUTH !== "true") {
    return false;
  }
  return true;
}

export function getDocsPasscode(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "pilot-docs";
}

export function readDocsSession(): DocsSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as DocsSession;
    if (session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function createDocsSession(): DocsSession {
  const session: DocsSession = {
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearDocsSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function verifyDocsPasscode(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  return normalized === getDocsPasscode();
}
