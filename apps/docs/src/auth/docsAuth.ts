const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 12;

export interface DocsSession {
  expiresAt: number;
}

/** Set to "off" to disable the gate (e.g. local dev). Production should keep the gate on. */
export function isDocsGateEnabled(): boolean {
  const flag = import.meta.env.VITE_DOCS_GATE?.trim().toLowerCase();
  return flag !== "off" && flag !== "false" && flag !== "0";
}

export function getDocsPasscode(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "atelier-docs";
}

export function readSession(): DocsSession | null {
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
