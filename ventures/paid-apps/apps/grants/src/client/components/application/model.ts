// Pure helpers for the application screens: labels, citation numbering, verdict lookup, flag
// ordering, money/word formatting. No React here so everything is unit-testable.

import type { Tone } from "@client/components/ui";
import type { FlagDto, OpportunityDto } from "@shared/api/types";
import type {
  ApplicationContent,
  ClaimVerdict,
  DraftSection,
  GroundingReport,
  RequirementSection,
} from "@shared/content";
import type {
  ApplicationStatus,
  FlagKind,
  FlagSeverity,
  ReviewTier,
  SubmissionChannel,
} from "@shared/enums";

export { APPLICATION_STATUS_LABEL } from "@client/components/grants/format";

/** The pipeline is working: poll until it settles. */
export const BUSY_STATUSES: readonly ApplicationStatus[] = [
  "draft_queued",
  "drafting",
  "verifying",
];
/** POST /reviews/:id/decision is accepted in these states (services/pipeline DECIDABLE). */
export const DECIDABLE_STATUSES: readonly ApplicationStatus[] = [
  "in_review",
  "changes_requested",
  "approved",
];
/** PATCH sections / regenerate are accepted in these states (services/pipeline EDITABLE). */
export const EDITABLE_STATUSES: readonly ApplicationStatus[] = [
  "needs_info",
  "in_review",
  "changes_requested",
  "approved",
  "failed",
];
/** POST /outcome is accepted in these states. */
export const OUTCOME_STATUSES: readonly ApplicationStatus[] = [
  "submitting",
  "submitted",
  "awarded",
  "declined",
];

export const isBusy = (s: ApplicationStatus) => BUSY_STATUSES.includes(s);

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, Tone> = {
  draft_queued: "neutral",
  drafting: "info",
  verifying: "info",
  needs_info: "warning",
  in_review: "brand",
  changes_requested: "warning",
  approved: "success",
  submitting: "info",
  submitted: "brand",
  awarded: "success",
  declined: "neutral",
  withdrawn: "neutral",
  failed: "danger",
};

export const TIER_INFO: Record<ReviewTier, { label: string; tone: Tone; description: string }> = {
  auto: {
    label: "Autopilot",
    tone: "success",
    description: "Low value, fully grounded and within your autopilot rules: submits on its own.",
  },
  one_click: {
    label: "One-click review",
    tone: "brand",
    description: "Ready to go: skim the summary and flags, then approve with one click.",
  },
  full_review: {
    label: "Full review",
    tone: "warning",
    description: "High value or lower confidence: review it section by section before approving.",
  },
};

/** "ask $250,000 is above the autopilot limit; 2 blocking flags must be resolved" → sentences. */
export function tierReasonSentences(reason: string | null | undefined): string[] {
  if (!reason) return [];
  return reason
    .split(/;\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const first = s.charAt(0).toUpperCase() + s.slice(1);
      return /[.!?]$/.test(first) ? first : `${first}.`;
    });
}

export const FLAG_KIND_LABEL: Record<FlagKind, string> = {
  unsupported_claim: "Unsupported claim",
  unconfirmed_fact: "Unconfirmed fact",
  numeric_mismatch: "Number mismatch",
  missing_info: "Missing information",
  stale_fact: "Possibly outdated fact",
  eligibility_risk: "Eligibility risk",
  length_limit: "Over length limit",
  policy: "Policy",
  restricted_data: "Restricted data",
  other: "Other",
};

const SEVERITY_RANK: Record<FlagSeverity, number> = { blocker: 0, warning: 1, info: 2 };

/** Open flags first, blockers before warnings before info; stable otherwise. */
export function sortFlags(flags: FlagDto[]): FlagDto[] {
  return flags
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const ao = a.f.status === "open" ? 0 : 1;
      const bo = b.f.status === "open" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const s = SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity];
      return s !== 0 ? s : a.i - b.i;
    })
    .map((x) => x.f);
}

export function openFlagCounts(flags: FlagDto[]) {
  const open = flags.filter((f) => f.status === "open");
  return {
    blockers: open.filter((f) => f.severity === "blocker").length,
    warnings: open.filter((f) => f.severity === "warning").length,
    info: open.filter((f) => f.severity === "info").length,
  };
}

