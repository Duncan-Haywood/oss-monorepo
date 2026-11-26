// Application activity timeline: GET /api/orgs/:orgId/applications/:id/timeline.
// Who did what at each step (AI, a person, autopilot or the system). Counts and labels only:
// never document text, fact statements, flag messages or reviewer comments.

export const TIMELINE_ACTOR_TYPES = ["ai", "human", "autopilot", "system"] as const;
export type TimelineActorType = (typeof TIMELINE_ACTOR_TYPES)[number];

export interface TimelineActor {
  type: TimelineActorType;
  /** A person's display name, the model for AI work, or "Autopilot". */
  name?: string;
}

export const TIMELINE_EVENT_KINDS = [
  "application.created",
  "llm.usage",
  "version.drafted",
  "version.edited",
  "check.passed",
  "check.flagged",
  "wait.needs_info",
  "flag.resolved",
  "application.routed",
  "wait.in_review",
  "review.approved",
  "review.changes_requested",
  "review.rejected",
  "feedback.added",
  "submission.sent",
  "submission.prepared",
  "submission.failed",
  "submission.confirmed",
  "application.withdrawn",
  "application.outcome",
  "application.exported",
  /** Any other audited action on the application (summary is the humanized action). */
  "activity",
] as const;
export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export type TimelineDetailValue = string | number | boolean | null | string[];

export interface TimelineEvent {
  /** Stable id (source + row id), used for keys and the cursor. */
  id: string;
  /** ISO timestamp. */
  at: string;
  actor: TimelineActor;
  kind: TimelineEventKind;
  /** Plain-language sentence, e.g. "AI drafted version 2 using 23 facts". */
  summary: string;
  detail?: Record<string, TimelineDetailValue>;
  /** An in-app path (or API download path) with more about this event. */
  link?: string;
}

export type WhoDecidedStepKey =
  | "drafted"
  | "edited"
  | "checked"
  | "resolved"
  | "decided"
  | "submitted";

/** One clause of "Drafted by AI · Checked by AI · Approved by Rosa · Submitted by Autopilot". */
export interface WhoDecidedStep {
  step: WhoDecidedStepKey;
  label: string;
  actor: TimelineActor;
  /** Still waiting on this step (e.g. "Awaiting approval"). */
  pending?: boolean;
}

export interface TimelineResponse {
  items: TimelineEvent[];
  nextCursor: string | null;
  /** Computed over the whole history (not just this page). */
  whoDecided: WhoDecidedStep[];
}
