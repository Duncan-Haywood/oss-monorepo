import { parseDollarsToCents } from "@client/routes/org/settings/form-bits";
import { describe, expect, it } from "vitest";
import { guessKind, guessOutcome } from "./documents-step";
import { resolveStep } from "./onboarding";

describe("resolveStep", () => {
  it("always starts at step 1 without an org", () => {
    expect(resolveStep(4, undefined)).toBe(1);
    expect(resolveStep(undefined, undefined)).toBe(1);
  });
  it("resumes the requested step once the org exists, clamped to 1..5", () => {
    expect(resolveStep(3, "org_1")).toBe(3);
    expect(resolveStep("4", "org_1")).toBe(4);
    expect(resolveStep(99, "org_1")).toBe(5);
    expect(resolveStep("nope", "org_1")).toBe(1);
  });
});

describe("guessKind", () => {
  it.each([
    ["SWIF Bylaws 2019.pdf", "charter_bylaws"],
    ["Annual Report 2024.pdf", "annual_report"],
    ["Form 990 FY23.pdf", "financial_statement"],
    ["Mission statement.docx", "mission_statement"],
    ["DOL grant application - declined.pdf", "past_application"],
    ["Decline letter Kellogg.pdf", "rejection_letter"],
    ["NM Workforce proposal.docx", "past_application"],
    ["photo.jpg", "other"],
  ])("%s -> %s", (name, kind) => {
    expect(guessKind(name)).toBe(kind);
  });
});

describe("guessOutcome", () => {
  it("reads awarded/declined hints from file names", () => {
    expect(guessOutcome("NM proposal - awarded.pdf")).toBe("awarded");
    expect(guessOutcome("DOL application declined.pdf")).toBe("declined");
    expect(guessOutcome("application.pdf")).toBe("unknown");
  });
});

describe("parseDollarsToCents", () => {
  it("accepts common ways of writing money", () => {
    expect(parseDollarsToCents("$25,000")).toBe(2_500_000);
    expect(parseDollarsToCents("25k")).toBe(2_500_000);
    expect(parseDollarsToCents("1.5m")).toBe(150_000_000);
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("lots")).toBeNull();
  });
});
