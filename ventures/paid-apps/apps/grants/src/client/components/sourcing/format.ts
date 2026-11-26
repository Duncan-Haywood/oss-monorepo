// Pure helpers for the grant sourcing UI: labels/tones, sorting, date conversion, error messages.
import type { Tone } from "@client/components/ui";
import { ApiError } from "@client/lib/api";
import type {
  FunderProfileDto,
  ProspectApproach,
  ProspectItem,
  ProspectStatus,
  WatchEventKind,
  WatchSourceDto,
  WatchSourceKind,
  WatchSourceStatus,
} from "./types";

export const WATCH_KIND_LABEL: Record<WatchSourceKind, string> = {
  rfp_page: "RFP / program page",
  rss: "RSS or Atom feed",
  listing_page: "Grant listing page",
};

export const WATCH_STATUS_META: Record<
  WatchSourceStatus,
  { label: string; tone: Tone; description: string }
> = {
  active: { label: "Active", tone: "success", description: "Checked on schedule" },
  paused: { label: "Paused", tone: "warning", description: "Not being checked" },
  error: { label: "Error", tone: "danger", description: "The last check failed" },
  blocked_by_robots: {
    label: "Blocked by robots.txt",
    tone: "danger",
    description: "The site asks automated tools not to visit this page, so we don't",
  },
};

export const WATCH_EVENT_META: Record<WatchEventKind, { label: string; tone: Tone }> = {
  opportunity_found: { label: "Opportunity found", tone: "success" },
  changed: { label: "Page changed", tone: "info" },
  error: { label: "Check failed", tone: "danger" },
};

export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  new: "New",
  researching: "Researching",
  contacted: "Contacted",
  applied: "Applied",
  declined: "Declined",
  not_a_fit: "Not a fit",
};

/** Prospects the org is no longer pursuing (hidden by the default "Active" filter). */
export const CLOSED_PROSPECT_STATUSES: readonly ProspectStatus[] = ["declined", "not_a_fit"];

/** Platform-curated sources, shared with every org. */
export const isPlatformSource = (s: Pick<WatchSourceDto, "orgId" | "scope">) =>
  s.scope === "platform" || s.orgId == null;

/** Whether this viewer can't check, pause or remove the source (server decides via `readOnly`). */
export const isReadOnlySource = (s: Pick<WatchSourceDto, "orgId" | "scope" | "readOnly">) =>
  s.readOnly ?? isPlatformSource(s);

export const PROSPECT_APPROACH_LABEL: Record<ProspectApproach, { label: string; hint: string }> = {
  letter_of_inquiry: {
    label: "Letter of inquiry",
    hint: "This foundation appears to accept letters of inquiry. Check its guidelines first.",
  },
  wait_for_rfp: {
    label: "Wait for an RFP",
    hint: "This foundation appears to fund through published calls. Watch its website for one.",
  },
  research_first: {
    label: "Research first",
    hint: "It's not clear how this foundation accepts requests. Research before reaching out.",
  },
};

/** "grants.example.org/programs" — a readable name for a URL when there is no label. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

export const sourceName = (s: Pick<WatchSourceDto, "label" | "funderName" | "url">) =>
  s.label?.trim() || s.funderName?.trim() || displayUrl(s.url);

/** Accepts only absolute http(s) URLs with a dotted host. Returns the normalized URL or null. */
export function normalizeHttpUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** The joined funder profile, whether nested under `funder`/`profile` or flattened. */
export function funderOf(p: ProspectItem): FunderProfileDto {
  const nested = p.funder ?? p.profile;
  if (nested) return nested;
  return {
    name: p.name ?? `EIN ${p.ein}`,
    city: p.city ?? null,
    state: p.state ?? null,
    nteeCode: p.nteeCode ?? null,
    totalAssetsCents: p.totalAssetsCents ?? null,
    totalGivingCents: p.totalGivingCents ?? null,
    latestFilingYear: p.latestFilingYear ?? null,
    website: p.website ?? null,
    propublicaUrl: p.propublicaUrl ?? null,
  };
}

