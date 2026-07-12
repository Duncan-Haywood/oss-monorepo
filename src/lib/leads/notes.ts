/**
 * Operator free-text notes on a Lead — capture call outcomes without a full CRM.
 * Pure helpers so validation stays unit-testable (see /docs/process operator-lead-notes
 * and discovery-call-notes-prompt).
 */

import type { LeadPipelineStage, OutreachStep } from "./types";

/** Soft cap so a single row cannot bloat SQLite/Convex documents. */
export const MAX_OPERATOR_NOTES_LENGTH = 2000;

/** Why the dashboard auto-opened the notes editor after a pipeline milestone. */
export type NotesPromptReason = "discovery_call" | "email_3";

/**
 * Normalize operator notes for persistence: trim, collapse empty to undefined,
 * reject over-long input (caller should show the error).
 */
export function normalizeOperatorNotes(
  raw: string | undefined | null,
): { ok: true; notes: string | undefined } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, notes: undefined };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, notes: undefined };
  }
  if (trimmed.length > MAX_OPERATOR_NOTES_LENGTH) {
    return {
      ok: false,
      error: `Notes must be ${MAX_OPERATOR_NOTES_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, notes: trimmed };
}

export function leadHasNotes(notes: string | undefined | null): boolean {
  return Boolean(notes && notes.trim().length > 0);
}

/**
 * Soft prompt when stage newly becomes discovery_call — not when already there
 * (avoids nagging on every re-select of the same stage).
 */
export function shouldPromptNotesAfterStageChange(
  previousStage: LeadPipelineStage,
  newStage: LeadPipelineStage,
): boolean {
  return previousStage !== "discovery_call" && newStage === "discovery_call";
}

/**
 * Soft prompt when Email 3 just landed (outreachStep → 3). Email 3 is the last
 * automated touch before a human call — notes keep the next pass warm.
 */
export function shouldPromptNotesAfterOutreachStep(
  previousStep: number | undefined | null,
  newStep: number | undefined | null,
): boolean {
  const prev = normalizeOutreachStepLocal(previousStep);
  const next = normalizeOutreachStepLocal(newStep);
  return prev !== 3 && next === 3;
}

function normalizeOutreachStepLocal(value: number | undefined | null): OutreachStep {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

/** Copy for the soft banner above the notes editor — never blocks stage/email success. */
export function notesPromptMessage(
  reason: NotesPromptReason,
  hasExistingNotes: boolean,
): string {
  if (reason === "discovery_call") {
    return hasExistingNotes
      ? "Discovery call stage set — update notes with agenda or outcomes before leaving this row."
      : "Discovery call stage set — capture who you'll call, when, and what to cover.";
  }
  return hasExistingNotes
    ? "Email 3 sent — update notes with the final-touch outcome so the next pass isn't cold."
    : "Email 3 sent — log the last touch and any reply so discovery prep isn't lost.";
}
