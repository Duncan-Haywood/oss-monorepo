const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 12;

export interface DocsSession {
  expiresAt: number;
}

export function isAuthSkipped(): boolean {
  return import.meta.env.VITE_DOCS_SKIP_AUTH === "true";
}

export function getDocsPasscode(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "rpi-docs-private";
}

export function readSession(): DocsSession | null {
  if (isAuthSkipped()) {
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
  if (isAuthSkipped()) return true;
  const normalized = input.trim();
  if (!normalized) return false;
  return normalized === getDocsPasscode();
}
