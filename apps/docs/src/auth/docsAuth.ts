const SESSION_KEY = "rpi_docs_session";
const SESSION_HOURS = 12;

declare const __DOCS_PASSCODE_HASH__: string;

export interface DocsSession {
  expiresAt: number;
}

/** Only available in dev builds for the login hint. Never call in production. */
export function getDocsPasscodeForDevHint(): string {
  return import.meta.env.VITE_DOCS_PASSCODE?.trim() || "pilot-docs";
}

/** When false, the gate is skipped (local dev only — set explicitly). */
export function isDocsGateEnabled(): boolean {
  const requireAuth = import.meta.env.VITE_DOCS_REQUIRE_AUTH?.trim().toLowerCase();
  if (requireAuth === "true" || requireAuth === "1") return true;

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

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyDocsPasscode(input: string): Promise<boolean> {
  const normalized = input.trim();
  if (!normalized) return false;
  const inputHash = await sha256Hex(normalized);
  return inputHash === __DOCS_PASSCODE_HASH__;
}
