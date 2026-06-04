const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 12;

export interface DocsSession {
  expiresAt: number;
}

export function getDocsPasscode(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "pilot-docs";
}

/** When false, the gate is skipped (local dev only — set explicitly). */
export function isDocsGateEnabled(): boolean {
  const flag = import.meta.env.VITE_DOCS_GATE_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return import.meta.env.PROD;
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
