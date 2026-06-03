const SESSION_KEY = "rpi_portal_session";
const SESSION_HOURS = 8;

export interface PortalSession {
  role: "operator" | "owner";
  expiresAt: number;
}

export function getDemoPasscode(): string {
  return import.meta.env.VITE_DEMO_PASSCODE?.trim() || "atelier-demo";
}

export function readSession(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PortalSession;
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

export function createSession(role: PortalSession["role"]): PortalSession {
  const session: PortalSession = {
    role,
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
  return normalized === getDemoPasscode();
}
