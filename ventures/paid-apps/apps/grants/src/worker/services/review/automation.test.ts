import { describe, expect, it } from "vitest";
import {
  AUTOMATION_LEVELS,
  canAutoSendFunderFollowup,
  presetDefaults,
  requiredApprovals,
  resolveAutomation,
} from "./automation";

describe("presetDefaults", () => {
  it.each([
    // level, autoDraft, autoSubmit, matchApproval, draftReview, submissionApproval, followupApproval
    ["manual", false, false, true, true, true, true],
    ["assisted", false, false, true, false, true, true],
    ["prepared", true, false, false, false, true, true],
    ["supervised", true, true, false, false, false, true],
    ["full", true, true, false, false, false, false],
  ] as const)("%s", (level, autoDraft, autoSubmit, match, draft, submission, followup) => {
    const p = presetDefaults(level);
    expect(p).toMatchObject({ level, autoDraft, autoSubmit });
    expect(p.checkpoints).toEqual({
      requireMatchApproval: match,
      requireFactConfirmation: true,
      requireDraftReview: draft,
      requireSubmissionApproval: submission,
      requireFollowupApproval: followup,
    });
    expect(p.twoPersonRuleAboveCents).toBeNull();
  });
});

describe("resolveAutomation", () => {
  it("derives the level from autopilotEnabled when none is stored", () => {
    expect(resolveAutomation({ autopilotEnabled: true })).toMatchObject({
      level: "supervised",
      source: "legacy",
      autoSubmit: true,
    });
    expect(resolveAutomation({ autopilotEnabled: false, automationLevel: null })).toMatchObject({
      level: "prepared",
      source: "legacy",
      autoSubmit: false,
      autoDraft: true,
    });
  });

  it("an explicit level wins over autopilotEnabled", () => {
    expect(resolveAutomation({ autopilotEnabled: true, automationLevel: "manual" })).toMatchObject({
      level: "manual",
      source: "explicit",
      autoSubmit: false,
      autoDraft: false,
    });
  });

  it("null overrides take the preset; set ones are reported as overridden", () => {
    for (const level of AUTOMATION_LEVELS) {
      const r = resolveAutomation({ autopilotEnabled: false, automationLevel: level });
      expect(r.overridden).toEqual([]);
      expect(r.requireDraftReview).toBe(presetDefaults(level).checkpoints.requireDraftReview);
    }
    const r = resolveAutomation({
      autopilotEnabled: true,
      automationLevel: "supervised",
      requireMatchApproval: true,
      requireDraftReview: false, // same as the preset: not an override
    });
    expect(r.requireMatchApproval).toBe(true);
    expect(r.overridden).toEqual(["requireMatchApproval"]);
  });

  it("fact confirmation is always required where autopilot submits", () => {
    for (const level of ["supervised", "full"] as const) {
      const r = resolveAutomation({
        autopilotEnabled: true,
        automationLevel: level,
        requireFactConfirmation: false,
      });
      expect(r.requireFactConfirmation).toBe(true);
      expect(r.forced).toContain("requireFactConfirmation");
    }
    expect(
      resolveAutomation({
        autopilotEnabled: false,
        automationLevel: "prepared",
        requireFactConfirmation: false,
      }).requireFactConfirmation,
    ).toBe(false);
  });

  it("submission approval cannot be switched off below supervised", () => {
    const r = resolveAutomation({
      autopilotEnabled: false,
      automationLevel: "prepared",
      requireSubmissionApproval: false,
    });
    expect(r.requireSubmissionApproval).toBe(true);
    expect(r.autoSubmit).toBe(false);
    expect(r.forced).toContain("requireSubmissionApproval");
    expect(
      resolveAutomation({
        autopilotEnabled: true,
        automationLevel: "full",
        requireSubmissionApproval: true,
      }).autoSubmit,
    ).toBe(false);
  });

  it("follow-ups to funders need approval except at full", () => {
    expect(canAutoSendFunderFollowup(resolveAutomation({ autopilotEnabled: true }))).toBe(false);
    expect(
      canAutoSendFunderFollowup(
        resolveAutomation({ autopilotEnabled: true, automationLevel: "full" }),
      ),
    ).toBe(true);
  });
});

describe("requiredApprovals (two-person rule)", () => {
  it.each([
    [null, 50_000_000, 1],
    [1_000_000, 1_000_000, 1],
    [1_000_000, 1_000_001, 2],
    [1_000_000, null, 2],
    [0, 1, 2],
  ] as const)("threshold %s, ask %s → %s", (threshold, ask, n) => {
    expect(requiredApprovals({ twoPersonRuleAboveCents: threshold }, ask)).toBe(n);
  });
});
