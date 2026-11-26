// The newsletter welcome / nurture sequence: which step a confirmed subscriber is due next. Pure.
//
// Steps go out in order, one per cron run at most, each no earlier than `delayDays` after the
// subscriber confirmed and at least SEQUENCE_MIN_GAP_DAYS after the previous step. The gap matters
// when sending is switched on after people have been confirming for a while: they then get the
// series spaced out, not four emails in two hours.

export const NURTURE_STEP_KEYS = ["welcome", "getting-ready", "writing", "how-it-works"] as const;
export type NurtureStepKey = (typeof NURTURE_STEP_KEYS)[number];

export interface SequenceStepTiming {
  key: NurtureStepKey;
  /** Days after confirmation. */
  delayDays: number;
}

export const NURTURE_SEQUENCE: readonly SequenceStepTiming[] = [
  { key: "welcome", delayDays: 0 },
  { key: "getting-ready", delayDays: 3 },
  { key: "writing", delayDays: 7 },
  { key: "how-it-works", delayDays: 14 },
];

export const SEQUENCE_MIN_GAP_DAYS = 2;
const DAY_MS = 86_400_000;

export interface SequenceState {
  confirmedAt: Date;
  /** When the previous step went out (null before the first). */
  lastSentAt: Date | null;
  /** Step keys already sent (or claimed) for this subscriber. */
  sentKeys: ReadonlySet<string>;
}

/** The first unsent step and when it becomes due; null when the sequence is finished. */
export function nextSequenceDue(
  state: SequenceState,
  steps: readonly SequenceStepTiming[] = NURTURE_SEQUENCE,
): { step: SequenceStepTiming; dueAt: Date } | null {
  const step = steps.find((s) => !state.sentKeys.has(s.key));
  if (!step) return null;
  const byDelay = state.confirmedAt.getTime() + step.delayDays * DAY_MS;
  const byGap = state.lastSentAt ? state.lastSentAt.getTime() + SEQUENCE_MIN_GAP_DAYS * DAY_MS : 0;
  return { step, dueAt: new Date(Math.max(byDelay, byGap)) };
}

/** The step to send now, or null when nothing is due yet (or the sequence is finished). */
export function dueSequenceStep(
  state: SequenceState,
  now: Date,
  steps: readonly SequenceStepTiming[] = NURTURE_SEQUENCE,
): SequenceStepTiming | null {
  const next = nextSequenceDue(state, steps);
  return next && next.dueAt.getTime() <= now.getTime() ? next.step : null;
}