export const RATING_LABELS = ["Way off", "Weak", "OK", "Strong", "Exceptional"] as const;

/** 420_000 micro-USD → "$0.42"; sub-cent amounts keep 4 decimals. */
export function formatMicros(micros: number | null | undefined): string {
  const m = Math.max(0, Number(micros ?? 0));
  const dollars = m / 1_000_000;
  if (m > 0 && m < 10_000) return `$${dollars.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export const shortSha = (sha: string | null | undefined, n = 12) => (sha ? sha.slice(0, n) : "—");

/** Only http(s) links are rendered as clickable (guide URLs come from scraped funder data). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const paragraphText = (p: { claims: { text: string }[] }) =>
  p.claims
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ");

export const sectionWordCount = (s: DraftSection) =>
  s.paragraphs.reduce((n, p) => n + countWords(paragraphText(p)), 0);

/** Citation numbers in order of first appearance across the whole draft (same fact = same number). */
export function citationNumbers(
  content: ApplicationContent | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of content?.sections ?? []) {
    for (const p of s.paragraphs) {
      for (const c of p.claims) {
        for (const id of c.factIds) if (!map.has(id)) map.set(id, map.size + 1);
      }
    }
  }
  return map;
}

export function verdictMap(report: GroundingReport | null | undefined): Map<string, ClaimVerdict> {
  return new Map((report?.verdicts ?? []).map((v) => [v.claimId, v]));
}

export type ClaimIssue = { level: "danger" | "warning"; reason: string } | null;

/** Red when unsupported or a number doesn't match the cited facts; amber when only partly supported. */
export function claimIssue(v: ClaimVerdict | undefined): ClaimIssue {
  if (!v) return null;
  if (v.verdict === "unsupported" || v.unmatchedNumbers.length > 0) {
    const parts: string[] = [];
    if (v.verdict === "unsupported") parts.push(v.reason || "The cited facts don't support this.");
    if (v.unmatchedNumbers.length > 0) {
      parts.push(
        `${v.unmatchedNumbers.join(", ")} ${v.unmatchedNumbers.length === 1 ? "doesn't" : "don't"} appear in the cited facts.`,
      );
      if (v.verdict !== "unsupported" && v.reason) parts.push(v.reason);
    }
    return { level: "danger", reason: parts.join(" ") };
  }
  if (v.verdict === "partially_supported") {
    return { level: "warning", reason: v.reason || "Only partly supported by the cited facts." };
  }
  return null;
}

export function requirementFor(
  opportunity: Pick<OpportunityDto, "requirements"> | null | undefined,
  key: string,
): RequirementSection | undefined {
  return opportunity?.requirements?.sections.find((s) => s.key === key);
}

export const CHANNEL_LABEL: Record<SubmissionChannel, string> = {
  email: "Email",
  manual: "Manual",
  grants_gov_s2s: "Grants.gov (system-to-system)",
  portal: "Funder portal",
};

/** What happens after "Approve & submit", from the opportunity's submission method. */
export function submissionChannelText(
  o: Pick<OpportunityDto, "submissionMethod" | "submissionEmail" | "submissionUrl" | "funderName">,
): string {
  switch (o.submissionMethod) {
    case "email":
      return o.submissionEmail
        ? `Email to ${o.submissionEmail}. It is sent automatically when your settings allow it; otherwise you get the package and a step-by-step guide.`
        : "Email (no funder address on file): you get the package and a step-by-step guide.";
    case "grants_gov":
      return "Grants.gov Workspace (manual): we prepare the package and a step-by-step guide for your Authorized Organization Representative.";
    case "portal":
      return `${o.funderName}'s online portal (manual): we prepare the package and a step-by-step guide.`;
    case "mail":
      return "By mail (manual): we prepare the package and a step-by-step guide.";
    default:
      return "Manual submission: we prepare the package and a step-by-step guide.";
  }
}

/** Read the manual guide from submission metadata, tolerating missing / malformed fields. */
export function readGuide(metadata: Record<string, unknown> | null | undefined) {
  const g = metadata?.guide;
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    method: typeof o.method === "string" ? o.method : "unknown",
    title: typeof o.title === "string" ? o.title : "Submit manually",
    url: typeof o.url === "string" ? o.url : null,
    steps: strings(o.steps),
    notes: strings(o.notes),
  };
}
