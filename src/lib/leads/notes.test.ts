import { describe, expect, it } from "vitest";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  leadHasNotes,
  normalizeOperatorNotes,
  notesPromptMessage,
  shouldAutoOpenNotesEditor,
  shouldPromptNotesAfterOutreachStep,
  shouldPromptNotesAfterStageChange,
} from "./notes";

describe("normalizeOperatorNotes", () => {
  it("returns undefined for null/undefined/blank", () => {
    expect(normalizeOperatorNotes(undefined)).toEqual({ ok: true, notes: undefined });
    expect(normalizeOperatorNotes(null)).toEqual({ ok: true, notes: undefined });
    expect(normalizeOperatorNotes("")).toEqual({ ok: true, notes: undefined });
    expect(normalizeOperatorNotes("   ")).toEqual({ ok: true, notes: undefined });
  });

  it("trims and keeps short notes", () => {
    expect(normalizeOperatorNotes("  Called; left voicemail  ")).toEqual({
      ok: true,
      notes: "Called; left voicemail",
    });
  });

  it("rejects notes over the soft cap", () => {
    const tooLong = "x".repeat(MAX_OPERATOR_NOTES_LENGTH + 1);
    const result = normalizeOperatorNotes(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/2000/);
    }
  });

  it("accepts notes at the exact cap", () => {
    const exact = "y".repeat(MAX_OPERATOR_NOTES_LENGTH);
    expect(normalizeOperatorNotes(exact)).toEqual({ ok: true, notes: exact });
  });
});

describe("leadHasNotes", () => {
  it("detects non-empty notes", () => {
    expect(leadHasNotes(undefined)).toBe(false);
    expect(leadHasNotes("")).toBe(false);
    expect(leadHasNotes("  ")).toBe(false);
    expect(leadHasNotes("VM left")).toBe(true);
  });
});

describe("shouldPromptNotesAfterStageChange", () => {
  it("prompts only when newly entering discovery_call", () => {
    expect(shouldPromptNotesAfterStageChange("outreach_sent", "discovery_call")).toBe(true);
    expect(shouldPromptNotesAfterStageChange("discovered", "discovery_call")).toBe(true);
    expect(shouldPromptNotesAfterStageChange("discovery_call", "discovery_call")).toBe(false);
    expect(shouldPromptNotesAfterStageChange("discovery_call", "paid")).toBe(false);
    expect(shouldPromptNotesAfterStageChange("outreach_sent", "paid")).toBe(false);
  });
});

describe("shouldPromptNotesAfterOutreachStep", () => {
  it("prompts only when Email 3 just lands", () => {
    expect(shouldPromptNotesAfterOutreachStep(2, 3)).toBe(true);
    expect(shouldPromptNotesAfterOutreachStep(undefined, 3)).toBe(true);
    expect(shouldPromptNotesAfterOutreachStep(3, 3)).toBe(false);
    expect(shouldPromptNotesAfterOutreachStep(1, 2)).toBe(false);
    expect(shouldPromptNotesAfterOutreachStep(0, 1)).toBe(false);
  });
});

describe("notesPromptMessage", () => {
  it("varies by reason and whether notes already exist", () => {
    expect(notesPromptMessage("discovery_call", false)).toMatch(/who you'll call/i);
    expect(notesPromptMessage("discovery_call", true)).toMatch(/update notes/i);
    expect(notesPromptMessage("email_3", false)).toMatch(/last touch/i);
    expect(notesPromptMessage("email_3", true)).toMatch(/final-touch/i);
  });
});

describe("shouldAutoOpenNotesEditor", () => {
  it("allows opening when no editor is currently open", () => {
    expect(shouldAutoOpenNotesEditor(null, "lead-b")).toBe(true);
  });

  it("allows re-opening/refreshing the same lead's own editor", () => {
    expect(shouldAutoOpenNotesEditor("lead-a", "lead-a")).toBe(true);
  });

  it("blocks stealing a DIFFERENT lead's open editor (clobber guard)", () => {
    // Regression for notes-editor-cross-lead-clobber: an operator mid-draft
    // on lead-a's notes must not have that draft silently discarded because
    // an unrelated stage change / follow-up send on lead-b triggered the
    // soft auto-open prompt.
    expect(shouldAutoOpenNotesEditor("lead-a", "lead-b")).toBe(false);
  });
});
