import { describe, expect, it } from "vitest";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  leadHasNotes,
  normalizeOperatorNotes,
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
