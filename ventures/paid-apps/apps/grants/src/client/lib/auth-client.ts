// Better Auth browser client. Session lives in an HttpOnly cookie; this only calls /api/auth/*.
import { createAuthClient } from "better-auth/react";
import { apiUrl } from "./base-path";

const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";

export const authClient = createAuthClient({ baseURL: `${origin}${apiUrl("/api/auth")}` });

/** Only allow same-site relative redirect targets ("/orgs/x"), never "//evil" or "https://evil". */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

/** Read `?next=` from the current URL (validated). */
export function readNextParam(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("next");
  const v = safeNext(raw, "");
  return v || null;
}
