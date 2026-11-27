// Where to send the user after sign-in or email confirmation (`?next=`, or the value saved before
// sign-up). The value comes from the URL or browser storage, so it is untrusted: it is parsed
// against our own origin and kept only when it resolves there. A prefix check is not enough:
// "/\evil.example" passes startsWith("/") && !startsWith("//") yet browsers resolve it off-site.

/** The same-origin path (path, query, hash) that `next` names, or null for anything else. */
export function sameOriginPath(next: string | null | undefined, origin: string): string | null {
  if (!next?.startsWith("/")) return null;
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** sameOriginPath against this page's origin, falling back to `fallback`. */
export function safeNext(next: string | null | undefined, fallback = "/orgs"): string {
  if (typeof window === "undefined") return fallback;
  return sameOriginPath(next, window.location.origin) ?? fallback;
}
