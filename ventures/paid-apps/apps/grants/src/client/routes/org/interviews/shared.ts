// OWNER: interview UI agent — query keys, DTO shapes and labels shared by the interview pages.
import type { InterviewDto, InterviewTurnDto } from "@shared/api/types";
import type { InterviewKind, InterviewStatus } from "@shared/enums";

export type InterviewDetail = InterviewDto & { turns: InterviewTurnDto[] };

/** POST /interviews/:id/answer response. */
export interface AnswerResponse {
  turns: (InterviewTurnDto | null)[];
  done: boolean;
}

/** GET /facts/summary response (knowledge module). */
export interface FactsSummary {
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  coverage: {
    topic: string;
    /** Human label, e.g. "Mission & identity". */
    label?: string;
    factCount: number;
    confirmedCount?: number;
    question?: string;
    status: "missing" | "thin" | "good";
  }[];
}

/** 400/409 from POST /interviews/:id/answer and /complete. */
export const ANSWER_ERRORS = {
  conflict: "This interview has already been finished, so it can't take new answers.",
};

/** POST /interviews, POST /interviews/transcript error codes. */
export const START_ERRORS = {
  not_found: "That project no longer exists. Pick another one.",
  too_large: "That transcript is too long (max 500,000 characters). Split it into parts.",
};

const EXTRACTION_WINDOW_MS = 3 * 60_000;

/**
 * True while a just-completed interview's facts are presumably still being extracted on the queue:
 * completed, with answers, factCount still 0, and completed within the last few minutes.
 */
export function isExtracting(
  iv: Pick<InterviewDetail, "status" | "factCount" | "completedAt" | "turns"> | undefined,
  now = Date.now(),
): boolean {
  if (iv?.status !== "completed" || iv.factCount > 0 || !iv.completedAt) return false;
  if (!iv.turns.some((t) => t.role === "respondent" && t.content.trim())) return false;
  return now - new Date(iv.completedAt).getTime() < EXTRACTION_WINDOW_MS;
}

export const interviewKeys = {
  all: (orgId: string) => ["orgs", orgId, "interviews"] as const,
  detail: (orgId: string, id: string) => ["orgs", orgId, "interviews", id] as const,
};
export const factsSummaryKey = (orgId: string) => ["orgs", orgId, "facts", "summary"] as const;
export const projectsKey = (orgId: string) => ["orgs", orgId, "projects"] as const;

export const KIND_LABELS: Record<InterviewKind, string> = {
  onboarding: "Onboarding",
  follow_up: "Follow-up",
  project: "Project",
  gap_fill: "Gap fill",
  transcript_upload: "Uploaded transcript",
  update: "What's new? check-in",
};

export const STATUS_LABELS: Record<InterviewStatus, string> = {
  active: "In progress",
  completed: "Completed",
  abandoned: "Abandoned",
};

export const STATUS_TONES: Record<InterviewStatus, "info" | "success" | "neutral"> = {
  active: "info",
  completed: "success",
  abandoned: "neutral",
};

/** "population_served" -> "Population served" */
export function topicLabel(key: string): string {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** Number of facts reported by POST /complete, whatever shape the backend returns. */
export function extractedFactCount(res: unknown, fallback: number): number {
  if (res && typeof res === "object") {
    const r = res as { factCount?: unknown; facts?: unknown; interview?: { factCount?: unknown } };
    if (typeof r.factCount === "number") return r.factCount;
    if (Array.isArray(r.facts)) return r.facts.length;
    if (typeof r.interview?.factCount === "number") return r.interview.factCount;
  }
  return fallback;
}

export const ANSWER_GUIDANCE =
  "Answer in your own words — specifics (numbers, dates, names) make stronger applications. Nothing is submitted without review.";