/** Highest fit first; ties broken by larger annual giving, then name. Does not mutate. */
export function sortProspectsByFit(items: readonly ProspectItem[]): ProspectItem[] {
  return [...items].sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    const ga = funderOf(a).totalGivingCents ?? -1;
    const gb = funderOf(b).totalGivingCents ?? -1;
    if (gb !== ga) return gb - ga;
    return funderOf(a).name.localeCompare(funderOf(b).name);
  });
}

export type ProspectFilter = "active" | "all" | ProspectStatus;

export function filterProspects(items: readonly ProspectItem[], filter: ProspectFilter) {
  if (filter === "all") return [...items];
  if (filter === "active") return items.filter((p) => !CLOSED_PROSPECT_STATUSES.includes(p.status));
  return items.filter((p) => p.status === filter);
}

/** $1.2M / $850K / $12,000 — for dense tables. Null → "—". */
export function formatCompactCents(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(dollars) >= 100_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(dollars) >= 100_000 ? 1 : 0,
  }).format(dollars);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp → "YYYY-MM-DD" (local calendar date) for <input type="date">. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "YYYY-MM-DD" → ISO timestamp at 12:00 UTC (so the calendar date reads the same in every US
 * timezone). Empty → null; invalid → undefined.
 */
export function dateInputToIso(value: string): string | null | undefined {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** True when a next-step date is before today (local). */
export function isOverdue(iso: string | null | undefined, now: Date = new Date()): boolean {
  const day = isoToDateInput(iso);
  if (!day) return false;
  return day < isoToDateInput(now.toISOString());
}

const SOURCING_ERRORS: Record<string, string> = {
  robots_disallowed:
    "That site's robots.txt asks automated tools not to visit this page, so we won't watch it. You can still download the RFP yourself and import it from the Opportunities page.",
  invalid_url:
    "That doesn't look like a valid web address. Paste the full link, starting with https://.",
  blocked_url: "We can only watch public web pages (no private, local or login-only addresses).",
  url_not_allowed:
    "We can only watch public web pages (no private, local or login-only addresses).",
  private_url: "We can only watch public web pages (no private, local or login-only addresses).",
  robots_unavailable:
    "We couldn't read that site's robots.txt just now, so we can't confirm it allows automated checks. Try again later.",
  too_many_sources: "Your watchlist is full. Remove a page you no longer need, then try again.",
  rate_limited: "That was done very recently. Please wait a little and try again.",
  forbidden: "You don't have permission to do that. Ask an admin for editor access.",
  unauthorized: "Your session has expired. Sign in again to continue.",
};

/** Add-source error codes shown on the URL field itself (others show as a form-level alert). */
export const URL_FIELD_ERROR_CODES: ReadonlySet<string> = new Set([
  "bad_request",
  "invalid_url",
  "blocked_url",
  "url_not_allowed",
  "private_url",
]);

/**
 * Codes whose server message is specific and written for end users ("Try again in 3 minute(s)",
 * "This page is already on your watchlist", "Resume this source before checking it", ...).
 */
const PREFER_SERVER_MESSAGE = new Set(["rate_limited", "conflict", "bad_request", "not_found"]);

/** A user-facing message for any thrown error from the sourcing endpoints. */
export function sourcingErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const server = err.message?.trim();
    if (server && PREFER_SERVER_MESSAGE.has(err.code)) return server;
    const byCode = SOURCING_ERRORS[err.code];
    if (byCode) return byCode;
    if (err.status === 429) return SOURCING_ERRORS.rate_limited as string;
    if (err.status === 403) return SOURCING_ERRORS.forbidden as string;
    if (err.status >= 500) return "Something went wrong on our side. Please try again.";
    return err.message?.trim() || "Something went wrong. Please try again.";
  }
  if (err instanceof TypeError) return "We couldn't reach the server. Check your connection.";
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
