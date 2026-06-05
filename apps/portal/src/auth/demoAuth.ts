const SESSION_KEY = "rpi_portal_session";
const SESSION_HOURS = 8;

declare const __DEMO_PASSCODE_HASH__: string;

export interface PortalSession {
  role: "operator" | "owner";
  expiresAt: number;
}

/** Only available in dev builds for the login hint. Never call in production. */
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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPasscode(input: string): Promise<boolean> {
  const normalized = input.trim();
  if (!normalized) return false;
  const inputHash = await sha256Hex(normalized);
  return inputHash === __DEMO_PASSCODE_HASH__;
}
