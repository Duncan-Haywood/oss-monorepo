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

// Must match the salt and iteration count in vite.config.ts.
const PASSCODE_SALT = "retail-pilot-intel/portal/passcode-v2";
const PASSCODE_ITERATIONS = 600_000;

async function derivePasscodeHash(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(PASSCODE_SALT), iterations: PASSCODE_ITERATIONS },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPasscode(input: string): Promise<boolean> {
  const normalized = input.trim();
  if (!normalized) return false;
  const inputHash = await derivePasscodeHash(normalized);
  return inputHash === __DEMO_PASSCODE_HASH__;
}
