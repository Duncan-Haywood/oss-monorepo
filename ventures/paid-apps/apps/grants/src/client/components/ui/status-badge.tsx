// Maps every app status enum (applications, documents, facts, matches, submissions, follow-ups,
// interviews, subscriptions, flags, review tiers, eligibility) to a tone + human label.
import { Badge, type Tone } from "./base";

export type StatusKind =
  | "application"
  | "document"
  | "fact"
  | "match"
  | "submission"
  | "followup"
  | "interview"
  | "opportunity"
  | "subscription"
  | "flag"
  | "reviewTier"
  | "eligibility"
  | "export";

const common: Record<string, Tone> = {
  // applications
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
  // documents
  uploaded: "neutral",
  processing: "info",
  ready: "success",
  // facts
  proposed: "warning",
  confirmed: "success",
  rejected: "danger",
  superseded: "neutral",
  // matches
  new: "info",
  shortlisted: "brand",
  dismissed: "neutral",
  applied: "success",
  // submissions / follow-ups / exports
  pending: "warning",
  sent: "info",
  done: "success",
  skipped: "neutral",
  expired: "neutral",
  // interviews
  active: "info",
  completed: "success",
  abandoned: "neutral",
  // opportunities
  forecasted: "info",
  posted: "success",
  closed: "neutral",
  archived: "neutral",
  // subscriptions
  trialing: "info",
  past_due: "danger",
  paused: "warning",
  canceled: "neutral",
  comp: "brand",
  // flags
  blocker: "danger",
  warning: "warning",
  info: "info",
  open: "warning",
  resolved: "success",
  // review tiers
  auto: "success",
  one_click: "brand",
  full_review: "warning",
  // eligibility
  eligible: "success",
  likely_eligible: "brand",
  unknown: "neutral",
  ineligible: "danger",
};

const overrides: Partial<Record<StatusKind, Record<string, Tone>>> = {
  subscription: { active: "success" },
  match: { new: "info" },
  flag: { open: "warning" },
};

const labels: Record<string, string> = {
  draft_queued: "Queued",
  needs_info: "Needs info",
  in_review: "In review",
  changes_requested: "Changes requested",
  proposed: "Unconfirmed",
  one_click: "One-click review",
  full_review: "Full review",
  auto: "Autopilot",
  likely_eligible: "Likely eligible",
  past_due: "Past due",
  comp: "Complimentary",
  trialing: "Trial",
};

export function statusTone(status: string, kind?: StatusKind): Tone {
  return (kind && overrides[kind]?.[status]) ?? common[status] ?? "neutral";
}

export function statusLabel(status: string): string {
  if (labels[status]) return labels[status];
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusBadge({
  status,
  kind,
  label,
  className,
}: {
  status: string | null | undefined;
  kind?: StatusKind;
  /** Override the displayed text. */
  label?: string;
  className?: string;
}) {
  if (!status) return null;
  return (
    <Badge tone={statusTone(status, kind)} dot className={className}>
      {label ?? statusLabel(status)}
    </Badge>
  );
}
