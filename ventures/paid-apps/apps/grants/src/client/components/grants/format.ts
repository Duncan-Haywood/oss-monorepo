// Pure formatting helpers for the grants UI (deadlines, award ranges, scores, activity).

import { formatCents } from "@client/lib/api";
import type { ApplicationStatus, Eligibility } from "@shared/enums";

const DAY_MS = 86_400_000;

type DateInput = string | number | Date;

/** Whole calendar days from `now` until `date` (local time). Negative when in the past. */
export function daysUntil(date: DateInput, now: Date = new Date()): number {
  const d = new Date(date);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY_MS);
}

export type DeadlineUrgency = "none" | "past" | "urgent" | "soon" | "normal";

/** urgent = closes within 14 days (shown red); soon = within 30 days. */
export function deadlineUrgency(
  date: DateInput | null | undefined,
  now: Date = new Date(),
): DeadlineUrgency {
  if (date == null) return "none";
  const days = daysUntil(date, now);
  if (days < 0) return "past";
  if (days < 14) return "urgent";
  if (days < 30) return "soon";
  return "normal";
}

/** "Closes in 5 days", "Closes today", "Closed 3 days ago", "No deadline listed". */
export function relativeDeadline(
  date: DateInput | null | undefined,
  now: Date = new Date(),
  verb: { future: string; past: string } = { future: "Closes", past: "Closed" },
): string {
  if (date == null) return "No deadline listed";
  const days = daysUntil(date, now);
  if (days === 0) return `${verb.future} today`;
  if (days === 1) return `${verb.future} tomorrow`;
  if (days === -1) return `${verb.past} yesterday`;
  if (days < 0) return `${verb.past} ${-days} days ago`;
  if (days <= 60) return `${verb.future} in ${days} days`;
  const months = Math.round(days / 30);
  return `${verb.future} in ~${months} months`;
}

/** "$50,000 – $250,000", "Up to $250,000", "From $50,000", "Award amount not listed". */
export function formatAwardRange(
  floorCents: number | null | undefined,
  ceilingCents: number | null | undefined,
): string {
  const floor = floorCents && floorCents > 0 ? floorCents : null;
  const ceiling = ceilingCents && ceilingCents > 0 ? ceilingCents : null;
  if (floor && ceiling) {
    return floor === ceiling
      ? formatCents(ceiling)
      : `${formatCents(floor)} – ${formatCents(ceiling)}`;
  }
  if (ceiling) return `Up to ${formatCents(ceiling)}`;
  if (floor) return `From ${formatCents(floor)}`;
  return "Award amount not listed";
}

/** 0.4567 -> "46%" */
export const formatPercent = (p: number | null | undefined) =>
  p == null || Number.isNaN(p) ? "—" : `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;

/** "needs_info" -> "Needs info" */
export const humanize = (s: string) => {
  const t = s.replace(/[._-]+/g, " ").trim();
  return t ? t[0]?.toUpperCase() + t.slice(1) : t;
};

export const ELIGIBILITY_LABEL: Record<Eligibility, string> = {
  eligible: "Eligible",
  likely_eligible: "Likely eligible",
  unknown: "Eligibility unclear",
  ineligible: "Not eligible",
};
export const ELIGIBILITY_TONE: Record<Eligibility, "success" | "info" | "neutral" | "danger"> = {
  eligible: "success",
  likely_eligible: "info",
  unknown: "neutral",
  ineligible: "danger",
};

/** Applications that are still being worked on (not yet submitted or closed out). */
export const IN_PROGRESS_STATUSES: readonly ApplicationStatus[] = [
  "draft_queued",
  "drafting",
  "verifying",
  "needs_info",
  "in_review",
  "changes_requested",
  "approved",
  "submitting",
];

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft_queued: "Queued",
  drafting: "Drafting",
  verifying: "Fact-checking",
  needs_info: "Needs info",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  submitting: "Submitting",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Declined",
  withdrawn: "Withdrawn",
  failed: "Failed",
};

/** "3m ago", "5h ago", "2d ago", or a date when older than a week. */
export function timeAgo(date: DateInput, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(date).getTime();
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(date));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  hellip: "…",
};

/**
 * Turn funder-provided text (sometimes containing HTML from listings) into plain text with
 * line breaks. The result is rendered as a React text node, so it is never interpreted as HTML.
 */
export function toPlainText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*\/\s*(p|div|ul|ol|h[1-6]|tr|table|section|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, ent: string) => {
      if (ent[0] === "#") {
        const code =
          ent[1] === "x" || ent[1] === "X"
            ? Number.parseInt(ent.slice(2), 16)
            : Number.parseInt(ent.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : m;
      }
      return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse a dollars string ("12,500" / "$12500.50") into integer cents; null when blank/invalid. */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export const centsToDollarsInput = (cents: number | null | undefined) =>
  cents == null ? "" : String(Math.round(cents / 100));
