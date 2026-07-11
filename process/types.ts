/**
 * Shared types for the Listing Lens agent process system.
 *
 * This is the source of truth for how autonomous agents track and progress
 * the business. Every agent session should read `roadmap.ts`,
 * `decisions-log.ts`, and `progress-log.ts` before acting, and append to
 * them (via small, reviewable diffs) after acting.
 */

export type PhaseStatus = "not_started" | "in_progress" | "blocked" | "done";

export type TaskOwner = "agent" | "human" | "both";

export type RoadmapTask = {
  id: string;
  title: string;
  status: PhaseStatus;
  owner: TaskOwner;
  /** Why this task exists / what it unblocks. */
  rationale: string;
  /** Concrete, agent-checkable definition of done. */
  doneWhen: string;
  /** Only set once status is "blocked". */
  blockedReason?: string;
};

export type RoadmapPhase = {
  id: string;
  title: string;
  status: PhaseStatus;
  /** Roughly maps to STRATEGY.md's 90-day GTM plan. */
  window: string;
  summary: string;
  tasks: RoadmapTask[];
};

export type BusinessDecision = {
  date: string; // YYYY-MM-DD
  title: string;
  decision: string;
  rationale: string;
  madeBy: string; // e.g. "claude/dazzling-allen-wg8i3m" or "duncan"
  relatedTaskIds?: string[];
};

export type ProgressEntry = {
  date: string; // YYYY-MM-DD
  agent: string; // branch or session identifier
  summary: string;
  changes: string[];
  nextUp: string[];
};
