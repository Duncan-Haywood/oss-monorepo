// Dismiss reasons as a soft matching signal (pure, deterministic). When a person dismissed an
// opportunity from the same funder as "wrong_focus" or "too_small", later opportunities from that
// funder start with a lower fit. Applied in score-org post-processing, after finalizeScore(), so the
// LLM never sees it and the adjustment is explained to the user as a reason.
import type { MatchReason } from "@shared/content";
import { DISMISS_REASON_LABELS, type DismissReason } from "@shared/match-triage";
import type { FinalScore } from "./scoring";

export const DISMISS_SIGNAL_REASONS = [
  "wrong_focus",
  "too_small",
] as const satisfies readonly DismissReason[];
export type DismissSignalReason = (typeof DISMISS_SIGNAL_REASONS)[number];

/** Fit points removed per earlier dismissal from the same funder. */
export const DISMISS_FIT_PENALTY: Record<DismissSignalReason, number> = {
  wrong_focus: 15,
  too_small: 10,
};
/** Total cap: a soft signal, never a veto. */
export const MAX_DISMISS_FIT_PENALTY = 25;

export interface FunderRef {
  opportunityId: string;
  funderId: string | null;
  funderName: string;
  /** Largest single award (award ceiling, else total funding), when known. */
  maxAwardCents: number | null;
}

export interface DismissalSignal extends FunderRef {
  reason: DismissSignalReason;
}

export const isSignalReason = (r: DismissReason | null | undefined): r is DismissSignalReason =>
  r === "wrong_focus" || r === "too_small";

export function normalizeFunderName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Same funder: by funder id when both have one, else by normalized name. */
export function sameFunder(a: FunderRef, b: FunderRef): boolean {
  if (a.funderId && b.funderId) return a.funderId === b.funderId;
  const n = normalizeFunderName(a.funderName);
  return n !== "" && n === normalizeFunderName(b.funderName);
}

/** "Too small" only carries over to awards that are not larger than the one dismissed. */
function appliesTo(signal: DismissalSignal, target: FunderRef): boolean {
  if (signal.reason !== "too_small") return true;
  if (signal.maxAwardCents == null || target.maxAwardCents == null) return true;
  return target.maxAwardCents <= signal.maxAwardCents;
}

export interface DismissalAdjustment {
  penalty: number;
  /** Explains the adjustment to the user; null when there is none. */
  reason: MatchReason | null;
}

export function dismissalAdjustment(
  target: FunderRef,
  signals: readonly DismissalSignal[],
): DismissalAdjustment {
  const hits = signals.filter(
    (s) =>
      s.opportunityId !== target.opportunityId && sameFunder(s, target) && appliesTo(s, target),
  );
  if (hits.length === 0) return { penalty: 0, reason: null };
  const raw = hits.reduce((sum, s) => sum + DISMISS_FIT_PENALTY[s.reason], 0);
  const penalty = Math.min(MAX_DISMISS_FIT_PENALTY, raw);
  const why = DISMISS_SIGNAL_REASONS.filter((r) => hits.some((h) => h.reason === r))
    .map((r) => DISMISS_REASON_LABELS[r].label.toLowerCase())
    .join(", ");
  const n = hits.length;
  return {
    penalty,
    reason: {
      text: `Fit lowered by ${penalty} points: you dismissed ${n} similar grant${n === 1 ? "" : "s"} from ${target.funderName.trim().slice(0, 120) || "this funder"} (${why}).`,
      polarity: "negative",
      factIds: [],
    },
  };
}

/** Lower the fit (never below 0) and append the explanation. Other fields are unchanged. */
export function applyDismissalSignal(
  score: FinalScore,
  target: FunderRef,
  signals: readonly DismissalSignal[],
): FinalScore {
  const { penalty, reason } = dismissalAdjustment(target, signals);
  if (penalty === 0 || !reason) return score;
  return {
    ...score,
    fitScore: Math.max(0, score.fitScore - penalty),
    reasons: [...score.reasons, reason],
  };
}
