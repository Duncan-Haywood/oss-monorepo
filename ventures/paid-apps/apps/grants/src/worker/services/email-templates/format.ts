// Escaping, header-safety and display helpers shared by every email template. Pure functions.
import type { MemberRole, ReviewTier } from "@shared/enums";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for HTML text or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const isControl = (code: number) =>
  code < 0x20 ||
  code === 0x7f ||
  (code >= 0x80 && code < 0xa0) ||
  code === 0x2028 ||
  code === 0x2029;

/** One line: CR/LF and other control characters become spaces, whitespace is collapsed. */
export function oneLine(value: string): string {
  let out = "";
  for (const ch of value) out += isControl(ch.codePointAt(0) ?? 0) ? " " : ch;
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Subject header: a single line (no CR/LF), capped so a scraped title cannot bloat it. */
export function cleanSubject(value: string, max = 200): string {
  const s = oneLine(value);
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** A user/scraped value shown inline (names, titles): one line, or the fallback when blank. */
export function display(value: string | null | undefined, fallback: string): string {
  const s = value ? oneLine(value) : "";
  return s || fallback;
}

/** Like display() but null when blank (for optional rows/lines). */
export function optional(value: string | null | undefined): string | null {
  const s = value ? oneLine(value) : "";
  return s || null;
}

/** Only http(s) and mailto links become anchors; anything else (javascript:, data:) is refused. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:"
      ? u.href
      : null;
  } catch {
    return null;
  }
}

/** "December 3, 2026" (UTC), or null for a missing/invalid date. */
export function formatDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "$12,500" / "$12,500.50" (USD), or null. */
export function formatMoney(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "1 blocker" / "3 blockers". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "an owner",
  admin: "an admin",
  editor: "an editor",
  reviewer: "a reviewer",
  viewer: "a viewer",
};

/** "an admin", "a viewer". */
export const roleWithArticle = (role: MemberRole): string => ROLE_LABELS[role] ?? "a member";

const TIER_LABELS: Record<ReviewTier, string> = {
  auto: "Autopilot (no review required)",
  one_click: "One-click review",
  full_review: "Full review",
};

export const tierLabel = (tier: ReviewTier | null | undefined): string | null =>
  tier ? (TIER_LABELS[tier] ?? null) : null;

/** Base URL without trailing slashes. */
export const normalizeAppUrl = (appUrl: string | null | undefined): string =>
  (appUrl ?? "").trim().replace(/\/+$/, "");

/** Encode one path segment (ids are URL-safe today; this keeps it that way). */
export const seg = (id: string): string => encodeURIComponent(id);
