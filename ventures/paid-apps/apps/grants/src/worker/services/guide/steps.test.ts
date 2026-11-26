import { describe, expect, it } from "vitest";
import { buildGuide, type GuideState, missingProfileFields } from "./steps";

const EMPTY: GuideState = {
  profileMissing: [],
  documents: 0,
  pastApplications: 0,
  confirmedFacts: 0,
  proposedFacts: 0,
  completedInterviews: 0,
  activeInterviews: 0,
  projects: 0,
  shortlisted: 0,
  drafts: 0,
  draftChecked: false,
  automationChosen: false,
  otherMembers: 0,
  pendingInvitations: 0,
};
const step = (s: GuideState, key: string) => buildGuide(s).steps.find((x) => x.key === key);

describe("buildGuide", () => {
  it("needs a past application among 3+ documents", () => {
    expect(step({ ...EMPTY, documents: 5 }, "documents")).toMatchObject({
      done: false,
      detail: expect.stringContaining("past application"),
    });
    expect(step({ ...EMPTY, documents: 3, pastApplications: 1 }, "documents")?.done).toBe(true);
  });

  it("a draft only counts once a person has checked it", () => {
    expect(step({ ...EMPTY, drafts: 1 }, "first_draft")).toMatchObject({ done: false });
    expect(step({ ...EMPTY, drafts: 1, draftChecked: true }, "first_draft")?.done).toBe(true);
  });

  it("caps progress at the target and reports the next step", () => {
    const g = buildGuide({ ...EMPTY, confirmedFacts: 25 });
    expect(g.steps.find((s) => s.key === "facts")?.progress).toEqual({ current: 10, target: 10 });
    expect(g.nextStep).toBe("documents");
  });
});

describe("missingProfileFields", () => {
  it("treats blank strings and empty lists as missing", () => {
    expect(
      missingProfileFields({
        legalName: "A",
        ein: " ",
        city: "X",
        state: "NM",
        focusAreas: [""],
        serviceAreas: ["Y"],
      }),
    ).toEqual(["EIN", "focus areas"]);
    expect(missingProfileFields(null)).toHaveLength(6);
  });
});
