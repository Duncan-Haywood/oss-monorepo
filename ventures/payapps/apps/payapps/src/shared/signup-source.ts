// Which of our own pages sent a new account: the `from` the "Start free" links carry
// (`/?signup&from=pay-app-guides/punch-list`, `from=certified-payroll-calculator`). Recorded once per
// account, shortly after sign-up, so the owner's metrics can say which front door brings companies
// that go on to bill. It is a page name we wrote, never a URL, a referrer header or anything about
// the visitor; anything that does not look like one of our page names is dropped.

/** Lowercase letters, digits, `.`, `_`, `-` and `/`, starting with a letter or digit; at most 80. */
const SHAPE = /^[a-z0-9][a-z0-9._/-]{0,79}$/;

/** The page name a `from` value names, or null when it is missing or not one of ours in shape. */
export function normalizeSignupSource(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/\.html$/, "");
  if (!SHAPE.test(v)) return null;
  // No `..` and no empty or trailing segments: a page name, not a path trick.
  if (v.includes("..") || v.includes("//") || v.endsWith("/")) return null;
  return v;
}

/** The `from` in a location search string, normalized (URLSearchParams decodes `%2F`). */
export function signupSourceFromSearch(search: string): string | null {
  return normalizeSignupSource(new URLSearchParams(search).get("from"));
}

/** An account records its source only this long after it was created (first visit, not later). */
export const SIGNUP_SOURCE_WINDOW_DAYS = 14;

/** The top-level front door a source belongs to: `pay-app-guides/punch-list` → `pay-app-guides`. */
export function signupSourceSite(source: string): string {
  return source.split("/")[0] ?? source;
}
