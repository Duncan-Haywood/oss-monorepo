const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 8;

export interface DocsSession {
  expiresAt: number;
}

export function getDocsPasscode(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "atelier-docs";
}

export function isDocsAuthDisabled(): boolean {
  return import.meta.env.VITE_DOCS_AUTH_DISABLED === "true";
}

export function readSession(): DocsSession | null {
  if (isDocsAuthDisabled()) {
    return { expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000 };
  }
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

export function createSession(): DocsSession {
  const session: DocsSession = {
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function verifyPasscode(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  return normalized === getDocsPasscode();
}
